import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { jigPaths } from '@jigbench/core';
import { atomicWriteFile } from '../atomic-write.js';
import { pathExists } from '../fs-util.js';

/** Filename-safe ids only — the same shape a fixture/toolpath/work-order id already takes
 * (alphanumerics, `-`, `_`). Rejects anything that could walk out of the snapshots directory
 * (`../`, a path separator, an absolute path) rather than trusting the caller. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function isSafeId(id: string): boolean {
  return SAFE_ID.test(id);
}

/**
 * F11 / CHASSIS.md's trial-fit mode: persists the loupe's `jig:snapshot` reply (a standalone
 * HTML string — the release-moment "before" frame) under `.jig/cache/snapshots/<id>.html`.
 * A cache, not the store of record (Law V — regenerable data lives in `.jig/cache/`,
 * gitignored): losing it loses the ABILITY to show the "before" frame for an order whose
 * shop already reported, never anything the ladder or the work order itself depends on.
 */
export class SnapshotStore {
  private readonly dir: string;

  constructor(repoRoot: string) {
    this.dir = join(jigPaths(repoRoot).cache, 'snapshots');
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  private fileFor(id: string): string {
    if (!isSafeId(id)) throw new Error(`SnapshotStore: unsafe snapshot id "${id}"`);
    return join(this.dir, `${id}.html`);
  }

  async save(id: string, html: string): Promise<void> {
    await atomicWriteFile(this.fileFor(id), html);
  }

  async read(id: string): Promise<string | undefined> {
    if (!isSafeId(id)) return undefined;
    const file = this.fileFor(id);
    if (!(await pathExists(file))) return undefined;
    return readFile(file, 'utf8');
  }
}
