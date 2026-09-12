import { afterEach, describe, expect, it } from 'vitest';
import express, { type Express } from 'express';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Bench } from '../bench/bench.js';
import type { StartTargetInput, TargetRunnerLike, TargetState } from './runner.js';
import { attachTargetRoute } from './route.js';

class FakeTargetRunner implements TargetRunnerLike {
  state: TargetState = { status: 'none' };
  startedWith: StartTargetInput | undefined;
  getState(): TargetState {
    return this.state;
  }
  async start(input: StartTargetInput): Promise<void> {
    this.startedWith = input;
    this.state = { status: 'up', url: `http://localhost:${input.port}`, pid: 4242 };
  }
  setUrl(url: string): void {
    this.state = { status: 'up', url };
  }
  async stop(): Promise<void> {
    this.state = { status: 'none' };
  }
}

let server: HttpServer | undefined;
let dirs: string[] = [];
let runner: FakeTargetRunner;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs = [];
});

async function freshRepo(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'jig-targetroute-'));
  dirs.push(d);
  return d;
}

function fakeBench(repoRoot: string, survey: unknown = { stub: true }): Bench {
  return {
    repoRoot,
    store: { getState: () => ({ survey }) } as unknown as Bench['store'],
  } as unknown as Bench;
}

async function boot(bench: Bench | null): Promise<{ app: Express; url: string }> {
  const app = express();
  app.use(express.json());
  runner = new FakeTargetRunner();
  attachTargetRoute(app, { getBench: () => bench, getRunner: () => runner });
  server = createHttpServer(app);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { app, url: `http://127.0.0.1:${port}` };
}

