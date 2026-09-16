import { afterEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// #81 item 1: the spy that proves `clampDocs` is never REACHED for a refused folder — not
// merely that it wrote nothing. The real implementation is kept behind it so every other test
// in this file still clamps for real.
vi.mock('../docs/clamp.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../docs/clamp.js')>();
  return { ...real, clampDocs: vi.fn(real.clampDocs) };
});

import { clampDocs } from '../docs/clamp.js';
import { UNC_REFUSED_MESSAGE } from '../fs/unc-path.js';
import type { BuildOutcome, BuildRunnerLike, ClaudeStatus, StartBuildInput } from '../build/types.js';
import { createBench, type Bench } from '../bench/bench.js';
import type { TargetState } from '../target/runner.js';
import { attachSetupRoute } from './route.js';

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

let server: HttpServer | undefined;
let dirs: string[] = [];
let bench: Bench | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
  if (bench) {
    await bench.close();
    bench = undefined;
  }
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs = [];
});

async function freshRepo(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'jig-setup-'));
  dirs.push(d);
  return d;
}

async function boot(opts: {
  bench?: Bench | null;
  targetState?: TargetState;
  desktopConfigPath?: string;
  /** #81 item 1 — the same test-only seam `FsRouteOptions` carries. */
  realpath?: (path: string) => Promise<string>;
}): Promise<{ app: Express; url: string }> {
  const app = express();
  app.use(express.json());
  attachSetupRoute(app, {
    getBench: () => opts.bench ?? null,
    getTargetState: () => opts.targetState ?? { status: 'none' },
    getDesktopConfigPath: () => opts.desktopConfigPath,
    realpath: opts.realpath,
  });
  server = createHttpServer(app);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { app, url: `http://127.0.0.1:${port}` };
}

describe('GET /api/setup', () => {
  it('reports an honest all-empty checklist when no repo is clamped', async () => {
    const { url } = await boot({});
    const res = await fetch(`${url}/api/setup`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      survey: false,
      docs: false,
      target: { status: 'none' },
      mcp: { written: false, path: undefined },
      desktop: { written: false, path: undefined },
      claude: 'none',
      detected: null, // #20
    });
  });

  // #20 (the 0.2.0 review): the checklist one click from the status line could never start
  // the app — `detected` existed only in the Clamp screen's local clamp result, so the drawer
  // always showed the URL field. `GET /api/setup` now answers the same detection
  // `POST /api/clamp` does, so the drawer can offer "Start the app".
  it('#20: says what "Start the app" would run — `detected`, the same answer POST /api/clamp gives', async () => {
    const repoRoot = await freshRepo();
    await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ name: 'x', scripts: { start: 'ng serve' } }), 'utf8');
    bench = await createBench(repoRoot, { benchOrigin: 'http://localhost:0', runner: new FakeBuildRunner() });
    const { url } = await boot({ bench });

    const body = await (await fetch(`${url}/api/setup`)).json();
    expect(body.detected).toEqual({ script: 'start', port: 4200, source: 'package.json' });
  });

  it('#20: `detected` is null for a clamped repo with nothing to run', async () => {
    const repoRoot = await freshRepo();
    bench = await createBench(repoRoot, { benchOrigin: 'http://localhost:0', runner: new FakeBuildRunner() });
    const { url } = await boot({ bench });

    const body = await (await fetch(`${url}/api/setup`)).json();
    expect(body.detected).toBeNull();
  });

  it('reflects a clamped bench\'s real survey/docs/claude wiring', async () => {
    const repoRoot = await freshRepo();
    bench = await createBench(repoRoot, { benchOrigin: 'http://localhost:0', runner: new FakeBuildRunner() });
    const { url } = await boot({ bench, targetState: { status: 'up', url: 'http://localhost:4200', pid: 123 } });

    const res = await fetch(`${url}/api/setup`);
    const body = await res.json();
    expect(body.survey).toBe(false); // nothing surveyed in this fresh temp repo — honest stub
    expect(body.docs).toBe(false);
    expect(body.target).toEqual({ status: 'up', url: 'http://localhost:4200', pid: 123 });
    expect(body.claude).toBe('none'); // FakeBuildRunner reports unavailable
    expect(body.mcp.path).toBe(join(repoRoot, '.mcp.json'));
  });
});

