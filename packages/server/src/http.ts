import { createServer as createHttpServer, type IncomingMessage, type Server as HttpServer } from 'node:http';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import open from 'open';
import { MarkTargetSchema } from '@jigbench/core';
import { JigStore } from './store.js';
import { attachBenchServing, type BenchServeMode } from './bench-serve.js';
import { defaultBenchDistDir } from './default-bench-dist.js';
import { createDocsRoute } from './docs/route.js';
import { attachPlateRoute } from './plate/route.js';
import type { PlateProxyHandle } from './plate/proxy.js';
import { logger } from './logger.js';
import { JigWatcher } from './watcher.js'; // S6
import { watchShopFreshness, SHOP_FRESHNESS_TICK_MS } from './shop-freshness.js'; // S6 fix (wave-4 finding 3)
// === S5 orders: imports (delimited block; owned by packages/server/src/orders/*) ===
import { OrdersService } from './orders/service.js';
import { OrderConflictError, OrderNotFoundError } from './orders/errors.js';
import type { OllamaLike } from './orders/drafters/ollama.js';
import type { AgentDrafter } from './orders/drafters/shop.js';
// === end S5 orders block ===
import { FixtureStore } from './fixtures/store.js'; // S7
import { attachFixturesRoute } from './fixtures/route.js'; // S7
import { createFixtureInterceptor } from './fixtures/interceptor.js'; // S7
import { ToolpathStore } from './toolpath/store.js'; // S8
import { attachToolpathsRoute } from './toolpath/route.js'; // S8
import { TrialFitMirror } from './trialfit/mirror.js'; // S8
import { SnapshotStore } from './trialfit/snapshot.js'; // S8
import { attachTrialFitRoute } from './trialfit/route.js'; // S8
import { SketchStore } from './sketch/store.js'; // S9
import { attachSketchesRoute } from './sketch/route.js'; // S9

export interface CreateJigServerOptions {
  repoRoot: string;
  port?: number;
  /** Interface to bind to. Defaults to loopback-only — the bench is a local dev tool and
   * has no business being reachable from the LAN. */
  host?: string;
  openBrowser?: boolean;
  /** Test/override hook — defaults to the sibling `packages/bench/dist`. */
  benchDistDir?: string;
  benchDevServerUrl?: string;
  /** S3's plate proxy, when the CLI has one running. Wires `GET /api/plate` and flips
   * `wiring.proxy` to `'wired'`. Absent (S1's default): neither happens. */
  plate?: PlateProxyHandle;
  /** Test-only override hook (wave-3 council): lets a caller inject a deterministic
   * drafter instead of the real `OllamaDrafter`/`AgentDrafter` `OrdersService` would
   * otherwise construct for itself. Production callers (the CLI's `serve` command,
   * `dev.ts`) never set this — omitting it keeps production behaviour byte-for-byte
   * identical to before this option existed. */
  drafters?: { ollama?: OllamaLike; shop?: AgentDrafter };
  /** Test-only override — how often the periodic shop-freshness tick (wave-4 council
   * finding 3) re-evaluates `wiring.shop` and broadcasts if it flipped. Production default:
   * `SHOP_FRESHNESS_TICK_MS` (10s). */
  shopFreshnessTickMs?: number;
}

/** True when `origin` is absent (a non-browser client — curl, an MCP client, the CLI itself
 * — never sends one) or matches `host` (the request's own `Host` header) exactly. Browsers
 * always send `Origin` on a cross-origin fetch/XHR and on same-origin state-changing
 * requests too, so comparing it against the request's own Host is a same-origin check that
 * needs no hardcoded port — it works whether the bench is on its configured port or, in
 * tests, an OS-assigned one. A request from any other page's Origin fails this regardless
 * of which interface the server is bound to. */
