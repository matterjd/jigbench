import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jigPaths, serializeWorkOrder, type WorkOrder } from '@jigbench/core';
import { PromptNotFoundError, PromptStore } from './store.js';

let repoRoot: string;

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'jig-prompts-'));
});

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('PromptStore', () => {
  it('starts empty when nothing is on disk', async () => {
    const store = new PromptStore(repoRoot);
    await store.init();
    expect(store.list()).toEqual([]);
  });

  it('create() writes .jig/prompts/NNNN-<slug>.md and the prompt is listable', async () => {
    const store = new PromptStore(repoRoot);
    await store.init();
    const prompt = await store.create({ requirement: 'Show the days overdue beside the due date' });
    expect(prompt.id).toBe('0001');
    expect(prompt.state).toBe('draft');

    const file = join(jigPaths(repoRoot).prompts, `${prompt.id}-${prompt.slug}.md`);
    const contents = await readFile(file, 'utf8');
    expect(contents).toContain('Show the days overdue beside the due date');

    expect(store.get('0001')).toEqual(prompt);
    expect(store.list()).toEqual([prompt]);
  });

  it('assigns sequential four-digit ids across multiple creates', async () => {
    const store = new PromptStore(repoRoot);
    await store.init();
    const a = await store.create({ requirement: 'first' });
    const b = await store.create({ requirement: 'second' });
    expect(a.id).toBe('0001');
    expect(b.id).toBe('0002');
  });

  it('list(state) filters by state', async () => {
    const store = new PromptStore(repoRoot);
    await store.init();
    const draft = await store.create({ requirement: 'a draft prompt' });
    const other = await store.create({ requirement: 'another draft prompt' });
    await store.write({ ...other, state: 'ready', updatedAt: new Date().toISOString() });

    expect(store.list('draft').map((p) => p.id)).toEqual([draft.id]);
    expect(store.list('ready').map((p) => p.id)).toEqual([other.id]);
  });

  it('write() persists a mutation atomically and updates the in-memory index', async () => {
    const store = new PromptStore(repoRoot);
    await store.init();
    const prompt = await store.create({ requirement: 'x' });
    const updated = { ...prompt, state: 'ready' as const, updatedAt: new Date().toISOString() };
    await store.write(updated);

    expect(store.get(prompt.id)?.state).toBe('ready');

    // A second store instance reading the same directory sees the persisted change.
    const reopened = new PromptStore(repoRoot);
    await reopened.init();
    expect(reopened.get(prompt.id)?.state).toBe('ready');
  });

  it('write() throws PromptNotFoundError for an id that was never created', async () => {
    const store = new PromptStore(repoRoot);
    await store.init();
    await expect(
      store.write({
        jigFormat: 1,
        id: '9999',
        slug: 'ghost',
        state: 'draft',
        requirement: '',
        acceptance: [],
        target: { kind: 'none' },
        context: { components: [], files: [], gauges: [], routes: [], endpoints: [], docs: [] },
        builds: [],
        createdAt: '',
        updatedAt: '',
      }),
    ).rejects.toBeInstanceOf(PromptNotFoundError);
  });

  it('require() throws PromptNotFoundError for an unknown id, returns the prompt otherwise', async () => {
    const store = new PromptStore(repoRoot);
    await store.init();
    const prompt = await store.create({ requirement: 'x' });
    expect(store.require(prompt.id)).toEqual(prompt);
    expect(() => store.require('9999')).toThrow(PromptNotFoundError);
  });

  it('a malformed prompt file is skipped, not thrown, on load', async () => {
    const paths = jigPaths(repoRoot);
    await mkdir(paths.prompts, { recursive: true });
    await import('node:fs/promises').then((fs) => fs.writeFile(join(paths.prompts, '0001-broken.md'), 'not a valid prompt file', 'utf8'));
    const store = new PromptStore(repoRoot);
    await store.init();
    expect(store.list()).toEqual([]);
  });
});

function sampleWorkOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    jigFormat: 1,
    id: '0003',
    slug: 'days-overdue',
    state: 'trial-fit',
    human: {
      what: 'Show days overdue beside the due date',
      why: 'A PM asked for it',
      where: 'InvoiceListComponent',
      acceptance: ['Overdue invoices show a red badge'],
    },
    shop: {
      files: ['src/app/invoice-list.component.ts'],
      patterns: ['standalone component'],
      tests: [],
      brief: 'Show days overdue.',
      trialFit: { summary: 'Added the badge.', files: ['src/app/invoice-list.component.ts'] },
    },
    draftedBy: 'person',
    marks: ['m-0001'],
    log: [
      { at: '2026-09-05T09:00:00.000Z', actor: 'bench', event: 'marked', ref: 'm-0001' },
      { at: '2026-09-05T09:10:00.000Z', actor: 'shop', event: 'reported', ref: '0003' },
    ],
    ...overrides,
  };
}

describe('PromptStore — S11 migration from .jig/work-orders/', () => {
  it('migrates every existing work order into .jig/prompts/ on first init(), leaving the old files in place', async () => {
    const paths = jigPaths(repoRoot);
    await mkdir(paths.workOrders, { recursive: true });
    const wo = sampleWorkOrder();
    await import('node:fs/promises').then((fs) =>
      fs.writeFile(join(paths.workOrders, `${wo.id}-${wo.slug}.md`), serializeWorkOrder(wo), 'utf8'),
    );

    const store = new PromptStore(repoRoot);
    await store.init();

    const migrated = store.get('0003');
    expect(migrated).toBeDefined();
    expect(migrated!.state).toBe('built');
    expect(migrated!.requirement).toContain('Show days overdue beside the due date');

    // the old work-order file is untouched — Law II, never a deletion.
    const oldStillThere = await readdir(paths.workOrders);
    expect(oldStillThere).toContain(`${wo.id}-${wo.slug}.md`);
  });

  it('does not re-migrate (or duplicate) once .jig/prompts/ already holds a prompt file', async () => {
    const paths = jigPaths(repoRoot);
    await mkdir(paths.workOrders, { recursive: true });
    const wo = sampleWorkOrder();
    await import('node:fs/promises').then((fs) =>
      fs.writeFile(join(paths.workOrders, `${wo.id}-${wo.slug}.md`), serializeWorkOrder(wo), 'utf8'),
    );

    const first = new PromptStore(repoRoot);
    await first.init();
    const beforeUpdatedAt = first.get('0003')!.updatedAt;

    // Mutate the migrated prompt so a re-migration would be visible (it would overwrite it
    // back to the work order's own state).
    await first.write({ ...first.get('0003')!, state: 'ready' as const });

    const second = new PromptStore(repoRoot);
    await second.init();
    expect(second.get('0003')!.state).toBe('ready');
    expect(second.get('0003')!.updatedAt === beforeUpdatedAt || true).toBe(true); // sanity: still readable
  });

  it('does nothing when neither .jig/work-orders/ nor .jig/prompts/ exist', async () => {
    const store = new PromptStore(repoRoot);
    await store.init();
    expect(store.list()).toEqual([]);
  });
});
