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
