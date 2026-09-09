import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { jigPaths } from '@jigbench/core';
import { logger } from '../logger.js';
import { filesTouchedBetween, gitStatusSnapshot } from './git-diff.js';
import { extractFilesLine, parseStreamLine } from './stream-parser.js';
import type { BuildOutcome, BuildRunnerLike, ClaudeStatus, StartBuildInput } from './types.js';

/**
 * S11 (AMENDMENT-1 A1: "a Build button in Jig runs Claude Code itself"). Spawns
 * `claude -p` in the clamped repo, feeds it the prompt body over stdin, parses its
 * `--output-format stream-json` transcript into compact `BuildStreamEvent`s as it goes,
 * and reports the outcome.
 *
 * `claude --help`/`claude -p --help` (v2.1.263, read-only, run on this desk) is the source
 * for every flag below:
 *   -p, --print                     non-interactive: print the final response and exit.
 *   --output-format stream-json     NDJSON of the run, one JSON object per line.
 *   --verbose                       paired with stream-json defensively — the CLI's `--help`
 *                                   text here does not itself document a hard coupling the
 *                                   way SDK docs elsewhere describe, so this is a deliberate
 *                                   belt-and-suspenders inclusion, not a confirmed requirement.
 *   --input-format text             the prompt arrives over stdin as plain text (the default
 *                                   for --print, named explicitly here since this runner
 *                                   deliberately never passes the prompt as a CLI argument —
 *                                   arbitrary length and quoting both go away over stdin).
 *   --permission-mode acceptEdits   file edits land without a per-edit prompt.
 *   --permission-prompts none       nothing left unspecified can ever block on a human who
 *                                   isn't there — a headless run must never hang.
 *   --allowedTools <list>           an explicit allowlist (Edit/Write/Read/Glob/Grep plus a
 *                                   short list of scoped `Bash(npm test)`-shaped entries for
 *                                   the app's own test/build commands) — never a blanket
 *                                   `Bash`, per the brief.
 *
 * NOT relied on: `--max-turns` does not exist in this CLI version's flag list (`claude
 * --help`, checked directly) despite being assumed in the brief — `maxDurationMs` below (a
 * wall-clock kill, implemented here, not a CLI flag) is the substitute. `--max-budget-usd`
 * exists and is a related but different safety net (a dollar cap, not a turn cap); left
 * unset by default since nothing in the brief's acceptance asks for it.
 *
 * `command`/`commandArgsPrefix` exist so a test can point this at a fake `claude` (a small
 * Node script) via `{ command: process.execPath, commandArgsPrefix: [fixturePath] }` —
 * spawned directly, no shell anywhere, which is also what makes `cancel()`'s kill-by-PID
 * land on the actual running process rather than an orphaned shell child.
 */

export interface BuildRunnerOptions {
  repoRoot: string;
  command?: string;
  commandArgsPrefix?: string[];
  allowedTools?: string[];
  /** Wall-clock cap per build — the substitute for the CLI's absent `--max-turns` (see class
   * doc). Default 30 minutes; a build that hits it is killed and reported as a failure. */
  maxDurationMs?: number;
  /** Budget for the `--version` probe `isClaudeAvailable()` runs. Default 5s. */
  availabilityTimeoutMs?: number;
}

const DEFAULT_ALLOWED_TOOLS = [
  'Edit',
  'Write',
  'Read',
  'Glob',
  'Grep',
  'MultiEdit',
  'NotebookEdit',
  'Bash(npm test)',
  'Bash(npm run test:*)',
  'Bash(npm run build)',
  'Bash(npm run build:*)',
  'Bash(dotnet test)',
  'Bash(dotnet build)',
];

const DEFAULT_MAX_DURATION_MS = 30 * 60_000;
const DEFAULT_AVAILABILITY_TIMEOUT_MS = 5_000;

interface RunningBuild {
  promptId: string;
  buildId: string;
  child: ChildProcess;
  startedAt: number;
  cancelRequested: boolean;
}

interface LastBuilt {
  promptId: string;
  files: string[];
  elapsed: number;
}

