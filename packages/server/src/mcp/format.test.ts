import { describe, expect, it } from 'vitest';
import { ageString, firstLogAt, workOrderFilePath } from './format.js';

/**
 * Pure presentation helpers shared by the MCP tools (`jig_work_orders`'s `age`/`file`
 * columns) — no I/O, so they're worth their own fast unit tests rather than only being
 * exercised indirectly through a tool call.
 */

describe('ageString', () => {
  const now = Date.parse('2026-09-06T12:00:00.000Z');

  it('reads under a minute as "just now"', () => {
    expect(ageString(new Date(now - 30_000).toISOString(), now)).toBe('just now');
  });

  it('reads minutes', () => {
    expect(ageString(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5m');
  });

  it('reads hours once past 60 minutes', () => {
    expect(ageString(new Date(now - 3 * 60 * 60_000).toISOString(), now)).toBe('3h');
  });

  it('reads days once past 24 hours', () => {
    expect(ageString(new Date(now - 2 * 24 * 60 * 60_000).toISOString(), now)).toBe('2d');
  });

  it('never goes negative for a future/clock-skewed timestamp', () => {
    expect(ageString(new Date(now + 60_000).toISOString(), now)).toBe('just now');
  });

  it('reports "unknown" for an unparsable timestamp rather than throwing', () => {
    expect(ageString('not-a-date', now)).toBe('unknown');
  });
});

describe('firstLogAt', () => {
  it('returns the earliest log entry\'s timestamp', () => {
    expect(
      firstLogAt({ log: [{ at: '2026-01-01T00:00:00.000Z', actor: 'bench', event: 'marked', ref: 'm-0001' }] }),
    ).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns undefined for an empty log rather than throwing', () => {
    expect(firstLogAt({ log: [] })).toBeUndefined();
  });
});

describe('workOrderFilePath', () => {
  it('joins the repo\'s .jig/work-orders dir with "<id>-<slug>.md"', () => {
    const path = workOrderFilePath('/repo', { id: '0001', slug: 'flag-overdue-rows' });
    expect(path.replace(/\\/g, '/')).toBe('/repo/.jig/work-orders/0001-flag-overdue-rows.md');
  });
});
