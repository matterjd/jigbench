import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer as createHttpServer, type IncomingMessage, type Server as HttpServer } from 'node:http';
import { join } from 'node:path';
import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import open from 'open';
import { JIG_FORMAT, stubSurvey, type DetectedTargetSummary, type GaugeSet } from '@jigbench/core';
import { HOST_REFUSED_MESSAGE, isAllowedHost, isSameOriginOrAbsent } from '../same-origin.js';
import { attachBenchServing, type BenchServeMode } from '../bench-serve.js';
import { defaultBenchDistDir } from '../default-bench-dist.js';
import { logger } from '../logger.js';
import { runSurveyAndWrite } from '../survey/run.js';
import { clampDocs } from '../docs/clamp.js';
import { createDocsRoute } from '../docs/route.js';
import { attachPromptsRoute } from '../prompts/route.js';
import { attachPlateRoute } from '../plate/route.js';
import { attachFixturesRoute } from '../fixtures/route.js';
import { attachSketchesRoute } from '../sketch/route.js';
import { attachFsRoute } from '../fs/route.js';
import { TargetRunner, type TargetRunnerLike } from '../target/runner.js';
import { attachTargetRoute } from '../target/route.js';
import { detectDevScript, summarizeDetectedTarget } from '../target/detect.js';
import { attachSetupRoute } from '../setup/route.js';
import type { BuildRunnerLike, BuildStreamEvent } from '../build/types.js';
import type { OllamaLike } from '../orders/drafters/ollama.js';
import { createBench, type Bench } from './bench.js';
import { validateClampPath } from './validate-clamp-path.js';
import { defaultRecentBenchesFile, readRecentBenches, recordRecentBench, updateRecentBench } from './recent.js';

/**
 * S17a (AMENDMENT-1 §7, A6): "`createJigServer` becomes a host holding zero or one current
 * bench". This is that host — a SEPARATE code path from `http.ts`'s existing `createJigServer`
 * (which every current test, and the CLI's `--repo`-at-boot flow, keeps using byte-for-byte
 * unchanged). `http.ts` delegates here with a two-line early return when `repoRoot` is
 * omitted at boot; see that file's own comment for why the two paths stay split rather than
 * unified into one.
 *
 * Bundle boundary: this host owns exactly `bench/bench.ts`'s Bench (JigStore, watcher, plate,
 * fixtures, prompts, sketches) plus the target runner and the fs/setup/clamp surfaces. S17b:
 * THE LOOP — `/api/prompts`, `/api/plate`, `/api/fixtures`, `/api/sketches`, `/api/docs` —
 * is mounted per bench through one swappable `express.Router` (see `currentRouter` below),
 * built on every clamp and dropped on unclamp. It still does NOT mount `orders`/`toolpath`/
 * `trialfit` routes — those are Advanced-tier (AMENDMENT-1 §3) and out of scope here; a
 * server booted with no initial `--repo` does not expose them (a disclosed gap).
 */

export interface CreateBenchHostOptions {
  port?: number;
  host?: string;
  openBrowser?: boolean;
  benchDistDir?: string;
  benchDevServerUrl?: string;
  /** Clamps this repo immediately at boot — the `--repo` case. Validated the same way a
   * runtime `POST /api/clamp` is; an invalid path here is a startup failure (thrown), not a
   * 400 (there is no HTTP response to send yet). */
  repoRoot?: string;
  /** #24: the plate proxy's listening port, for every bench this host clamps — the CLI's
   * `--plate-port` (default 4601, the number `README.md` and `docs/TEST-RUN.md` promise). The
   * Clamp path had no way to hear it, so every runtime clamp took an OS-assigned port instead.
   * Omitted, that stays the behaviour: port 0, so nothing can collide. Safe as a fixed number
   * because `clampTo` closes the previous bench — and with it the previous plate's listening
   * socket — before it creates the next one. */
  platePort?: number;
  /** Test-only override for where `recordRecentBench`/`readRecentBenches` read and write.
   * Defaults to `~/.jig/recent.json`. */
  recentBenchesFile?: string;
  claude?: { command?: string; commandArgsPrefix?: string[] };
  /** Test-only override, forwarded to every `Bench` this host creates (across clamps). */
  runner?: BuildRunnerLike;
  ollama?: OllamaLike;
  /** Test-only overrides forwarded to every `TargetRunner` this host creates. */
  targetProbeIntervalMs?: number;
  targetProbeTimeoutMs?: number;
}