export function isSameOriginOrAbsent(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Reads a numeric `status`/`statusCode` off a thrown error (the shape node's http-errors —
 * and therefore body-parser's PayloadTooLargeError — actually use) without resorting to
 * `any`. Returns `undefined` for anything else (a ZodError, a plain Error, a non-Error
 * throw), so callers can fall back to their own default. */
function errorStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const candidate = (err as { status?: unknown; statusCode?: unknown }).status ?? (err as { statusCode?: unknown }).statusCode;
  return typeof candidate === 'number' ? candidate : undefined;
}

export interface JigServerHandle {
  url: string;
  port: number;
  /** The literal address the socket bound to (`httpServer.address().address`) — exposed so
   * tests can assert the loopback default without shelling out to `netstat`. */
  boundAddress: string;
  store: JigStore;
  /** S7 — the fixture data/lifecycle store; exposed for tests the same way `store` is. */
  fixtureStore: FixtureStore;
  /** S8 — the toolpath data/lifecycle store; exposed for tests the same way `store` is. */
  toolpathStore: ToolpathStore;
  /** S8 — the trial-fit mirror + its snapshot store; exposed for tests the same way
   * `store`/`fixtureStore`/`toolpathStore` are. */
  trialFitMirror: TrialFitMirror;
  snapshotStore: SnapshotStore;
  /** S9 — the sketch data/lifecycle store; exposed for tests the same way `store` is. */
  sketchStore: SketchStore;
  benchServeMode: BenchServeMode;
  close(): Promise<void>;
}

// S6: GET /api/state and every WS 'state' broadcast carry the same composed shape — the core
// JigState plus a top-level `shop` (the connected agent's own name/connectedAt, or null),
// which `wiring.shop`'s wired/none alone can't say. One function so the two call sites never
// drift apart.
function composedState(store: JigStore): ReturnType<JigStore['getState']> & { shop: ReturnType<JigStore['getShopInfo']> } {
  return { ...store.getState(), shop: store.getShopInfo() };
}

function broadcastState(wss: WebSocketServer, store: JigStore): void {
  const payload = JSON.stringify({ type: 'state', state: composedState(store) });
  for (const client of wss.clients as Set<WebSocket>) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

function buildApp(
  store: JigStore,
  wss: WebSocketServer,
  options: CreateJigServerOptions,
  fixtureStore: FixtureStore, // S7
  toolpathStore: ToolpathStore, // S8
  trialFitMirror: TrialFitMirror, // S8
  snapshotStore: SnapshotStore, // S8
  sketchStore: SketchStore, // S9
): { app: Express; benchServeMode: BenchServeMode; orders: OrdersService } {
  const app = express();
  // 64kb: the bench's own request bodies (marks, work-order patches) are all small,
  // structured JSON — a generous cap on any single field lives closer to that field
  // (see orders/service.ts's HumanFacePatchSchema), this is the whole-body backstop
  // (finding 2, wave-3 council).
  app.use(express.json({ limit: '64kb' }));

  // Same-origin gate on every mutating /api/* request. GET is exempt (it has no side
  // effect to forge); anything else — today just POST /api/marks, but the rule is written
  // for whatever comes next — must either carry no Origin (a non-browser client) or an
  // Origin that matches this request's own Host. No CORS headers are ever sent alongside
  // this: the bench is same-origin only, never a cross-origin API.
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    if (!isSameOriginOrAbsent(req.headers.origin, req.headers.host)) {
      res.status(403).json({ error: 'cross-origin request rejected' });
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, repoRoot: store.repoRoot });
  });

  app.get('/api/state', (_req, res) => {
    res.json(composedState(store));
  });

  app.get('/api/docs', createDocsRoute(store.repoRoot)); // S2b — see docs/route.ts

  // === S5 orders: work-order routes (delimited block; owned by packages/server/src/orders/*) ===
  // A drafter attempt (Ollama especially) can legitimately take tens of seconds, so
  // `/draft` is fire-and-forget (202) rather than blocking the request — the bench watches
  // `/api/state` over WS for the transition, exactly as `orders/service.ts`'s own
  // `createMark` already does for its own auto-draft. Declared here, above POST /api/marks,
  // so the integrator's seam-2 auto-draft call below can use it directly.
  const orders = new OrdersService({
    store,
    notify: () => broadcastState(wss, store),
    ollama: options.drafters?.ollama,
    shop: options.drafters?.shop,
  });

  app.post('/api/marks', async (req, res, next) => {
    try {
      // S5: body may carry `pick` (the loupe's PlatePick shape) instead of `target` — the
      // existing `target` shape is untouched, so nothing about this route's prior timing
      // or broadcast behavior changes for a caller that still sends `target`.
      const pick = req.body?.pick;
      const rawTarget =
        req.body?.target ??
        (pick && typeof pick === 'object'
          ? { path: pick.path, component: pick.component, file: pick.file, text: pick.text }
          : undefined);
      const target = MarkTargetSchema.parse(rawTarget);
      const prompt = String(req.body?.prompt ?? '');
      if (!prompt.trim()) {
        res.status(400).json({ error: 'prompt is required' });
        return;
      }
      const created = await store.createMarkAndWorkOrder({ target, prompt });
      broadcastState(wss, store);
      res.status(201).json(created);

      // Integration seam 2 (wave-3 merge): the product flow is "mark -> drafting
      // immediately, with its cost shown" (commission F7, CHASSIS.md) — fire the same
      // auto-draft `OrdersService.createMark` already does for its own callers, but from
      // this route too, since http.ts creates marks via `store.createMarkAndWorkOrder`
      // directly rather than through `orders.createMark`. Opt out with `draft:false` in the
      // body. Fire-and-forget, after the 201 has already gone out: a slow (or absent)
      // drafter must never hold the mark-creation response open. Failure leaves the order
      // `marked` with a logged `draft-failed` entry (orders/service.ts's own `draftOrder`
      // never throws for a draft failure) — logged here too since nothing else awaits it.
      if (req.body?.draft !== false) {
        orders.draftOrder(created.workOrder.id).catch((err) => logger.warn('auto-draft failed', String(err)));
      }
    } catch (err) {
      next(err);
    }
  });

  function mapOrderError(err: unknown, res: Response, next: NextFunction): void {
    if (err instanceof OrderNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof OrderConflictError) {
      res.status(409).json({ error: err.message });
      return;
    }
    next(err);
  }

  app.post('/api/work-orders/:id/draft', (req, res) => {
    const order = store.getWorkOrder(req.params.id);
    if (!order) {
      res.status(404).json({ error: `no such work order: ${req.params.id}` });
      return;
    }
    if (order.state !== 'marked') {
      res.status(409).json({ error: `work order ${order.id} is ${order.state}, not marked — cannot draft` });
      return;
    }
    res.status(202).json({ accepted: true, id: order.id });
    orders.draftOrder(order.id).catch((err) => logger.warn('draft failed', String(err)));
  });

  app.post('/api/work-orders/:id/release', async (req, res, next) => {
    try {
      res.status(200).json(await orders.release(req.params.id));
    } catch (err) {
      mapOrderError(err, res, next);
    }
  });

  app.post('/api/work-orders/:id/scrap', async (req, res, next) => {
    try {
      res.status(200).json(await orders.scrap(req.params.id));
    } catch (err) {
      mapOrderError(err, res, next);
    }
  });

  app.post('/api/work-orders/:id/restore', async (req, res, next) => {
    try {
      res.status(200).json(await orders.restore(req.params.id));
    } catch (err) {
      mapOrderError(err, res, next);
    }
  });

  app.patch('/api/work-orders/:id', async (req, res, next) => {
    try {
      res.status(200).json(await orders.editHumanFace(req.params.id, req.body ?? {}));
    } catch (err) {
      mapOrderError(err, res, next);
    }
  });

  app.get('/api/drafter', async (_req, res, next) => {
    try {
      res.json(await orders.getDrafterInfo());
    } catch (err) {
      next(err);
    }
  });
  // === end S5 orders block ===

  // === S8 (trial fit): the two ladder moves the shop drives ==============================
  app.post('/api/work-orders/:id/claim', async (req, res, next) => {
    try {
      const by = typeof req.body?.by === 'string' && req.body.by.trim() ? req.body.by : undefined;
      res.status(200).json(await orders.claim(req.params.id, by));
    } catch (err) {
      mapOrderError(err, res, next);
    }
  });

  app.post('/api/work-orders/:id/report', async (req, res, next) => {
    try {
      const summary = String(req.body?.summary ?? '');
      if (!summary.trim()) {
        res.status(400).json({ error: 'summary is required' });
        return;
      }
      const files = Array.isArray(req.body?.files) ? req.body.files.map(String) : undefined;
      res.status(200).json(await orders.reportDone(req.params.id, { summary, files }));
    } catch (err) {
      mapOrderError(err, res, next);
    }
  });
  // === end S8 block ===

  if (options.plate) {
    attachPlateRoute(app, options.plate, () => store.getActiveFixture(), () => trialFitMirror.getStatus());
  }

  // getPlateUrl: S7's proof line (route.ts's probeFixtureAnswers) makes a REAL request through
  // the plate on every load — options.plate is the same handle attachPlateRoute above already
  // uses, so this is just handing its own .url getter through as a thunk (undefined when no
  // plate is wired at all, e.g. a caller with no --target — the route then skips the probe).
  attachFixturesRoute(app, fixtureStore, () => store.getState().survey, () => options.plate?.url); // S7

  attachToolpathsRoute(app, toolpathStore); // S8

  attachTrialFitRoute(app, { mirror: trialFitMirror, snapshotStore, primaryPlate: options.plate }); // S8

  attachSketchesRoute(app, sketchStore, () => store.getState().gauges); // S9

  const benchServeMode = attachBenchServing(app, {
    benchDistDir: options.benchDistDir ?? defaultBenchDistDir(),
    benchDevServerUrl: options.benchDevServerUrl,
  });

  // Keep API errors JSON — this is a local tool, not a public API, so the message itself is
  // fine to return; it is never a stack trace, never a secret.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    // Most thrown errors here (a ZodError from MarkTargetSchema/HumanFacePatchSchema) have
    // no status of their own -> 400 (malformed request), same as always. body-parser's own
    // PayloadTooLargeError (the express.json({limit}) cap, finding 2) DOES carry a real
    // `status`/`statusCode` (413) -- honour it instead of flattening every error to 400.
    const status = errorStatus(err) ?? 400;
    logger.warn('request failed', message);
    res.status(status).json({ error: message });
  });

  return { app, benchServeMode, orders };
}

