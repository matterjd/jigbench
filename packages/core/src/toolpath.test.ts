import { describe, expect, it } from 'vitest';
import { ToolpathSchema, ToolpathStepSchema, type Toolpath } from './toolpath.js';

/**
 * S8 (EXECUTION-PLAN.md §4): "Toolpath files under `.jig/toolpaths/<id>.json` — name,
 * createdAt, startUrl, steps[{kind, path, value?, at (ms offset), label?}]". S1 shipped the
 * bare shape (jigFormat/id/steps only, `at` as a string) with no consumer yet — this test
 * file is the first to pin the real shape down.
 */

describe('ToolpathStepSchema', () => {
  it('accepts a click step with a numeric ms offset', () => {
    const step = ToolpathStepSchema.parse({ kind: 'click', path: 'app-invoice-list:nth-of-type(1)', at: 0 });
    expect(step).toEqual({ kind: 'click', path: 'app-invoice-list:nth-of-type(1)', at: 0 });
  });

  it('accepts an input step with a value', () => {
    const step = ToolpathStepSchema.parse({ kind: 'input', path: 'input:nth-of-type(1)', value: 'INV-1042', at: 500 });
    expect(step.value).toBe('INV-1042');
  });

  it('accepts a navigate step with a label', () => {
    const step = ToolpathStepSchema.parse({ kind: 'navigate', path: '/invoices/1042', at: 1200, label: 'open the invoice' });
    expect(step.label).toBe('open the invoice');
  });

  it('rejects a kind outside click/input/navigate', () => {
    expect(() => ToolpathStepSchema.parse({ kind: 'scroll', path: 'x', at: 0 })).toThrow();
  });

  it('rejects a negative offset', () => {
    expect(() => ToolpathStepSchema.parse({ kind: 'click', path: 'x', at: -1 })).toThrow();
  });
});

describe('ToolpathSchema', () => {
  const sample: Toolpath = {
    jigFormat: 1,
    id: '0001',
    name: 'open-and-edit',
    createdAt: '2026-09-05T12:00:00.000Z',
    startUrl: '/invoices',
    steps: [
      { kind: 'navigate', path: '/invoices', at: 0 },
      { kind: 'click', path: 'app-invoice-list:nth-of-type(1) > tr:nth-of-type(2)', at: 340 },
      { kind: 'input', path: 'input:nth-of-type(1)', value: 'INV-1042', at: 1800 },
    ],
  };

  it('round-trips a full toolpath, startUrl included', () => {
    expect(ToolpathSchema.parse(sample)).toEqual(sample);
  });

  it('startUrl is optional — a toolpath recorded from the plate\'s current screen has none', () => {
    const { startUrl: _startUrl, ...withoutStartUrl } = sample;
    expect(ToolpathSchema.parse(withoutStartUrl)).toEqual(withoutStartUrl);
  });

  it('scrapped/scrappedAt are optional (Law II: scrap is a state, never a deletion)', () => {
    const scrapped = { ...sample, scrapped: true, scrappedAt: '2026-09-06T00:00:00.000Z' };
    expect(ToolpathSchema.parse(scrapped)).toEqual(scrapped);
  });

  it('rejects a toolpath missing a name', () => {
    const { name: _name, ...withoutName } = sample;
    expect(() => ToolpathSchema.parse(withoutName)).toThrow();
  });
});
