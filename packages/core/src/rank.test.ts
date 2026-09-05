import { describe, expect, it } from 'vitest';
import type { DocChunk } from './docs.js';
import { buildIndex, retrieve, tokenize } from './rank.js';

function chunk(partial: Partial<DocChunk> & Pick<DocChunk, 'id' | 'file' | 'text'>): DocChunk {
  return {
    headingPath: [],
    startLine: 1,
    endLine: 1,
    words: partial.text.split(/\s+/).filter(Boolean).length,
    ...partial,
  };
}

describe('tokenize', () => {
  it('lowercases, keeps only alnum tokens, and drops stopwords', () => {
    expect(tokenize('The Invoice is DUE.')).toEqual(['invoice', 'due']);
  });

  it('stems simple plural -s, -ing, and -ed suffixes', () => {
    expect(tokenize('invoices')).toEqual(['invoice']);
    expect(tokenize('billing')).toEqual(['bill']);
    expect(tokenize('issued')).toEqual(['issu']);
  });
});

describe('retrieve (BM25-lite)', () => {
  it('ranks the chunk mentioning every query word above one mentioning only one', () => {
    const both = chunk({ id: 'a', file: 'a.md', text: 'The invoice due date is printed at the top.' });
    const partial = chunk({ id: 'b', file: 'b.md', text: 'The invoice number appears at the top.' });
    const index = buildIndex([partial, both]);

    const results = retrieve(index, 'invoice due date', 5);

    expect(results[0]!.chunk.id).toBe('a');
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it('returns an empty result for an empty index, not an error', () => {
    const index = buildIndex([]);
    expect(retrieve(index, 'anything', 5)).toEqual([]);
  });

  it('caps results at k and breaks ties deterministically by file then startLine', () => {
    const a = chunk({ id: 'a', file: 'b.md', text: 'widget widget widget', startLine: 5 });
    const b = chunk({ id: 'b', file: 'a.md', text: 'widget widget widget', startLine: 10 });
    const c = chunk({ id: 'c', file: 'a.md', text: 'widget widget widget', startLine: 1 });
    const index = buildIndex([a, b, c]);

    const results = retrieve(index, 'widget', 2);

    expect(results).toHaveLength(2);
    // a.md sorts before b.md; within a.md, startLine 1 sorts before startLine 10.
    expect(results.map((r) => r.chunk.id)).toEqual(['c', 'b']);
  });

  it('is deterministic across repeated calls on the same index', () => {
    const chunks = [
      chunk({ id: 'x', file: 'x.md', text: 'gauges categorize colour space radius' }),
      chunk({ id: 'y', file: 'y.md', text: 'gauges are the design system, measured' }),
    ];
    const index = buildIndex(chunks);
    const first = retrieve(index, 'gauges design', 5).map((r) => r.chunk.id);
    const second = retrieve(index, 'gauges design', 5).map((r) => r.chunk.id);
    expect(first).toEqual(second);
  });
});
