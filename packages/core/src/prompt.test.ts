import { describe, expect, it } from 'vitest';
import {
  PromptSchema,
  emptyPromptContext,
  migrateWorkOrder,
  parsePrompt,
  promptBodyForClaude,
  restorePromptState,
  serializePrompt,
  promptTransition,
  type Prompt,
} from './prompt.js';
import type { WorkOrder } from './work-order.js';
import { JIG_FORMAT } from './jig-format.js';

function samplePrompt(overrides: Partial<Prompt> = {}): Prompt {
  return {
    jigFormat: JIG_FORMAT,
    id: '0001',
    slug: 'invoice-due-date',
    state: 'ready',
    requirement: 'Show the days overdue beside the due date.\n\nA PM asked for it in triage.',
    acceptance: ['Overdue invoices show a red badge', 'On-time invoices show nothing extra'],
    target: { kind: 'element', path: 'body > app-invoice-list', component: 'InvoiceListComponent', file: 'src/app/invoice-list.component.ts' },
    context: {
      components: [{ name: 'InvoiceListComponent', selector: 'app-invoice-list', file: 'src/app/invoice-list.component.ts' }],
      files: ['src/app/invoice-list.component.ts', 'src/app/invoice-list.component.html'],
      gauges: [{ name: '--ink', value: '#111827', category: 'colour' }],
      routes: [{ path: '/invoices', component: 'InvoiceListComponent' }],
      endpoints: [{ method: 'get', path: '/api/invoices' }],
      docs: [{ provenance: 'billing.md > Due dates (lines 10-14)', text: 'Overdue means today is after the due date.' }],
    },
    builds: [],
    createdAt: '2026-09-07T10:00:00.000Z',
    updatedAt: '2026-09-07T10:00:00.000Z',
    ...overrides,
  };
}

describe('Prompt — golden round-trip', () => {
  it('serializePrompt -> parsePrompt reproduces the exact same Prompt, no builds yet', () => {
    const prompt = samplePrompt();
    const markdown = serializePrompt(prompt);
    expect(parsePrompt(markdown)).toEqual(prompt);
  });

  it('round-trips with an empty context (a fresh draft, nothing surveyed yet)', () => {
    const prompt = samplePrompt({ context: emptyPromptContext(), acceptance: [], target: { kind: 'none' } });
    const markdown = serializePrompt(prompt);
    expect(parsePrompt(markdown)).toEqual(prompt);
  });

  it('round-trips with one or more build records', () => {
    const prompt = samplePrompt({
      state: 'built',
      builds: [
        {
          id: 'b1',
          startedAt: '2026-09-07T10:05:00.000Z',
          finishedAt: '2026-09-07T10:07:12.000Z',
          exitCode: 0,
          filesTouched: ['src/app/invoice-list.component.ts', 'src/app/invoice-list.component.html'],
          summary: 'Added the days-overdue badge next to the due date.',
          transcriptPath: '.jig/cache/builds/0001-b1.jsonl',
        },
        {
          id: 'b2',
          startedAt: '2026-09-07T11:00:00.000Z',
          filesTouched: [],
        },
      ],
    });
    const markdown = serializePrompt(prompt);
    expect(parsePrompt(markdown)).toEqual(prompt);
  });

  it('round-trips a build record carrying model/elapsedMs (migrateWorkOrder retest-defect-5 fields)', () => {
    const prompt = samplePrompt({
      state: 'built',
      builds: [
        {
          id: 'migrated-0003',
          startedAt: '2026-09-07T10:05:00.000Z',
          finishedAt: '2026-09-07T10:07:12.000Z',
          exitCode: 0,
          filesTouched: ['src/app/invoice-list.component.ts'],
          summary: 'Added the days-overdue badge.',
          model: 'llama3.1',
          elapsedMs: 4213,
        },
      ],
    });
    const markdown = serializePrompt(prompt);
    expect(parsePrompt(markdown)).toEqual(prompt);
  });

  it('round-trips a scrapped prompt with scrappedFrom recorded', () => {
    const prompt = samplePrompt({ state: 'scrapped', scrappedFrom: 'ready' });
    const markdown = serializePrompt(prompt);
    expect(parsePrompt(markdown)).toEqual(prompt);
  });

  it('the markdown is stable input to PromptSchema itself, not just its own round trip', () => {
    const prompt = samplePrompt();
    expect(() => PromptSchema.parse(parsePrompt(serializePrompt(prompt)))).not.toThrow();
  });
});

