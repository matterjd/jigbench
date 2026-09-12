import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

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
}

interface GitInvocation {
  command: string;
  argsPrefix: string[];
  timeoutMs: number;
}

function invocationFrom(options: GitSnapshotOptions | undefined): GitInvocation {
  return {
    command: options?.command ?? 'git',
    argsPrefix: options?.argsPrefix ?? [],
    timeoutMs: options?.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
  };
}

function run(git: GitInvocation, args: string[], cwd: string): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolvePromise) => {
    // Same shape as `runner.ts`'s own `isClaudeAvailable` probe: an AbortController the timer
    // trips, which makes Node kill the child — so a wedged git is reaped, not merely abandoned
    // with this promise resolved out from under it.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), git.timeoutMs);
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(git.command, [...git.argsPrefix, ...args], { cwd, shell: false, signal: controller.signal });
    } catch {
      clearTimeout(timer);
      resolvePromise({ code: null, stdout: '' });
      return;
    }
    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    // An aborted child arrives here as an `error` (AbortError) or a `close` with a null code and
    // a signal — both already mean "no diff information available", the same as a git that is
    // not installed or exits non-zero.
    child.on('error', () => {
      clearTimeout(timer);
      resolvePromise({ code: null, stdout: '' });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout });
    });
  });
}

async function gitTopLevel(git: GitInvocation, repoRoot: string): Promise<string | null> {
  const { code, stdout } = await run(git, ['rev-parse', '--show-toplevel'], repoRoot);
  if (code !== 0) return null;
  const top = stdout.trim();
  return top.length > 0 ? top : null;
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
 * diff information available", never a thrown error. */
export async function gitStatusSnapshot(repoRoot: string, options?: GitSnapshotOptions): Promise<GitStatusSnapshot | null> {
  const git = invocationFrom(options);
  const topLevel = await gitTopLevel(git, repoRoot);
  if (!topLevel) return null;
  const { code, stdout } = await run(git, ['status', '--porcelain', '-z'], repoRoot);
  if (code !== 0) return null;

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
