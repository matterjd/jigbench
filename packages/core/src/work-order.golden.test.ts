import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorkOrder, serializeWorkOrder, type WorkOrder } from './work-order.js';

const here = dirname(fileURLToPath(import.meta.url));
const goldenPath = join(here, '__fixtures__', 'work-order.golden.md');

// The sample work order the golden fixture is generated from. If you change this object,
// regenerate the fixture with: UPDATE_GOLDEN=1 vitest run work-order.golden
const sample: WorkOrder = {
  jigFormat: 1,
  id: '0007',
  slug: 'highlight-invoice-due-date',
  state: 'released',
  draftedBy: 'model',
  // Retest defect 5 (2026-09-06 evening): persisted draft metadata — the model name + the
  // measured wall-clock cost, so the tray badge still knows "qwen2.5-coder:7b · 5.2s" after
  // a bench restart or a scrap + fresh mark, not just the bare "model" driver name.
  model: 'qwen2.5-coder:7b',
  elapsedMs: 5200,
  marks: ['m-0001', 'm-0002'],
  human: {
    what: 'Highlight the invoice due date in red when it is overdue.',
    why: 'Customers miss overdue invoices because nothing calls it out.',
    where: 'InvoiceListComponent, the due-date cell.',
    acceptance: [
      'An overdue due-date cell renders in the alert colour.',
      'A due date that is today or in the future renders unchanged.',
    ],
    fixture: 'invoice-overdue.json',
  },
  shop: {
    files: [
      'src/app/invoice-list/invoice-list.component.ts',
      'src/app/invoice-list/invoice-list.component.html',
    ],
    patterns: ['Angular signals for derived state', 'ngClass binding on a computed signal'],
    tests: ['invoice-list.component.spec.ts: overdue row gets the alert class'],
    brief:
      'Add a computed signal that flags overdue rows and bind it to the due-date cell class.',
  },
  log: [],
};

describe('WorkOrder markdown golden round trip', () => {
  if (process.env.UPDATE_GOLDEN === '1') {
    it('regenerates the golden fixture', () => {
      writeFileSync(goldenPath, serializeWorkOrder(sample), 'utf8');
      expect(existsSync(goldenPath)).toBe(true);
    });
    return;
  }

  it('the golden fixture exists', () => {
    expect(existsSync(goldenPath)).toBe(true);
  });

  it('serializeWorkOrder(sample) is byte-exact against the golden fixture', () => {
    const golden = readFileSync(goldenPath, 'utf8');
    expect(serializeWorkOrder(sample)).toBe(golden);
  });

  it('parseWorkOrder(golden) deep-equals the sample object', () => {
    const golden = readFileSync(goldenPath, 'utf8');
    expect(parseWorkOrder(golden)).toEqual(sample);
  });

  it('round-trips a second time: serialize(parse(golden)) === golden', () => {
    const golden = readFileSync(goldenPath, 'utf8');
    expect(serializeWorkOrder(parseWorkOrder(golden))).toBe(golden);
  });

  it('a work order with no shop face omits the Shop brief section entirely', () => {
    const { shop: _shop, ...withoutShop } = sample;
    const wo: WorkOrder = { ...withoutShop, state: 'drafted' };
    const md = serializeWorkOrder(wo);
    expect(md).not.toContain('## Shop brief');
    expect(parseWorkOrder(md)).toEqual(wo);
  });

  // Retest defect 5 (2026-09-06 evening): "I just see `drafted · model`" — the model name +
  // elapsed cost must survive the markdown round trip, not just live in the ephemeral log.
  it('round-trips model + elapsedMs through the frontmatter', () => {
    const md = serializeWorkOrder(sample);
    // Quoted: `yamlScalar` quotes any value that isn't a bare identifier — a model name
    // with a colon in it (qwen2.5-coder:7b) always needs it, same as every other field.
    expect(md).toContain('model: "qwen2.5-coder:7b"');
    expect(md).toContain('elapsedMs: 5200');
    expect(parseWorkOrder(md).model).toBe('qwen2.5-coder:7b');
    expect(parseWorkOrder(md).elapsedMs).toBe(5200);
  });

  // Backward compat: every pre-existing work-order file (written before this fix, or drafted
  // by 'shop'/'person' rather than 'model') has no model/elapsedMs at all — must still parse
  // cleanly, and neither field appears in a fresh serialization when absent.
  it('omits model/elapsedMs entirely when absent (backward compat with pre-existing files)', () => {
    const { model: _model, elapsedMs: _elapsedMs, ...withoutMeta } = sample;
    const wo: WorkOrder = { ...withoutMeta };
    const md = serializeWorkOrder(wo);
    expect(md).not.toContain('model:');
    expect(md).not.toContain('elapsedMs:');
    expect(parseWorkOrder(md)).toEqual(wo);
    expect(parseWorkOrder(md).model).toBeUndefined();
    expect(parseWorkOrder(md).elapsedMs).toBeUndefined();
  });
});
