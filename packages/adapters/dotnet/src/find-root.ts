import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'bin', 'obj', '.git']);

function toForwardSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

async function hasProjectFile(dir: string): Promise<boolean> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return false;
  }
  return entries.some((e) => e.endsWith('.csproj') || e.endsWith('.sln'));
}

/**
 * `detect(repoRoot)`'s underlying search, shared with `survey()`: the repo root itself, or
 * exactly one level down (a `--repo` pointed at a parent folder that contains the .NET app
 * as a sibling, e.g. `examples/` containing `examples/ledger-api/`). Never descends into
 * `bin`/`obj` (build output, not a project root) or further than one level.
 */
export async function findDotnetRoot(repoRoot: string): Promise<string | undefined> {
  if (await hasProjectFile(repoRoot)) return toForwardSlashes(repoRoot);

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
    if (await hasProjectFile(candidate)) return toForwardSlashes(candidate);
  }

  return undefined;
}
