import { z } from 'zod';

/**
 * The work-order state ladder (Law II: scrapped is a state, never a deletion — a scrapped
 * work order still exists, still counts, and is never removed from `.jig/work-orders/`).
 */
export const LADDER_STATES = [
  'marked',
  'drafted',
  'released',
  'in-the-shop',
  'trial-fit',
  'scrapped',
] as const;
export const LadderStateSchema = z.enum(LADDER_STATES);
export type LadderState = (typeof LADDER_STATES)[number];

export const LADDER_EVENTS = ['draft', 'release', 'claim', 'report', 'scrap'] as const;
export const LadderEventSchema = z.enum(LADDER_EVENTS);
export type LadderEvent = (typeof LADDER_EVENTS)[number];

type Transitions = Record<LadderState, Partial<Record<LadderEvent, LadderState>>>;

/** The only legal moves. Every state can be scrapped except `scrapped` itself, which is
 * terminal — nothing transitions out of it. */
const TRANSITIONS: Transitions = {
  marked: { draft: 'drafted', scrap: 'scrapped' },
  drafted: { release: 'released', scrap: 'scrapped' },
  released: { claim: 'in-the-shop', scrap: 'scrapped' },
  'in-the-shop': { report: 'trial-fit', scrap: 'scrapped' },
  'trial-fit': { scrap: 'scrapped' },
  scrapped: {},
};

/** A pure function: given a state and an event, the next state — or `null` if that move is
 * illegal. Never throws; illegal moves are data, not exceptions, so a caller can decide what
 * to do (badge it, log it, refuse it) without a try/catch. */
export function transition(state: LadderState, event: LadderEvent): LadderState | null {
  return TRANSITIONS[state]?.[event] ?? null;
}
