import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { createServer } from 'node:http';
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
const IGNORES_SIGTERM_FIXTURE = join(fixturesDir, 'fake-target-ignores-sigterm.mjs');
const CHATTY_SIGTERM_FIXTURE = join(fixturesDir, 'fake-target-chatty-ignores-sigterm.mjs');
const EXITS_HOLDING_PIPE_FIXTURE = join(fixturesDir, 'fake-target-exits-holding-pipe.mjs');

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** #81 item 6: signal 0 asks the OS whether a PID exists without sending anything. On POSIX a
 * killed-but-unreaped child is a ZOMBIE and still answers yes here — which is exactly the state
 * `stop()` used to return in, because `killTree`'s `process.kill(-pid, 'SIGKILL')` returns the
 * instant the kernel accepts the signal, not when the process is gone. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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

  // #24 (`runner.ts:199` in the issue): the probe answering and `stop()` landing are two
  // independent races inside `start()`. When the probe wins, `setState({status:'up'})` fires for
  // a process this runner no longer owns — and in `bench/host.ts` that late "up" wires the plate
  // of whatever bench is current BY THEN. Forced deterministically: the child is given time to
  // boot and install its own SIGTERM handler (so `killTree` has to wait out its 300ms before
  // SIGKILL), the port is answered by a server the TEST owns and only opens at the last moment,
  // and `stop()` is called the instant it does — so the very next probe, ~25ms later, lands well
  // inside the window where the runner has already let this process go.
  it('never reports "up" for a target that stop() already let go of', async () => {
    const port = await freePort();
    const states: string[] = [];
    runner = new TargetRunner({
      onLog: () => {},
      onStateChange: (s) => states.push(s.status),
      probeIntervalMs: 25,
      probeTimeoutMs: 10_000,
    });

    const started = runner.start({ command: process.execPath, args: [IGNORES_SIGTERM_FIXTURE], cwd: fixturesDir, port });
    // Nothing is listening yet, so every probe so far has failed — and the child has had time to
    // boot node and register its handler. A SIGTERM sent before that lands on the default action.
    await sleep(500);
    expect(states).toEqual(['starting']);

    // Bound the way `fake-target-server.mjs` binds — no explicit host, so a probe of
    // `http://localhost:PORT` reaches it whether the name resolves to 127.0.0.1 or ::1.
    const answering = createServer((_req, res) => res.end('ok'));
    await new Promise<void>((resolve) => answering.listen(port, resolve));
    try {
      const stopped = runner.stop(); // claims `this.child` synchronously, then waits out the kill

      await expect(started).rejects.toThrow(/stopped/i);
      expect(states).not.toContain('up');
      await stopped;
      expect(runner.getState()).toEqual({ status: 'none' });
    } finally {
      await new Promise<void>((resolve) => answering.close(() => resolve()));
    }
  }, 20_000);

  // #81 item 6 (the S20 review's eighth follow-up): `stop()` cleared `this.child`, awaited
  // `killTree`, and returned — but `killTree` resolves when the KILLER is done, not when the
  // TARGET is. On Windows that is `taskkill` exiting; on POSIX it is `process.kill(-pid,
  // 'SIGKILL')` returning, which happens the instant the kernel accepts the signal. Either way
  // the child can still hold its working directory when `stop()` resolves, which is what #78's
  // teardown retry was papering over.
  //
  // Two things make the window deterministic rather than hopeful. The fixture refuses SIGTERM,
  // so `killTree` has to spend its full 300 ms and escalate to SIGKILL — the return lands in the
  // gap rather than long after the process happened to die. And it keeps its stdout pipe full,
  // so there are always unread bytes at that instant: `close` fires only once the process is
  // reaped AND its streams have ended, which is the guarantee `killTree` alone cannot give.
  //
  // Measured on this seat before the fix, three runs out of three, lines arriving from a child
  // `stop()` had already reported gone: +171, +65, +38. On POSIX the PID itself is reaped inside
  // the same turn, so the pipe is the half that shows the gap here; on Windows `taskkill` exits
  // before the tree does and both halves show it — which is what CI run 34716624245's EBUSY was.
  it('#81: stop() does not resolve until the child is gone and its output is drained', async () => {
    const port = await freePort();
    let lines = 0;
    runner = new TargetRunner({
      onLog: () => {
        lines++;
      },
      onStateChange: () => {},
      probeIntervalMs: 25,
      probeTimeoutMs: 10_000,
    });

    // The fixture binds no port (it exists to refuse SIGTERM and keep its pipe full), so the
    // test owns the server that answers the probe — the same shape #24's race test uses.
    const answering = createServer((_req, res) => res.end('ok'));
    await new Promise<void>((resolve) => answering.listen(port, resolve));
    try {
      await runner.start({ command: process.execPath, args: [CHATTY_SIGTERM_FIXTURE], cwd: fixturesDir, port });
      const state = runner.getState();
      if (state.status !== 'up' || state.pid === undefined) {
        throw new Error(`expected an up target with a pid, got ${JSON.stringify(state)}`);
      }
      const pid = state.pid;

      // Let it boot and install its own SIGTERM handler — a SIGTERM sent before that lands on
      // the default action and the child simply dies, which would make this pass for the wrong
      // reason. The same 500 ms #24's race test needs, and for the same reason.
      await sleep(500);
      expect(lines, 'the fixture never spoke — nothing to be late').toBeGreaterThan(0);

      await runner.stop();
      const atStop = lines;

      // The contract: when `stop()` resolves the runner is FINISHED with this child. Nothing
      // more arrives from it, and the OS no longer has it.
      await sleep(300);
      expect(lines - atStop, 'lines arrived from a child stop() had already reported gone').toBe(0);
      expect(isProcessAlive(pid), `pid ${pid} was still alive when stop() resolved`).toBe(false);
      expect(runner.getState()).toEqual({ status: 'none' });
    } finally {
      await new Promise<void>((resolve) => answering.close(() => resolve()));
    }
  }, 30_000);

  // #81 item 6, the lead's repair: `awaitExit` short-circuited on `exitCode`/`signalCode`, and
  // those are set when `exit` fires — the process reaped — while `close` fires LATER, once the
  // stdio streams have ended. The gap between them is the backlog the test above asserts is
  // absent, so returning early skipped the half of the contract that matters. The test above
  // cannot see it: on POSIX `killTree` resumes on a microtask, so `exit` has usually not fired
  // by the time `stop()` reaches the wait. On win32 `killTree` awaits the spawned `taskkill`'s
  // own `close`, a whole macrotask later, which is where the ordering flips — the leg this PR
  // just removed #78's retry net from.
  //
  // So the ordering is made deterministic instead of hoped for: the fixture exits on its own,
  // the test waits for that `exit` to fire, and only then hands the child to `awaitExit`. The
  // pipe is still open — a detached grandchild holds it — so `close` is still to come. Called
  // through the class rather than the runner's `stop()`, because a child whose `close` has not
  // fired is still `this.child` and there is no other way to reach the wait in that state.
  it('#81: awaits `close` even when `exit` has already fired — the win32 ordering', async () => {
    const holdMs = 600;
    const child = spawn(process.execPath, [EXITS_HOLDING_PIPE_FIXTURE, String(holdMs)], { cwd: fixturesDir });
    let closed = false;
    const exited = new Promise<void>((resolve) => {
      child.once('close', () => {
        closed = true;
        resolve();
      });
    });

    await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    // The control: if either of these is wrong the fixture is not producing the state under
    // test, and a green below would prove nothing.
    expect(child.exitCode ?? child.signalCode, 'the fixture did not exit on its own').not.toBeNull();
    expect(closed, '`close` fired with `exit` — the grandchild is not holding the pipe').toBe(false);

    const runnerUnderTest = new TargetRunner({ onLog: () => {}, onStateChange: () => {} });
    await (
      runnerUnderTest as unknown as { awaitExit(c: ChildProcess, e: Promise<unknown> | null): Promise<void> }
    ).awaitExit(child, exited);

    expect(closed, '`awaitExit` returned while the child still had stdio open').toBe(true);
  }, 15_000);

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
      // #78 wrapped this in `{maxRetries: 5, retryDelay: 100}` after CI run 34716624245 failed
      // here on windows-latest with `EBUSY: resource busy or locked, rmdir
      // 'C:\Users\RUNNER~1\AppData\Local\Temp\jig-runner-npm-dl84Jg'`. #81 item 6 names that
      // retry as masking rather than fixing: this test spawns a REAL `npm run start`, three
      // processes deep on Windows (`cmd.exe` -> `npm.cmd` -> `node server.mjs`), and `stop()`
      // was resolving before any of them had exited, so the OS still held handles into
      // `repoRoot`. `stop()` awaits the child's `close` now, so a plain `rm` is enough — and
      // being plain is the point: with the retry here, a regression in `stop()` would be hidden
      // again rather than failing this leg.
      await rm(repoRoot, { recursive: true, force: true });
    }
  }, 40_000);
});