export async function createJigServer(options: CreateJigServerOptions): Promise<JigServerHandle> {
  const { repoRoot, port = 4600, host = '127.0.0.1', openBrowser = false } = options;

  const store = new JigStore(repoRoot);
  await store.init();
  if (options.plate) store.setProxyWired(true);

  // --- S7 (fixtures): construct + wire ---------------------------------------------------
  const fixtureStore = new FixtureStore(repoRoot, store); // store satisfies FixtureWiringSink
  await fixtureStore.init();
  if (options.plate) options.plate.addInterceptor?.(createFixtureInterceptor(fixtureStore));
  // -----------------------------------------------------------------------------------------

  // --- S8 (toolpath): construct + wire ------------------------------------------------------
  const toolpathStore = new ToolpathStore(repoRoot, store); // store satisfies ToolpathWiringSink
  await toolpathStore.init();
  // -------------------------------------------------------------------------------------------

  // --- S8 (trial fit): construct + wire -----------------------------------------------------
  // benchOrigin mirrors serve.ts's own approach for the primary plate (the CONFIGURED port,
  // not necessarily the OS-assigned one under `port: 0` in tests) — the mirror is embedded
  // in the SAME bench page the primary already is, so it needs the same origin value.
  const benchOrigin = `http://localhost:${port}`;
  const trialFitMirror = new TrialFitMirror(benchOrigin);
  const snapshotStore = new SnapshotStore(repoRoot);
  await snapshotStore.init();
  // -------------------------------------------------------------------------------------------

  // --- S9 (sketch): construct + wire ---------------------------------------------------------
  const sketchStore = new SketchStore(repoRoot, store); // store satisfies SketchWiringSink
  await sketchStore.init();
  // -------------------------------------------------------------------------------------------

  const wss = new WebSocketServer({ noServer: true });
  const { app, benchServeMode, orders } = buildApp(store, wss, options, fixtureStore, toolpathStore, trialFitMirror, snapshotStore, sketchStore);
  const httpServer: HttpServer = createHttpServer(app);

  // --- S6: the .jig/ watcher — the MCP process (ADR-001) is a SEPARATE process from this
  // one, so a jig_draft/jig_claim/jig_report tool call writes a file this server never
  // touched directly. Reload the store and broadcast so a connected bench sees it within a
  // second, same as any change this server made itself. ---------------------------------
  const watcher = new JigWatcher({
    repoRoot,
    onChange: () => {
      store
        .reload()
        .then(() => broadcastState(wss, store))
        .catch((err: unknown) => logger.warn('jig watcher: reload after an external .jig/ change failed', String(err)));
    },
  });
  watcher.start();
  // -----------------------------------------------------------------------------------------

  // --- S6 fix (wave-4 council finding 3): the shop-freshness tick — wiring.shop must go
  // back to 'none' within one tick of the heartbeat going stale (an ungraceful agent exit
  // leaves .jig/cache/shop.json on disk with nothing to delete it), even when no .jig/ file
  // event or HTTP request happens to land afterward to notice on its own. -------------------
  const shopFreshness = watchShopFreshness(store, () => broadcastState(wss, store), options.shopFreshnessTickMs ?? SHOP_FRESHNESS_TICK_MS);
  // -----------------------------------------------------------------------------------------

  httpServer.on('upgrade', (req: IncomingMessage, socket, head) => {
    if (req.url !== '/ws') {
      socket.destroy();
      return;
    }
    if (!isSameOriginOrAbsent(req.headers.origin, req.headers.host)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    ws.send(JSON.stringify({ type: 'state', state: composedState(store) }));
  });

  await new Promise<void>((resolve) => httpServer.listen(port, host, resolve));
  const address = httpServer.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const boundAddress = typeof address === 'object' && address ? address.address : host;
  const url = `http://localhost:${actualPort}`;

  logger.info('jig server listening', { url, repoRoot });

  if (openBrowser) {
    open(url).catch((err: unknown) => logger.warn('could not open the browser automatically', String(err)));
  }

  return {
    url,
    port: actualPort,
    boundAddress,
    store,
    fixtureStore, // S7
    toolpathStore, // S8
    trialFitMirror, // S8
    snapshotStore, // S8
    sketchStore, // S9
    benchServeMode,
    async close() {
      watcher.stop(); // S6
      shopFreshness.stop(); // S6 fix (wave-4 finding 3)
      // wss was created with { noServer: true }, so close() alone won't drop connected
      // clients — terminate them explicitly or httpServer.close()'s callback never fires.
      for (const client of wss.clients as Set<WebSocket>) client.terminate();
      wss.close();
      await orders.close(); // finding 3 fix — drain any background auto-draft before the store goes away
      await trialFitMirror.close(); // S8 — the mirror's own listening socket, if started
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
