import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import type { BuildNoticeCode } from '@jigbench/core';

/**
 * "the FILES: line if present else `git status --porcelain` diff of the repo before/after"
 * (S11 brief). `git status --porcelain` reports paths relative to the git TOP-LEVEL,
 * regardless of `cwd` or `status.relativePaths` (verified live on this desk, git 2.47.1: a
 * `git status --porcelain .` run from a subdirectory still printed the path from the repo
 * root) — the clamped repo (`repoRoot`) is often a SUBDIRECTORY of a larger git repo (every
 * `examples/*` fixture in this monorepo is exactly that shape), so every path is relativized
 * a second time, against `repoRoot` itself, before this module hands it back.
 */

/**
 * #37: a budget per `git` invocation. `BuildRunner.start()` awaits the before-snapshot before it
 * spawns `claude` at all, so a `git` that never answers held `start()` open forever — no timeout
 * anywhere, and the two calls here are the only child processes in the build path without one
 * (`isClaudeAvailable`'s `--version` probe already had a 5-second cap of its own).
 *
 * A `git rev-parse` or `git status` on the clamped repo answers in milliseconds; a git that has
 * not answered in 15 seconds is wedged, not slow — a credential helper waiting on a prompt, a
 * dead network drive under the working tree, an `index.lock` someone else is holding. 15 s is
 * three orders of magnitude of headroom over the real thing rather than a number tuned to a fast
 * disk, because the cost of guessing LOW here is a snapshot that silently reads as "no diff
 * information" on a loaded CI runner (the class of Windows-timing flake #62 records four of).
 * `BuildRunner` can name its own through `gitTimeoutMs`.
 */
const DEFAULT_GIT_TIMEOUT_MS = 15_000;

export interface GitSnapshotOptions {
  /** Wall-clock cap per `git` invocation. A git that outlives it is killed and the snapshot
   * reads as `null` — "no diff information available", which is what every other git failure
   * already reads as. Default 15 s. */
  timeoutMs?: number;
  /** The git executable. Jig's own literal `'git'` in production; the same seam
   * `BuildRunner`'s `command`/`commandArgsPrefix` pair gives the fake `claude`, so a test can
   * point this at a `git` that never exits without needing one on PATH. */
  command?: string;
  /** Arguments before git's own — `[fixture.mjs]` when `command` is `process.execPath`. */
  argsPrefix?: string[];
  /**
   * #81 item 7: called at most once, with WHY this snapshot is about to answer `null`.
   *
   * There are exactly three reasons and they used to be indistinguishable — every one of them
   * arrived at the caller as a bare `null`, which `build/runner.ts` read as "no diff
   * information" and told nobody. A git wedged for the full fifteen seconds looked identical to
   * a folder that simply is not a repo. The caller turns the code into one line on the build
   * stream (`@jigbench/core`'s `buildNoticeLine` owns the words).
   */
  onUnavailable?: (code: BuildNoticeCode) => void;
}

interface GitInvocation {
  command: string;
  argsPrefix: string[];
  timeoutMs: number;
}

/** #81: why one `git` invocation produced nothing usable. `undefined` means it ran — whatever
 * its exit code was, which is a separate question the caller asks next. */
type GitRunFailure = 'git-timed-out' | 'git-not-found' | 'git-failed-to-start';

interface GitRunResult {
  code: number | null;
  stdout: string;
  failure?: GitRunFailure;
}

function invocationFrom(options: GitSnapshotOptions | undefined): GitInvocation {
  return {
    command: options?.command ?? 'git',
    argsPrefix: options?.argsPrefix ?? [],
    timeoutMs: options?.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
  };
}

