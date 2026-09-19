import { JigStore } from '../store.js';
import { JigWatcher } from '../watcher.js';
import { createPlateProxy, type PlateProxyHandle } from '../plate/proxy.js';
import { FixtureStore } from '../fixtures/store.js';
import { SketchStore } from '../sketch/store.js'; // S17b
import { createFixtureInterceptor } from '../fixtures/interceptor.js';
import { PromptStore } from '../prompts/store.js';
import { PromptService } from '../prompts/service.js';
// #23 ruling 1 — the Advanced tier, per bench (S5/S8's own surfaces)
import { ToolpathStore } from '../toolpath/store.js';
import { TrialFitMirror } from '../trialfit/mirror.js';
import { SnapshotStore } from '../trialfit/snapshot.js';
import { OrdersService } from '../orders/service.js';
import { BuildRunner } from '../build/runner.js';
import type { BuildRunnerLike, BuildStreamEvent } from '../build/types.js';
import { OllamaDrafter, type OllamaLike } from '../orders/drafters/ollama.js';
import { logger } from '../logger.js';

/**
 * S17a (AMENDMENT-1 §7, A6): "one Bench per repo root" — the re-clampable unit `bench/host.ts`
 * creates, tears down, and replaces on every `POST /api/clamp`/`POST /api/unclamp`. Bundles
 * exactly the pieces named in the S17a brief: the `JigStore`, the `.jig/` watcher, the plate
 * proxy, the prompt store/service (+ its `BuildRunner`), the fixture store, and the shop
 * heartbeat read (already folded into `JigStore.getState()` itself — nothing extra to wire).
 *
 * S17b folds the `SketchStore` in too — the loop (prompts, plate, fixtures, sketches, docs)
 * rides `bench/host.ts` per bench now, through one swappable router; see that file.
 *
 * S21 (#23 ruling 1, Matter 2026-09-14 — "MOUNT them (toolpath, work orders, trial fit) so
 * the Clamp path equals --repo") folds in the Advanced tier S17a deliberately left out and
 * disclosed as a gap: the `ToolpathStore`, the `TrialFitMirror` + `SnapshotStore`, and the
 * `OrdersService`. They are still "Advanced" per AMENDMENT-1 §3 — one toggle away on the
 * surface — but a bench reached through the Clamp screen now holds exactly what a bench
 * reached through `--repo` holds, and `bench/host.ts` mounts their routes per bench.
 */

export interface CreateBenchOptions {
  /** The bench server's own origin (e.g. `http://localhost:4600`) — stamped into the plate
   * proxy's injected script/CSP rewrite, same as `createJigServer` already does for the
   * `--repo`-at-boot path. */
  benchOrigin: string;
  /** Interface the plate proxy binds to. Defaults to loopback-only inside `createPlateProxy`. */
  host?: string;
  /** The plate proxy's own listening port. Defaults to an OS-assigned port (0) so multiple
   * benches (across a process lifetime, one at a time) never collide on a fixed port. */
  platePort?: number;
  /** The target app's dev server, when already known at clamp time. Absent — the common
   * case for a fresh clamp — leaves the plate reporting `status: 'none'` until
   * `target/runner.ts` (driven by `bench/host.ts`) starts or points at one. */
  target?: string;
  /** Test/override hook, same shape as `http.ts`'s own `options.claude`. */
  claude?: { command?: string; commandArgsPrefix?: string[] };
  /** Test-only override — inject a deterministic `BuildRunnerLike` instead of a real
   * child-process `BuildRunner`. */
  runner?: BuildRunnerLike;
  ollama?: OllamaLike;
  /** Called after any bench-internal mutation (a `.jig/` external write reloading the store,
   * a prompt mutation, a build event) — `bench/host.ts` wires this to its own WS broadcast. */
  notify?: () => void;
  onBuildEvent?: (id: string, event: BuildStreamEvent, elapsedMs: number) => void;
}

