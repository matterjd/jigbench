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

/**
 * `detect(repoRoot)`'s underlying search, shared with `survey()` so both agree on which
 * directory is the actual Angular app root: the repo root itself, or exactly one level down
 * (a `--repo` pointed at a parent folder that contains the Angular app as a sibling, e.g.
 * `examples/` containing `examples/ledger-angular/`). Never descends further, and never
 * looks inside `node_modules`/`dist`/`.angular`.
 */
export async function findAngularRoot(repoRoot: string): Promise<string | undefined> {
  if (await hasAngularJson(repoRoot)) return toForwardSlashes(repoRoot);

  let entries: string[];
  try {
    entries = await readdir(repoRoot);
  } catch {
    return undefined;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const candidate = join(repoRoot, entry);
    let isDir = false;
    try {
      isDir = (await stat(candidate)).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    if (await hasAngularJson(candidate)) return toForwardSlashes(candidate);
  }

  return undefined;
}
