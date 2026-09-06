import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JIG_FORMAT, jigPaths, type Survey } from '@jigbench/core';
import {
  FixtureNameConflictError,
  FixtureNotFoundError,
  FixtureScrappedError,
  FixtureStore,
  type FixtureWiringSink,
} from './store.js';

function stubSurvey(): Survey {
  return {
    jigFormat: JIG_FORMAT,
    stack: [],
    components: [],
    routes: [],
    endpoints: [
      { method: 'GET', path: '/api/invoices', responseSchema: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } } },
    ],
    schemas: [],
    docs: [],
    generatedAt: '2026-09-05T00:00:00.000Z',
  };
}

function fakeSink(): FixtureWiringSink & { active: string | null; wiring: string | undefined } {
  const state = { active: null as string | null, wiring: undefined as string | undefined };
  return {
    setActiveFixture: vi.fn((name: string | null) => { state.active = name; }),
    setFixtureWiring: vi.fn((status) => { state.wiring = status; }),
    get active() { return state.active; },
    get wiring() { return state.wiring; },
  } as unknown as FixtureWiringSink & { active: string | null; wiring: string | undefined };
}

let repoRoot: string;

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'jig-fixtures-store-'));
});

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

describe('FixtureStore — empty state', () => {
  it('starts with no fixtures, nothing active, and reports wiring "none"', async () => {
    const sink = fakeSink();
    const store = new FixtureStore(repoRoot, sink);
    await store.init();
    expect(store.list()).toEqual([]);
    expect(store.getActive()).toBeUndefined();
    expect(sink.setFixtureWiring).toHaveBeenLastCalledWith('none');
  });
});

describe('FixtureStore — create', () => {
  it('generates, persists atomically under .jig/fixtures/<id>.json, and reports wiring "stub"', async () => {
    const sink = fakeSink();
    const store = new FixtureStore(repoRoot, sink);
    await store.init();

    const fixture = await store.create({ name: 'overdue-heavy', seed: 42 }, stubSurvey());
    expect(fixture.id).toBe('overdue-heavy');
    expect(fixture.seed).toBe(42);

    const onDisk = JSON.parse(await readFile(join(jigPaths(repoRoot).fixtures, 'overdue-heavy.json'), 'utf8'));
    expect(onDisk.id).toBe('overdue-heavy');

    expect(store.list().map((f) => f.id)).toEqual(['overdue-heavy']);
    expect(sink.setFixtureWiring).toHaveBeenLastCalledWith('stub');
  });

  it('defaults the seed to a stable hash of the name — same name, no seed, reproduces the same seed and data', async () => {
    const storeA = new FixtureStore(repoRoot, fakeSink());
    await storeA.init();
    const a = await storeA.create({ name: 'alpha' }, stubSurvey());

    const otherRoot = await mkdtemp(join(tmpdir(), 'jig-fixtures-store-'));
    try {
      const storeB = new FixtureStore(otherRoot, fakeSink());
      await storeB.init();
      const b = await storeB.create({ name: 'alpha' }, stubSurvey());
      expect(b.seed).toBe(a.seed);
      expect(JSON.stringify(b.responses)).toBe(JSON.stringify(a.responses));
    } finally {
      await rm(otherRoot, { recursive: true, force: true });
    }
  });

  it('rejects a duplicate name (id collision) rather than silently overwriting', async () => {
    const store = new FixtureStore(repoRoot, fakeSink());
    await store.init();
    await store.create({ name: 'dup' }, stubSurvey());
    await expect(store.create({ name: 'dup' }, stubSurvey())).rejects.toBeInstanceOf(FixtureNameConflictError);
  });

  it('rejects a blank name', async () => {
    const store = new FixtureStore(repoRoot, fakeSink());
    await store.init();
    await expect(store.create({ name: '   ' }, stubSurvey())).rejects.toThrow();
  });
});

describe('FixtureStore — persistence round-trip', () => {
  it('a fresh store instance pointed at the same repoRoot picks up what an earlier one wrote', async () => {
    const first = new FixtureStore(repoRoot, fakeSink());
    await first.init();
    await first.create({ name: 'persisted', seed: 1 }, stubSurvey());

    const second = new FixtureStore(repoRoot, fakeSink());
    await second.init();
    expect(second.list().map((f) => f.id)).toEqual(['persisted']);
  });
});

describe('FixtureStore — load / unload', () => {
  it('load sets the active fixture and flips wiring to "wired"; unload clears it back to "stub"', async () => {
    const sink = fakeSink();
    const store = new FixtureStore(repoRoot, sink);
    await store.init();
    await store.create({ name: 'a', seed: 1 }, stubSurvey());

    const loaded = store.load('a');
    expect(loaded.id).toBe('a');
    expect(store.getActive()?.id).toBe('a');
    expect(sink.setActiveFixture).toHaveBeenLastCalledWith('a');
    expect(sink.setFixtureWiring).toHaveBeenLastCalledWith('wired');

    store.unload();
    expect(store.getActive()).toBeUndefined();
    expect(sink.setActiveFixture).toHaveBeenLastCalledWith(null);
    expect(sink.setFixtureWiring).toHaveBeenLastCalledWith('stub');
  });

  it('loading an unknown id throws FixtureNotFoundError', async () => {
    const store = new FixtureStore(repoRoot, fakeSink());
    await store.init();
    expect(() => store.load('nope')).toThrow(FixtureNotFoundError);
  });

  it('loading a scrapped fixture throws FixtureScrappedError', async () => {
    const store = new FixtureStore(repoRoot, fakeSink());
    await store.init();
    await store.create({ name: 'a', seed: 1 }, stubSurvey());
    await store.scrap('a');
    expect(() => store.load('a')).toThrow(FixtureScrappedError);
  });
});

describe('FixtureStore — scrap / restore (Law II: never a hard delete)', () => {
  it('scrap marks the fixture, persists it, and auto-unloads it if it was active', async () => {
    const sink = fakeSink();
    const store = new FixtureStore(repoRoot, sink);
    await store.init();
    await store.create({ name: 'a', seed: 1 }, stubSurvey());
    store.load('a');

    const scrapped = await store.scrap('a');
    expect(scrapped.scrapped).toBe(true);
    expect(scrapped.scrappedAt).toBeTruthy();
    expect(store.getActive()).toBeUndefined();
    expect(sink.setActiveFixture).toHaveBeenLastCalledWith(null);

    // still listed — scrapped, not deleted
    expect(store.list().find((f) => f.id === 'a')?.scrapped).toBe(true);
  });

  it('restore clears the scrapped flag and the fixture becomes loadable again', async () => {
    const store = new FixtureStore(repoRoot, fakeSink());
    await store.init();
    await store.create({ name: 'a', seed: 1 }, stubSurvey());
    await store.scrap('a');

    const restored = await store.restore('a');
    expect(restored.scrapped).toBeUndefined();
    expect(restored.scrappedAt).toBeUndefined();
    expect(() => store.load('a')).not.toThrow();
  });

  it('there is no delete method on the store (Law II, enforced by shape)', () => {
    const store = new FixtureStore(repoRoot, fakeSink());
    expect((store as unknown as { delete?: unknown }).delete).toBeUndefined();
  });
});
