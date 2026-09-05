import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Write a file atomically: write to a sibling temp file, then rename over the target. A
 * reader never sees a partially-written file — `.jig/` is the store of record, and a crash
 * mid-write must never corrupt it. */
export async function atomicWriteFile(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await writeFile(tmp, contents, 'utf8');
  await rename(tmp, path);
}
