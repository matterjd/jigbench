import { describe, expect, it } from 'vitest';
import { LADDER_EVENTS, LADDER_STATES, transition, type LadderEvent, type LadderState } from './ladder.js';

// The full cross product of states x events, hand-written independently of ladder.ts's own
// transition table, so this test can actually catch a wrong table rather than just
// re-asserting it. `null` means the move is illegal.
const EXPECTED: Record<LadderState, Record<LadderEvent, LadderState | null>> = {
  marked: { draft: 'drafted', release: null, claim: null, report: null, scrap: 'scrapped' },
  drafted: { draft: null, release: 'released', claim: null, report: null, scrap: 'scrapped' },
  released: { draft: null, release: null, claim: 'in-the-shop', report: null, scrap: 'scrapped' },
  'in-the-shop': { draft: null, release: null, claim: null, report: 'trial-fit', scrap: 'scrapped' },
  'trial-fit': { draft: null, release: null, claim: null, report: null, scrap: 'scrapped' },
  scrapped: { draft: null, release: null, claim: null, report: null, scrap: null },
};

describe('work-order state ladder', () => {
  it('covers every state and every event in the expectation table', () => {
    expect(new Set(Object.keys(EXPECTED))).toEqual(new Set(LADDER_STATES));
    for (const state of LADDER_STATES) {
      expect(new Set(Object.keys(EXPECTED[state]))).toEqual(new Set(LADDER_EVENTS));
    }
  });

  for (const state of LADDER_STATES) {
    for (const event of LADDER_EVENTS) {
      const expected = EXPECTED[state][event];
      const label = expected === null ? 'is illegal' : `-> ${expected}`;
      it(`${state} --${event}--> ${label}`, () => {
        expect(transition(state, event)).toBe(expected);
      });
    }
  }

  it('scrapped is terminal: no event moves it anywhere', () => {
    for (const event of LADDER_EVENTS) {
      expect(transition('scrapped', event)).toBeNull();
    }
  });

  it('scrap reaches scrapped from every non-terminal state (Law II)', () => {
    for (const state of LADDER_STATES) {
      if (state === 'scrapped') continue;
      expect(transition(state, 'scrap')).toBe('scrapped');
    }
  });
});