// #103 (#97): the LOSING half of `awaitExit`'s race is taken back.
//
// `sleep` is a bare `setTimeout` with no `unref` and nothing holding the handle, and
// `awaitExit` races one against the child's `close` unconditionally. `close` wins in every
// ordinary case, and the 5 s timer it beat stayed live and referenced for the rest of those
// 5 s — after EVERY `stop()`, including the fast win32 case that used to leave none at all
// (before #81 the method returned at the reaped check, ahead of building the race, so the
// repair widened the leak rather than introducing it). A CLI that stops its target and expects
// to exit sits there instead.
//
// The instrument is `process.getActiveResourcesInfo()`, which answers the runtime's own
// question — is anything holding the loop open — rather than a spy on `clearTimeout`, which
// would only say a call was made and not which handle it took back.
//
// It is COARSE, and that decided the shape of this: it reports one `Timeout` per live timer
// DURATION, not per timer. A second test driving the same leak through `stop()` was written
// and then deleted, because it passed in both states — the test below leaks a 5 s timer while
// red, so the 5 s entry already existed and `stop()`'s own never moved the count. It would
// have been a green that proved nothing, and order-dependent besides. The proof is taken at
// the one site that builds the timer, over a window of a single `await`, and `stop()` is
// `awaitExit`'s only caller (`grep -n 'awaitExit' runner.ts`).
describe('#103 (#97): awaitExit leaves no timer behind', () => {
  function liveTimeouts(): number {
    return process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
  }


  // The instrument control: prove this counter can SEE a timer of exactly the kind under test
  // before trusting it to report zero of them.
  it('the counter sees a referenced setTimeout, and sees it go', () => {
    const before = liveTimeouts();
    const handle = setTimeout(() => {}, 5_000);
    expect(liveTimeouts() - before, 'the counter cannot see a live timer — it cannot prove one absent').toBe(1);
    clearTimeout(handle);
    expect(liveTimeouts() - before).toBe(0);
  });

  it('a `close` that has already fired leaves no 5 s timeout holding the event loop', async () => {
    const runner = new TargetRunner({ onLog: () => {}, onStateChange: () => {} });
    // An already-resolved `exited`, which is the ordinary case: `stop()` calls `killTree` and
    // awaits, so by the time `awaitExit` runs the child has usually closed.
    const alreadyClosed = Promise.resolve();
    const child = { pid: 4242, exitCode: 0, signalCode: null, once: () => {} } as unknown as ChildProcess;

    const before = liveTimeouts();
    await (
      runner as unknown as { awaitExit(c: ChildProcess, e: Promise<unknown> | null): Promise<void> }
    ).awaitExit(child, alreadyClosed);

    expect(
      liveTimeouts() - before,
      'awaitExit returned with its losing 5 s timer still referenced — the event loop is held open',
    ).toBe(0);
  });
});
