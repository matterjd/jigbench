import { describe, expect, it } from 'vitest';
import { JIG_FORMAT, type GaugeSet, type Sketch } from '@jigbench/core';
import { renderSketchHtml } from './render.js';

function gaugeSet(): GaugeSet {
  return {
    jigFormat: JIG_FORMAT,
    generatedAt: '2026-09-06T00:00:00.000Z',
    gauges: [
      { name: '--ledger-color-accent', $type: 'color', $value: '#1a56db', category: 'colour', source: { file: 'x.scss', line: 1 } },
      { name: '--ledger-radius-md', $type: 'dimension', $value: '8px', category: 'radius', source: { file: 'x.scss', line: 2 } },
      { name: '$ledger-font-body', $type: 'fontFamily', $value: 'Inter, sans-serif', category: 'type', source: { file: 'x.scss', line: 3 } },
    ],
  };
}

function baseSketch(overrides: Partial<Sketch> = {}): Sketch {
  return {
    jigFormat: JIG_FORMAT,
    id: '0001',
    name: 'Overdue invoices',
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    size: { w: 640, h: 480 },
    elements: [],
    links: [],
    ...overrides,
  };
}

describe('renderSketchHtml', () => {
  it('emits the resolved gauge VALUES as :root CSS custom properties, keyed by a normalized var name', () => {
    const sketch = baseSketch({
      elements: [
        { id: 'e1', kind: 'box', x: 0, y: 0, w: 100, h: 40, gauges: { fill: '--ledger-color-accent', radius: '--ledger-radius-md' } },
      ],
    });
    const html = renderSketchHtml(sketch, gaugeSet());
    expect(html).toContain('--ledger-color-accent: #1a56db');
    expect(html).toContain('--ledger-radius-md: 8px');
    expect(html).toContain('var(--ledger-color-accent)');
    expect(html).toContain('var(--ledger-radius-md)');
  });

  it('normalizes a $scss-style gauge name into a valid CSS custom property', () => {
    const sketch = baseSketch({
      elements: [{ id: 'e1', kind: 'text', x: 0, y: 0, w: 100, h: 20, gauges: { type: '$ledger-font-body' }, content: 'hi', sizeStep: 0 }],
    });
    const html = renderSketchHtml(sketch, gaugeSet());
    expect(html).toContain('--ledger-font-body: Inter, sans-serif');
    expect(html).toContain('var(--ledger-font-body)');
    expect(html).not.toContain('$ledger-font-body:');
  });

  it('escapes user-supplied text content — no injected markup survives', () => {
    const sketch = baseSketch({
      elements: [
        {
          id: 'e1',
          kind: 'text',
          x: 0,
          y: 0,
          w: 100,
          h: 20,
          gauges: {},
          content: '<img src=x onerror="alert(1)">',
          sizeStep: 0,
        },
      ],
    });
    const html = renderSketchHtml(sketch, gaugeSet());
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('escapes a user-supplied label the same way', () => {
    const sketch = baseSketch({
      elements: [{ id: 'e1', kind: 'button', x: 0, y: 0, w: 60, h: 20, gauges: {}, label: '</a><script>evil()</script>' }],
    });
    const html = renderSketchHtml(sketch, gaugeSet());
    expect(html).not.toContain('<script>evil()</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders a hotspot element linking to a surveyed route as an anchor with that href', () => {
    const sketch = baseSketch({
      elements: [{ id: 'btn', kind: 'button', x: 0, y: 0, w: 60, h: 20, gauges: {}, label: 'View all' }],
      links: [{ fromElementId: 'btn', toRoute: '/invoices' }],
    });
    const html = renderSketchHtml(sketch, gaugeSet());
    expect(html).toMatch(/<a[^>]*href="\/invoices"[^>]*data-jig-hotspot="true"/);
    expect(html).toContain('View all');
  });

  it('renders a hotspot linking to another sketch as an anchor carrying the target sketch id', () => {
    const sketch = baseSketch({
      elements: [{ id: 'btn', kind: 'button', x: 0, y: 0, w: 60, h: 20, gauges: {}, label: 'Next screen' }],
      links: [{ fromElementId: 'btn', toSketchId: '0002' }],
    });
    const html = renderSketchHtml(sketch, gaugeSet());
    expect(html).toMatch(/<a[^>]*data-jig-sketch-link="0002"/);
  });

  it('renders a non-hotspot element as a plain div, not a link', () => {
    const sketch = baseSketch({
      elements: [{ id: 'box1', kind: 'box', x: 0, y: 0, w: 60, h: 20, gauges: {} }],
    });
    const html = renderSketchHtml(sketch, gaugeSet());
    expect(html).not.toMatch(/<a[^>]*jig-sketch-el--box/);
    expect(html).toMatch(/<div[^>]*jig-sketch-el--box/);
  });

  it('sizes the sheet to the sketch size', () => {
    const html = renderSketchHtml(baseSketch({ size: { w: 900, h: 500 } }), gaugeSet());
    expect(html).toContain('width: 900px');
    expect(html).toContain('height: 500px');
  });
});
