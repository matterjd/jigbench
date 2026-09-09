import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BuildOutcome, BuildRunnerLike, ClaudeStatus, StartBuildInput } from '../build/types.js';
import { FakeOllamaDrafter } from '../orders/drafters/fake.js';
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** #24: a build that runs until something cancels it — the fake stand-in for `claude -p`, whose
 * real wall-clock cap is 30 minutes. `PromptService.close()` (and so `Bench.close()`, and so
 * unclamp and re-clamp) awaits every build in flight, which is the whole defect. */
class CancellableBuildRunner implements BuildRunnerLike {
  readonly cancelled: string[] = [];
  private running: { promptId: string; buildId: string } | null = null;
  private release: (() => void) | null = null;

  async isClaudeAvailable(): Promise<boolean> {
    return true;
  }
  currentBuild(): { promptId: string; buildId: string } | null {
    return this.running;
  }
  async start(input: StartBuildInput): Promise<BuildOutcome> {
    this.running = { promptId: input.promptId, buildId: input.buildId };
    await new Promise<void>((resolve) => {
      this.release = resolve;
      // The safety net, never reached in a passing run: a build nothing cancels still ends, so
      // a failure here reads as an assertion rather than a hung worker.
      setTimeout(resolve, 60_000).unref?.();
    });
    this.running = null;
    return { exitCode: null, filesTouched: [], transcriptPath: '', cancelled: true };
  }
  cancel(promptId: string): boolean {
    this.cancelled.push(promptId);
    this.release?.();
    return true;
  }
  status(): ClaudeStatus {
    return this.running ? { state: 'building', id: this.running.promptId, elapsed: 0 } : { state: 'idle' };
  }
}

/** #24: `createBench` awaits `runner.isClaudeAvailable()` on every clamp, which makes it the one
 * place a test can hold a clamp open for a known length of time without touching production
 * code. Used to land an unclamp squarely inside a clamp that is still being built. */
