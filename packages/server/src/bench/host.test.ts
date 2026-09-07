import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BuildOutcome, BuildRunnerLike, ClaudeStatus, StartBuildInput } from '../build/types.js';
import { createBenchHost, type BenchHostHandle } from './host.js';

class FakeBuildRunner implements BuildRunnerLike {
  async isClaudeAvailable(): Promise<boolean> {
    return false;
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

let handle: BenchHostHandle | undefined;
let dirs: string[] = [];

afterEach(async () => {
  if (handle) {
    await handle.close();
    handle = undefined;
  }
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs = [];
});

async function freshRepo(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'jig-host-'));
  dirs.push(d);
  return d;
}

async function boot(opts: Parameters<typeof createBenchHost>[0] = {}): Promise<BenchHostHandle> {
  handle = await createBenchHost({
    port: 0,
    openBrowser: false,
    benchDistDir: join(tmpdir(), 'jig-no-such-bench-dist'),
    runner: new FakeBuildRunner(),
    recentBenchesFile: join(await freshRepo(), 'recent.json'),
    targetProbeIntervalMs: 50,
    targetProbeTimeoutMs: 2000,
    ...opts,
  });
  return handle;
}

describe('GET /api/state', () => {
  it('reports bench:null, all-none wiring, and a recent list when nothing is clamped', async () => {
    const h = await boot();
    const res = await fetch(`${h.url}/api/state`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bench).toBeNull();
    expect(body.wiring).toEqual({
      survey: 'none',
      proxy: 'none',
      drafter: 'none',
      shop: 'none',
      fixtures: 'none',
      toolpath: 'none',
      sketch: 'none',
      docs: 'none',
      claude: 'none',
    });
    expect(Array.isArray(body.recent)).toBe(true);
  });
});

describe('POST /api/clamp', () => {
  it('400s with an honest message on a path that does not exist', async () => {
    const h = await boot();
    const res = await fetch(`${h.url}/api/clamp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoRoot: join(tmpdir(), 'jig-does-not-exist-anywhere-xyz') }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('400s on a repoRoot that is missing from the body entirely', async () => {
    const h = await boot();
    const res = await fetch(`${h.url}/api/clamp`, { method: 'POST' });
    expect(res.status).toBe(400);
  });

  it('runs the survey, wires the bench, and GET /api/state reflects it', async () => {
    const h = await boot();
    const repoRoot = await freshRepo();

    const res = await fetch(`${h.url}/api/clamp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoRoot }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.repoRoot).toBe(repoRoot);
    expect(body.survey).toBeDefined(); // the survey ran (even an honest stub) — the file proof is below

    const { pathExists } = await import('../fs-util.js');
    const { jigPaths } = await import('@jigbench/core');
    expect(await pathExists(join(jigPaths(repoRoot).survey, 'survey.json'))).toBe(true);

    const stateRes = await fetch(`${h.url}/api/state`);
    const state = await stateRes.json();
    expect(state.bench).toEqual({ repoRoot });
    expect(state.wiring.claude).toBe('none'); // FakeBuildRunner reports unavailable
    expect(state.recent[0].repoRoot).toBe(repoRoot);
  });

  it('auto-clamps docs/ when the folder exists, flipping wiring.docs to wired', async () => {
    const h = await boot();
    const repoRoot = await freshRepo();
    await mkdir(join(repoRoot, 'docs'), { recursive: true });
    await writeFile(join(repoRoot, 'docs', 'guide.md'), '# Guide\n\nHello.', 'utf8');

    await fetch(`${h.url}/api/clamp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoRoot }),
    });

    const state = await (await fetch(`${h.url}/api/state`)).json();
    expect(state.wiring.docs).toBe('wired');
  });

  it('re-clamping to a different repo closes the first bench (its plate stops answering)', async () => {
    const h = await boot();
    const repoA = await freshRepo();
    const repoB = await freshRepo();

    await fetch(`${h.url}/api/clamp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoRoot: repoA }),
    });
    const firstPlateUrl = h.getBench()!.plate.url;
    expect(h.getBench()!.repoRoot).toBe(repoA);

    await fetch(`${h.url}/api/clamp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoRoot: repoB }),
    });
    expect(h.getBench()!.repoRoot).toBe(repoB);

    await expect(fetch(firstPlateUrl, { signal: AbortSignal.timeout(1000) })).rejects.toBeDefined();
  });
});

describe('POST /api/unclamp', () => {
  it('closes the current bench and GET /api/state returns to bench:null', async () => {
    const h = await boot();
    const repoRoot = await freshRepo();
    await fetch(`${h.url}/api/clamp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoRoot }),
    });
    expect(h.getBench()).not.toBeNull();
    const plateUrl = h.getBench()!.plate.url;

    const res = await fetch(`${h.url}/api/unclamp`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(h.getBench()).toBeNull();

    const state = await (await fetch(`${h.url}/api/state`)).json();
    expect(state.bench).toBeNull();
    await expect(fetch(plateUrl, { signal: AbortSignal.timeout(1000) })).rejects.toBeDefined();
  });
});

describe('booting with an initial repoRoot (the --repo case)', () => {
  it('clamps at boot — GET /api/state already reports the bench with no /api/clamp call', async () => {
    const repoRoot = await freshRepo();
    const h = await boot({ repoRoot });
    expect(h.getBench()?.repoRoot).toBe(repoRoot);
    const state = await (await fetch(`${h.url}/api/state`)).json();
    expect(state.bench).toEqual({ repoRoot });
  });
});

