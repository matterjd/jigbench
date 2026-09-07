import { describe, expect, it } from 'vitest';
import { loadedMessage } from './loadProof.js';

// Matter's retest-18: this wording is shared verbatim by FixturePanel's own chip and
// PlateBench's plate-frame banner (both import it) — pinned here once so neither can drift.
describe('loadedMessage', () => {
  it('claims "the plate answers from it" only once a real x-jig-fixture value is confirmed', () => {
    expect(loadedMessage('overdue-heavy', { ok: true, header: 'x-jig-fixture', value: 'overdue-heavy' })).toBe(
      'fixture · overdue-heavy · loaded — the plate answers from it — x-jig-fixture: overdue-heavy',
    );
  });

  it('names the honest reason when the survey has no endpoints to answer with', () => {
    expect(loadedMessage('overdue-heavy', { ok: false, reason: 'no-endpoints' })).toMatch(
      /this survey has no endpoints — survey the api too/i,
    );
  });

  it('names the honest reason when the plate answered without the header', () => {
    expect(loadedMessage('overdue-heavy', { ok: false, reason: 'not-confirmed' })).not.toMatch(
      /answers from it/i,
    );
  });

  it('names the honest reason when the plate could not be reached', () => {
    expect(loadedMessage('overdue-heavy', { ok: false, reason: 'unreachable' })).toMatch(/couldn't reach the plate/i);
  });

  it('makes no claim at all when there is no proof to go on', () => {
    expect(loadedMessage('overdue-heavy', undefined)).toBe('fixture · overdue-heavy · loaded');
  });
});
