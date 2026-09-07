import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'target', '.git']);
const STYLE_SUBDIRS = ['src', 'app', 'public', 'styles'];
const STYLE_EXTENSIONS = ['.css', '.scss', '.less'];

function toForwardSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
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
    if (await isDirectory(join(dir, entry))) dirs.push(entry);
  }
  return dirs.sort();
}

/** Any `.css`/`.scss`/`.less` file anywhere under `dir`, skipping `SKIP_DIRS` — used only as
 * a yes/no probe here (the full scan with declarations/usages is `gauges.ts`'s job). */
async function hasQualifyingStyleFile(dir: string): Promise<boolean> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (await hasQualifyingStyleFile(full)) return true;
    } else if (STYLE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      return true;
    }
  }
  return false;
}

/** Is `dir` itself a web app root: a `package.json` file, OR a qualifying stylesheet
 * somewhere under one of its `src/`, `app/`, `public/`, `styles/` subdirectories. This is
 * deliberately loose — the web adapter is the fallback that matches almost any web codebase
 * (AMENDMENT-1 §6/A5) — a repo with neither signal at all is the only thing it says no to. */
async function isWebRoot(dir: string): Promise<boolean> {
  if (await isFile(join(dir, 'package.json'))) return true;
  for (const sub of STYLE_SUBDIRS) {
    if (await hasQualifyingStyleFile(join(dir, sub))) return true;
  }
  return false;
}

/**
 * `detect(repoRoot)`'s underlying search, shared with `survey()` (same shape as the Angular
 * adapter's `findAngularRoot`): the repo root itself; one level down (a `--repo` pointed at a
 * parent folder); or two levels down under `apps/*` or `packages/*` (a nested workspace —
 * `apps/desktop` for command-center's Angular shell, `packages/chart-harness` for worldloom's
 * plain HTML/JS harness sitting inside an otherwise Rust workspace with no package.json or
 * stylesheet of its own at the root or one level down). `packages/*` is searched before
 * `apps/*`: in the two live repos this slice was checked against, an `apps/*` entry is more
 * often a native-shell wrapper (a Tauri/Electron app) with little or no web content of its
 * own, while a `packages/*` entry is more often the actual browser-facing surface — worldloom
 * is exactly this shape (`apps/satchel` is a Tauri Android shell with no CSS anywhere;
 * `packages/chart-harness` is the real, styled web page). Every candidate is checked (not just
 * up to the first match) so every match can be logged; the first one found, in this fixed
 * order, wins. */
export async function findWebRoot(repoRoot: string): Promise<string | undefined> {
  const candidates: string[] = [];

  if (await isWebRoot(repoRoot)) candidates.push(toForwardSlashes(repoRoot));

  for (const child of await immediateDirs(repoRoot)) {
    const dir = join(repoRoot, child);
    if (await isWebRoot(dir)) candidates.push(toForwardSlashes(dir));
  }

  for (const group of ['packages', 'apps']) {
    const groupDir = join(repoRoot, group);
    for (const child of await immediateDirs(groupDir)) {
      const dir = join(groupDir, child);
      if (await isWebRoot(dir)) candidates.push(toForwardSlashes(dir));
    }
  }

  if (candidates.length > 1) {
    console.error(
      `[jig] findWebRoot: multiple web app roots found under ${toForwardSlashes(repoRoot)}: ${candidates.join(', ')} — using the first.`,
    );
  }

  return candidates[0];
}
