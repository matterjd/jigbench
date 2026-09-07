import { JigStore } from '../store.js';
import { JigWatcher } from '../watcher.js';
import { createPlateProxy, type PlateProxyHandle } from '../plate/proxy.js';
import { FixtureStore } from '../fixtures/store.js';
import { createFixtureInterceptor } from '../fixtures/interceptor.js';
import { PromptStore } from '../prompts/store.js';
import { PromptService } from '../prompts/service.js';
import { BuildRunner } from '../build/runner.js';
import type { BuildRunnerLike, BuildStreamEvent } from '../build/types.js';
import type { OllamaLike } from '../orders/drafters/ollama.js';
import { logger } from '../logger.js';

/**
 * S17a (AMENDMENT-1 §7, A6): "one Bench per repo root" — the re-clampable unit `bench/host.ts`
 * creates, tears down, and replaces on every `POST /api/clamp`/`POST /api/unclamp`. Bundles
 * exactly the pieces named in the S17a brief: the `JigStore`, the `.jig/` watcher, the plate
 * proxy, the prompt store/service (+ its `BuildRunner`), the fixture store, and the shop
 * heartbeat read (already folded into `JigStore.getState()` itself — nothing extra to wire).
 *
 * Deliberately NOT bundled: `ToolpathStore`, `TrialFitMirror`/`SnapshotStore`, `SketchStore`,
 * `OrdersService` — those are S5/S7(-toolpath is S8)/S8/S9's own surfaces, "Advanced" per
 * AMENDMENT-1 §3, and out of this slice's named file scope. `createJigServer`'s EXISTING
 * `--repo`-at-boot path (every current test) keeps constructing them exactly as it does
 * today, untouched by this file. A server booted through `bench/host.ts` (no initial
 * `--repo`) does not mount their HTTP routes at all yet — a disclosed gap for whichever slice
 * wires the Clamp screen's full feature set (see the worker report).
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
  readonly promptStore: PromptStore;
  readonly promptService: PromptService;
  readonly runner: BuildRunnerLike;
  readonly plate: PlateProxyHandle;
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

  const promptStore = new PromptStore(repoRoot);
  await promptStore.init();

  const runner: BuildRunnerLike = opts.runner ?? new BuildRunner({ repoRoot, ...opts.claude });
  const promptService = new PromptService({
    store: promptStore,
    survey: () => store.getState().survey,
    gauges: () => store.getState().gauges,
    ollama: opts.ollama,
    runner,
    notify,
    onBuildEvent: opts.onBuildEvent ?? noop,
  });

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
    promptStore,
    promptService,
    runner,
    plate,
    claudeInstalled,
    async close(): Promise<void> {
      watcher.stop();
      await promptService.close();
      await plate.close();
    },
  };
}
