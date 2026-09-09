import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { logger } from '../logger.js';

/**
 * S17a (AMENDMENT-1 §7, A6 — "Start the app runs the detected dev script inside the repo with
 * its log visible"). Spawns whatever `target/detect.ts` (or an explicit override) resolved,
 * pipes its stdout/stderr into a bounded ring buffer via `onLog` (the caller — `bench/bench.ts`
 * — streams these over WS as `{type:'target-log', line}`), probes the target's own port until
 * it answers, and reports `{status}` transitions via `onStateChange`.
 *
 * "a bench close stops what it started (never a process it did not start)" — `setUrl()` (an
 * already-running app the human just points Jig at) never spawns anything, so `stop()` has
 * nothing to kill in that case; the distinction is `this.child` being null, not a separate
 * flag.
 */

// S17b: `TargetState` is defined in `@jigbench/core` (bench-state.ts) — the bench renders it on
// the Clamp screen and may import core only — and re-exported here so every existing server
// import of `./target/runner.js` keeps working unchanged.
export type { TargetState } from '@jigbench/core';
import type { TargetState } from '@jigbench/core';

export interface TargetRunnerOptions {
  onLog: (line: string) => void;
  onStateChange: (state: TargetState) => void;
  /** How often to re-probe the target's port while starting. Default 500ms. */
  probeIntervalMs?: number;
  /** Overall budget for the target to start answering. Default 120s (the brief's number). */
  probeTimeoutMs?: number;
  /** How many recent log lines `getLogTail()` retains. Default 200. */
  ringBufferSize?: number;
  /** Test-only override for the per-probe HTTP timeout. Default 1s. */
  probeRequestTimeoutMs?: number;
}

export interface StartTargetInput {
  command: string;
  args: string[];
  cwd: string;
  /** The port to probe once spawned — required because a process with nothing to probe can
   * never honestly report "up" (only "we stopped waiting"). */
  port: number;
}

/** The subset `target/route.ts` actually calls — widened to an interface (same trick as
 * `build/types.ts`'s `BuildRunnerLike`) so route-level tests can inject a deterministic fake
 * instead of spawning a real process for every HTTP-wiring assertion. */
export interface TargetRunnerLike {
  getState(): TargetState;
  start(input: StartTargetInput): Promise<void>;
  setUrl(url: string): void;
  stop(): Promise<void>;
}

