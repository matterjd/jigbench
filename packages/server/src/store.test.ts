import { describe, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { jigPaths, parseWorkOrder } from '@jigbench/core';
import { JigStore } from './store.js';
import { runSurveyAndWrite } from './survey/run.js';

const LEDGER_ANGULAR_SOURCE = fileURLToPath(
  new URL('../../../examples/ledger-angular', import.meta.url),
);

async function freshRepo(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'jig-store-'));
}

describe('JigStore.init', () => {
  it('creates the full .jig/ tree', async () => {
    const repoRoot = await freshRepo();
    const store = new JigStore(repoRoot);

    await store.init();

    const paths = jigPaths(repoRoot);
    for (const dir of [paths.survey, paths.fixtures, paths.workOrders, paths.toolpaths, paths.sketches, paths.cache]) {
      expect((await stat(dir)).isDirectory()).toBe(true);
    }
  });

  it('starts with an honest stub survey and matching wiring when nothing is on disk', async () => {
    const repoRoot = await freshRepo();
    const store = new JigStore(repoRoot);

    await store.init();
    const state = store.getState();

    expect(state.survey.stub).toBe(true);
    expect(state.wiring.survey).toBe('stub');
    expect(state.wiring.proxy).toBe('none');
    expect(state.wiring.drafter).toBe('stub');
    expect(state.wiring.shop).toBe('none');
    expect(state.wiring.fixtures).toBe('none');
    expect(state.wiring.toolpath).toBe('none');
    expect(state.wiring.sketch).toBe('none');
    expect(state.wiring.docs).toBe('none');
    expect(state.marks).toEqual([]);
    expect(state.workOrders).toEqual([]);
  });

  it('reports wiring.proxy as wired once the plate proxy is marked wired (S3)', async () => {
    const repoRoot = await freshRepo();
    const store = new JigStore(repoRoot);
    await store.init();

    expect(store.getWiring().proxy).toBe('none');
    store.setProxyWired(true);
    expect(store.getWiring().proxy).toBe('wired');
    expect(store.getState().wiring.proxy).toBe('wired');
  });
});

describe('JigStore.createMarkAndWorkOrder', () => {
  it('writes a schema-valid work-order file in the marked state and broadcasts via state', async () => {
    const repoRoot = await freshRepo();
    const store = new JigStore(repoRoot);
    await store.init();

    const { mark, workOrder } = await store.createMarkAndWorkOrder({
      target: { path: 'body > invoice-list', component: 'InvoiceListComponent' },
      prompt: 'highlight the due date when overdue',
    });

    expect(mark.id).toBe('m-0001');
    expect(workOrder.id).toBe('0001');
    expect(workOrder.state).toBe('marked');
    expect(workOrder.marks).toEqual(['m-0001']);

    const paths = jigPaths(repoRoot);
    const file = join(paths.workOrders, `${workOrder.id}-${workOrder.slug}.md`);
    const onDisk = parseWorkOrder(await readFile(file, 'utf8'));
    expect(onDisk.id).toBe(workOrder.id);
    expect(onDisk.state).toBe('marked');

    const state = store.getState();
    expect(state.marks).toHaveLength(1);
    expect(state.workOrders).toHaveLength(1);
  });

  it('assigns increasing ids across multiple marks', async () => {
    const repoRoot = await freshRepo();
    const store = new JigStore(repoRoot);
    await store.init();

    const first = await store.createMarkAndWorkOrder({ target: { path: 'a' }, prompt: 'first' });
    const second = await store.createMarkAndWorkOrder({ target: { path: 'b' }, prompt: 'second' });

    expect(first.workOrder.id).toBe('0001');
    expect(second.workOrder.id).toBe('0002');
    expect(first.mark.id).toBe('m-0001');
    expect(second.mark.id).toBe('m-0002');
  });
});

describe('JigStore.reload / a fresh process picking the store back up', () => {
  it('rebuilds its work-order index from disk, not from memory', async () => {
    const repoRoot = await freshRepo();
    const writer = new JigStore(repoRoot);
    await writer.init();
    await writer.createMarkAndWorkOrder({ target: { path: 'a' }, prompt: 'remember me' });

    // A brand-new store instance, as if the process restarted.
    const reader = new JigStore(repoRoot);
    await reader.init();

    const state = reader.getState();
    expect(state.workOrders).toHaveLength(1);
    expect(state.workOrders[0]?.human.what).toBe('remember me');
    expect(state.marks).toHaveLength(1);
  });

  it('reports wiring.survey as wired once a non-stub survey.json exists on disk', async () => {
    const repoRoot = await freshRepo();
    const store = new JigStore(repoRoot);
    await store.init();

    const paths = jigPaths(repoRoot);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      join(paths.survey, 'survey.json'),
      JSON.stringify({
        jigFormat: 1,
        stack: ['angular'],
        components: [],
        routes: [],
        endpoints: [],
        schemas: [],
        docs: [],
        generatedAt: new Date().toISOString(),
      }),
      'utf8',
    );

    await store.reload();

    expect(store.getState().wiring.survey).toBe('wired');
  });

  it('reports wiring.docs as wired once a docs.json exists on disk (S2b clamp)', async () => {
    const repoRoot = await freshRepo();
    const store = new JigStore(repoRoot);
    await store.init();
    expect(store.getState().wiring.docs).toBe('none');

    const paths = jigPaths(repoRoot);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      join(paths.survey, 'docs.json'),
      JSON.stringify({ jigFormat: 1, root: '/docs', clampedAt: new Date().toISOString(), files: [], chunks: [] }),
      'utf8',
    );

    await store.reload();

    expect(store.getState().wiring.docs).toBe('wired');
  });

  it('GET /api/state carries the real survey once S2 wiring has run — not a hand-crafted stand-in (examples/ is read-only, so this runs against a throwaway copy)', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-store-real-survey-'));
    try {
      await cp(LEDGER_ANGULAR_SOURCE, repoRoot, { recursive: true });
      await runSurveyAndWrite(repoRoot);

      // A store constructed AFTER the survey ran, the way the real server boots against an
      // already-clamped repo — store.getState() is exactly what `GET /api/state` returns.
      const store = new JigStore(repoRoot);
      await store.init();
      const state = store.getState();

      expect(state.survey.stub).toBe(false);
      expect(state.survey.components.length).toBe(7);
      expect(state.survey.components.map((c) => c.name)).toContain('StatusChipComponent');
      expect(state.wiring.survey).toBe('wired');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  }, 20000);
});
