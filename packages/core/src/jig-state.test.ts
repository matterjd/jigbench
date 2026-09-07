import { describe, expect, it } from 'vitest';
import { JigStateSchema, ShopInfoSchema, WiringSchema } from './jig-state.js';
import { stubSurvey } from './survey.js';

const wiring = {
  survey: 'stub',
  proxy: 'none',
  drafter: 'stub',
  shop: 'none',
  fixtures: 'none',
  toolpath: 'none',
  sketch: 'none',
} as const;

describe('WiringSchema', () => {
  it('accepts every subsystem at wired | stub | none', () => {
    expect(() => WiringSchema.parse(wiring)).not.toThrow();
  });

  it('rejects an unknown status value', () => {
    expect(() => WiringSchema.parse({ ...wiring, survey: 'unknown' })).toThrow();
  });

  it('rejects a missing subsystem', () => {
    const { proxy: _proxy, ...rest } = wiring;
    expect(() => WiringSchema.parse(rest)).toThrow();
  });

  it('defaults docs to "none" (S2b) so a pre-S2b wiring literal still parses', () => {
    // `wiring` above has no `docs` key at all — this is exactly the S1 shape.
    const parsed = WiringSchema.parse(wiring);
    expect(parsed.docs).toBe('none');
  });

  it('accepts an explicit docs status of wired | stub | none', () => {
    expect(WiringSchema.parse({ ...wiring, docs: 'wired' }).docs).toBe('wired');
    expect(WiringSchema.parse({ ...wiring, docs: 'stub' }).docs).toBe('stub');
    expect(WiringSchema.parse({ ...wiring, docs: 'none' }).docs).toBe('none');
  });

  it('rejects an unknown docs status value', () => {
    expect(() => WiringSchema.parse({ ...wiring, docs: 'unknown' })).toThrow();
  });
});

describe('JigStateSchema', () => {
  it('validates the S1 shape: a stub survey, empty gauges/marks/work-orders, honest wiring', () => {
    const state = {
      survey: stubSurvey(),
      gauges: { jigFormat: 1, gauges: [], generatedAt: new Date().toISOString() },
      marks: [],
      workOrders: [],
      wiring,
    };
    expect(() => JigStateSchema.parse(state)).not.toThrow();
  });

  // Retest defect 22 (2026-09-06 evening): the bench's ShopLane/SimStrip need to know WHO is
  // connected, live — `shop` (the connected agent's client label + connectedAt, or null) is
  // now part of the canonical, typed JigState shape rather than an ad hoc extension http.ts
  // bolted on only at the HTTP/WS boundary. Optional (not required) so every pre-existing
  // JigState-shaped literal across the codebase that never mentions `shop` still parses and
  // still type-checks.
  it('accepts state with no shop key at all (pre-existing literals stay valid)', () => {
    const state = {
      survey: stubSurvey(),
      gauges: { jigFormat: 1, gauges: [], generatedAt: new Date().toISOString() },
      marks: [],
      workOrders: [],
      wiring,
    };
    expect(JigStateSchema.parse(state).shop).toBeUndefined();
  });

  it('accepts shop: null (no agent connected)', () => {
    const state = {
      survey: stubSurvey(),
      gauges: { jigFormat: 1, gauges: [], generatedAt: new Date().toISOString() },
      marks: [],
      workOrders: [],
      wiring,
      shop: null,
    };
    expect(JigStateSchema.parse(state).shop).toBeNull();
  });

  it('accepts shop: {client, connectedAt} (an agent is connected)', () => {
    const shop = { client: 'Claude Code 2.1.259', connectedAt: '2026-09-06T20:00:00.000Z' };
    const state = {
      survey: stubSurvey(),
      gauges: { jigFormat: 1, gauges: [], generatedAt: new Date().toISOString() },
      marks: [],
      workOrders: [],
      wiring,
      shop,
    };
    expect(JigStateSchema.parse(state).shop).toEqual(shop);
  });
});

describe('ShopInfoSchema', () => {
  it('requires both client and connectedAt as strings', () => {
    expect(() => ShopInfoSchema.parse({ client: 'Claude Code', connectedAt: '2026-09-06T20:00:00.000Z' })).not.toThrow();
    expect(() => ShopInfoSchema.parse({ client: 'Claude Code' })).toThrow();
  });
});
