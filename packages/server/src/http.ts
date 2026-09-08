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
import { HOST_REFUSED_MESSAGE, isAllowedHost, isSameOriginOrAbsent } from './same-origin.js'; // S17a — extracted so fs/route.ts can reuse it too
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
// === S11 prompts + build runner: imports (delimited block; owned by packages/server/src/{prompts,build}/*) ===
import { PromptStore, type MigrationSkip } from './prompts/store.js';
import { PromptService } from './prompts/service.js';
import { attachPromptsRoute } from './prompts/route.js';
import { BuildRunner } from './build/runner.js';
import type { BuildRunnerLike } from './build/types.js';
// === end S11 block ===
// S17a (AMENDMENT-1 §7, A6): "createJigServer becomes a host holding zero or one current
// bench" — that host is `bench/host.ts`'s `createBenchHost`, a SEPARATE implementation this
// file delegates to (below) rather than being rewritten around, so every existing caller/test
// here (all of which always pass `repoRoot`) keeps its exact current behaviour byte-for-byte.
// `bench/host.ts`'s own module doc explains the split and its scope boundary.
import { createBenchHost } from './bench/host.js';
// === S17b: the setup surfaces on the --repo-at-boot path too (delimited block) ===
import { attachFsRoute } from './fs/route.js';
import { TargetRunner, type TargetState } from './target/runner.js';
import { attachTargetRoute, type TargetBenchView } from './target/route.js';
import { attachSetupRoute, type SetupBenchView } from './setup/route.js';
// === end S17b block ===

export interface CreateJigServerOptions {
  /** S17a: optional — omitted, `createJigServer` boots through `bench/host.ts` instead,
   * serving with NO repo clamped (the Clamp screen's server side) until a `POST /api/clamp`.
   * Every option below this point applies only to the repoRoot-given path (unchanged from
   * before S17a); `bench/host.ts` has its own, narrower option set for the no-repo path. */
  repoRoot?: string;
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
  // === S11: prompts + build runner options (delimited block) ===
  /** How the real `claude` executable is invoked — `command` defaults to `'claude'` (resolved
   * off PATH); `commandArgsPrefix` is prepended before every argument list. Production never
   * sets this; tests point `command` at `process.execPath` and `commandArgsPrefix` at a fake
   * `claude` script, the same shape `build/runner.test.ts` uses directly. */
  claude?: { command?: string; commandArgsPrefix?: string[] };
  /** Test-only override hook, same reasoning as `drafters` above — inject a fully
   * deterministic `BuildRunnerLike` instead of a real child-process `BuildRunner`. Takes
   * priority over `claude` when both are given. */
  runner?: BuildRunnerLike;
  // === end S11 block ===
}

// isSameOriginOrAbsent now lives in ./same-origin.js (S17a) — re-exported here so any
// existing import of it from './http.js' keeps working unchanged.
export { isAllowedHost, isSameOriginOrAbsent } from './same-origin.js';

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
  /** S11 — the prompt data/lifecycle service; exposed for tests the same way `store` is. */
  promptStore: PromptStore;
  promptService: PromptService;
  benchServeMode: BenchServeMode;
  close(): Promise<void>;
}

// === S11: composedState's claude fields (delimited block) ===
// `wiring.claude` ('installed' | 'none' — whether the `claude` executable was found on PATH)
// and `status.claude` (idle | building | built, from the BuildRunner) ride along on the same
// composed shape below. A `WeakMap` keyed by the `JigStore` instance — rather than adding
// parameters to `composedState`/`broadcastState` — keeps every ALREADY-EXISTING call site
// (six of them, scattered through this file) compiling unchanged; `createJigServer` registers
// the one entry for its own `store` right after constructing the prompt service.
// `getClaudeInstalled` reads a value refreshed ONCE at server startup, not on every call —
// spawning `claude --version` on every single `/api/state` poll or WS broadcast would be
// wasteful, especially mid-build when broadcasts fire often; a claude install that appears
// mid-session is picked up the next time a Build is actually attempted (`PromptService.build()`
// always re-checks for real) even though this badge may lag until then — a disclosed v0.2
// trade-off, not an oversight.
const promptContextByStore = new WeakMap<
  JigStore,
  {
    promptService: PromptService;
    getClaudeInstalled: () => boolean;
    getMigrationSkipped: () => MigrationSkip[];
    /** S17b: the target runner's own state, layered on as `target` the same way — the entry
     * is registered after `buildApp`, so before that (never observable: nothing listens yet)
     * `composedState` answers an honest `{status: 'none'}`. */
    getTargetState: () => TargetState;
  }
>();
// === end S11 block ===