export interface BenchHostHandle {
  url: string;
  port: number;
  boundAddress: string;
  /** The current bench, or `null` — exposed for tests the same way `JigServerHandle.store`
   * lets existing tests reach in directly. */
  getBench: () => Bench | null;
  benchServeMode: BenchServeMode;
  close(): Promise<void>;
}

const EMPTY_WIRING = {
  survey: 'none',
  proxy: 'none',
  drafter: 'none',
  shop: 'none',
  fixtures: 'none',
  toolpath: 'none',
  sketch: 'none',
  docs: 'none',
  claude: 'none',
} as const;

function errorStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const candidate = (err as { status?: unknown; statusCode?: unknown }).status ?? (err as { statusCode?: unknown }).statusCode;
  return typeof candidate === 'number' ? candidate : undefined;
}

/** A plain top-level helper (not an inline ternary/optional-chain on the captured `let`
 * itself) — `currentBench` is reassigned inside sibling closures (`clampTo`,
 * `closeCurrentBench`) defined in the same scope, and TS's flow narrowing for a read of it at
 * the top level of `createBenchHost` (as opposed to inside another callback) infers `never`
 * for a directly-inlined `currentBench === null ? null : currentBench.repoRoot`. Passing it as
 * a plain parameter sidesteps that entirely. */
function repoRootOf(bench: Bench | null): string | null {
  return bench ? bench.repoRoot : null;
}

