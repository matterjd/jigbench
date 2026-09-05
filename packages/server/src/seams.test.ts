import { describe, expect, it } from 'vitest';
import type { Mark } from '@jigbench/core';
import { HumanDrafter, NullDrafter, StubPlateHost } from './seams.js';

const mark: Mark = {
  id: 'm-0001',
  number: 1,
  target: { path: 'body > app-root > invoice-list', component: 'InvoiceListComponent' },
  prompt: 'the due date should stand out when overdue',
  createdAt: '2026-09-05T00:00:00.000Z',
};

describe('HumanDrafter', () => {
  it('returns an empty face to fill, seeded with the mark target', () => {
    const face = new HumanDrafter().draft(mark);
    expect(face).toEqual({
      what: '',
      why: '',
      where: 'InvoiceListComponent',
      acceptance: [],
    });
  });

  it('falls back to file, then the DOM path, when no component name is known', () => {
    const fileOnly = new HumanDrafter().draft({ ...mark, target: { path: 'x', file: 'a.ts' } });
    expect(fileOnly.where).toBe('a.ts');

    const pathOnly = new HumanDrafter().draft({ ...mark, target: { path: 'x' } });
    expect(pathOnly.where).toBe('x');
  });
});

describe('NullDrafter', () => {
  it('refuses to draft', () => {
    expect(() => new NullDrafter().draft()).toThrow(/no drafting driver/i);
  });
});

describe('StubPlateHost', () => {
  it('is the identity function — S1 does no proxying', () => {
    expect(new StubPlateHost().start('http://localhost:4201')).toBe('http://localhost:4201');
  });
});
