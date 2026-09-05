import { describe, expect, it } from 'vitest';
import type { DocsIndex } from '@jigbench/core';
import { contextForPrompt } from './context.js';

function idx(chunks: DocsIndex['chunks']): DocsIndex {
  return { jigFormat: 1, root: '/docs', clampedAt: '2026-09-05T00:00:00.000Z', files: [], chunks };
}

describe('contextForPrompt', () => {
  it('ranks by the prompt plus surveyed names and returns a readable provenance line', () => {
    const index = idx([
      {
        id: 'a',
        file: 'billing.md',
        headingPath: ['Billing', 'Due dates'],
        startLine: 10,
        endLine: 14,
        text: 'Invoices fall due thirty days after issue.',
        words: 7,
      },
      {
        id: 'b',
        file: 'other.md',
        headingPath: [],
        startLine: 1,
        endLine: 1,
        text: 'Unrelated setup notes about npm scripts.',
        words: 6,
      },
    ]);

    const result = contextForPrompt(index, 'when is the invoice due', ['InvoiceListComponent'], 200);

    expect(result.chunks[0]?.file).toBe('billing.md');
    expect(result.chunks[0]?.provenance).toBe('billing.md > Billing > Due dates (lines 10-14)');
  });

  it('trims to the word budget, never splitting a chunk, preferring the best chunk that fits', () => {
    const index = idx([
      { id: 'big', file: 'a.md', headingPath: [], startLine: 1, endLine: 1, text: 'invoice '.repeat(50).trim(), words: 50 },
      { id: 'small', file: 'b.md', headingPath: [], startLine: 1, endLine: 1, text: 'invoice detail', words: 2 },
    ]);

    const result = contextForPrompt(index, 'invoice', [], 10);

    expect(result.chunks.map((c) => c.file)).toEqual(['b.md']);
    expect(result.totalWords).toBe(2);
  });

  it('returns an empty context for an empty index, not an error', () => {
    const result = contextForPrompt(idx([]), 'anything', [], 100);
    expect(result).toEqual({ chunks: [], totalWords: 0 });
  });

  it('returns an empty context when the budget is zero or negative', () => {
    const index = idx([{ id: 'a', file: 'a.md', headingPath: [], startLine: 1, endLine: 1, text: 'invoice due', words: 2 }]);
    expect(contextForPrompt(index, 'invoice', [], 0)).toEqual({ chunks: [], totalWords: 0 });
  });
});
