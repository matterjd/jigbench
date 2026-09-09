import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import type { Express, Request, Response } from 'express';
import { isSameOriginOrAbsent } from '../same-origin.js';
import { isUncPath, UNC_REFUSED_MESSAGE } from './unc-path.js';
import { hiddenOrSystemNames } from './win32-hidden.js';

/**
 * S17a (AMENDMENT-1 §7, A6): "pick the repo folder in Jig's own folder browser (a page cannot
 * receive a real path from the OS picker)". Two GETs — `/api/fs/roots` (where to start
 * browsing) and `/api/fs/list?path=` (what's inside one directory) — directories only, never
 * file contents. Both are local-filesystem reads with no server-side sandbox root (the whole
 * point is to reach any repo on disk), so the "sensitive" half of the brief is the one thing
 * that actually IS enforceable here: refuse a foreign `Origin` even on a GET, the one
 * exception to `http.ts`'s main same-origin gate (which exempts every GET).
 */

const SKIP_DIR_NAMES = new Set(['node_modules', '.git']);

export interface FsRootEntry {
  name: string;
  path: string;
}

export interface FsListEntry {
  name: string;
  path: string;
  hasGit: boolean;
  hasPackageJson: boolean;
  hasAngularJson: boolean;
  hasCsproj: boolean;
  hasDocs: boolean;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** Windows: probe every drive letter with a real `fs.stat` (no shelling out to `wmic`/
 * `fsutil`) and keep only the ones that answer. POSIX: `/` plus the user's home — the two
 * starting points anyone actually wants when hunting for a repo. */
async function computeRoots(): Promise<FsRootEntry[]> {
  if (platform() === 'win32') {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const candidates = await Promise.all(
      letters.map(async (letter) => {
        const path = `${letter}:\\`;
        return (await isDirectory(path)) ? { name: `${letter}:`, path } : null;
      }),
    );
    return candidates.filter((c): c is FsRootEntry => c !== null);
  }
  const home = homedir();
  const roots: FsRootEntry[] = [{ name: '/', path: '/' }];
  if (home && home !== '/') roots.push({ name: '~', path: home });
  return roots;
}

async function hasAnyCsproj(dirPath: string): Promise<boolean> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.some((e) => e.isFile() && e.name.toLowerCase().endsWith('.csproj'));
  } catch {
    return false;
  }
}

async function describeEntry(parentPath: string, name: string): Promise<FsListEntry> {
  const entryPath = join(parentPath, name);
  const [hasGit, hasPackageJson, hasAngularJson, hasDocs, hasCsproj] = await Promise.all([
    // `.git` is a directory in a normal repo, a FILE (containing `gitdir: ...`) in a
    // worktree or submodule — either way, its mere existence is the honest "yes".
    Promise.resolve(existsSync(join(entryPath, '.git'))),
    Promise.resolve(existsSync(join(entryPath, 'package.json'))),
    Promise.resolve(existsSync(join(entryPath, 'angular.json'))),
    isDirectory(join(entryPath, 'docs')),
    hasAnyCsproj(entryPath),
  ]);
  return { name, path: entryPath, hasGit, hasPackageJson, hasAngularJson, hasCsproj, hasDocs };
}

export interface FsRouteOptions {
  /** The `--host` the server was bound to, when any — #18: the gate below accepts it as a
   * Host alongside the loopback names. Omitted: loopback only. */
  host?: string;
}

export function attachFsRoute(app: Express, options: FsRouteOptions = {}): void {
  function refuseForeignOrigin(req: Request, res: Response): boolean {
    // #18: Host-first (a DNS name is refused even with no Origin — the rebinding case), then
    // Origin must match that Host. `isSameOriginOrAbsent` does both.
    if (!isSameOriginOrAbsent(req.headers.origin, req.headers.host, options.host)) {
      res.status(403).json({ error: 'cross-origin request rejected' });
      return true;
    }
    return false;
  }

  app.get('/api/fs/roots', async (req, res, next) => {
    if (refuseForeignOrigin(req, res)) return;
    try {
      res.json({ roots: await computeRoots() });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/fs/list', async (req, res, next) => {
    if (refuseForeignOrigin(req, res)) return;
    try {
      const raw = req.query.path;
      if (typeof raw !== 'string' || raw.trim().length === 0) {
        res.status(400).json({ error: 'path is required' });
        return;
      }

      // #18: a UNC value would make Windows open an SMB connection to the named host on the
      // `stat` below — refused by its spelling, before any filesystem call.
      if (isUncPath(raw)) {
        res.status(400).json({ error: UNC_REFUSED_MESSAGE });
        return;
      }

      // `resolvePath` collapses `..`/`.` segments against `process.cwd()` for a relative
      // input and normalises separators — the ONLY handling `..` gets here (S17a brief:
      // "`..` allowed only via the parent link the API itself returns", i.e. by normalising
      // whatever the caller sent rather than special-casing it as an attack).
      const target = resolvePath(raw);

      let stats;
      try {
        stats = await stat(target);
      } catch {
        res.status(400).json({ error: `no such path: ${target}` });
        return;
      }
      if (!stats.isDirectory()) {
        res.status(400).json({ error: `not a directory: ${target}` });
        return;
      }

      const dirEntries = await readdir(target, { withFileTypes: true });
      const visible = dirEntries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .filter((name) => !name.startsWith('.') && !SKIP_DIR_NAMES.has(name));

      // #24: a dot prefix is a POSIX convention. Windows keeps the same idea as two bits on the
      // directory entry, which is why `$Recycle.Bin`, `$WINDOWS.~BT`, `System Volume Information`
      // and `Recovery` came back at a drive root. Off win32 this is a no-op with no spawn.
      const flagged = await hiddenOrSystemNames(target, visible);
      const names = visible.filter((name) => !flagged.has(name)).sort((a, b) => a.localeCompare(b));

      const entries = await Promise.all(names.map((name) => describeEntry(target, name)));
      const parentPath = dirname(target);

      res.json({
        path: target,
        parent: parentPath === target ? null : parentPath,
        entries,
      });
    } catch (err) {
      next(err);
    }
  });
}
