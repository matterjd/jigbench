import { spawn } from 'node:child_process';
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

/** One `git status --porcelain` line is `XY path` or, for a rename, `XY orig -> new` — the
 * path (or the rename's destination) starts at column 3. `git`'s porcelain format never
 * quotes a path unless it contains characters needing escaping; the outer quotes (when
 * present) are stripped so a plain compare against other paths still works. */
function parsePorcelainPaths(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.length > 3)
    .map((l) => l.slice(3).trim())
    .map((p) => (p.includes(' -> ') ? p.slice(p.indexOf(' -> ') + 4) : p))
    .map((p) => p.replace(/^"(.*)"$/, '$1'));
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
  const { code, stdout } = await run('git', ['status', '--porcelain'], repoRoot);
  if (code !== 0) return null;

  const repoRootAbs = resolve(repoRoot);
  const paths = new Set(
    parsePorcelainPaths(stdout).map((p) => relative(repoRootAbs, resolve(topLevel, p)).split('\\').join('/')),
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