function run(git: GitInvocation, args: string[], cwd: string): Promise<GitRunResult> {
  return new Promise((resolvePromise) => {
    // Same shape as `runner.ts`'s own `isClaudeAvailable` probe: an AbortController the timer
    // trips, which makes Node kill the child — so a wedged git is reaped, not merely abandoned
    // with this promise resolved out from under it.
    const controller = new AbortController();
    // #81: which of the two failures this was. The abort and a missing binary both surface as an
    // `error` event with an empty stdout, so the only thing that can tell them apart is knowing
    // whether WE fired. Without this flag the caller cannot say "git ran out of time" rather
    // than "git is not on PATH", which is the whole of this item.
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, git.timeoutMs);
    let child: ReturnType<typeof spawn>;
    try {
      // A synchronous throw from `spawn` is the platform refusing the call before there is a
      // child at all: a bad option or argument type, and on win32 an EFTYPE for a file that is
      // not an executable image (measured on this desk — a `.txt` path throws EFTYPE
      // synchronously). A MISSING binary is not this: it arrives asynchronously as the `error`
      // below, with ENOENT, on every platform. So this path cannot say "not on PATH" — it says
      // only that git could not be started.
      child = spawn(git.command, [...git.argsPrefix, ...args], { cwd, shell: false, signal: controller.signal });
    } catch {
      clearTimeout(timer);
      resolvePromise({ code: null, stdout: '', failure: 'git-failed-to-start' });
      return;
    }
    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    // An aborted child arrives here as an `error` (AbortError) or as a `close` with a null code
    // and a signal; a git that is not installed arrives as an `error` with ENOENT. Every one of
    // them still means "no diff information available" — what differs is what we may SAY about
    // it. Our own abort we know about (`timedOut`). ENOENT is the one error that really does
    // mean "there is no git at that name". Everything else — EACCES on a git that is not
    // executable, EMFILE, ENOMEM, EAGAIN — is a spawn that failed for a reason this code does
    // not know, and saying "git is not on PATH" about a git that is right there sends the reader
    // looking in the wrong place (the lead's 2026-09-15 review).
    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      const failure: GitRunFailure = timedOut
        ? 'git-timed-out'
        : err?.code === 'ENOENT'
          ? 'git-not-found'
          : 'git-failed-to-start';
      resolvePromise({ code: null, stdout: '', failure });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise(timedOut ? { code, stdout, failure: 'git-timed-out' } : { code, stdout });
    });
  });
}

/** #81: the top level, or the reason there isn't one. A non-zero exit from `rev-parse
 * --show-toplevel` is git itself reporting no working tree here — the ordinary reason, and the
 * one whose words are deliberately not "this folder is not a repo": a `safe.directory` /
 * dubious-ownership refusal exits non-zero from this same command about a folder that IS one
 * (the lead's 2026-09-15 review). */
async function gitTopLevel(git: GitInvocation, repoRoot: string): Promise<{ topLevel: string } | { failure: BuildNoticeCode }> {
  const { code, stdout, failure } = await run(git, ['rev-parse', '--show-toplevel'], repoRoot);
  if (failure) return { failure };
  if (code !== 0) return { failure: 'not-a-git-repo' };
  const top = stdout.trim();
  return top.length > 0 ? { topLevel: top } : { failure: 'not-a-git-repo' };
}

/**
 * Parses `git status --porcelain -z` output. `-z` NUL-separates every record and NEVER
 * quotes or C-escapes a path — the plain `--porcelain` format (kept only in history/tests as
 * a comparison point) quotes any path needing it (a space, a rename, non-ASCII bytes) and
 * C-escapes non-ASCII bytes as octal (`"caf\303\251.txt"` for `café.txt`), which a bare
 * `.replace(/^"(.*)"$/, '$1')` strips the quotes from but never un-escapes — `-z` sidesteps
 * that whole class outright (verified live on this desk, git 2.47.1, against a renamed file
 * with a space and a unicode filename).
 *
 * Each record is `XY path\0`. A rename/copy record (status starting `R`/`C`) is followed by
 * ONE MORE NUL-terminated field — the origin path, with no ` -> ` separator in `-z` mode — so
 * that field is consumed and discarded; only the current (destination) path is wanted here.
 *
 * The backslash-to-forward-slash and leading-`./`-strip below are defensive: real `git`
 * status output on this desk never needed either (`-z` paths were already forward-slashed
 * with no prefix), but they cost nothing and guard against a future/other git build that
 * emits either shape.
 */
