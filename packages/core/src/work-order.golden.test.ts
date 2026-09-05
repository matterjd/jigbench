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
});