describe('promptBodyForClaude', () => {
  it('is exactly Requirement + Acceptance + Context + Rules — no frontmatter, no build history', () => {
    const prompt = samplePrompt({
      builds: [{ id: 'b1', startedAt: '2026-09-07T10:05:00.000Z', filesTouched: [] }],
    });
    const body = promptBodyForClaude(prompt);
    expect(body).toContain('# Requirement');
    expect(body).toContain('## Acceptance');
    expect(body).toContain('## Context');
    expect(body).toContain('## Rules');
    expect(body).not.toContain('## Builds');
    expect(body).not.toContain('---\njigFormat');
    expect(body).not.toContain('jigFormat:');
  });

  it('carries the requirement text and every acceptance bullet verbatim', () => {
    const prompt = samplePrompt();
    const body = promptBodyForClaude(prompt);
    expect(body).toContain('Show the days overdue beside the due date.');
    for (const line of prompt.acceptance) {
      expect(body).toContain(`- ${line}`);
    }
  });

  it('carries the fixed rules, including the FILES: report line and the .jig/ prohibition', () => {
    const body = promptBodyForClaude(samplePrompt());
    expect(body).toMatch(/Work in this repo only/);
    expect(body).toMatch(/Test-first/i);
    expect(body).toMatch(/do not edit `\.jig\/`/i);
    expect(body).toMatch(/FILES: a, b, c/);
  });

  it('appends the component/files/gauges/routes/endpoints/docs context Jig knows about', () => {
    const body = promptBodyForClaude(samplePrompt());
    expect(body).toContain('InvoiceListComponent');
    expect(body).toContain('src/app/invoice-list.component.html');
    expect(body).toContain('--ink: #111827');
    expect(body).toContain('/invoices -> InvoiceListComponent');
    expect(body).toContain('GET /api/invoices');
    expect(body).toContain('billing.md > Due dates (lines 10-14)');
    expect(body).toContain('Overdue means today is after the due date.');
  });
});

describe('promptTransition — the four states + scrapped', () => {
  it('draft -> ready on "ready"', () => {
    expect(promptTransition('draft', 'ready')).toBe('ready');
  });

  it('ready -> building on "build"', () => {
    expect(promptTransition('ready', 'build')).toBe('building');
  });

  it('building -> built on "built"', () => {
    expect(promptTransition('building', 'built')).toBe('built');
  });

  it('building -> ready on "fail" (a build that exits non-zero goes back to ready)', () => {
    expect(promptTransition('building', 'fail')).toBe('ready');
  });

  it('scrap is legal from every non-terminal state', () => {
    expect(promptTransition('draft', 'scrap')).toBe('scrapped');
    expect(promptTransition('ready', 'scrap')).toBe('scrapped');
    expect(promptTransition('building', 'scrap')).toBe('scrapped');
    expect(promptTransition('built', 'scrap')).toBe('scrapped');
  });

  it('scrapped is terminal — no event moves it anywhere', () => {
    expect(promptTransition('scrapped', 'ready')).toBeNull();
    expect(promptTransition('scrapped', 'build')).toBeNull();
    expect(promptTransition('scrapped', 'scrap')).toBeNull();
  });

  it('rejects illegal forward moves instead of throwing', () => {
    expect(promptTransition('draft', 'build')).toBeNull();
    expect(promptTransition('built', 'build')).toBeNull();
    expect(promptTransition('ready', 'built')).toBeNull();
  });
});

describe('restorePromptState', () => {
  it('returns the recorded scrappedFrom state', () => {
    expect(restorePromptState('ready')).toBe('ready');
    expect(restorePromptState('building')).toBe('building');
    expect(restorePromptState('built')).toBe('built');
  });

  it('falls back to draft when scrappedFrom is missing or itself scrapped', () => {
    expect(restorePromptState(undefined)).toBe('draft');
    expect(restorePromptState('scrapped')).toBe('draft');
  });
});

function sampleWorkOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    jigFormat: JIG_FORMAT,
    id: '0003',
    slug: 'days-overdue',
    state: 'trial-fit',
    human: {
      what: 'Show days overdue beside the due date',
      why: 'A PM asked for it in triage',
      where: 'InvoiceListComponent',
      acceptance: ['Overdue invoices show a red badge'],
    },
    shop: {
      files: ['src/app/invoice-list.component.ts'],
      patterns: ['standalone component'],
      tests: ['invoice-list.component.spec.ts: extend for — days overdue'],
      brief: 'Show days overdue on InvoiceListComponent.',
      trialFit: { summary: 'Added the days-overdue badge.', files: ['src/app/invoice-list.component.ts'] },
    },
    draftedBy: 'person',
    marks: ['m-0001'],
    log: [
      { at: '2026-09-05T09:00:00.000Z', actor: 'bench', event: 'marked', ref: 'm-0001' },
      { at: '2026-09-05T09:05:00.000Z', actor: 'person', event: 'released', ref: '0003' },
      { at: '2026-09-05T09:10:00.000Z', actor: 'shop', event: 'reported', ref: '0003' },
    ],
    ...overrides,
  };
}