export async function createBenchHost(options: CreateBenchHostOptions = {}): Promise<BenchHostHandle> {
  const { port = 4600, host = '127.0.0.1', openBrowser = false } = options;
  const recentBenchesFile = options.recentBenchesFile ?? defaultRecentBenchesFile();
  const benchOrigin = `http://localhost:${port}`;

  let currentBench: Bench | null = null;
  /** S17b: the loop's routes for the CURRENT bench — one `express.Router` built fresh on
   * every clamp (each attach function closes over that bench's own stores/services) and
   * dropped on unclamp, so a route never outlives the bench it answers for. Mounted ONCE in
   * the app (below) through a thunk that dispatches into whichever router is current, or
   * falls through to express's own 404 when nothing is clamped. */
  let currentRouter: Router | null = null;
  /** #24: every bench this host holds gets a number, bumped by `closeCurrentBench` — which
   * every clamp and every unclamp goes through. Anything started for an earlier bench checks
   * its own number before it writes: a `TargetRunner` still probing a port after the bench it
   * belonged to was let go, and a `clampTo` that a newer clamp (or an unclamp) overtook while
   * it was awaiting `createBench`. Neither can then land in the bench that came after it. */
  let generation = 0;
  const wss = new WebSocketServer({ noServer: true });

  function broadcastRaw(payload: unknown): void {
    const text = JSON.stringify(payload);
    for (const client of wss.clients as Set<WebSocket>) {
      if (client.readyState === client.OPEN) client.send(text);
    }
  }

  function makeTargetRunner(runnerGeneration: number): TargetRunnerLike {
    return new TargetRunner({
      onLog: (line) => {
        // #24: a line from the app of a bench that is gone is not this bench's log.
        if (runnerGeneration !== generation) return;
        broadcastRaw({ type: 'target-log', line });
      },
      onStateChange: (state) => {
        // #24: a probe that answers after this bench was let go — the port took its time, or
        // the human unclamped mid-start — belongs to a bench that no longer exists. Acting on
        // it here is what wired the NEXT bench's plate to the previous bench's app, and wrote
        // that app's URL onto the next bench's recent entry.
        if (runnerGeneration !== generation) return;
        if (state.status === 'up' && currentBench) {
          // `PlateHost.start` returns `Promise<string> | string` (a real proxy is always
          // async; `StubPlateHost` — never used here, but the interface is shared — is
          // sync) — `Promise.resolve(...)` normalises either into something `.catch`-able.
          Promise.resolve(currentBench.plate.start(state.url)).catch((err: unknown) =>
            logger.warn('bench host: could not wire the plate to the started target', String(err)),
          );
          // S17b: remember the URL on this repo's recent entry — the Clamp screen offers it
          // back next time. Off the request path; broadcast again once it is on disk so the
          // `recent` list a connected bench holds carries it too.
          updateRecentBench(currentBench.repoRoot, { lastUsedTargetUrl: state.url }, recentBenchesFile)
            .then(() => broadcastState())
            .catch((err: unknown) => logger.warn('bench host: could not remember the target url', String(err)));
        }
        broadcastState();
      },
      probeIntervalMs: options.targetProbeIntervalMs,
      probeTimeoutMs: options.targetProbeTimeoutMs,
    });
  }

  let targetRunner: TargetRunnerLike = makeTargetRunner(generation);

  async function composeState(): Promise<Record<string, unknown>> {
    const recent = await readRecentBenches(recentBenchesFile);
    if (!currentBench) {
      // S17b: the empty host is still a WHOLE `JigState` (core's `BenchState` extends it) —
      // an honest stub survey, an empty gauge set, no marks, no work orders — so the bench
      // never has to special-case "no bench yet" at every read. Same honest-empty convention
      // `JigStore` itself uses before a survey has run.
      const emptyGauges: GaugeSet = { jigFormat: JIG_FORMAT, gauges: [], generatedAt: new Date().toISOString() };
      return {
        bench: null,
        survey: stubSurvey(),
        gauges: emptyGauges,
        marks: [],
        workOrders: [],
        shop: null,
        wiring: EMPTY_WIRING,
        target: targetRunner.getState(),
        status: { claude: { state: 'idle' } },
        recent,
      };
    }
    const state = currentBench.store.getState();
    return {
      bench: { repoRoot: currentBench.repoRoot },
      ...state,
      wiring: { ...state.wiring, claude: currentBench.claudeInstalled ? 'installed' : 'none' },
      target: targetRunner.getState(),
      status: { claude: currentBench.promptService.claudeStatus() },
      recent,
    };
  }

  function broadcastState(): void {
    composeState()
      .then((state) => broadcastRaw({ type: 'state', state }))
      .catch((err: unknown) => logger.warn('bench host: failed to compose state for broadcast', String(err)));
  }

  async function closeCurrentBench(): Promise<void> {
    generation += 1; // #24 — everything started for the bench being let go is now stale
    currentRouter = null; // S17b — the loop stops answering before the bench it served closes
    const bench = currentBench;
    const runner = targetRunner;
    // Claimed synchronously, before the first await: a second unclamp (or a clamp racing one)
    // then finds nothing to close rather than closing the same bench twice.
    currentBench = null;

    // #24: cancel BEFORE draining. `Bench.close()` awaits every build in flight through
    // `PromptService.close()`, and a `claude -p` build's own cap is 30 minutes — so unclamp and
    // re-clamp used to block for up to that long, with `POST /api/prompts/:id/cancel` already
    // unmounted on the line above, leaving the human nothing to end the wait with. The host
    // asks the runner directly, so there is no route to reach and nothing to race.
    const running = bench?.runner.currentBuild();
    if (running) bench?.runner.cancel(running.promptId);

    await runner.stop();
    if (bench) await bench.close();
  }

  /** S17b: the loop, for one bench — see `currentRouter`. Every attach function here is the
   * same one `http.ts`'s --repo-at-boot path mounts on its app; only the mount point differs. */
  function buildLoopRouter(bench: Bench): Router {
    const router = express.Router();
    attachPromptsRoute(router, bench.promptService);
    attachPlateRoute(router, bench.plate, () => bench.store.getActiveFixture());
    attachFixturesRoute(router, bench.fixtureStore, () => bench.store.getState().survey, () => bench.plate.url);
    attachSketchesRoute(router, bench.sketchStore, () => bench.store.getState().gauges);
    router.get('/api/docs', createDocsRoute(bench.repoRoot));
    return router;
  }

  /** The one place a repo becomes THE clamped bench — `POST /api/clamp` and an initial
   * `--repo` at boot both funnel through this. Closes whatever bench/target was live first
   * (re-clamp semantics), then: construct (+ mount its loop router) -> survey (+ detect what
   * "Start the app" would run) -> auto-clamp `docs/` when present -> record in recent
   * benches -> broadcast. */
  async function clampTo(
    repoRoot: string,
  ): Promise<{ survey: unknown; docsClamped: boolean; recent: unknown; detected: DetectedTargetSummary | null }> {
    await closeCurrentBench();
    const myGeneration = generation; // #24 — this clamp's own number, taken after the bump

    const bench = await createBench(repoRoot, {
      benchOrigin,
      host: options.host,
      platePort: options.platePort,
      claude: options.claude,
      runner: options.runner,
      ollama: options.ollama,
      notify: broadcastState,
      onBuildEvent: (id: string, event: BuildStreamEvent, elapsedMs: number) => broadcastRaw({ type: 'build', id, event, elapsedMs }),
    });

    // #24: a clamp is several awaits long, and an unclamp (or a second clamp) that landed in
    // that window has already bumped the generation. This bench was never the current one, so
    // it is closed here rather than written over whatever the human asked for last.
    if (generation !== myGeneration) {
      await bench.close();
      throw Object.assign(new Error(`clamp of ${repoRoot} was superseded before it finished`), { status: 409 });
    }

    currentBench = bench;
    currentRouter = buildLoopRouter(bench); // S17b
    targetRunner = makeTargetRunner(myGeneration);

    const surveyResult = await runSurveyAndWrite(repoRoot);
    await bench.store.reload();

    // S17b: the same detection `POST /api/target/start` will do, said up front so the Clamp
    // screen can name the script (or ask for a URL when this is null).
    const detected = summarizeDetectedTarget(detectDevScript(repoRoot, surveyResult.survey));

    let docsClamped = false;
    const docsDefault = join(repoRoot, 'docs');
    if (existsSync(docsDefault)) {
      const stats = await stat(docsDefault).catch(() => null);
      if (stats?.isDirectory()) {
        await clampDocs({ repoRoot, folder: docsDefault });
        await bench.store.reload();
        docsClamped = true;
      }
    }

    const recent = await recordRecentBench({ repoRoot, clampedAt: new Date().toISOString() }, recentBenchesFile);

    broadcastState();
    return { survey: surveyResult.survey, docsClamped, recent, detected };
  }

  const app = express();
  app.use(express.json({ limit: '64kb' }));

  // #18: Host first on every /api/* request (GET included), then the same-origin gate on
  // mutating ones — identical rule to http.ts's own middleware; see same-origin.ts.
  app.use('/api', (req, res, next) => {
    if (!isAllowedHost(req.headers.host, host)) {
      res.status(403).json({ error: HOST_REFUSED_MESSAGE });
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    if (!isSameOriginOrAbsent(req.headers.origin, req.headers.host, host)) {
      res.status(403).json({ error: 'cross-origin request rejected' });
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, repoRoot: repoRootOf(currentBench) });
  });

  app.get('/api/state', async (_req, res, next) => {
    try {
      res.json(await composeState());
    } catch (err) {
      next(err);
    }
  });

  attachFsRoute(app, { host }); // #18: the fs gate accepts the bound host too
  attachTargetRoute(app, { getBench: () => currentBench, getRunner: () => targetRunner });
  attachSetupRoute(app, { getBench: () => currentBench, getTargetState: () => targetRunner.getState() });

  app.post('/api/clamp', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const raw = req.body?.repoRoot;
      const validation = await validateClampPath(typeof raw === 'string' ? raw : '');
      if (!validation.ok) {
        res.status(400).json({ error: validation.error });
        return;
      }
      const result = await clampTo(validation.resolved);
      res.json({ ok: true, repoRoot: validation.resolved, ...result });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/unclamp', async (_req, res, next) => {
    try {
      await closeCurrentBench();
      broadcastState();
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // S17b: the loop, per bench — see `currentRouter`. Mounted after the fixed routes and
  // BEFORE the bench's static serving and the JSON error handler, so a loop route's own
  // thrown error still lands in that handler, and with no bench clamped the request falls
  // through exactly as an unknown `/api/*` path always has (express's own 404).
  app.use((req, res, next) => (currentRouter ? currentRouter(req, res, next) : next()));

  const benchServeMode = attachBenchServing(app, {
    benchDistDir: options.benchDistDir ?? defaultBenchDistDir(),
    benchDevServerUrl: options.benchDevServerUrl,
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    const status = errorStatus(err) ?? 400;
    logger.warn('bench host: request failed', message);
    res.status(status).json({ error: message });
  });

  const httpServer: HttpServer = createHttpServer(app);

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
    composeState()
      .then((state) => ws.send(JSON.stringify({ type: 'state', state })))
      .catch((err: unknown) => logger.warn('bench host: failed to send initial state', String(err)));
  });

  if (options.repoRoot) {
    const validation = await validateClampPath(options.repoRoot);
    if (!validation.ok) throw new Error(validation.error);
    await clampTo(validation.resolved);
  }

  await new Promise<void>((resolve) => httpServer.listen(port, host, resolve));
  const address = httpServer.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const boundAddress = typeof address === 'object' && address ? address.address : host;
  const url = `http://localhost:${actualPort}`;

  logger.info('jig bench host listening', { url, repoRoot: repoRootOf(currentBench) });

  if (openBrowser) {
    open(url).catch((err: unknown) => logger.warn('could not open the browser automatically', String(err)));
  }

  return {
    url,
    port: actualPort,
    boundAddress,
    getBench: () => currentBench,
    benchServeMode,
    async close(): Promise<void> {
      await closeCurrentBench();
      for (const client of wss.clients as Set<WebSocket>) client.terminate();
      wss.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
