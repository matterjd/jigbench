import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jigPaths, type ToolpathStep } from '@jigbench/core';
import { ToolpathNotFoundError, ToolpathStore, type ToolpathWiringSink } from './store.js';

/**
 * S8 — mirrors `fixtures/store.test.ts`'s shape exactly (same persistence/scrap-restore
 * pattern, Law II): `.jig/toolpaths/<id>.json`, atomic writes, a fresh instance picks up
 * what an earlier one wrote, scrap never deletes.
 */

function fakeSink(): ToolpathWiringSink & { wiring: string | undefined } {
  const state = { wiring: undefined as string | undefined };
  return {
    setToolpathWiring: vi.fn((status) => {
      state.wiring = status;
    }),
    get wiring() {
      return state.wiring;
    },
  } as unknown as ToolpathWiringSink & { wiring: string | undefined };
}

const steps: ToolpathStep[] = [
  { kind: 'navigate', path: '/invoices', at: 0 },
  { kind: 'click', path: 'app-invoice-list:nth-of-type(1)', at: 340 },
  { kind: 'input', path: 'input:nth-of-type(1)', value: 'INV-1042', at: 1800 },
];

let repoRoot: string;

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'jig-toolpath-store-'));
});

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

describe('ToolpathStore — empty state', () => {
  it('starts with no toolpaths and reports wiring "none"', async () => {
    const sink = fakeSink();
    const store = new ToolpathStore(repoRoot, sink);
    await store.init();
    expect(store.list()).toEqual([]);
    expect(sink.setToolpathWiring).toHaveBeenLastCalledWith('none');
  });
});

describe('ToolpathStore — create', () => {
  it('numbers the toolpath 0001, persists atomically under .jig/toolpaths/<id>.json, and reports wiring "wired"', async () => {
    const sink = fakeSink();
    const store = new ToolpathStore(repoRoot, sink);
    await store.init();

    const toolpath = await store.create({ name: 'open-and-edit', startUrl: '/invoices', steps });
    expect(toolpath.id).toBe('0001');
    expect(toolpath.steps).toEqual(steps);

    const onDisk = JSON.parse(await readFile(join(jigPaths(repoRoot).toolpaths, '0001.json'), 'utf8'));
    expect(onDisk.id).toBe('0001');
    expect(onDisk.name).toBe('open-and-edit');

    expect(store.list().map((t) => t.id)).toEqual(['0001']);
    expect(store.list()[0]).toMatchObject({ id: '0001', name: 'open-and-edit', stepCount: 3, startUrl: '/invoices' });
    expect(sink.setToolpathWiring).toHaveBeenLastCalledWith('wired');
  });

  it('numbers a second toolpath 0002', async () => {
    const store = new ToolpathStore(repoRoot, fakeSink());
    await store.init();
    await store.create({ name: 'a', steps: [] });
    const second = await store.create({ name: 'b', steps: [] });
    expect(second.id).toBe('0002');
  });

  it('rejects a blank name', async () => {
    const store = new ToolpathStore(repoRoot, fakeSink());
    await store.init();
    await expect(store.create({ name: '   ', steps: [] })).rejects.toThrow();
  });

  it('a toolpath with no steps is still creatable — an empty recording is honest, not an error', async () => {
    const store = new ToolpathStore(repoRoot, fakeSink());
    await store.init();
    const toolpath = await store.create({ name: 'empty', steps: [] });
    expect(toolpath.steps).toEqual([]);
  });
});

describe('ToolpathStore — persistence round-trip', () => {
  it('a fresh store instance pointed at the same repoRoot picks up what an earlier one wrote', async () => {
    const first = new ToolpathStore(repoRoot, fakeSink());
    await first.init();
    await first.create({ name: 'persisted', steps });

    const second = new ToolpathStore(repoRoot, fakeSink());
    await second.init();
    expect(second.list().map((t) => t.id)).toEqual(['0001']);
    expect(second.get('0001')?.steps).toEqual(steps);
  });
});

describe('ToolpathStore — get', () => {
  it('returns undefined for an unknown id', async () => {
    const store = new ToolpathStore(repoRoot, fakeSink());
    await store.init();
    expect(store.get('nope')).toBeUndefined();
  });
});

describe('ToolpathStore — scrap / restore (Law II: never a hard delete)', () => {
  it('scrap marks the toolpath and persists it — it stays listed', async () => {
    const sink = fakeSink();
    const store = new ToolpathStore(repoRoot, sink);
    await store.init();
    await store.create({ name: 'a', steps });

    const scrapped = await store.scrap('0001');
    expect(scrapped.scrapped).toBe(true);
    expect(scrapped.scrappedAt).toBeTruthy();
    expect(store.list().find((t) => t.id === '0001')?.scrapped).toBe(true);
  });

  it('scrapping an unknown id throws ToolpathNotFoundError', async () => {
    const store = new ToolpathStore(repoRoot, fakeSink());
    await store.init();
    await expect(store.scrap('nope')).rejects.toBeInstanceOf(ToolpathNotFoundError);
  });

  it('restore clears the scrapped flag', async () => {
    const store = new ToolpathStore(repoRoot, fakeSink());
    await store.init();
    await store.create({ name: 'a', steps });
    await store.scrap('0001');

    const restored = await store.restore('0001');
    expect(restored.scrapped).toBeUndefined();
    expect(restored.scrappedAt).toBeUndefined();
  });

  it('there is no delete method on the store (Law II, enforced by shape)', () => {
    const store = new ToolpathStore(repoRoot, fakeSink());
    expect((store as unknown as { delete?: unknown }).delete).toBeUndefined();
  });
});