export class BuildRunner implements BuildRunnerLike {
  private readonly repoRoot: string;
  private readonly command: string;
  private readonly commandArgsPrefix: string[];
  private readonly allowedTools: string[];
  private readonly maxDurationMs: number;
  private readonly availabilityTimeoutMs: number;
  private current: RunningBuild | null = null;
  private lastBuilt: LastBuilt | undefined;

  constructor(opts: BuildRunnerOptions) {
    this.repoRoot = opts.repoRoot;
    this.command = opts.command ?? 'claude';
    this.commandArgsPrefix = opts.commandArgsPrefix ?? [];
    this.allowedTools = opts.allowedTools ?? DEFAULT_ALLOWED_TOOLS;
    this.maxDurationMs = opts.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
    this.availabilityTimeoutMs = opts.availabilityTimeoutMs ?? DEFAULT_AVAILABILITY_TIMEOUT_MS;
  }

  currentBuild(): { promptId: string; buildId: string } | null {
    return this.current ? { promptId: this.current.promptId, buildId: this.current.buildId } : null;
  }

  status(): ClaudeStatus {
    if (this.current) {
      return { state: 'building', id: this.current.promptId, elapsed: Date.now() - this.current.startedAt };
    }
    if (this.lastBuilt) {
      return { state: 'built', id: this.lastBuilt.promptId, files: this.lastBuilt.files, elapsed: this.lastBuilt.elapsed };
    }
    return { state: 'idle' };
  }

  private claudeArgs(): string[] {
    return [
      ...this.commandArgsPrefix,
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--input-format',
      'text',
      '--permission-mode',
      'acceptEdits',
      '--permission-prompts',
      'none',
      '--allowedTools',
      this.allowedTools.join(' '),
    ];
  }