class SlowProbeBuildRunner extends FakeBuildRunner {
  constructor(private readonly delayMs: number) {
    super();
  }
  async isClaudeAvailable(): Promise<boolean> {
    await sleep(this.delayMs);
    return false;
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

/** A port nothing is on right now — never a fixed number, so two CI legs on one runner (or a
 * developer with the real 4601 in use) can run this file at the same time. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createTcpServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

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

  it('S17b: with nothing clamped the state is still a whole JigState — an honest stub survey, empty gauges/marks/workOrders — so no reader has to special-case the empty host', async () => {
    const h = await boot();
    const body = await (await fetch(`${h.url}/api/state`)).json();
    expect(body.bench).toBeNull();
    expect(body.survey.stub).toBe(true);
    expect(body.survey.components).toEqual([]);
    expect(body.gauges.gauges).toEqual([]);
    expect(body.marks).toEqual([]);
    expect(body.workOrders).toEqual([]);
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

  it('re-clamping to a different repo closes the first bench', async () => {
    const h = await boot();
    const repoA = await freshRepo();
    const repoB = await freshRepo();

    await fetch(`${h.url}/api/clamp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoRoot: repoA }),
    });
    const first = h.getBench()!;
    expect(first.repoRoot).toBe(repoA);
    // Proven through the bench's own close(), not by fetching the old plate URL: with
    // OS-assigned ports (`port: 0`) the SECOND bench's plate can be handed the very port the
    // first one just freed and answer 200 there — CI run 34160451936 (ubuntu) did exactly that.
    const closed = vi.spyOn(first, 'close');

    await fetch(`${h.url}/api/clamp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoRoot: repoB }),
    });
    expect(h.getBench()!.repoRoot).toBe(repoB);
    expect(h.getBench()).not.toBe(first);
    expect(closed).toHaveBeenCalledTimes(1);
  });
});

// --- #18: the host refuses a rebound Host and a UNC repoRoot -------------------------------
/** `fetch` drops a caller-set Host (a forbidden header in the Fetch spec) — raw `node:http`. */
function rawRequest(
  target: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(target, { method: init.method ?? 'GET', headers: init.headers ?? {} }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on('error', reject);
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}

describe('#18: the Host allowlist and UNC rejection on the bench host', () => {
  it("POST /api/clamp 400s a UNC repoRoot — in either spelling — without clamping anything", async () => {
    const h = await boot();
    for (const unc of ['\\\\evil.example\\share\\repo', '//evil.example/share/repo']) {
      const res = await fetch(`${h.url}/api/clamp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoRoot: unc }),
      });
      expect(res.status, unc).toBe(400);
      expect((await res.json()).error).toMatch(/UNC/);
    }
    expect(h.getBench()).toBeNull();
  });

  it("refuses a rebinding POST /api/clamp — Host and Origin both the attacker's name — and a rebinding GET /api/state with no Origin", async () => {
    const h = await boot();
    const port = new URL(h.url).port;
    const repoRoot = await freshRepo();

    const clampRes = await rawRequest(`${h.url}/api/clamp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: `attacker.example:${port}`,
        origin: `http://attacker.example:${port}`,
      },
      body: JSON.stringify({ repoRoot }),
    });
    expect(clampRes.status).toBe(403);
    expect(h.getBench()).toBeNull();

    const stateRes = await rawRequest(`${h.url}/api/state`, { headers: { host: `attacker.example:${port}` } });
    expect(stateRes.status).toBe(403);
    expect(stateRes.body).not.toContain('"recent"');

    // The bench's own names still answer.
    expect((await rawRequest(`${h.url}/api/state`, { headers: { host: `localhost:${port}` } })).status).toBe(200);
  });

  it('answers to the explicit host it was bound to', async () => {
    // `host: '127.0.0.1'` is what the test can actually bind on any runner; the allowlist
    // logic for a LAN address is pinned in same-origin.test.ts — this proves the option is
    // threaded through to the gate at all.
    const h = await boot({ host: '127.0.0.1' });
    const port = new URL(h.url).port;
    expect((await rawRequest(`${h.url}/api/state`, { headers: { host: `127.0.0.1:${port}` } })).status).toBe(200);
    expect((await rawRequest(`${h.url}/api/state`, { headers: { host: `attacker.example:${port}` } })).status).toBe(403);
  });
});

// #24 (the 0.2.0 review): "`--plate-port` is ignored on the Clamp-screen path (the plate came up
// on an OS-assigned port, 56258) while README.md:49 and docs/TEST-RUN.md:12 promise 4601." The
// CLI parsed the number and `createBench` already knew what to do with one; nothing carried it
// from `serve.ts` through `createJigServer` to the host, so every runtime clamp got port 0.
describe('#24: the plate binds the port it was given (--plate-port on the Clamp path)', () => {
  it('a clamp made at runtime binds platePort, and something really answers there', async () => {
    const platePort = await freePort();
    const h = await boot({ platePort });
    const repoRoot = await freshRepo();

    const res = await fetch(`${h.url}/api/clamp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoRoot }),
    });
    expect(res.status).toBe(200);

    expect(h.getBench()?.plate.port).toBe(platePort);
    expect(h.getBench()?.plate.url).toBe(`http://localhost:${platePort}/`);
    // `plate.port` falls back to the number it ASKED for when the socket has no address yet, so
    // the number alone would pass even if the bind had failed. This is the half that cannot.
    const onThePort = await fetch(`http://127.0.0.1:${platePort}/`);
    expect(onThePort.status).toBe(200);
  });

  it('the --repo-at-boot clamp binds it too', async () => {
    const platePort = await freePort();
    const repoRoot = await freshRepo();
    const h = await boot({ platePort, repoRoot });
    expect(h.getBench()?.plate.port).toBe(platePort);
  });

  it('with no platePort a clamp still takes an OS-assigned port, so nothing collides', async () => {
    const h = await boot();
    const repoRoot = await freshRepo();
    await fetch(`${h.url}/api/clamp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoRoot }),
    });
    expect(h.getBench()?.plate.port).toBeGreaterThan(0);
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
    const bench = h.getBench()!;
    const closed = vi.spyOn(bench, 'close'); // see the re-clamp test above for why not a fetch

    const res = await fetch(`${h.url}/api/unclamp`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(h.getBench()).toBeNull();

    const state = await (await fetch(`${h.url}/api/state`)).json();
    expect(state.bench).toBeNull();
    expect(closed).toHaveBeenCalledTimes(1);
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

// #24 (the 0.2.0 review): "unclamp and re-clamp await an in-flight `claude -p` build for up to
// its 30-minute cap and drop the cancel route first (`bench/host.ts:206`). Cancel before
// draining; add a generation counter so a late target-up or a late clamp cannot write into the
// next bench."
describe('#24: unclamp with a build in flight', () => {
  async function readyPromptWithBuild(h: BenchHostHandle, repoRoot: string): Promise<string> {
    await clamp(h, repoRoot);
    const created = await fetch(`${h.url}/api/prompts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requirement: 'show days overdue' }),
    });
    expect(created.status).toBe(201);
    const { id } = await created.json();
    expect((await fetch(`${h.url}/api/prompts/${id}/ready`, { method: 'POST' })).status).toBe(200);
    expect((await fetch(`${h.url}/api/prompts/${id}/build`, { method: 'POST' })).status).toBe(202);
    return id;
  }

  it('cancels the build itself and returns at once, instead of waiting out its 30-minute cap', async () => {
    const runner = new CancellableBuildRunner();
    const h = await boot({ runner });
    const repoRoot = await freshRepo();
    const id = await readyPromptWithBuild(h, repoRoot);
    expect(runner.currentBuild()?.promptId).toBe(id);

    const startedAt = Date.now();
    const res = await fetch(`${h.url}/api/unclamp`, { method: 'POST' });
    const tookMs = Date.now() - startedAt;

    expect(res.status).toBe(200);
    // The host cancels the build itself — `POST /api/prompts/:id/cancel` is unmounted with the
    // rest of the loop the moment the bench starts closing, so nothing else could have.
    expect(runner.cancelled).toEqual([id]);
    expect(tookMs).toBeLessThan(5_000);
    expect(h.getBench()).toBeNull();
  }, 20_000);

  it('a re-clamp does the same — the second repo is on the bench, not blocked behind the first repo\'s build', async () => {
    const runner = new CancellableBuildRunner();
    const h = await boot({ runner });
    const repoA = await freshRepo();
    const repoB = await freshRepo();
    const id = await readyPromptWithBuild(h, repoA);

    const startedAt = Date.now();
    await clamp(h, repoB);
    const tookMs = Date.now() - startedAt;

    expect(runner.cancelled).toEqual([id]);
    expect(tookMs).toBeLessThan(10_000);
    expect(h.getBench()!.repoRoot).toBe(repoB);
  }, 25_000);
});

// #24's generation counter, the clamp half: a clamp is several awaits long (createBench, the
// survey, the docs auto-clamp), and anything the human does in that window has to win. Without
// a generation, a clamp that finished after an unclamp simply wrote itself in as the current
// bench — the host was clamped to a repo the human had just let go of.
describe('#24: a clamp the human overtook never becomes the current bench', () => {
  it('an unclamp landing mid-clamp wins, and the superseded clamp says so instead of landing', async () => {
    const h = await boot({ runner: new SlowProbeBuildRunner(600) });
    const repoRoot = await freshRepo();

    const clamping = fetch(`${h.url}/api/clamp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoRoot }),
    });
    await sleep(150); // well inside createBench's own 600ms probe

    expect((await fetch(`${h.url}/api/unclamp`, { method: 'POST' })).status).toBe(200);

    const res = await clamping;
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/supersed/i);

    expect(h.getBench()).toBeNull();
    expect((await (await fetch(`${h.url}/api/state`)).json()).bench).toBeNull();
    expect((await fetch(`${h.url}/api/prompts`)).status).toBe(404); // no loop router left behind
  }, 20_000);
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

// --- #21: Polish on the Clamp-screen path -------------------------------------------------
// A2 rules Polish on demand when a local model exists. `http.ts`'s --repo path has an
// OrdersService whose drafter probe flips `wiring.drafter`; the Bench host's bundle had no
// Ollama client at all, so `wiring.drafter` stayed 'stub' and the card never showed the
// button, whatever was running on the desk. Like `http.test.ts`, this block clears the
// ambient `JIG_NO_MODEL=1` (CI's own switch, which short-circuits every probe by design) so
// the model path is exercised — against the fake, never a real endpoint.
describe('Polish on the Clamp-screen path (#21)', () => {
  let priorJigNoModel: string | undefined;
  beforeEach(() => {
    priorJigNoModel = process.env.JIG_NO_MODEL;
    delete process.env.JIG_NO_MODEL;
  });
  afterEach(() => {
    if (priorJigNoModel === undefined) delete process.env.JIG_NO_MODEL;
    else process.env.JIG_NO_MODEL = priorJigNoModel;
  });

  it('probes the model at clamp — wiring.drafter reads wired when it answers — and POST /api/prompts/:id/polish answers through it', async () => {
    const ollama = new FakeOllamaDrafter({ available: true });
    const h = await boot({ ollama });
    const repoRoot = await freshRepo();
    await clamp(h, repoRoot);

    const state = await (await fetch(`${h.url}/api/state`)).json();
    expect(state.wiring.drafter).toBe('wired');
    expect(ollama.calls.some((c) => c.kind === 'available')).toBe(true);

    const created = await (
      await fetch(`${h.url}/api/prompts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requirement: 'show days overdue' }),
      })
    ).json();
    const polished = await fetch(`${h.url}/api/prompts/${created.id}/polish`, { method: 'POST' });
    expect(polished.status).toBe(200);
    expect((await polished.json()).requirement).toBe('show days overdue'); // the fake echoes
    expect(ollama.calls.some((c) => c.kind === 'rewrite')).toBe(true);
  });

  it('reads stub — no button — when no model answers at clamp', async () => {
    const h = await boot({ ollama: new FakeOllamaDrafter({ available: false }) });
    const repoRoot = await freshRepo();
    await clamp(h, repoRoot);
    const state = await (await fetch(`${h.url}/api/state`)).json();
    expect(state.wiring.drafter).toBe('stub');
  });

  it('JIG_NO_MODEL=1 skips the probe entirely, as everywhere else — stub, and the fake is never asked', async () => {
    process.env.JIG_NO_MODEL = '1';
    const ollama = new FakeOllamaDrafter({ available: true });
    const h = await boot({ ollama });
    await clamp(h, await freshRepo());
    const state = await (await fetch(`${h.url}/api/state`)).json();
    expect(state.wiring.drafter).toBe('stub');
    expect(ollama.calls.filter((c) => c.kind === 'available')).toEqual([]);
  });
});
