import { describe, expect, it } from 'vitest';
import { jigPaths } from './paths.js';

describe('jigPaths', () => {
  it('lays out the full .jig/ tree under the repo root', () => {
    expect(jigPaths('/repo')).toEqual({
      root: '/repo/.jig',
      survey: '/repo/.jig/survey',
      gaugesFile: '/repo/.jig/gauges.json',
      fixtures: '/repo/.jig/fixtures',
      workOrders: '/repo/.jig/work-orders',
      toolpaths: '/repo/.jig/toolpaths',
      sketches: '/repo/.jig/sketches',
      cache: '/repo/.jig/cache',
    });
  });

  it('strips a trailing slash on the repo root before appending', () => {
    expect(jigPaths('/repo/').root).toBe('/repo/.jig');
    expect(jigPaths('C:/Users/matte/app\\').root).toBe('C:/Users/matte/app/.jig');
  });

  it('never imports node:path — paths are built by plain string concatenation', () => {
    // Covered structurally by the no-io test; this just pins the observable contract.
    expect(jigPaths('/a/b').workOrders).toBe('/a/b/.jig/work-orders');
  });
});