describe('POST /api/target/start', () => {
  it('409s when no repo is clamped', async () => {
    const { url } = await boot(null);
    const res = await fetch(`${url}/api/target/start`, { method: 'POST' });
    expect(res.status).toBe(409);
  });

  it('400s honestly when nothing about the repo can be detected and no {script} is given', async () => {
    const repoRoot = await freshRepo();
    const { url } = await boot(fakeBench(repoRoot));
    const res = await fetch(`${url}/api/target/start`, { method: 'POST' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/could not detect/i);
  });

  it('detects package.json\'s start script and starts the runner with it, accepting 202', async () => {
    const repoRoot = await freshRepo();
    await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ scripts: { start: 'ng serve' } }), 'utf8');
    const { url } = await boot(fakeBench(repoRoot));

    const res = await fetch(`${url}/api/target/start`, { method: 'POST' });
    expect(res.status).toBe(202);
    // start() is fire-and-forget from the route's point of view, but the fake resolves
    // synchronously-ish — poll briefly for it to have registered.
    await expect.poll(() => runner.startedWith).toBeDefined();
    expect(runner.startedWith?.args.slice(-2)).toEqual(['run', 'start']); // trailing args — see detect.test.ts for the platform-specific leading invocation (cmd.exe /d /s /c on Windows)
    expect(runner.startedWith?.cwd).toBe(repoRoot);
  });

  it('an explicit {script} in the body overrides detection — when package.json defines it', async () => {
    const repoRoot = await freshRepo();
    // #17: `start` is what detection would pick; `dev` is the explicit override, and it must be
    // a script the repo itself names for the route to run it at all (see the three tests below).
    await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ scripts: { start: 'ng serve', dev: 'vite' } }), 'utf8');
    const { url } = await boot(fakeBench(repoRoot));
    const res = await fetch(`${url}/api/target/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ script: 'dev', port: 5173 }),
    });
    expect(res.status).toBe(202);
    await expect.poll(() => runner.startedWith).toBeDefined();
    expect(runner.startedWith?.args.slice(-2)).toEqual(['run', 'dev']);
    expect(runner.startedWith?.port).toBe(5173);
  });

  // #17: on win32 `detect.ts`'s `invocation` routes npm through `cmd.exe /d /s /c`, and cmd.exe
  // re-parses the joined command line — `&`, `|`, `^`, `%` inside an argv element run as shell
  // syntax. The only defence is upstream: an explicit {script} is accepted solely when it is a
  // key of the clamped repo's own package.json `scripts`. These three pin that on every OS.
  async function startWithScript(url: string, script: string): Promise<Response> {
    return fetch(`${url}/api/target/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ script }),
    });
  }

  it('#17: 400s — and never spawns — on a {script} carrying cmd.exe metacharacters that package.json does not define', async () => {
    const repoRoot = await freshRepo();
    await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ scripts: { start: 'ng serve' } }), 'utf8');
    const { url } = await boot(fakeBench(repoRoot));

    // #37: `start&calc.exe`, not `start & calc.exe`. libuv quotes an argument containing a
    // space, a tab or a quote, so the SPACED form reaches cmd.exe as one quoted token and could
    // never have injected anything — the old payload proved less than it looked. Unspaced, `&`
    // is passed through bare and cmd.exe splits the line on it.
    const res = await startWithScript(url, 'start&calc.exe');
    expect(res.status).toBe(400);
    const body = await res.json();
    // #37: two refusals, one per platform, and both are right — so this asserts the one that
    // actually applies rather than a regex that happens to match only off Windows (which is how
    // CI run 34716234717 caught this: green on ubuntu, red on windows-latest). On win32 the name
    // never reaches the membership test: `isRunnableScriptName` refuses those characters first,
    // and `packageJsonScriptNames` would have dropped such a key from the list anyway. Off win32
    // nothing re-parses npm's argv, so the only thing that can refuse this name is that the repo
    // does not define it.
    expect(body.error).toMatch(process.platform === 'win32' ? /letters, digits/ : /package\.json/);

    // start() is fire-and-forget after a 202 — give a wrongly-accepted spawn every chance to
    // have registered before asserting it never did.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(runner.startedWith).toBeUndefined();
    expect(runner.getState()).toEqual({ status: 'none' });
  });

  it('#17: 400s on a clean-looking {script} name the package.json simply does not define', async () => {
    const repoRoot = await freshRepo();
    await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ scripts: { start: 'ng serve' } }), 'utf8');
    const { url } = await boot(fakeBench(repoRoot));

    const res = await startWithScript(url, 'dev');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('start'); // the message names what the repo does define
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(runner.startedWith).toBeUndefined();
  });

  // #37: the hole #17 left. Being a key of package.json was the whole test, and a repo's own key
  // can carry the metacharacters — `"start&calc.exe": "echo pwned"` in a hostile clone was a name
  // Jig would hand to cmd.exe. On win32 the name must also be letters, digits, `-`, `_`, `:` or
  // `.`; off win32 nothing re-parses npm's argv, so the repo's own key is the repo's business
  // (which is why this case runs only on the Windows leg — `isRunnableScriptName`'s own tests in
  // detect.test.ts prove both branches on every leg).
  const itOnWin32 = process.platform === 'win32' ? it : it.skip;

  itOnWin32('#37: 400s on a {script} the repo DOES define, when the name would split under cmd.exe', async () => {
    const repoRoot = await freshRepo();
    await writeFile(
      join(repoRoot, 'package.json'),
      JSON.stringify({ scripts: { start: 'ng serve', 'start&calc.exe': 'echo pwned' } }),
      'utf8',
    );
    const { url } = await boot(fakeBench(repoRoot));

    const res = await startWithScript(url, 'start&calc.exe');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/letters, digits/);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(runner.startedWith).toBeUndefined();
    expect(runner.getState()).toEqual({ status: 'none' });
  });

  itOnWin32('#37: a repo whose only script splits under cmd.exe detects nothing to start, rather than starting that', async () => {
    const repoRoot = await freshRepo();
    await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ scripts: { start: 'ng serve&calc.exe' } }), 'utf8');
    const { url } = await boot(fakeBench(repoRoot));

    // The VALUE may be anything — the repo runs its own scripts however it likes; only the NAME
    // reaches Jig's argv, and `start` is a fine name. So this one starts.
    const res = await fetch(`${url}/api/target/start`, { method: 'POST' });
    expect(res.status).toBe(202);
    await expect.poll(() => runner.startedWith).toBeDefined();
    expect(runner.startedWith?.args.slice(-2)).toEqual(['run', 'start']);
  });

  it('#17: 400s on any {script} when the repo has no package.json at all — nothing can be a key of it', async () => {
    const repoRoot = await freshRepo();
    const { url } = await boot(fakeBench(repoRoot));

    const res = await startWithScript(url, 'dev');
    expect(res.status).toBe(400);

    // #37 (S20, the test gaps): the status was all this case checked, and a 400 is also what the
    // "not a script in this package.json" branch answers — so the no-scripts branch's own words,
    // which are the ones that tell a human what to do instead, were never asserted at all. They
    // have to name what was asked for, say why nothing can be run, and point at the way out.
    const error = (await res.json()).error as string;
    expect(error).toContain('"dev"'); // what was asked for, quoted
    expect(error).toContain("this repo's package.json defines no scripts"); // why, not just that
    expect(error).toContain('POST /api/target/url'); // and the way out — paste a URL instead
    expect(error).not.toMatch(/is not a script in/); // never the other branch's words

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(runner.startedWith).toBeUndefined();
  });

  // #37: `port` was accepted on a bare `typeof === 'number'`, and `1e999` passes that — JSON
  // has no Infinity literal but no exponent ceiling either, so a parser reads it as Infinity.
  // The app was spawned and the runner's 120-second probe burned on a port that cannot exist.
  describe('#37: the port is bounded to 1..65535 before anything spawns', () => {
    // The body is RAW TEXT on purpose: `JSON.stringify({ port: 1e999 })` is `{"port":null}`,
    // so building this payload the usual way tests a different bug than the one the desk found.
    const RAW_BODIES: Array<[string, string]> = [
      ['1e999 (Infinity — the one the desk found)', '{"port":1e999}'],
      ['0 (the OS\'s "any free port", never a caller\'s to ask for)', '{"port":0}'],
      ['-1', '{"port":-1}'],
      ['65536 (one past the last port there is)', '{"port":65536}'],
      ['4200.5', '{"port":4200.5}'],
      ['"4200" (a numeric string)', '{"port":"4200"}'],
    ];

    for (const [label, body] of RAW_BODIES) {
      it(`400s on port ${label}, and never spawns`, async () => {
        const repoRoot = await freshRepo();
        await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ scripts: { start: 'ng serve' } }), 'utf8');
        const { url } = await boot(fakeBench(repoRoot));

        const res = await fetch(`${url}/api/target/start`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        });
        expect(res.status, label).toBe(400);
        const error = (await res.json()).error as string;
        expect(error).toMatch(/port must be a whole number from 1 to 65535/);
        expect(error).toMatch(/got /); // the words say what was wrong, not just that something was

        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(runner.startedWith, label).toBeUndefined();
        expect(runner.getState()).toEqual({ status: 'none' });
      });
    }

    it('still accepts the edges — 1 and 65535 — and starts on them', async () => {
      for (const port of [1, 65535]) {
        const repoRoot = await freshRepo();
        await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ scripts: { start: 'ng serve' } }), 'utf8');
        const { url } = await boot(fakeBench(repoRoot));
        const res = await fetch(`${url}/api/target/start`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ port }),
        });
        expect(res.status, String(port)).toBe(202);
        await expect.poll(() => runner.startedWith).toBeDefined();
        expect(runner.startedWith?.port, String(port)).toBe(port);
      }
    });

    it('a body with no port at all is untouched — detection still supplies one', async () => {
      const repoRoot = await freshRepo();
      await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ scripts: { start: 'ng serve' } }), 'utf8');
      const { url } = await boot(fakeBench(repoRoot));
      const res = await fetch(`${url}/api/target/start`, { method: 'POST' });
      expect(res.status).toBe(202);
      await expect.poll(() => runner.startedWith).toBeDefined();
      expect(runner.startedWith?.port).toBe(4200);
    });
  });

  it('409s when the target is already starting or up', async () => {
    const repoRoot = await freshRepo();
    const { url } = await boot(fakeBench(repoRoot));
    runner.state = { status: 'up', url: 'http://localhost:4200' };
    const res = await fetch(`${url}/api/target/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ script: 'dev' }),
    });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/target/stop', () => {
  it('stops the runner and reports ok', async () => {
    const repoRoot = await freshRepo();
    const { url } = await boot(fakeBench(repoRoot));
    runner.state = { status: 'up', url: 'http://localhost:4200' };
    const res = await fetch(`${url}/api/target/stop`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(runner.getState()).toEqual({ status: 'none' });
  });
});

describe('POST /api/target/url', () => {
  it('400s without a url', async () => {
    const { url } = await boot(fakeBench(await freshRepo()));
    const res = await fetch(`${url}/api/target/url`, { method: 'POST' });
    expect(res.status).toBe(400);
  });

  it('sets the runner\'s url directly, reporting up', async () => {
    const { url } = await boot(fakeBench(await freshRepo()));
    const res = await fetch(`${url}/api/target/url`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://localhost:8080' }),
    });
    expect(res.status).toBe(200);
    expect(runner.getState()).toEqual({ status: 'up', url: 'http://localhost:8080' });
  });
});
