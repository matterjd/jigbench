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

function run(command: string, args: string[], cwd: string): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolvePromise) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, { cwd, shell: false });
    } catch {
      resolvePromise({ code: null, stdout: '' });
      return;
    }
    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.on('error', () => resolvePromise({ code: null, stdout: '' }));
    child.on('close', (code) => resolvePromise({ code, stdout }));
  });
}

async function gitTopLevel(repoRoot: string): Promise<string | null> {
  const { code, stdout } = await run('git', ['rev-parse', '--show-toplevel'], repoRoot);
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

/** `null` when `repoRoot` isn't inside a git working tree at all, or `git` itself isn't on
 * PATH — the caller treats that as "no diff information available", never a thrown error. */
export async function gitStatusSnapshot(repoRoot: string): Promise<GitStatusSnapshot | null> {
  const topLevel = await gitTopLevel(repoRoot);
  if (!topLevel) return null;
  const { code, stdout } = await run('git', ['status', '--porcelain', '-z'], repoRoot);
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