const DEFAULT_PROBE_INTERVAL_MS = 500;
const DEFAULT_PROBE_TIMEOUT_MS = 120_000;
const DEFAULT_RING_BUFFER_SIZE = 200;
const DEFAULT_PROBE_REQUEST_TIMEOUT_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** #24 (the 0.2.0 review): a dev server that believes it owns a TTY writes colour, so the app's
 * own log arrived in the Clamp screen and the logbook drawer as `\x1B[33m\u276F\x1B[39m
 * Building...`. Three shapes cover everything `ng serve`, `vite` and npm itself emit:
 *   - CSI  `ESC [` params intermediates final  — colour, bold, cursor moves
 *   - OSC  `ESC ]` ... `BEL` or `ESC \`        — the window title `ng serve` sets
 *   - the two-character escapes in between (`ESC c`, `ESC 7`, ...)
 * Stripped in `log()` — before `onLog` and before the ring buffer — because the broadcast, the
 * tail `getLogTail()` returns and the tail folded into a `start()` failure all read the same
 * lines, and none of them is a terminal. */
const ANSI_ESCAPE =
  /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001B]*(?:\u0007|\u001B\\)|[@-Z\\-_])/g;

export function stripAnsi(line: string): string {
  return line.replace(ANSI_ESCAPE, '');
}

async function probeOnce(url: string, requestTimeoutMs: number): Promise<boolean> {
  try {
    // Any HTTP response — even a 404 or 500 — proves something is listening and speaking
    // HTTP on the port; that is all "up" claims. A connection failure/timeout is the only
    // thing this treats as "not yet".
    await fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) });
    return true;
  } catch {
    return false;
  }
}

/** Kills a process BY PID (never by name) — `taskkill /T` on Windows to take the whole tree
 * (a `npm.cmd` parent with a real `node`/`ng` child neither `npm` nor a bare SIGTERM to the
 * parent PID reliably stops); a negative PID signal on POSIX for the same reason, which only
 * works because the child is spawned `detached: true` there, making it its own process
 * group leader. */
async function killTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { shell: false, stdio: 'ignore' });
      killer.on('close', () => resolve());
      killer.on('error', () => resolve());
    });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    // Already gone, or never became a group leader — nothing left to do.
  }
  await sleep(300);
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // Already gone.
  }
}

export class TargetRunner implements TargetRunnerLike {
  private child: ChildProcess | null = null;
  private state: TargetState = { status: 'none' };
  private ring: string[] = [];
  private readonly ringBufferSize: number;
  private readonly probeIntervalMs: number;
  private readonly probeTimeoutMs: number;
  private readonly probeRequestTimeoutMs: number;

  constructor(private readonly opts: TargetRunnerOptions) {
    this.ringBufferSize = opts.ringBufferSize ?? DEFAULT_RING_BUFFER_SIZE;
    this.probeIntervalMs = opts.probeIntervalMs ?? DEFAULT_PROBE_INTERVAL_MS;
    this.probeTimeoutMs = opts.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
    this.probeRequestTimeoutMs = opts.probeRequestTimeoutMs ?? DEFAULT_PROBE_REQUEST_TIMEOUT_MS;
  }

  getState(): TargetState {
    return this.state;
  }

  getLogTail(): string[] {
    return [...this.ring];
  }

  private setState(next: TargetState): void {
    this.state = next;
    this.opts.onStateChange(next);
  }

  private log(raw: string): void {
    const line = stripAnsi(raw);
    this.ring.push(line);
    if (this.ring.length > this.ringBufferSize) this.ring.shift();
    this.opts.onLog(line);
  }

  /** Spawns the detected (or explicitly given) command and waits for its port to answer.
   * Throws — with the log tail folded into the message — if the process exits first or the
   * probe budget runs out; either way the runner is left in a clean, restartable state
   * (`'down'` on an unexpected exit, `'none'` after a timeout this method itself stopped). */
  async start(input: StartTargetInput): Promise<void> {
    if (this.child) throw new Error('a target is already running — stop it first');

    this.setState({ status: 'starting' });

    let child: ChildProcess;
    try {
      child = spawn(input.command, input.args, {
        cwd: input.cwd,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      });
    } catch (err) {
      this.setState({ status: 'down', exitCode: null });
      throw err instanceof Error ? err : new Error(String(err));
    }
    this.child = child;

    createInterface({ input: child.stdout! }).on('line', (l) => this.log(l));
    createInterface({ input: child.stderr! }).on('line', (l) => this.log(l));

    const exited = new Promise<{ code: number | null }>((resolve) => {
      child.once('close', (code) => resolve({ code }));
      child.once('error', (err) => {
        this.log(`[jig] target failed to start: ${err.message}`);
        resolve({ code: null });
      });
    });
    // The externally-visible state transition on an unexpected exit — separate from the
    // `exited` promise above (which `start()` races against) so a LATER exit, after `start()`
    // has already resolved 'up', still flips the badge back without anything else driving it.
    void exited.then(({ code }) => {
      if (this.child === child) {
        this.child = null;
        this.setState({ status: 'down', exitCode: code });
      }
    });

    const url = `http://localhost:${input.port}`;
    let probing = true;
    const probeLoop = (async (): Promise<void> => {
      while (probing) {
        if (await probeOnce(url, this.probeRequestTimeoutMs)) return;
        if (!probing) return;
        await sleep(this.probeIntervalMs);
      }
    })();

    const outcome = await Promise.race([
      probeLoop.then(() => ({ kind: 'up' as const })),
      exited.then((e) => ({ kind: 'exited' as const, code: e.code })),
      sleep(this.probeTimeoutMs).then(() => ({ kind: 'timeout' as const })),
    ]);
    probing = false;

    if (outcome.kind === 'up') {
      // #24: `stop()` claims `this.child` synchronously and only then waits out its kill tree,
      // so it can land while this race is still running — and the probe answering a moment
      // later would report a process this runner no longer owns as "up". `bench/host.ts` acts
      // on that: a late "up" wires the plate of whatever bench is current BY THEN, which is
      // how an unclamped bench's target ended up on the next bench's plate.
      if (this.child !== child) {
        throw new Error(`target was stopped before it answered at ${url}`);
      }
      this.setState({ status: 'up', url, pid: child.pid });
      return;
    }

    const tail = this.ring.join('\n');
    if (outcome.kind === 'exited') {
      // The exit's own state transition already landed via the `exited.then` above.
      throw new Error(`target process exited (code ${outcome.code ?? 'unknown'}) before it answered at ${url}\n${tail}`);
    }

    // Timed out with the process still alive — this call started it, so this call stops it.
    await this.stop();
    throw new Error(`target did not answer at ${url} within ${this.probeTimeoutMs}ms\n${tail}`);
  }

  /** An already-running app the human points Jig at directly (AMENDMENT-1 §7: "or take a
   * URL") — reports `'up'` immediately, with no PID (nothing was spawned) and therefore
   * nothing for `stop()` to kill. */
  setUrl(url: string): void {
    this.setState({ status: 'up', url });
  }

  /** Kills the process THIS runner started, by its PID tree — a no-op (never an error) when
   * nothing is running or the target came from `setUrl()`. */
  async stop(): Promise<void> {
    const child = this.child;
    if (!child || child.pid === undefined) {
      this.setState({ status: 'none' });
      return;
    }
    this.child = null;
    try {
      await killTree(child.pid);
    } catch (err) {
      logger.warn('target runner: killTree failed', String(err));
    }
    this.setState({ status: 'none' });
  }
}
