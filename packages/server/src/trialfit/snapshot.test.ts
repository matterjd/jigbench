import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jigPaths } from '@jigbench/core';
import { SnapshotStore } from './snapshot.js';

/**
 * F11 / CHASSIS.md's trial-fit mode: the release-moment "before" frame the loupe's
 * `jig:snapshot` reply produces, persisted under `.jig/cache/snapshots/` (gitignored cache —
 * regenerable, never the store of record) and served back as text/html.
 */

let repoRoot: string;

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'jig-snapshot-store-'));
});

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

describe('SnapshotStore', () => {
  it('save() persists the HTML under .jig/cache/snapshots/<id>.html', async () => {
    const store = new SnapshotStore(repoRoot);
    await store.init();
    await store.save('0007', '<!doctype html><html><body>hi</body></html>');

    const onDisk = await readFile(join(jigPaths(repoRoot).cache, 'snapshots', '0007.html'), 'utf8');
    expect(onDisk).toBe('<!doctype html><html><body>hi</body></html>');
  });

  it('read() returns what was saved', async () => {
    const store = new SnapshotStore(repoRoot);
    await store.init();
    await store.save('0007', '<p>content</p>');
    expect(await store.read('0007')).toBe('<p>content</p>');
  });

  it('read() returns undefined for an id that was never saved, rather than throwing', async () => {
    const store = new SnapshotStore(repoRoot);
    await store.init();
    expect(await store.read('nope')).toBeUndefined();
  });

  it('save() overwrites a previous snapshot for the same id', async () => {
    const store = new SnapshotStore(repoRoot);
    await store.init();
    await store.save('0007', 'first');
    await store.save('0007', 'second');
    expect(await store.read('0007')).toBe('second');
  });

  it('a fresh store instance pointed at the same repoRoot reads back what an earlier one saved', async () => {
    const first = new SnapshotStore(repoRoot);
    await first.init();
    await first.save('0007', 'persisted');

    const second = new SnapshotStore(repoRoot);
    await second.init();
    expect(await second.read('0007')).toBe('persisted');
  });

  it('rejects a path-traversal id rather than writing outside the snapshots directory', async () => {
    const store = new SnapshotStore(repoRoot);
    await store.init();
    await expect(store.save('../../evil', '<p>x</p>')).rejects.toThrow();
    await expect(store.read('../../evil')).resolves.toBeUndefined();
  });
});
