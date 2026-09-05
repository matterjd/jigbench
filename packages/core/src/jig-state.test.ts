import { describe, expect, it } from 'vitest';
import { JigStateSchema, WiringSchema } from './jig-state.js';
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
});
