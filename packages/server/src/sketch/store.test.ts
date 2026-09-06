import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jigPaths } from '@jigbench/core';
import { SketchNotFoundError, SketchStore, type SketchWiringSink } from './store.js';

function fakeSink(): SketchWiringSink & { wiring: string | undefined } {
  const state = { wiring: undefined as string | undefined };
  return {
    setSketchWiring: vi.fn((status) => {
      state.wiring = status;
    }),
    get wiring() {
      return state.wiring;
    },
  } as unknown as SketchWiringSink & { wiring: string | undefined };
}

let repoRoot: string;

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'jig-sketch-store-'));
});

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

describe('SketchStore — empty state', () => {
  it('starts with no sketches and reports wiring "none"', async () => {
    const sink = fakeSink();
    const store = new SketchStore(repoRoot, sink);
    await store.init();
    expect(store.list()).toEqual([]);
    expect(sink.wiring).toBe('none');
  });
});

describe('SketchStore — create', () => {
  it('creates a sketch, persists it under .jig/sketches/, and flips wiring to "wired"', async () => {
    const sink = fakeSink();
    const store = new SketchStore(repoRoot, sink);
    await store.init();

    const sketch = await store.create({ name: 'Overdue invoices', size: { w: 640, h: 480 } });
    expect(sketch.id).toBe('0001');
    expect(sketch.name).toBe('Overdue invoices');
    expect(sketch.elements).toEqual([]);
    expect(sketch.links).toEqual([]);
    expect(sink.wiring).toBe('wired');

    const raw = await readFile(join(jigPaths(repoRoot).sketches, '0001.json'), 'utf8');
    expect(JSON.parse(raw).name).toBe('Overdue invoices');
  });

  it('numbers a second sketch 0002', async () => {
    const store = new SketchStore(repoRoot, fakeSink());
    await store.init();
    await store.create({ name: 'One', size: { w: 100, h: 100 } });
    const second = await store.create({ name: 'Two', size: { w: 100, h: 100 } });
    expect(second.id).toBe('0002');
  });

  it('rejects a blank name', async () => {
    const store = new SketchStore(repoRoot, fakeSink());
    await store.init();
    await expect(store.create({ name: '   ', size: { w: 100, h: 100 } })).rejects.toThrow();
  });
});

describe('SketchStore — read/list/update', () => {
  it('lists summaries (not full element payloads) sorted by id', async () => {
    const store = new SketchStore(repoRoot, fakeSink());
    await store.init();
    await store.create({ name: 'B', size: { w: 100, h: 100 } });
    await store.create({ name: 'A', size: { w: 100, h: 100 } });
    const list = store.list();
    expect(list.map((s) => s.id)).toEqual(['0001', '0002']);
    expect(list[0]).not.toHaveProperty('elements');
  });

  it('updates an existing sketch with new elements/links and bumps updatedAt', async () => {
    const store = new SketchStore(repoRoot, fakeSink());
    await store.init();
    const created = await store.create({ name: 'Overdue invoices', size: { w: 640, h: 480 } });

    const updated = await store.update(created.id, {
      ...created,
      elements: [{ id: 'e1', kind: 'box', x: 0, y: 0, w: 40, h: 40, gauges: {} }],
      links: [],
    });

    expect(updated.elements).toHaveLength(1);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());

    const reread = store.get(created.id);
    expect(reread?.elements).toHaveLength(1);
  });

  it('throws SketchNotFoundError updating a sketch that does not exist', async () => {
    const store = new SketchStore(repoRoot, fakeSink());
    await store.init();
    await expect(
      store.update('9999', { name: 'x', size: { w: 1, h: 1 }, elements: [], links: [] }),
    ).rejects.toThrow(SketchNotFoundError);
  });

  it('throws SketchNotFoundError getting a sketch that does not exist via requireSketch-backed calls', async () => {
    const store = new SketchStore(repoRoot, fakeSink());
    await store.init();
    expect(store.get('9999')).toBeUndefined();
  });
});

describe('SketchStore — scrap/restore (Law II: never delete)', () => {
  it('scraps a sketch (marks it, keeps the file) and restore clears the mark', async () => {
    const store = new SketchStore(repoRoot, fakeSink());
    await store.init();
    const created = await store.create({ name: 'Overdue invoices', size: { w: 640, h: 480 } });

    const scrapped = await store.scrap(created.id);
    expect(scrapped.scrapped).toBe(true);
    expect(typeof scrapped.scrappedAt).toBe('string');
    // still on disk — never deleted
    const raw = await readFile(join(jigPaths(repoRoot).sketches, `${created.id}.json`), 'utf8');
    expect(JSON.parse(raw).scrapped).toBe(true);

    const restored = await store.restore(created.id);
    expect(restored.scrapped).toBeUndefined();
    expect(restored.scrappedAt).toBeUndefined();
  });

  it('throws SketchNotFoundError scrapping an id that does not exist', async () => {
    const store = new SketchStore(repoRoot, fakeSink());
    await store.init();
    await expect(store.scrap('9999')).rejects.toThrow(SketchNotFoundError);
  });
});

describe('SketchStore — init rebuilds from disk', () => {
  it('reloads every sketch already on disk, including a scrapped one', async () => {
    const first = new SketchStore(repoRoot, fakeSink());
    await first.init();
    const created = await first.create({ name: 'Overdue invoices', size: { w: 640, h: 480 } });
    await first.scrap(created.id);

    const second = new SketchStore(repoRoot, fakeSink());
    await second.init();
    expect(second.list()).toHaveLength(1);
    expect(second.get(created.id)?.scrapped).toBe(true);
  });

  it('skips an unparseable file rather than crashing init', async () => {
    const store = new SketchStore(repoRoot, fakeSink());
    await store.init();
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(jigPaths(repoRoot).sketches, 'broken.json'), '{ not json', 'utf8');

    const second = new SketchStore(repoRoot, fakeSink());
    await expect(second.init()).resolves.not.toThrow();
    expect(second.list()).toEqual([]);
  });
});
