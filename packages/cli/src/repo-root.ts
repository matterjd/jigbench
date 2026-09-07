import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

/** Walk up from `startDir` looking for a `.jig/` directory first, then a `.git` entry, at
 * EACH level in turn before continuing further up. Falls back to `startDir` itself
 * (resolved to an absolute path) if neither is ever found — every command still needs
 * somewhere to clamp, even outside a git repo.
 *
 * Retest defect 22 (2026-09-06 evening): a `.git`-only walk-up breaks the moment the
 * clamped folder is a subdirectory of a bigger git repo with no `.git` of its own — exactly
 * `examples/ledger-angular` inside the jigbench monorepo. `jigbench survey --repo
 * examples/ledger-angular` (or `init`) already left a `.jig/` tree right there; walking past
 * it to the monorepo's `.git` served the WRONG root to a later `jigbench mcp` launched with
 * that subfolder as its cwd. Checking `.jig/` before `.git` at every level (not a separate
 * pass to the filesystem root) means an established `.jig/` always wins at the nearest
 * directory that has either — and a plain repo with no `.jig/` yet behaves exactly as
 * before. */
export function findRepoRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, '.jig'))) return dir;
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(startDir);
    dir = parent;
  }
}

/** `--repo <path>` always wins; otherwise detect from the current working directory. */
export function resolveRepoRoot(explicitRepo?: string): string {
  if (explicitRepo) return resolve(explicitRepo);
  return findRepoRoot(process.cwd());
}

/** S6: "add --repo when init is run from outside the repo root" — true when `cwd` bears no
 * containment relation to `repoRoot` at all (a sibling directory, an unrelated path, a
 * different drive on Windows). False when `cwd` IS `repoRoot` or sits somewhere inside it
 * (a subdirectory) — Claude Code cwd-ing into the directory that holds `.mcp.json` covers
 * that case on its own, so `.mcp.json`'s entry never needs an explicit `--repo` there. An
 * ancestor of `repoRoot` (case: cwd one level up from repoRoot, not equal, not inside)
 * counts as outside too — `relative()` climbing upward (`..`) is the one signal for both
 * "sibling" and "ancestor", so they don't need separate handling. */
export function isOutsideRepoRoot(repoRoot: string, cwd: string = process.cwd()): boolean {
  const rel = relative(resolve(repoRoot), resolve(cwd));
  if (rel === '') return false; // cwd IS repoRoot
  return rel.startsWith('..') || isAbsolute(rel); // isAbsolute(rel): different drive on Windows
}
