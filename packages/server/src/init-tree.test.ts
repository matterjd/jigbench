import { describe, expect, it } from 'vitest';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initJigTree } from './init-tree.js';

describe('initJigTree', () => {
  it('creates the full .jig/ skeleton under a fresh repo root', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-init-'));

    const result = await initJigTree(repoRoot);

    expect(result.createdDirs.length).toBe(6);
    for (const sub of ['survey', 'fixtures', 'work-orders', 'toolpaths', 'sketches', 'cache']) {
      const st = await stat(join(repoRoot, '.jig', sub));
      expect(st.isDirectory()).toBe(true);
    }
  });

  it('is idempotent — a second run creates nothing new', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-init-'));

    await initJigTree(repoRoot);
    const second = await initJigTree(repoRoot);

    expect(second.createdDirs).toEqual([]);
  });
});