describe('POST /api/setup/mcp', () => {
  it('409s when no repo is clamped', async () => {
    const { url } = await boot({});
    const res = await fetch(`${url}/api/setup/mcp`, { method: 'POST' });
    expect(res.status).toBe(409);
  });

  it('returns a diff and writes nothing without apply:true', async () => {
    const repoRoot = await freshRepo();
    bench = await createBench(repoRoot, { benchOrigin: 'http://localhost:0', runner: new FakeBuildRunner() });
    const { url } = await boot({ bench });

    const res = await fetch(`${url}/api/setup/mcp`, { method: 'POST' });
    const body = await res.json();
    expect(body.changed).toBe(true);
    expect(body.wrote).toBe(false);
    expect(typeof body.diff).toBe('string');
    expect(body.diff).toContain('jig');

    await expect(readFile(join(repoRoot, '.mcp.json'), 'utf8')).rejects.toThrow();
  });

  it('writes .mcp.json and appends the .gitignore entry when apply:true', async () => {
    const repoRoot = await freshRepo();
    bench = await createBench(repoRoot, { benchOrigin: 'http://localhost:0', runner: new FakeBuildRunner() });
    const { url } = await boot({ bench });

    const res = await fetch(`${url}/api/setup/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apply: true }),
    });
    const body = await res.json();
    expect(body.wrote).toBe(true);

    const mcpJson = JSON.parse(await readFile(join(repoRoot, '.mcp.json'), 'utf8'));
    expect(mcpJson.mcpServers.jig).toEqual({ command: 'npx', args: ['jigbench', 'mcp', '--repo', repoRoot.replace(/\\/g, '/')] });

    const gitignore = await readFile(join(repoRoot, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.jig/cache/');
  });

  it('reports changed:false and wrote:false when already up to date', async () => {
    const repoRoot = await freshRepo();
    bench = await createBench(repoRoot, { benchOrigin: 'http://localhost:0', runner: new FakeBuildRunner() });
    const { url } = await boot({ bench });

    await fetch(`${url}/api/setup/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apply: true }) });
    const res = await fetch(`${url}/api/setup/mcp`, { method: 'POST' });
    const body = await res.json();
    expect(body.changed).toBe(false);
    expect(body.wrote).toBe(false);
  });
});