// S6, folded into JigStore.getState() itself (retest defect 22, 2026-09-06 evening):
// GET /api/state and every WS 'state' broadcast carry the same shape — the core JigState,
// which now includes `shop` (the connected agent's own name/connectedAt, or null) directly —
// which `wiring.shop`'s wired/none alone can't say any more. composedState() no longer needs
// to add `shop` itself (retest defect 22 folded that into JigStore.getState() directly); it
// now exists only to layer S11's `wiring.claude` and `status.claude` on top of that shape, so
// every call site still shares the one function and can never drift apart.
function composedState(store: JigStore): ReturnType<JigStore['getState']> & {
  wiring: ReturnType<JigStore['getState']>['wiring'] & { claude: 'installed' | 'none' }; // S11
  status: { claude: ReturnType<PromptService['claudeStatus']> }; // S11
  // CI run 34148382041: a work order the S11 migration can't parse used to vanish with only
  // a server-log WARN to show for it. `migration.skipped` is that failure surfaced the same
  // way `wiring.claude`/`status.claude` already are — every existing call site (six of them)
  // picks it up for free.
  migration: { skipped: MigrationSkip[] }; // S11
  // S17b: the two fields `bench/host.ts` already sends that the status line's setup checklist
  // and the Clamp screen read off `/api/state` — `bench` is never null on this path (a repo
  // was clamped at boot); `target` is the runner's own `none → starting → up | down`.
  bench: { repoRoot: string }; // S17b
  target: TargetState; // S17b
} {
  const state = store.getState();
  const promptCtx = promptContextByStore.get(store); // S11
  return {
    ...state,
    wiring: { ...state.wiring, claude: promptCtx?.getClaudeInstalled() ? 'installed' : 'none' }, // S11
    status: { claude: promptCtx?.promptService.claudeStatus() ?? { state: 'idle' } }, // S11
    migration: { skipped: promptCtx?.getMigrationSkipped() ?? [] }, // S11
    bench: { repoRoot: store.repoRoot }, // S17b
    target: promptCtx?.getTargetState() ?? { status: 'none' }, // S17b
  };
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
  promptStore: PromptStore, // S11
  benchView: SetupBenchView & TargetBenchView, // S17b
  targetRunner: TargetRunner, // S17b
): { app: Express; benchServeMode: BenchServeMode; orders: OrdersService; promptService: PromptService; runner: BuildRunnerLike } {
  const app = express();
  // 64kb: the bench's own request bodies (marks, work-order patches) are all small,
  // structured JSON — a generous cap on any single field lives closer to that field
  // (see orders/service.ts's HumanFacePatchSchema), this is the whole-body backstop
  // (finding 2, wave-3 council).
  app.use(express.json({ limit: '64kb' }));

  // #18: Host first, on EVERY /api/* request, GET included — a request whose Host does not
  // name this bench (a DNS name: the rebinding case, which arrives with no Origin on a GET)
  // is refused before anything answers; `/api/state` alone hands out the survey. Then the
  // same-origin gate on every mutating request: GET is exempt from THAT half (it has no side
  // effect to forge); anything else must either carry no Origin (a non-browser client) or an
  // Origin that matches this request's own Host. No CORS headers are ever sent alongside
  // this: the bench is same-origin only, never a cross-origin API.
  const boundHost = options.host;
  app.use('/api', (req, res, next) => {
    if (!isAllowedHost(req.headers.host, boundHost)) {
      res.status(403).json({ error: HOST_REFUSED_MESSAGE });
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    if (!isSameOriginOrAbsent(req.headers.origin, req.headers.host, boundHost)) {
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

  // === S17b: the setup surfaces on this path too (delimited block) ===
  // `bench/host.ts` mounts these same three for the no-repo boot; here they answer for the
  // one repo clamped at boot, so the status line's setup checklist and "Start the app" (or a
  // pasted URL) work whichever way the server came up. `benchView` is the narrow slice of a
  // Bench the two route contexts actually read (`SetupBenchView`/`TargetBenchView`) — this
  // path never constructs a full `Bench`.
  attachFsRoute(app, { host: options.host }); // #18: the fs gate accepts the bound host too
  attachTargetRoute(app, { getBench: () => benchView, getRunner: () => targetRunner });
  attachSetupRoute(app, { getBench: () => benchView, getTargetState: () => targetRunner.getState() });
  // === end S17b block ===

  // === S11 prompts + build runner: construct + mount (delimited block) ===
  // `runner` reuses `options.drafters?.ollama` for `PromptService.polish()` — the same
  // `OllamaLike` test double (`FakeOllamaDrafter`) every existing HTTP test already injects,
  // rather than inventing a second override option for the identical seam.
  const runner: BuildRunnerLike = options.runner ?? new BuildRunner({ repoRoot: store.repoRoot, ...options.claude });
  const promptService = new PromptService({
    store: promptStore,
    survey: () => store.getState().survey,
    gauges: () => store.getState().gauges,
    ollama: options.drafters?.ollama,
    runner,
    notify: () => broadcastState(wss, store),
    onBuildEvent: (id, event, elapsedMs) => {
      const payload = JSON.stringify({ type: 'build', id, event, elapsedMs });
      for (const client of wss.clients as Set<WebSocket>) {
        if (client.readyState === client.OPEN) client.send(payload);
      }
    },
  });
  attachPromptsRoute(app, promptService);
  // === end S11 block ===

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

  return { app, benchServeMode, orders, promptService, runner };
}

export async function createJigServer(options: CreateJigServerOptions): Promise<JigServerHandle> {
  // S17a: no repoRoot at all -> the new host (bench/host.ts), which can start with zero
  // clamped repos and later clamp/unclamp/re-clamp at runtime. The cast is deliberate: a
  // `BenchHostHandle` is a narrower, DIFFERENT shape (no `fixtureStore`/`toolpathStore`/etc.
  // fields — those features aren't mounted on this path yet, see that file's module doc) —
  // every field `JigServerHandle` promises that this path doesn't have is one nothing on
  // this path ever reads; every existing caller of `createJigServer` always passes
  // `repoRoot`, so this branch is exercised only by brand-new (S17a) call sites.
  if (!options.repoRoot) {
    return createBenchHost(options) as unknown as JigServerHandle;
  }

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

  // --- S11 (prompts): construct + wire ---------------------------------------------------
  const promptStore = new PromptStore(repoRoot);
  await promptStore.init(); // runs the .jig/work-orders/ -> .jig/prompts/ migration, if needed
  // -----------------------------------------------------------------------------------------

  const wss = new WebSocketServer({ noServer: true });

  // --- S17b: the target runner + the narrow bench view the setup/target routes read --------
  // `claudeInstalled` is only knowable once `buildApp` has handed back the build runner
  // (below), so the view reads it through a getter rather than capturing a stale `false`.
  let claudeInstalled = false;
  const benchView: SetupBenchView & TargetBenchView = {
    repoRoot,
    store,
    get claudeInstalled() {
      return claudeInstalled;
    },
  };
  const targetRunner = new TargetRunner({
    onLog: (line) => {
      const payload = JSON.stringify({ type: 'target-log', line });
      for (const client of wss.clients as Set<WebSocket>) {
        if (client.readyState === client.OPEN) client.send(payload);
      }
    },
    onStateChange: (state) => {
      if (state.status === 'up' && options.plate) {
        // Same normalisation `bench/host.ts` does: `PlateHost.start` may be sync or async.
        Promise.resolve(options.plate.start(state.url)).catch((err: unknown) =>
          logger.warn('could not wire the plate to the started target', String(err)),
        );
      }
      broadcastState(wss, store);
    },
  });
  // -----------------------------------------------------------------------------------------

  const { app, benchServeMode, orders, promptService, runner } = buildApp(
    store,
    wss,
    options,
    fixtureStore,
    toolpathStore,
    trialFitMirror,
    snapshotStore,
    sketchStore,
    promptStore,
    benchView, // S17b
    targetRunner, // S17b
  );
  const httpServer: HttpServer = createHttpServer(app);

  // --- S11: `wiring.claude` snapshot — see composedState's own comment for why this is a
  // one-time-at-startup check rather than a live one on every call. ---------------------------
  claudeInstalled = await runner.isClaudeAvailable();
  promptContextByStore.set(store, {
    promptService,
    getClaudeInstalled: () => claudeInstalled,
    getMigrationSkipped: () => promptStore.migrationSkipped(),
    getTargetState: () => targetRunner.getState(), // S17b
  });
  // -----------------------------------------------------------------------------------------

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
    if (!isSameOriginOrAbsent(req.headers.origin, req.headers.host, host)) {
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
    promptStore, // S11
    promptService, // S11
    benchServeMode,
    async close() {
      await targetRunner.stop(); // S17b — kills only what it started; a pointed-at URL has no pid
      watcher.stop(); // S6
      shopFreshness.stop(); // S6 fix (wave-4 finding 3)
      // wss was created with { noServer: true }, so close() alone won't drop connected
      // clients — terminate them explicitly or httpServer.close()'s callback never fires.
      for (const client of wss.clients as Set<WebSocket>) client.terminate();
      wss.close();
      await orders.close(); // finding 3 fix — drain any background auto-draft before the store goes away
      await promptService.close(); // S11 — same reasoning, for any background build in flight
      await trialFitMirror.close(); // S8 — the mirror's own listening socket, if started
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