describe('migrateWorkOrder', () => {
  it('maps trial-fit -> built, folds what+why into the requirement, carries acceptance across', () => {
    const wo = sampleWorkOrder();
    const prompt = migrateWorkOrder(wo);
    expect(prompt.id).toBe('0003');
    expect(prompt.slug).toBe('days-overdue');
    expect(prompt.state).toBe('built');
    expect(prompt.requirement).toContain('Show days overdue beside the due date');
    expect(prompt.requirement).toContain('A PM asked for it in triage');
    expect(prompt.acceptance).toEqual(['Overdue invoices show a red badge']);
  });

  it('maps every rung: marked/drafted -> draft, released -> ready, in-the-shop -> building', () => {
    expect(migrateWorkOrder(sampleWorkOrder({ state: 'marked', shop: undefined })).state).toBe('draft');
    expect(migrateWorkOrder(sampleWorkOrder({ state: 'drafted', shop: undefined })).state).toBe('draft');
    expect(migrateWorkOrder(sampleWorkOrder({ state: 'released' })).state).toBe('ready');
    expect(migrateWorkOrder(sampleWorkOrder({ state: 'in-the-shop' })).state).toBe('building');
  });

  it('folds the shop face into context: files map directly, brief/patterns/tests become provenance-labelled docs', () => {
    const prompt = migrateWorkOrder(sampleWorkOrder());
    expect(prompt.context.files).toEqual(['src/app/invoice-list.component.ts']);
    const provenances = prompt.context.docs.map((d) => d.provenance);
    expect(provenances).toContain('migrated: shop brief');
    expect(provenances).toContain('migrated: patterns');
    expect(provenances).toContain('migrated: tests');
    expect(prompt.context.docs.find((d) => d.provenance === 'migrated: shop brief')?.text).toBe('Show days overdue on InvoiceListComponent.');
  });

  it('turns a trialFit report into one synthetic build record so build history survives', () => {
    const prompt = migrateWorkOrder(sampleWorkOrder());
    expect(prompt.builds).toHaveLength(1);
    expect(prompt.builds[0]!.summary).toBe('Added the days-overdue badge.');
    expect(prompt.builds[0]!.filesTouched).toEqual(['src/app/invoice-list.component.ts']);
    expect(prompt.builds[0]!.exitCode).toBe(0);
  });

  it('carries retest-defect-5 model/elapsedMs onto the synthetic build record', () => {
    const wo = sampleWorkOrder({ draftedBy: 'model', model: 'llama3.1', elapsedMs: 4213 });
    const prompt = migrateWorkOrder(wo);
    expect(prompt.builds).toHaveLength(1);
    expect(prompt.builds[0]!.model).toBe('llama3.1');
    expect(prompt.builds[0]!.elapsedMs).toBe(4213);
  });

  it('omits model/elapsedMs from the synthetic build record when the work order never carried them', () => {
    const prompt = migrateWorkOrder(sampleWorkOrder());
    expect(prompt.builds).toHaveLength(1);
    expect(prompt.builds[0]!.model).toBeUndefined();
    expect(prompt.builds[0]!.elapsedMs).toBeUndefined();
  });

  it('a work order with no shop face migrates with an empty context and no builds', () => {
    const prompt = migrateWorkOrder(sampleWorkOrder({ state: 'marked', shop: undefined }));
    expect(prompt.context).toEqual(emptyPromptContext());
    expect(prompt.builds).toEqual([]);
  });

  it('produces a schema-valid Prompt', () => {
    expect(() => PromptSchema.parse(migrateWorkOrder(sampleWorkOrder()))).not.toThrow();
  });

  it('maps a scrapped work order to scrapped, recording scrappedFrom via the old ladder mapping', () => {
    const wo = sampleWorkOrder({
      state: 'scrapped',
      log: [
        { at: '2026-09-05T09:00:00.000Z', actor: 'bench', event: 'marked', ref: 'm-0001' },
        { at: '2026-09-05T09:05:00.000Z', actor: 'person', event: 'released', ref: '0003' },
        { at: '2026-09-05T09:10:00.000Z', actor: 'person', event: 'scrapped', ref: '0003', note: 'prev:released' },
      ],
    });
    const prompt = migrateWorkOrder(wo);
    expect(prompt.state).toBe('scrapped');
    expect(prompt.scrappedFrom).toBe('ready');
    expect(restorePromptState(prompt.scrappedFrom)).toBe('ready');
  });
});
