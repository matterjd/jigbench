import { describe, expect, it } from 'vitest';
import { parseWorkOrder, serializeWorkOrder, type WorkOrder } from './work-order.js';

/**
 * S8 (EXECUTION-PLAN.md §4 row S8 / F11 "the trial fit"): `reportDone` stores the shop's
 * summary in the work order's shop section as `## Trial fit`, with the files the shop says
 * it touched — this is the markdown <-> WorkOrder half of that; `orders/service.ts` owns the
 * ladder transition itself.
 */

const base: WorkOrder = {
  jigFormat: 1,
  id: '0009',
  slug: 'rename-the-total-column',
  state: 'trial-fit',
  draftedBy: 'model',
  marks: ['m-0001'],
  human: {
    what: 'Rename the Total column to Amount due.',
    why: 'Customers misread Total as already paid.',
    where: 'InvoiceListComponent, the table header.',
    acceptance: ['The header cell reads "Amount due".'],
  },
  shop: {
    files: ['src/app/invoice-list/invoice-list.component.html'],
    patterns: ['static template text'],
    tests: [],
    brief: 'Change the header cell text.',
    trialFit: {
      summary: 'renamed the Total column',
      files: ['src/app/invoice-list/invoice-list.component.html'],
    },
  },
  log: [],
};

describe('WorkOrder — the "## Trial fit" section (S8)', () => {
  it('serializes the trial-fit summary and its files as their own section', () => {
    const md = serializeWorkOrder(base);
    expect(md).toContain('## Trial fit');
    expect(md).toContain('renamed the Total column');
    expect(md).toContain('### Trial fit files');
    expect(md).toContain('- src/app/invoice-list/invoice-list.component.html');
  });

  it('round-trips: parse(serialize(wo)) deep-equals wo', () => {
    const md = serializeWorkOrder(base);
    expect(parseWorkOrder(md)).toEqual(base);
  });

  it('a shop face with no trial-fit report omits the section entirely', () => {
    const { trialFit: _trialFit, ...shopWithoutTrialFit } = base.shop!;
    const wo: WorkOrder = { ...base, state: 'in-the-shop', shop: shopWithoutTrialFit };
    const md = serializeWorkOrder(wo);
    expect(md).not.toContain('## Trial fit');
    expect(parseWorkOrder(md)).toEqual(wo);
  });

  it('a trial-fit report with no files touched serializes an empty file list, not a missing section', () => {
    const wo: WorkOrder = { ...base, shop: { ...base.shop!, trialFit: { summary: 'no files touched', files: [] } } };
    const md = serializeWorkOrder(wo);
    expect(md).toContain('## Trial fit');
    expect(md).toContain('no files touched');
    expect(parseWorkOrder(md)).toEqual(wo);
  });
});
