import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jigPaths } from '@jigbench/core';
import type { BuildOutcome, BuildRunnerLike, ClaudeStatus, StartBuildInput } from '../build/types.js';
import { createBench, type Bench } from './bench.js';

class FakeBuildRunner implements BuildRunnerLike {
  constructor(private readonly available = false) {}
  async isClaudeAvailable(): Promise<boolean> {
    return this.available;
  }
  currentBuild(): { promptId: string; buildId: string } | null {
    return null;
  }
  async start(_input: StartBuildInput): Promise<BuildOutcome> {
    return { exitCode: 0, filesTouched: [], transcriptPath: '', cancelled: false };
  }
  cancel(): boolean {
    return false;
  }
  status(): ClaudeStatus {
    return { state: 'idle' };
  }
}

let dirs: string[] = [];
let benches: Bench[] = [];

afterEach(async () => {
  await Promise.all(benches.map((b) => b.close()));
  benches = [];
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs = [];
});

async function freshRepo(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'jig-bench-'));
  dirs.push(d);
  return d;
}

async function bench(repoRoot: string, opts: Parameters<typeof createBench>[1] = {}): Promise<Bench> {
  const b = await createBench(repoRoot, { benchOrigin: 'http://localhost:0', runner: new FakeBuildRunner(), ...opts });
  benches.push(b);
  return b;
}

describe('createBench', () => {
  it('bundles a fresh JigStore, FixtureStore, PromptStore/PromptService and a plate proxy for the repo', async () => {
    const repoRoot = await freshRepo();
    const b = await bench(repoRoot);

    expect(b.repoRoot).toBe(repoRoot);
    expect(b.store.repoRoot).toBe(repoRoot);
    expect(b.store.getState().survey.stub).toBe(true); // nothing surveyed yet — honest stub
    expect(b.fixtureStore).toBeDefined();
    expect(b.promptStore).toBeDefined();
    expect(b.promptService).toBeDefined();
    expect(b.plate).toBeDefined();
    const plateStatus = await b.plate.getStatus();
    expect(plateStatus.status).toBe('none'); // no target given
  });

  it('reports claudeInstalled from the runner (real or overridden) at construction time', async () => {
    const repoRoot = await freshRepo();
    const b = await bench(repoRoot, { runner: new FakeBuildRunner(true) });
    expect(b.claudeInstalled).toBe(true);

    const repoRoot2 = await freshRepo();
    const b2 = await bench(repoRoot2, { runner: new FakeBuildRunner(false) });
    expect(b2.claudeInstalled).toBe(false);
  });

  // #37 (S20, the test gaps): `createBench`'s `opts.ollama ?? new OllamaDrafter()` is the
  // production path — #21's fix, the reason Polish appears on the Clamp-screen path at all — and
  // every test in this file passes a `runner` but no `ollama`, so the branch RAN and nothing ever
  // asserted anything about it. With `JIG_NO_MODEL=1` the probe is skipped outright, so the
  // default drafter could have been deleted and the whole suite would still be green.
  //
  // This case unsets that pin for its own duration, so the real `available()` probe runs — against
  // a port nothing answers on, named explicitly rather than inherited, so the answer is the same
  // on a desk with Ollama running as on a CI runner without it (#54's class of desk-only
  // divergence, avoided on purpose).
  it('#37: constructs a real Ollama client when none is injected, and reports the drafter as stub when no model answers', async () => {
    const repoRoot = await freshRepo();
    const noModel = process.env.JIG_NO_MODEL;
    const ollamaUrl = process.env.JIG_OLLAMA_URL;
    delete process.env.JIG_NO_MODEL;
    process.env.JIG_OLLAMA_URL = 'http://127.0.0.1:9'; // discard port — refused, and refused fast

    try {
      // No `ollama` in the options: this is `new OllamaDrafter()`, probed for real.
      const b = await bench(repoRoot);

      expect(b.store.getState().wiring.drafter).toBe('stub'); // probed, nothing there, said so
      expect(b.promptService).toBeDefined();

      // Polish is on demand and answers honestly rather than throwing something a caller cannot
      // read — the behaviour #21 wired this client in for.
      const prompt = await b.promptService.create({ requirement: 'Show days overdue beside the due date' });
      await expect(b.promptService.polish(prompt.id)).rejects.toThrow(/no local model is reachable/);
    } finally {
      if (noModel === undefined) delete process.env.JIG_NO_MODEL;
      else process.env.JIG_NO_MODEL = noModel;
      if (ollamaUrl === undefined) delete process.env.JIG_OLLAMA_URL;
      else process.env.JIG_OLLAMA_URL = ollamaUrl;
    }
  });

  it('the .jig/ watcher notices an external write and calls notify() after reloading the store', async () => {
    const repoRoot = await freshRepo();
    let notified = 0;
    const b = await bench(repoRoot, { notify: () => notified++ });

    const paths = jigPaths(repoRoot);
    await mkdir(paths.cache, { recursive: true });
    const now = new Date().toISOString();
    await writeFile(
      join(paths.cache, 'shop.json'),
      JSON.stringify({ client: 'test-agent', pid: 1, connectedAt: now, lastSeen: now }),
      'utf8',
    );

    await expect
      .poll(() => notified, { timeout: 3000, interval: 50 })
      .toBeGreaterThan(0);
    expect(b.store.getState().shop).toEqual({ client: 'test-agent', connectedAt: now });
  });

  it('close() stops the watcher and shuts the plate proxy down (its url stops answering)', async () => {
    const repoRoot = await freshRepo();
    const b = await createBench(repoRoot, { benchOrigin: 'http://localhost:0', runner: new FakeBuildRunner() });
    const plateUrl = b.plate.url;
    await b.close();

    await expect(fetch(plateUrl, { signal: AbortSignal.timeout(1000) })).rejects.toBeDefined();
  });

  it('two benches for two different repos run independent plate proxies on different ports', async () => {
    const repoA = await freshRepo();
    const repoB = await freshRepo();
    const a = await bench(repoA);
    const b = await bench(repoB);
    expect(a.plate.port).not.toBe(b.plate.port);
  });
});