describe('POST /api/setup/desktop', () => {
  it('409s when no repo is clamped', async () => {
    const { url } = await boot({});
    const res = await fetch(`${url}/api/setup/desktop`, { method: 'POST' });
    expect(res.status).toBe(409);
  });

  it('404s honestly when the platform has no known Claude Desktop config location', async () => {
    const repoRoot = await freshRepo();
    bench = await createBench(repoRoot, { benchOrigin: 'http://localhost:0', runner: new FakeBuildRunner() });
    const { url } = await boot({ bench, desktopConfigPath: undefined });
    const res = await fetch(`${url}/api/setup/desktop`, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('writes the config only with apply:true', async () => {
    const repoRoot = await freshRepo();
    const configDir = await freshRepo();
    const configPath = join(configDir, 'claude_desktop_config.json');
    bench = await createBench(repoRoot, { benchOrigin: 'http://localhost:0', runner: new FakeBuildRunner() });
    const { url } = await boot({ bench, desktopConfigPath: configPath });

    const diffOnly = await fetch(`${url}/api/setup/desktop`, { method: 'POST' });
    expect((await diffOnly.json()).wrote).toBe(false);
    await expect(readFile(configPath, 'utf8')).rejects.toThrow();

    const applied = await fetch(`${url}/api/setup/desktop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apply: true }),
    });
    expect((await applied.json()).wrote).toBe(true);
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    expect(config.mcpServers.jig.args).toContain(repoRoot);
  });
});

describe('POST /api/docs/clamp', () => {
  it('409s when no repo is clamped', async () => {
    const { url } = await boot({});
    const res = await fetch(`${url}/api/docs/clamp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ folder: 'docs' }) });
    expect(res.status).toBe(409);
  });

  it('clamps a docs folder and reloads the bench store so wiring.docs flips to wired', async () => {
    const repoRoot = await freshRepo();
    const docsFolder = join(repoRoot, 'my-docs');
    await mkdir(docsFolder, { recursive: true });
    await writeFile(join(docsFolder, 'guide.md'), '# Guide\n\nSome content here.', 'utf8');

    bench = await createBench(repoRoot, { benchOrigin: 'http://localhost:0', runner: new FakeBuildRunner() });
    const { url } = await boot({ bench });

    const res = await fetch(`${url}/api/docs/clamp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folder: docsFolder }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files).toBeGreaterThan(0);

    expect(bench.store.getState().wiring.docs).toBe('wired');
  });

  // #81 item 1 (the S20 review's first follow-up): this route refused only the UNC SPELLING
  // (`setup/route.ts:179`), which is where `/api/fs/list` and `/api/clamp` were before #37. A
  // symlink inside the home pointing at `\\attacker\share` is spelled like any
  // other local path, so it carried the share straight past that check and `clampDocs` walked
  // it — `stat` and then `readdir`, every one of them the SMB connection the guard exists to
  // prevent. Planting the win32 shape for real would make that connection on a CI runner, so
  // the realpath answer is injected here, exactly as `fs/route.test.ts` does for the browser.
  it('#81: 400s a locally-spelled folder whose real target is a UNC share, and never reaches clampDocs', async () => {
    const repoRoot = await freshRepo();
    const docsFolder = join(repoRoot, 'my-docs');
    await mkdir(docsFolder, { recursive: true });
    await writeFile(join(docsFolder, 'guide.md'), '# Guide\n\nSome content here.', 'utf8');

    bench = await createBench(repoRoot, { benchOrigin: 'http://localhost:0', runner: new FakeBuildRunner() });
    vi.mocked(clampDocs).mockClear();
    const { url } = await boot({ bench, realpath: async () => '\\\\attacker.example\\share\\loot' });

    const res = await fetch(`${url}/api/docs/clamp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folder: docsFolder }),
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(UNC_REFUSED_MESSAGE);
    expect(clampDocs).not.toHaveBeenCalled();
    expect(bench.store.getState().wiring.docs).not.toBe('wired');
  });

  // #81 item 1, the lead's repair: the guard's two spellings must stay APART. The walk goes
  // through `real` (the spelling the guard cleared, so nothing can be re-pointed between the
  // check and the read), but everything the index RECORDS — its `root`, every `files[].file`
  // and every `chunks[].id` — is the caller's spelling, because `bench.repoRoot` is the
  // caller's spelling too (`bench/validate-clamp-path.ts` returns `resolved`, not `real`) and
  // `relative()` between the two forms escapes: the same 8.3/junction mismatch
  // `build/git-diff.ts` documents against a real CI failure. `DocsIndex.root` and those refs
  // are reported back by `GET /api/docs`, by the MCP `jig_docs` tool and by the prompt builder,
  // so a mismatch is caller-facing. The realpath answer is injected, the same seam the two
  // tests above use — planting a junction for real would need a privilege CI does not have.
  it('#81: records the caller\'s spelling even when the real one differs — refs stay repo-relative', async () => {
    const linkRepo = await freshRepo(); // the spelling the human picked, and `bench.repoRoot`
    const realRepo = await freshRepo(); // what `realpath` says it really is
    await mkdir(join(realRepo, 'docs'), { recursive: true });
    await writeFile(join(realRepo, 'docs', 'guide.md'), '# Guide\n\nSome content here.', 'utf8');

    bench = await createBench(linkRepo, { benchOrigin: 'http://localhost:0', runner: new FakeBuildRunner() });
    vi.mocked(clampDocs).mockClear();
    const { url } = await boot({ bench, realpath: async (p: string) => p.replace(linkRepo, realRepo) });

    const res = await fetch(`${url}/api/docs/clamp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folder: join(linkRepo, 'docs') }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files).toBe(1);

    // The walk went through the real spelling — that is the TOCTOU fix, and it stays.
    expect(vi.mocked(clampDocs).mock.calls[0][0].folder).toBe(join(realRepo, 'docs'));

    const index = JSON.parse(await readFile(body.file, 'utf8'));
    expect(index.files[0].file).toBe('docs/guide.md');
    expect(index.chunks[0].id.startsWith('docs/guide.md#')).toBe(true);
    expect(index.root).toBe(join(linkRepo, 'docs').split('\\').join('/'));
  });

  // The acceptance for #81 item 1: one input, three routes, one refusal in one wording. The
  // other two now assert the same constant — `fs/route.test.ts` and
  // `bench/validate-clamp-path.test.ts` both import `UNC_REFUSED_MESSAGE` and pin it, so the
  // wording cannot drift in one route without a red in that route's own file.
  it('#18/#81: still 400s a raw UNC spelling, in the words the other two routes use', async () => {
    const repoRoot = await freshRepo();
    bench = await createBench(repoRoot, { benchOrigin: 'http://localhost:0', runner: new FakeBuildRunner() });
    vi.mocked(clampDocs).mockClear();
    const { url } = await boot({ bench });

    for (const unc of ['\\\\evil.example\\share', '//evil.example/share']) {
      const res = await fetch(`${url}/api/docs/clamp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ folder: unc }),
      });
      expect(res.status, unc).toBe(400);
      expect((await res.json()).error, unc).toBe(UNC_REFUSED_MESSAGE);
    }
    expect(clampDocs).not.toHaveBeenCalled();
  });
});
