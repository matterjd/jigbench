import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { invocation } from './detect.js';
import { TargetRunner } from './runner.js';

const fixturesDir = fileURLToPath(new URL('./__fixtures__', import.meta.url));
const SERVER_FIXTURE = join(fixturesDir, 'fake-target-server.mjs');
const EXIT1_FIXTURE = join(fixturesDir, 'fake-target-exit1.mjs');
const ANSI_FIXTURE = join(fixturesDir, 'fake-target-ansi.mjs');

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

let runner: TargetRunner | undefined;

afterEach(async () => {
  await runner?.stop();
  runner = undefined;
});

describe('TargetRunner', () => {
  it('start(): reports "starting" then "up" with the probed url and pid once the script answers', async () => {
    const port = await freePort();
    const states: string[] = [];
    runner = new TargetRunner({
      onLog: () => {},
      onStateChange: (s) => states.push(s.status),
      probeIntervalMs: 100,
      probeTimeoutMs: 10_000,
    });

    await runner.start({ command: process.execPath, args: [SERVER_FIXTURE, String(port)], cwd: fixturesDir, port });

    const state = runner.getState();
    expect(state.status).toBe('up');
    expect(state).toMatchObject({ status: 'up', url: `http://localhost:${port}` });
    if (state.status === 'up') expect(typeof state.pid).toBe('number');
    expect(states[0]).toBe('starting');
    expect(states.at(-1)).toBe('up');
  });

  it('stop(): kills the process it started — the port is free again afterward', async () => {
    const port = await freePort();
    runner = new TargetRunner({ onLog: () => {}, onStateChange: () => {}, probeIntervalMs: 100, probeTimeoutMs: 10_000 });

    await runner.start({ command: process.execPath, args: [SERVER_FIXTURE, String(port)], cwd: fixturesDir, port });
    await runner.stop();

    expect(runner.getState()).toEqual({ status: 'none' });
    // The port is free again — a second run against the SAME port succeeds, which it could
    // not if the first process (or a leaked child of it) still held it.
    await runner.start({ command: process.execPath, args: [SERVER_FIXTURE, String(port)], cwd: fixturesDir, port });
    expect(runner.getState().status).toBe('up');
  });

  it('a script that exits before answering rejects start() and reports "down" with the log tail', async () => {
    const port = await freePort();
    const lines: string[] = [];
    runner = new TargetRunner({ onLog: (l) => lines.push(l), onStateChange: () => {}, probeIntervalMs: 50, probeTimeoutMs: 5_000 });

    await expect(runner.start({ command: process.execPath, args: [EXIT1_FIXTURE], cwd: fixturesDir, port })).rejects.toThrow(
      /exited/i,
    );

    const state = runner.getState();
    expect(state.status).toBe('down');
    if (state.status === 'down') expect(state.exitCode).toBe(1);
    expect(lines.some((l) => l.includes('simulated startup failure'))).toBe(true);
  });

  it('setUrl(): reports "up" immediately for an already-running app, and stop() never kills anything (nothing was started)', async () => {
    runner = new TargetRunner({ onLog: () => {}, onStateChange: () => {} });
    runner.setUrl('http://localhost:9999');
    expect(runner.getState()).toEqual({ status: 'up', url: 'http://localhost:9999' });
    await expect(runner.stop()).resolves.toBeUndefined();
    expect(runner.getState()).toEqual({ status: 'none' });
  });

  it('start() rejects with a clear message when the target never answers before the timeout, and cleans up the process', async () => {
    const port = await freePort(); // nothing ever listens on it
    runner = new TargetRunner({ onLog: () => {}, onStateChange: () => {}, probeIntervalMs: 50, probeTimeoutMs: 400 });
    await expect(
      runner.start({ command: process.execPath, args: [SERVER_FIXTURE, String(port + 1)], cwd: fixturesDir, port }),
    ).rejects.toThrow(/did not answer/i);
    expect(runner.getState().status).toBe('none');
  });

  // #24 (the 0.2.0 review): the app's own log showed `\x1B[33m❯\x1B[39m Building...` verbatim in
  // the Clamp screen and in the logbook drawer, because a dev server that believes it owns a TTY
  // writes colour. The runner is the one place both readers pass through, so it strips there —
  // before `onLog` AND before the ring buffer, so the tail folded into a `start()` failure is clean
  // too.
  it('strips ANSI escapes from the lines it broadcasts and retains — the app log carries no [33m', async () => {
    const port = await freePort();
    const lines: string[] = [];
    runner = new TargetRunner({
      onLog: (l) => lines.push(l),
      onStateChange: () => {},
      probeIntervalMs: 50,
      probeTimeoutMs: 5_000,
    });

    await expect(
      runner.start({ command: process.execPath, args: [ANSI_FIXTURE], cwd: fixturesDir, port }),
    ).rejects.toThrow(/exited/i);

    // Colour (CSI), a window title (OSC ... BEL) and a reset all gone; the words survive intact.
    expect(lines).toContain('❯ Building...');
    expect(lines).toContain('compiled successfully');
    expect(lines.some((l) => /[\x1B\x07]/.test(l))).toBe(false);
    expect(runner.getLogTail().some((l) => /[\x1B\x07]/.test(l))).toBe(false);
  });

  // #10 (S17a follow-up): "verify the win32 `cmd.exe /d /s /c npm run <script>` invocation on
  // the CI runner's Node". Every other test here spawns `node` directly; this one goes through
  // the SAME `invocation('npm', ...)` `POST /api/target/start` builds — `cmd.exe /d /s /c npm
  // run start` on Windows, plain `npm run start` elsewhere — against a real package.json in a
  // temp repo, so the platform-specific spawn is proven on both CI legs, not just described.
  it('start(): an `npm run <script>` invocation — the route\'s own — comes up on this platform', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-runner-npm-'));
    try {
      const port = await freePort();
      await copyFile(SERVER_FIXTURE, join(repoRoot, 'server.mjs'));
      await writeFile(
        join(repoRoot, 'package.json'),
        JSON.stringify({ name: 'jig-runner-npm-fixture', private: true, scripts: { start: `node server.mjs ${port}` } }),
        'utf8',
      );
      const states: string[] = [];
      runner = new TargetRunner({
        onLog: () => {},
        onStateChange: (s) => states.push(s.status),
        probeIntervalMs: 100,
        probeTimeoutMs: 30_000,
      });
      await runner.start({ ...invocation('npm', ['run', 'start']), cwd: repoRoot, port });
      const state = runner.getState();
      expect(state.status).toBe('up');
      if (state.status === 'up') expect(state.url).toBe(`http://localhost:${port}`);
      expect(states).toEqual(['starting', 'up']);
      await runner.stop();
      expect(runner.getState()).toEqual({ status: 'none' });
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  }, 40_000);
});