describe('fs/target/setup routes are mounted on the host', () => {
  it('GET /api/fs/roots answers', async () => {
    const h = await boot();
    const res = await fetch(`${h.url}/api/fs/roots`);
    expect(res.status).toBe(200);
  });

  it('POST /api/target/start 409s with no bench clamped (proving the route is wired through)', async () => {
    const h = await boot();
    const res = await fetch(`${h.url}/api/target/start`, { method: 'POST' });
    expect(res.status).toBe(409);
  });

  it('GET /api/setup answers honestly with no bench clamped', async () => {
    const h = await boot();
    const res = await fetch(`${h.url}/api/setup`);
    expect(res.status).toBe(200);
    expect((await res.json()).claude).toBe('none');
  });
});

// --- S17b: the loop rides the host ----------------------------------------------------------
// AMENDMENT-1 §7 "everything else is in the bench": after a runtime `POST /api/clamp`, the
// bench's own loop (prompts, plate, fixtures, sketches, docs) must answer on this host, per
// bench — and stop answering the moment the bench is unclamped.
async function clamp(h: BenchHostHandle, repoRoot: string): Promise<Response> {
  return fetch(`${h.url}/api/clamp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ repoRoot }),
  });
}

describe('the loop after a clamp (S17b) — prompts/plate/fixtures/sketches/docs answer per bench', () => {
  it('GET /api/prompts answers an honest empty list once a repo is clamped', async () => {
    const h = await boot();
    const repoRoot = await freshRepo();
    await clamp(h, repoRoot);

    const res = await fetch(`${h.url}/api/prompts`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ prompts: [] });
  });

  it("POST /api/prompts creates a prompt file under the clamped repo's .jig/prompts/", async () => {
    const h = await boot();
    const repoRoot = await freshRepo();
    await clamp(h, repoRoot);

    const res = await fetch(`${h.url}/api/prompts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requirement: 'show days overdue' }),
    });
    expect(res.status).toBe(201);

    const files = await readdir(join(repoRoot, '.jig', 'prompts'));
    expect(files.length).toBeGreaterThan(0);
  });

  it('GET /api/plate reports status none (no target yet); fixtures, sketches and docs answer too', async () => {
    const h = await boot();
    const repoRoot = await freshRepo();
    await clamp(h, repoRoot);

    const plate = await fetch(`${h.url}/api/plate`);
    expect(plate.status).toBe(200);
    expect((await plate.json()).status).toBe('none');

    expect((await fetch(`${h.url}/api/fixtures`)).status).toBe(200);
    expect((await fetch(`${h.url}/api/sketches`)).status).toBe(200);
    expect((await fetch(`${h.url}/api/docs`)).status).toBe(200);
  });

  it('after POST /api/unclamp the loop routes are gone again (404)', async () => {
    const h = await boot();
    const repoRoot = await freshRepo();
    await clamp(h, repoRoot);
    expect((await fetch(`${h.url}/api/prompts`)).status).toBe(200);

    await fetch(`${h.url}/api/unclamp`, { method: 'POST' });
    expect((await fetch(`${h.url}/api/prompts`)).status).toBe(404);
  });

  it('re-clamping to a second repo answers for THAT repo — a prompt made in A is not listed under B', async () => {
    const h = await boot();
    const repoA = await freshRepo();
    const repoB = await freshRepo();

    await clamp(h, repoA);
    const created = await fetch(`${h.url}/api/prompts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requirement: 'show days overdue' }),
    });
    expect(created.status).toBe(201);
    expect((await (await fetch(`${h.url}/api/prompts`)).json()).prompts).toHaveLength(1);

    await clamp(h, repoB);
    expect(h.getBench()!.repoRoot).toBe(repoB);
    expect(await (await fetch(`${h.url}/api/prompts`)).json()).toEqual({ prompts: [] });
  });
});

describe('POST /api/clamp says what "Start the app" would run (S17b)', () => {
  it('reports the detected package.json script, its port and its source', async () => {
    const h = await boot();
    const repoRoot = await freshRepo();
    await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ name: 'x', scripts: { start: 'ng serve' } }), 'utf8');

    const res = await clamp(h, repoRoot);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.detected).toEqual({ script: 'start', port: 4200, source: 'package.json' });
  });

  it('reports detected: null for a repo with nothing to run', async () => {
    const h = await boot();
    const repoRoot = await freshRepo();

    const body = await (await clamp(h, repoRoot)).json();
    expect(body.detected).toBeNull();
  });
});

describe('the target URL is remembered per recent bench (S17b)', () => {
  it("POST /api/target/url stamps lastUsedTargetUrl on the clamped repo's recent entry", async () => {
    const h = await boot();
    const repoRoot = await freshRepo();
    await clamp(h, repoRoot);

    const res = await fetch(`${h.url}/api/target/url`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://localhost:8080' }),
    });
    expect(res.status).toBe(200);

    // The recent-file write is async and off the request path — poll, briefly.
    await expect
      .poll(async () => (await (await fetch(`${h.url}/api/state`)).json()).recent[0].lastUsedTargetUrl, { timeout: 2000 })
      .toBe('http://localhost:8080');
  });
});
