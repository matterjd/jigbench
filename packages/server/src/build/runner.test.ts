import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { jigPaths } from '@jigbench/core';
import { BuildRunner } from './runner.js';
import type { BuildStreamEvent } from './types.js';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const FAKE_CLAUDE = join(here, '__fixtures__', 'fake-claude.mjs');

let repoRoot: string;

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'jig-runner-'));
});

afterEach(async () => {
  // maxRetries/retryDelay: same fix `mcp/server.test.ts`/`mcp/tools.test.ts` already document
  // for the identical Windows shape — a just-exited child process (the fake claude) or a real
  // `git` invocation (`git-diff.ts`) can leave the OS holding a handle into `repoRoot` for an
  // instant after this test's own await chain resolves; an unretried `rm` reproduces as EBUSY/
  // ENOTEMPTY, not a real leak (this is the same transient-lock class `atomic-write.ts`'s own
  // rename retry handles for writes).
  await rm(repoRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function makeRunner(overrides: Partial<ConstructorParameters<typeof BuildRunner>[0]> = {}): BuildRunner {
  return new BuildRunner({
    repoRoot,
    command: process.execPath,
    commandArgsPrefix: [FAKE_CLAUDE],
    maxDurationMs: 10_000,
    availabilityTimeoutMs: 2_000,
    ...overrides,
  });
}

async function collectEvents(runner: BuildRunner, promptId: string, buildId: string, promptText = 'do the thing') {
  const events: BuildStreamEvent[] = [];
  const outcome = await runner.start({
    promptId,
    buildId,
    repoRoot,
    promptText,
    onEvent: (event) => events.push(event),
  });
  return { events, outcome };
}

describe('BuildRunner.isClaudeAvailable', () => {
  it('reports true when the (fake) claude executable exits 0 on --version', async () => {
    const runner = makeRunner();
    await expect(runner.isClaudeAvailable()).resolves.toBe(true);
  });

  it('reports false when the command does not exist on PATH (not installed)', async () => {
    const runner = makeRunner({ command: join(repoRoot, 'no-such-claude-binary'), commandArgsPrefix: [] });
    await expect(runner.isClaudeAvailable()).resolves.toBe(false);
  });
});

describe('BuildRunner.start — success', () => {
  it('reports exit 0, the FILES: line as filesTouched, and a summary', async () => {
    const runner = makeRunner();
    process.env.FAKE_CLAUDE_FILES = 'a.ts, b.ts';
    try {
      const { events, outcome } = await collectEvents(runner, 'p1', 'b1');
      expect(outcome.exitCode).toBe(0);
      expect(outcome.cancelled).toBe(false);
      expect(outcome.filesTouched).toEqual(['a.ts', 'b.ts']);
      expect(outcome.summary).toContain('Done.');
      expect(outcome.sessionId).toBe('fake-session');

      expect(events.some((e) => e.kind === 'init')).toBe(true);
      expect(events.some((e) => e.kind === 'text')).toBe(true);
      expect(events.some((e) => e.kind === 'tool' && e.name === 'Edit')).toBe(true);
      expect(events.some((e) => e.kind === 'tool_result')).toBe(true);
      expect(events.some((e) => e.kind === 'result' && e.ok)).toBe(true);
    } finally {
      delete process.env.FAKE_CLAUDE_FILES;
    }
  });

  it('writes the full NDJSON transcript to .jig/cache/builds/<promptId>-<buildId>.jsonl', async () => {
    const runner = makeRunner();
    const { outcome } = await collectEvents(runner, 'p2', 'b2');
    const expectedPath = join(jigPaths(repoRoot).cache, 'builds', 'p2-b2.jsonl');
    expect(outcome.transcriptPath).toBe(expectedPath);

    const contents = await readFile(expectedPath, 'utf8');
    const lines = contents.trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan (0);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    expect(lines.some((l) => JSON.parse(l).type === 'result')).toBe(true);
  });

  it('pipes the prompt text over stdin, never as a CLI argument', async () => {
    const stdinOutFile = join(repoRoot, 'stdin-received.txt');
    process.env.FAKE_CLAUDE_STDIN_OUT = stdinOutFile;
    try {
      const runner = makeRunner();
      await collectEvents(runner, 'p3', 'b3', '# Requirement\n\nAdd a comment.');
      const received = await readFile(stdinOutFile, 'utf8');
      expect(received).toBe('# Requirement\n\nAdd a comment.');
    } finally {
      delete process.env.FAKE_CLAUDE_STDIN_OUT;
    }
  });

  it('reports status() idle before starting and built(id, files, elapsed) after a success', async () => {
    const runner = makeRunner();
    expect(runner.status()).toEqual({ state: 'idle' });
    process.env.FAKE_CLAUDE_FILES = 'x.ts';
    try {
      await collectEvents(runner, 'p4', 'b4');
    } finally {
      delete process.env.FAKE_CLAUDE_FILES;
    }
    const status = runner.status();
    expect(status.state).toBe('built');
    if (status.state === 'built') {
      expect(status.id).toBe('p4');
      expect(status.files).toEqual(['x.ts']);
      expect(status.elapsed).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('BuildRunner.start — failure exit 1', () => {
  it('reports the non-zero exit code and the failure summary, filesTouched empty with no git repo', async () => {
    process.env.FAKE_CLAUDE_MODE = 'fail';
    try {
      const runner = makeRunner();
      const { events, outcome } = await collectEvents(runner, 'p5', 'b5');
      expect(outcome.exitCode).toBe(1);
      expect(outcome.cancelled).toBe(false);
      expect(outcome.filesTouched).toEqual([]);
      expect(outcome.summary).toContain('compile error');
      expect(events.some((e) => e.kind === 'result' && e.ok === false)).toBe(true);
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
    }
  });

  it('status() falls back to idle after a failed build, never a stale "built"', async () => {
    process.env.FAKE_CLAUDE_MODE = 'fail';
    try {
      const runner = makeRunner();
      await collectEvents(runner, 'p6', 'b6');
      expect(runner.status()).toEqual({ state: 'idle' });
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
    }
  });
});

describe('BuildRunner.start — FILES: absent falls back to a git diff', () => {
  it('reports files touched between before/after git status snapshots when no FILES: line is present', async () => {
    await execFileAsync('git', ['init'], { cwd: repoRoot });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoRoot });
    await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: repoRoot });
    await writeFile(join(repoRoot, 'existing.txt'), 'hello\n', 'utf8');
    await execFileAsync('git', ['add', '.'], { cwd: repoRoot });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: repoRoot });

    // The fake claude doesn't actually touch the filesystem — it only emits events. To prove
    // the fallback reads real git state (not just "always empty"), create a new dirty file
    // in repoRoot AFTER `start()`'s own "before" snapshot has had time to complete (the
    // fake is told to pause before emitting anything, giving a generous window), simulating
    // a change that lands during the run.
    process.env.FAKE_CLAUDE_MODE = 'no-files';
    process.env.FAKE_CLAUDE_DELAY_MS = '800';
    try {
      const runner = makeRunner();
      const startPromise = collectEvents(runner, 'p7', 'b7');
      await new Promise((r) => setTimeout(r, 500));
      await writeFile(join(repoRoot, 'new-file.txt'), 'new\n', 'utf8');
      const { outcome } = await startPromise;
      expect(outcome.filesTouched).toContain('new-file.txt');
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      delete process.env.FAKE_CLAUDE_DELAY_MS;
    }
    // Five git subprocesses, a deliberate 500 ms + 800 ms of waiting, and two `git status`
    // snapshots: 4.1 s on ubuntu-latest (run 34174031120) and past vitest's 5 s default on a
    // loaded windows-latest — main's push run 34175827649 (at dece0fc) timed out here with
    // the other 1675 tests passing. The budget now matches what the test actually does, the
    // same explicit timeout the cancel test below already carries.
  }, 20_000);
});

describe('BuildRunner.cancel', () => {
  it('kills the running child by PID and reports cancelled: true', async () => {
    process.env.FAKE_CLAUDE_MODE = 'slow';
    process.env.FAKE_CLAUDE_SLOW_MS = '10000';
    try {
      const runner = makeRunner({ maxDurationMs: 60_000 });
      const events: BuildStreamEvent[] = [];
      const startPromise = runner.start({ promptId: 'p8', buildId: 'b8', repoRoot, promptText: 'x', onEvent: (e) => events.push(e) });

      // Give the child a moment to actually spawn before cancelling it.
      await new Promise((r) => setTimeout(r, 200));
      const cancelled = runner.cancel('p8');
      expect(cancelled).toBe(true);

      const outcome = await startPromise;
      expect(outcome.cancelled).toBe(true);
      expect(runner.currentBuild()).toBeNull();
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      delete process.env.FAKE_CLAUDE_SLOW_MS;
    }
  }, 15_000);

  it('cancel() for an id that is not running returns false and does nothing', async () => {
    const runner = makeRunner();
    expect(runner.cancel('no-such-prompt')).toBe(false);
  });
});

describe('BuildRunner — one build at a time', () => {
  it('a second start() call while one is running rejects', async () => {
    process.env.FAKE_CLAUDE_MODE = 'slow';
    process.env.FAKE_CLAUDE_SLOW_MS = '3000';
    try {
      const runner = makeRunner({ maxDurationMs: 60_000 });
      const first = runner.start({ promptId: 'p9', buildId: 'b9', repoRoot, promptText: 'x', onEvent: () => {} });
      // No await between the two calls — this is exactly the re-entrancy the synchronous
      // claim in `start()` exists to close.
      await expect(runner.start({ promptId: 'p10', buildId: 'b10', repoRoot, promptText: 'x', onEvent: () => {} })).rejects.toThrow(
        /already running/,
      );
      expect(runner.currentBuild()).toEqual({ promptId: 'p9', buildId: 'b9' });

      runner.cancel('p9');
      await first;
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      delete process.env.FAKE_CLAUDE_SLOW_MS;
    }
  }, 10_000);
});
