import { describe, expect, it } from 'vitest';
import type { Gauge } from '@jigbench/core';
import { computeGridReadout, resolveGridPx } from './gridReadout.js';

function spaceGauge(name: string, px: number): Gauge {
  return {
    name,
    $type: 'dimension',
    $value: `${px}px`,
    category: 'space',
    source: { file: 'src/styles/_tokens.scss', line: 1 },
  };
}

describe('resolveGridPx', () => {
  it('falls back to 4px and says so when there are no space gauges', () => {
    expect(resolveGridPx(undefined)).toEqual({ px: 4, fallbackUsed: true });
    expect(resolveGridPx([])).toEqual({ px: 4, fallbackUsed: true });
  });

  it('uses the smallest space-category gauge value as the grid unit', () => {
    const gauges = [spaceGauge('space.4', 16), spaceGauge('space.1', 4), spaceGauge('space.3', 12)];
    expect(resolveGridPx(gauges)).toEqual({ px: 4, fallbackUsed: false });
  });

  it('ignores non-space gauges and non-numeric space values', () => {
    const gauges: Gauge[] = [
      { name: 'radius.sm', $type: 'dimension', $value: '4px', category: 'radius', source: { file: 'x', line: 1 } },
      spaceGauge('space.weird', Number.NaN),
      spaceGauge('space.6', 24),
    ];
    // The NaN entry must never win — the resolver only counts parseable px values.
    expect(resolveGridPx(gauges)).toEqual({ px: 24, fallbackUsed: false });
  });
});

describe('computeGridReadout', () => {
  it('reports "on the Npx grid" when every edge is within half a pixel of a multiple', () => {
    const readout = computeGridReadout({ x: 184, y: 220, width: 456, height: 40 }, { px: 4, fallbackUsed: false });
    expect(readout.onGrid).toBe(true);
    expect(readout.text).toBe('456×40 @ 184,220 · on the 4px grid');
  });

  it('reports the worst-offending axis and its deviation when off-grid', () => {
    // width 40 is 2px off the nearest 4px multiple (38 or 42) — this is the concept's own
    // worked example (concept-a-the-surface-plate.md): "456×40 @ 184,220 · off the 4px grid
    // by 2.0px (w)" for a 33.8px-tall header; reproduced here with round numbers.
    const readout = computeGridReadout({ x: 184, y: 220, width: 456, height: 38 }, { px: 4, fallbackUsed: false });
    expect(readout.onGrid).toBe(false);
    expect(readout.axis).toBe('h');
    expect(readout.text).toBe('456×38 @ 184,220 · off the 4px grid by 2.0px (h)');
  });

  it('picks whichever axis deviates most when more than one is off', () => {
    const readout = computeGridReadout({ x: 185, y: 221, width: 457, height: 39 }, { px: 4, fallbackUsed: false });
    // x: 185 -> nearest 184, dev 1; y: 221 -> nearest 220, dev 1; w: 457 -> nearest 456, dev 1;
    // h: 39 -> nearest 40, dev 1 -- a tie; the first-listed axis (x) wins ties deterministically.
    expect(readout.axis).toBe('x');
  });

  it('says when the grid unit is a fallback, not a surveyed one', () => {
    const readout = computeGridReadout({ x: 0, y: 0, width: 10, height: 10 }, { px: 4, fallbackUsed: true });
    expect(readout.fallbackUsed).toBe(true);
    expect(readout.text).toContain('off the 4px grid');
  });

  it('rounds the displayed size and position to whole pixels', () => {
    const readout = computeGridReadout({ x: 184.4, y: 220.2, width: 456.1, height: 40.4 }, { px: 4, fallbackUsed: false });
    expect(readout.text.startsWith('456×40 @ 184,220')).toBe(true);
  });
});
