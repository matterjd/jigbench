import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { TargetRunner } from './runner.js';

const fixturesDir = fileURLToPath(new URL('./__fixtures__', import.meta.url));
const SERVER_FIXTURE = join(fixturesDir, 'fake-target-server.mjs');
const EXIT1_FIXTURE = join(fixturesDir, 'fake-target-exit1.mjs');

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
});
