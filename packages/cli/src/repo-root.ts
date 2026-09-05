import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Walk up from `startDir` looking for a `.git` entry. Falls back to `startDir` itself
 * (resolved to an absolute path) if nothing is found — every command still needs somewhere
 * to clamp, even outside a git repo. */
export function findRepoRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (;;) {
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
