import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'dist', '.angular', '.git']);

function toForwardSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

async function hasAngularJson(dir: string): Promise<boolean> {
  try {
    const s = await stat(join(dir, 'angular.json'));
    return s.isFile();
  } catch {
    return false;
  }
}

/** Sorted immediate subdirectory names of `dir`, skipping `SKIP_DIRS` — `[]` when `dir`
 * doesn't exist at all (a repo with no `apps/` or `packages/` folder is the common case, not
 * an error). */
async function immediateDirs(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const dirs: string[] = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    let isDir = false;
    try {
      isDir = (await stat(join(dir, entry))).isDirectory();
    } catch {
      continue;
    }
    if (isDir) dirs.push(entry);
  }
  return dirs.sort();
}

/**
 * `detect(repoRoot)`'s underlying search, shared with `survey()` so both agree on which
 * directory is the actual Angular app root: the repo root itself; exactly one level down (a
 * `--repo` pointed at a parent folder that contains the Angular app as a sibling, e.g.
 * `examples/` containing `examples/ledger-angular/`); or two levels down under `apps/*` or
 * `packages/*` (S16, AMENDMENT-1 §6 — a nested workspace whose Angular app has no
 * `angular.json` at the root or one level down at all, e.g. command-center's
 * `apps/desktop/angular.json` sitting inside an otherwise Rust/Cargo workspace). Every
 * candidate directory is checked (not just up to the first match) so every match found can be
 * logged to stderr; the first one, in this fixed order, wins. Never looks inside
 * `node_modules`/`dist`/`.angular`/`.git` at any level.
 */
export async function findAngularRoot(repoRoot: string): Promise<string | undefined> {
  const candidates: string[] = [];

  if (await hasAngularJson(repoRoot)) candidates.push(toForwardSlashes(repoRoot));

  for (const entry of await immediateDirs(repoRoot)) {
    const candidate = join(repoRoot, entry);
    if (await hasAngularJson(candidate)) candidates.push(toForwardSlashes(candidate));
  }

  for (const group of ['apps', 'packages']) {
    const groupDir = join(repoRoot, group);
    for (const entry of await immediateDirs(groupDir)) {
      const candidate = join(groupDir, entry);
      if (await hasAngularJson(candidate)) candidates.push(toForwardSlashes(candidate));
    }
  }

  if (candidates.length > 1) {
    console.error(
      `[jig] findAngularRoot: multiple Angular roots found under ${toForwardSlashes(repoRoot)}: ${candidates.join(', ')} — using the first.`,
    );
  }

  return candidates[0];
}
