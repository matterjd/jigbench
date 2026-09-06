import { describe, expect, it } from 'vitest';
import { nextToolpathId, nextWorkOrderId, slugify } from './ids.js';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Highlight the Invoice Due Date')).toBe('highlight-the-invoice-due-date');
  });

  it('folds diacritics', () => {
    expect(slugify('Café Résumé')).toBe('cafe-resume');
  });

  it('collapses non-alphanumeric runs to one hyphen and trims edges', () => {
    expect(slugify('  --wow!! this... is-- neat--  ')).toBe('wow-this-is-neat');
  });

  it('falls back to "untitled" when nothing alphanumeric survives', () => {
    expect(slugify('!!!')).toBe('untitled');
  });

  it('caps length at 60', () => {
    const long = 'a'.repeat(200);
    expect(slugify(long).length).toBeLessThanOrEqual(60);
  });
});

describe('nextWorkOrderId', () => {
  it('starts at 0001 with no existing ids', () => {
    expect(nextWorkOrderId([])).toBe('0001');
  });

  it('increments past the highest existing id', () => {
    expect(nextWorkOrderId(['0001', '0002', '0007'])).toBe('0008');
  });

  it('ignores malformed ids rather than throwing', () => {
    expect(nextWorkOrderId(['not-an-id', '0003'])).toBe('0004');
  });

  it('pads to four digits past 9999', () => {
    expect(nextWorkOrderId(['9999'])).toBe('10000');
  });
});

// S8: the toolpath store numbers `.jig/toolpaths/<id>.json` the same way work orders number
// `.jig/work-orders/`, so this is the exact same rule under its own name rather than a
// caller reaching for `nextWorkOrderId` on an unrelated collection.
describe('nextToolpathId', () => {
  it('starts at 0001 with no existing ids', () => {
    expect(nextToolpathId([])).toBe('0001');
  });

  it('increments past the highest existing id', () => {
    expect(nextToolpathId(['0001', '0003'])).toBe('0004');
  });
});
