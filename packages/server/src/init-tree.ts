import { mkdir } from 'node:fs/promises';
import { jigPaths } from '@jigbench/core';
import { pathExists } from './fs-util.js';

export interface InitJigTreeResult {
  root: string;
  createdDirs: string[];
}

/** `jigbench init` semantics — and what `jigbench` (default serve) does before it starts
 * listening. Idempotent: running it again on an already-initialized repo creates nothing
 * and reports an empty `createdDirs`. */
export async function initJigTree(repoRoot: string): Promise<InitJigTreeResult> {
  const paths = jigPaths(repoRoot);
  const dirs = [
    paths.survey,
    paths.fixtures,
    paths.workOrders,
    paths.toolpaths,
    paths.sketches,
    paths.cache,
  ];
  const createdDirs: string[] = [];
  for (const dir of dirs) {
    const already = await pathExists(dir);
    await mkdir(dir, { recursive: true });
    if (!already) createdDirs.push(dir);
  }
  return { root: paths.root, createdDirs };
}