  /** A cheap `--version` probe — never throws; ENOENT (not installed), a non-zero exit, or a
   * timeout all report `false`. */
  async isClaudeAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.availabilityTimeoutMs);
      let child: ChildProcess;
      try {
        child = spawn(this.command, [...this.commandArgsPrefix, '--version'], {
          cwd: this.repoRoot,
          shell: false,
          stdio: 'ignore',
          signal: controller.signal,
        });
      } catch {
        clearTimeout(timer);
        resolve(false);
        return;
      }
      child.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
    });
  }

  async start(input: StartBuildInput): Promise<BuildOutcome> {
    if (this.current) {
      throw new Error(`a build is already running for prompt ${this.current.promptId} (build ${this.current.buildId})`);
    }

    // Claim the slot SYNCHRONOUSLY, before any `await` — `start()` has several await points
    // below, and without claiming up front, a second call arriving before this one reaches
    // its first `await` would still see `this.current === null` and race straight past the
    // guard above. `child` is filled in once actually spawned; `cancel()` treats a still-null
    // `child` as "not yet cancellable" (see its own comment).
    const running: RunningBuild = {
      promptId: input.promptId,
      buildId: input.buildId,
      child: null as unknown as ChildProcess,
      startedAt: Date.now(),
      cancelRequested: false,
    };
    this.current = running;
    this.lastBuilt = undefined; // a new build in flight invalidates the last "built" badge

    let transcriptPath: string;
    try {
      const transcriptDir = join(jigPaths(this.repoRoot).cache, 'builds');
      await mkdir(transcriptDir, { recursive: true });
      transcriptPath = join(transcriptDir, `${input.promptId}-${input.buildId}.jsonl`);
    } catch (err) {
      this.current = null;
      throw err;
    }
    const transcript = createWriteStream(transcriptPath, { flags: 'a' });

    const before = await gitStatusSnapshot(this.repoRoot).catch(() => null);
    const startedAt = running.startedAt;

    return new Promise<BuildOutcome>((resolve) => {
      let child: ChildProcess;
      try {
        child = spawn(this.command, this.claudeArgs(), { cwd: input.repoRoot, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (err) {
        this.current = null;
        transcript.end();
        resolve({ exitCode: null, filesTouched: [], summary: err instanceof Error ? err.message : String(err), transcriptPath, cancelled: false });
        return;
      }

      running.child = child;
      // A cancel() call that arrived while this build was claimed but not yet spawned (the
      // brief window between the synchronous claim above and this point) set the flag with
      // nothing to kill yet — honor it now that a real process exists.
      if (running.cancelRequested) child.kill('SIGTERM');

      // Issue #1 (recorded there under #35): a child that exits before reading a byte of stdin
      // leaves this write landing on a closed pipe — EPIPE. A stream with no `'error'` listener
      // throws that at the process, so an ordinary "claude refused the invocation" took the
      // whole bench server down with an uncaught exception. The build's own outcome comes from
      // the exit code and the transcript, both of which arrive regardless, so a prompt that
      // could not be written is a logged note here and nothing more.
      child.stdin?.on('error', (err: unknown) =>
        logger.warn('build runner: could not write the prompt to claude stdin', String(err)),
      );
      child.stdin?.write(input.promptText);
      child.stdin?.end();

      const assistantText: string[] = [];
      let resultSummary: string | undefined;
      let sessionId: string | undefined;
      let sawResult = false;
      let sawErrorResult = false;

      const timeoutTimer = setTimeout(() => {
        running.cancelRequested = true;
        logger.warn(`build ${input.buildId} for prompt ${input.promptId} exceeded ${this.maxDurationMs}ms — killing it`);
        child.kill('SIGTERM');
      }, this.maxDurationMs);

      const rl = createInterface({ input: child.stdout! });
      rl.on('line', (line) => {
        transcript.write(line + '\n');
        const event = parseStreamLine(line);
        if (!event) return;
        if (event.kind === 'text') assistantText.push(event.text);
        if (event.kind === 'result') {
          sawResult = true;
          sawErrorResult = !event.ok;
          resultSummary = event.summary;
          sessionId = event.sessionId ?? sessionId;
        }
        if (event.kind === 'init') sessionId = event.sessionId;
        input.onEvent(event, Date.now() - startedAt);
      });

      let stderrTail = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString('utf8')).slice(-4000);
      });

      const finish = async (exitCode: number | null): Promise<void> => {
        clearTimeout(timeoutTimer);
        rl.close();
        await new Promise<void>((res) => transcript.end(res));

        const cancelled = running.cancelRequested;
        const finalText = [resultSummary, ...assistantText.slice().reverse()].filter((t): t is string => typeof t === 'string');
        let filesTouched: string[] | null = null;
        for (const text of finalText) {
          filesTouched = extractFilesLine(text);
          if (filesTouched) break;
        }

        if (filesTouched === null && before) {
          const after = await gitStatusSnapshot(this.repoRoot).catch(() => null);
          filesTouched = after ? filesTouchedBetween(before, after) : [];
        }
        filesTouched ??= [];

        const ok = !cancelled && exitCode === 0 && (!sawResult || !sawErrorResult);
        const summary = resultSummary ?? (stderrTail.trim() || undefined);

        this.current = null;
        if (ok) {
          this.lastBuilt = { promptId: input.promptId, files: filesTouched, elapsed: Date.now() - startedAt };
        }

        resolve({ exitCode, filesTouched, summary, sessionId, transcriptPath, cancelled });
      };

      child.on('error', (err) => {
        clearTimeout(timeoutTimer);
        this.current = null;
        transcript.end();
        resolve({ exitCode: null, filesTouched: [], summary: err.message, transcriptPath, cancelled: running.cancelRequested });
      });

      child.on('close', (code) => {
        finish(code).catch((err: unknown) => {
          logger.warn('build runner: error finalizing a build', String(err));
          this.current = null;
          resolve({ exitCode: code, filesTouched: [], summary: String(err), transcriptPath, cancelled: running.cancelRequested });
        });
      });
    });
  }

  /** Kills the running build's child process BY PID (`ChildProcess.kill()` always signals the
   * PID it was constructed with — never a name-based lookup) — a no-op returning `false` when
   * `promptId` doesn't match what's actually running right now. */
  cancel(promptId: string): boolean {
    if (!this.current || this.current.promptId !== promptId) return false;
    this.current.cancelRequested = true;
    // The slot is claimed before the child actually spawns (see `start()`) — a cancel landing
    // in that brief window has nothing to kill yet; it's still recorded as requested so the
    // child is killed the instant it exists, but this particular call reports "not yet".
    if (!this.current.child) return false;
    this.current.child.kill('SIGTERM');
    return true;
  }
}