export interface Bench {
  readonly repoRoot: string;
  readonly store: JigStore;
  readonly fixtureStore: FixtureStore;
  /** S17b — the sketch data/lifecycle store, so the host's per-bench sketch route has one. */
  readonly sketchStore: SketchStore;
  readonly promptStore: PromptStore;
  readonly promptService: PromptService;
  readonly runner: BuildRunnerLike;
  readonly plate: PlateProxyHandle;
  /** #23 ruling 1 — the Advanced tier, one set per bench, torn down with it. */
  readonly toolpathStore: ToolpathStore;
  readonly trialFitMirror: TrialFitMirror;
  readonly snapshotStore: SnapshotStore;
  readonly orders: OrdersService;
  /** A one-time-at-construction snapshot, same reasoning as `http.ts`'s own
   * `wiring.claude` — see that file's comment for why this is never re-probed live. */
  readonly claudeInstalled: boolean;
  /** Awaits the watcher, the plate proxy, and any build/prompt work in flight before
   * resolving — a caller (host.ts's clamp/unclamp, or the server's own shutdown) never has
   * to know the bundle's internals to tear it down cleanly. */
  close(): Promise<void>;
}

const noop = (): void => {};

export async function createBench(repoRoot: string, opts: CreateBenchOptions): Promise<Bench> {
  const notify = opts.notify ?? noop;

  const store = new JigStore(repoRoot);
  await store.init();

  const plate = createPlateProxy({
    target: opts.target,
    benchOrigin: opts.benchOrigin,
    port: opts.platePort ?? 0,
    host: opts.host,
  });
  store.setProxyWired(true);

  const fixtureStore = new FixtureStore(repoRoot, store);
  await fixtureStore.init();
  plate.addInterceptor?.(createFixtureInterceptor(fixtureStore));

  const sketchStore = new SketchStore(repoRoot, store); // store satisfies SketchWiringSink (S17b)
  await sketchStore.init();

  const promptStore = new PromptStore(repoRoot);
  await promptStore.init();

  // #21 (the 0.2.0 review): Polish is on demand when a local model exists (AMENDMENT-1 A2).
  // `http.ts`'s --repo path has an OrdersService whose drafter probe flips `wiring.drafter`;
  // this bundle had no Ollama client at all — `PromptService.polish()` threw "unavailable" and
  // the store's wiring stayed 'stub', so the button never appeared on the Clamp-screen path
  // whatever was running on the desk. The same client OrdersService builds, probed once at
  // clamp (`JIG_NO_MODEL=1` skips the probe, as everywhere else), sets the wiring the prompt
  // card reads; `polish()` still asks `available()` again on every call, so a model that
  // goes away after the clamp is a readable "unavailable", never a hang.
  const ollama: OllamaLike = opts.ollama ?? new OllamaDrafter();
  const ollamaUp = process.env.JIG_NO_MODEL === '1' ? false : await ollama.available();
  store.setDrafterWiring(ollamaUp ? 'wired' : 'stub');

  const runner: BuildRunnerLike = opts.runner ?? new BuildRunner({ repoRoot, ...opts.claude });
  const promptService = new PromptService({
    store: promptStore,
    survey: () => store.getState().survey,
    gauges: () => store.getState().gauges,
    ollama,
    runner,
    notify,
    onBuildEvent: opts.onBuildEvent ?? noop,
  });

  // #23 ruling 1: the Advanced tier, constructed exactly as `http.ts`'s --repo path does —
  // the toolpath index and the trial-fit snapshot dir under this repo's own `.jig/`, the
  // mirror on this bench's own origin, and one `OrdersService` over the same store (sharing
  // the probed `ollama` above rather than building a second client for the same desk).
  const toolpathStore = new ToolpathStore(repoRoot, store); // store satisfies ToolpathWiringSink
  await toolpathStore.init();
  const trialFitMirror = new TrialFitMirror(opts.benchOrigin);
  const snapshotStore = new SnapshotStore(repoRoot);
  await snapshotStore.init();
  const orders = new OrdersService({ store, notify, ollama });

  const claudeInstalled = await runner.isClaudeAvailable();

  const watcher = new JigWatcher({
    repoRoot,
    onChange: () => {
      store
        .reload()
        .then(notify)
        .catch((err: unknown) => logger.warn('bench watcher: reload after an external .jig/ change failed', String(err)));
    },
  });
  watcher.start();

  return {
    repoRoot,
    store,
    fixtureStore,
    sketchStore,
    promptStore,
    promptService,
    runner,
    plate,
    toolpathStore,
    trialFitMirror,
    snapshotStore,
    orders,
    claudeInstalled,
    async close(): Promise<void> {
      watcher.stop();
      // #23 ruling 1: same order `http.ts`'s own close uses — drain any background auto-draft
      // before the store goes away, then any build in flight, then the mirror's listening
      // socket (it binds a real port when Advanced started one, and nothing else would).
      await orders.close();
      await promptService.close();
      await trialFitMirror.close();
      await plate.close();
    },
  };
}
