import { describe, expect, it } from 'vitest';
import type { GaugeSet } from './gauges.js';
import { SketchSchema, nextSketchId, resolveGauge, snap, type Sketch } from './sketch.js';

function baseSketch(overrides: Partial<Sketch> = {}): Sketch {
  return {
    jigFormat: 1,
    id: '0001',
    name: 'Overdue invoices',
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    size: { w: 1024, h: 768 },
    elements: [],
    links: [],
    ...overrides,
  };
}

describe('SketchSchema', () => {
  it('accepts a sketch whose elements draw with gauge references, never raw values', () => {
    const sketch = baseSketch({
      elements: [
        {
          id: 'e1',
          kind: 'box',
          x: 0,
          y: 0,
          w: 200,
          h: 80,
          gauges: { fill: 'color-primary', radius: 'radius-md', shadow: 'shadow-held' },
        },
        {
          id: 'e2',
          kind: 'text',
          x: 8,
          y: 8,
          w: 180,
          h: 24,
          gauges: { type: 'font-sans' },
          content: 'Overdue invoices',
          sizeStep: 2,
        },
        {
          id: 'e3',
          kind: 'button',
          x: 8,
          y: 40,
          w: 100,
          h: 32,
          gauges: { fill: 'color-primary' },
          label: 'View all',
        },
      ],
      links: [{ fromElementId: 'e3', toRoute: '/invoices' }],
    });
    expect(() => SketchSchema.parse(sketch)).not.toThrow();
  });

  it('rejects a raw hex value sitting in a gauge slot', () => {
    const sketch = baseSketch({
      elements: [
        {
          id: 'e1',
          kind: 'box',
          x: 0,
          y: 0,
          w: 100,
          h: 40,
          gauges: { fill: '#ff00aa' },
        },
      ],
    });
    expect(() => SketchSchema.parse(sketch)).toThrow();
  });

  it('rejects a raw rgb()/hsl() value the same way', () => {
    const sketch = baseSketch({
      elements: [
        { id: 'e1', kind: 'box', x: 0, y: 0, w: 100, h: 40, gauges: { fill: 'rgba(1,2,3,0.5)' } },
      ],
    });
    expect(() => SketchSchema.parse(sketch)).toThrow();
  });

  it('rejects an element kind outside the closed primitive set', () => {
    const sketch = baseSketch({
      elements: [{ id: 'e1', kind: 'video', x: 0, y: 0, w: 10, h: 10 } as never],
    });
    expect(() => SketchSchema.parse(sketch)).toThrow();
  });

  it('requires exactly one of toSketchId/toRoute on a link — neither is invalid', () => {
    const sketch = baseSketch({ links: [{ fromElementId: 'e1' } as never] });
    expect(() => SketchSchema.parse(sketch)).toThrow();
  });

  it('requires exactly one of toSketchId/toRoute on a link — both is invalid', () => {
    const sketch = baseSketch({
      links: [{ fromElementId: 'e1', toSketchId: '0002', toRoute: '/x' } as never],
    });
    expect(() => SketchSchema.parse(sketch)).toThrow();
  });

  it('accepts a link naming toSketchId alone', () => {
    const sketch = baseSketch({ links: [{ fromElementId: 'e1', toSketchId: '0002' }] });
    expect(() => SketchSchema.parse(sketch)).not.toThrow();
  });
});

describe('snap', () => {
  it('rounds to the nearest multiple of the grid', () => {
    expect(snap(6, 4)).toBe(8);
    expect(snap(5, 4)).toBe(4);
    expect(snap(0, 4)).toBe(0);
    expect(snap(17, 16)).toBe(16);
  });

  it('leaves the value alone when the grid is zero or negative', () => {
    expect(snap(13, 0)).toBe(13);
    expect(snap(13, -4)).toBe(13);
  });
});

describe('nextSketchId', () => {
  it('starts at 0001 with no existing sketches', () => {
    expect(nextSketchId([])).toBe('0001');
  });

  it('pads and increments past the highest existing id', () => {
    expect(nextSketchId(['0001', '0002', '0007'])).toBe('0008');
  });

  it('ignores non-numeric ids rather than throwing', () => {
    expect(nextSketchId(['not-a-number', '0003'])).toBe('0004');
  });
});

describe('resolveGauge', () => {
  const gaugeSet: GaugeSet = {
    jigFormat: 1,
    generatedAt: '2026-09-06T00:00:00.000Z',
    gauges: [
      { name: 'color-primary', $type: 'color', $value: '#1a56db', category: 'colour', source: { file: 'x.css', line: 1 } },
      { name: 'radius-md', $type: 'dimension', $value: '8px', category: 'radius', source: { file: 'x.css', line: 2 } },
    ],
  };

  it('resolves every distinct gauge reference used across the sketch, against the survey gauge set', () => {
    const sketch = baseSketch({
      elements: [
        { id: 'e1', kind: 'box', x: 0, y: 0, w: 10, h: 10, gauges: { fill: 'color-primary', radius: 'radius-md' } },
        { id: 'e2', kind: 'box', x: 0, y: 0, w: 10, h: 10, gauges: { fill: 'color-primary' } },
      ],
    });
    const resolved = resolveGauge(sketch, gaugeSet);
    expect(Object.keys(resolved).sort()).toEqual(['color-primary', 'radius-md']);
    expect(resolved['color-primary'].$value).toBe('#1a56db');
    expect(resolved['radius-md'].$value).toBe('8px');
  });

  it('omits a reference with no match in the gauge set rather than throwing', () => {
    const sketch = baseSketch({
      elements: [{ id: 'e1', kind: 'box', x: 0, y: 0, w: 10, h: 10, gauges: { fill: 'no-such-gauge' } }],
    });
    expect(resolveGauge(sketch, gaugeSet)).toEqual({});
  });
});