function parsePorcelainZ(stdout: string): string[] {
  const tokens = stdout.split('\0');
  const paths: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.length === 0) continue;
    const status = token.slice(0, 2);
    let path = token.slice(3);
    if (status[0] === 'R' || status[0] === 'C') {
      i++; // the next field is the rename/copy origin path — not needed, skip over it
    }
    path = path.split('\\').join('/').replace(/^\.\//, '');
    paths.push(path);
  }
  return paths;
}

export interface GitStatusSnapshot {
  topLevel: string;
  /** Paths already relativized to `repoRoot` (not the git top-level) — see module doc. */
  paths: Set<string>;
}

/** `null` when `repoRoot` isn't inside a git working tree at all, `git` itself isn't on PATH, or
 * (#37) a `git` invocation outlived its budget — the caller treats every one of those as "no
 * diff information available", never a thrown error. #81: and is now TOLD which of the three it
 * was, through `options.onUnavailable`, so it can say so in words instead of silently reporting
 * no files touched. */
export async function gitStatusSnapshot(repoRoot: string, options?: GitSnapshotOptions): Promise<GitStatusSnapshot | null> {
  const git = invocationFrom(options);
  const unavailable = (code: BuildNoticeCode): null => {
    options?.onUnavailable?.(code);
    return null;
  };

  const top = await gitTopLevel(git, repoRoot);
  if ('failure' in top) return unavailable(top.failure);
  const { topLevel } = top;

  const { code, stdout, failure } = await run(git, ['status', '--porcelain', '-z'], repoRoot);
  if (failure) return unavailable(failure);
  // `status` succeeding after `rev-parse` did is the normal case; a non-zero exit here is git
  // refusing the working tree it just acknowledged — a corrupt index, a lock — and that is NOT
  // "this folder is not a repo": `rev-parse --show-toplevel` has already answered with one.
  // Reproduced on the lead's desk with a garbage `.git/index`: `rev-parse` exits 0 and prints
  // the top level while `status --porcelain -z` exits 128 ("index file smaller than expected"),
  // so the old code told the user a folder was not a working tree about a folder that
  // demonstrably was one.
  if (code !== 0) return unavailable('git-refused-the-tree');

  // `repoRoot` can reach this module through a path that is LEXICALLY different from, but
  // points at the very same directory as, what git's own `--show-toplevel` reports — an NTFS
  // junction, or (confirmed against the actual CI failure) an 8.3-shortened path segment
  // (GitHub's windows-latest runner sets `%TEMP%` to `C:\Users\RUNNER~1\...`; `git` resolves
  // that alias to its long canonical form, e.g. `C:\Users\runneradmin\...`, before reporting
  // `--show-toplevel`). `resolve(repoRoot)` alone never reconciles that: `path.relative`
  // between the two forms produces a `../`-laden escape instead of the plain filename —
  // reproduced live on this desk with both an 8.3 alias and a plain junction. `fs.realpath`
  // canonicalises the same way git does, so both sides of the `relative()` call below agree.
  const repoRootAbs = await realpath(repoRoot).catch(() => resolve(repoRoot));
  const paths = new Set(
    parsePorcelainZ(stdout).map((p) => relative(repoRootAbs, resolve(topLevel, p)).split('\\').join('/')),
  );
  return { topLevel, paths };
}

/** Files present in `after` that were NOT already dirty in `before` — a file that was
 * already modified before the build started and got touched FURTHER during it is not
 * counted (it never left the "dirty" set), a known, documented limitation of a before/after
 * diff rather than a true audit log; the `FILES:` line is what covers that case, this is
 * only ever the fallback. */
export function filesTouchedBetween(before: GitStatusSnapshot, after: GitStatusSnapshot): string[] {
  return [...after.paths].filter((p) => !before.paths.has(p)).sort();
}

/** Exported for direct unit coverage of the `-z` record parser (rename/copy pairing, the
 * defensive backslash/`./` normalisation) without needing a live `git` process per case. */
export const __test__ = { parsePorcelainZ };
