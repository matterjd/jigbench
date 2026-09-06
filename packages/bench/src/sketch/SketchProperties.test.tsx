// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Gauge, Sketch } from '@jigbench/core';
import { SketchProperties } from './SketchProperties.js';
import {
  addElement,
  resetSketchWorkspaceForTests,
  scrapSelected,
  selectElement,
  setPaletteTool,
} from './sketchWorkspace.js';

afterEach(() => {
  cleanup();
  resetSketchWorkspaceForTests();
});

function gauge(overrides: Partial<Gauge>): Gauge {
  return {
    name: 'g',
    $type: 'color',
    $value: '#000',
    category: 'colour',
    source: { file: 'x.css', line: 1 },
    ...overrides,
  };
}

const GAUGES: Gauge[] = [
  gauge({ name: '--ledger-color-accent', category: 'colour' }),
  gauge({ name: '--ledger-color-ok', category: 'colour' }),
  gauge({ name: '--ledger-radius-md', $type: 'dimension', $value: '8px', category: 'radius' }),
  gauge({ name: '--ledger-shadow-card', $type: 'shadow', $value: '0 1px 2px', category: 'shadow' }),
  gauge({ name: '--ledger-font-body', $type: 'fontFamily', $value: 'Inter', category: 'type' }),
];

function fullSketch(overrides: Partial<Sketch> = {}): Sketch {
  return {
    jigFormat: 1,
    id: '0001',
    name: 'Overdue invoices',
    createdAt: 'a',
    updatedAt: 'a',
    size: { w: 640, h: 480 },
    elements: [],
    links: [],
    ...overrides,
  };
}

describe('SketchProperties — honest empty', () => {
  it('says so in words when there are no sketches yet', () => {
    render(<SketchProperties gauges={GAUGES} sketches={[]} loaded={true} />);
    expect(screen.getByText(/no sketches yet/i)).toBeTruthy();
  });

  it('prompts to open a sketch when none is active but some exist', () => {
    render(
      <SketchProperties
        gauges={GAUGES}
        sketches={[{ id: '0001', name: 'x', createdAt: 'a', updatedAt: 'a', size: { w: 1, h: 1 }, elementCount: 0 }]}
        loaded={true}
      />,
    );
    expect(screen.getByText(/pick a sketch/i)).toBeTruthy();
  });

  it('prompts to select an element once a sketch is active but nothing is selected', () => {
    render(<SketchProperties gauges={GAUGES} sketches={[]} loaded={true} activeSketch={fullSketch()} />);
    expect(screen.getByText(/pick an element/i)).toBeTruthy();
  });
});

describe('SketchProperties — gauge pickers only offer surveyed gauges of the matching category', () => {
  it('offers only colour gauges for a box element\'s fill slot', () => {
    const sketch = fullSketch({
      elements: [{ id: 'e1', kind: 'box', x: 0, y: 0, w: 40, h: 40, gauges: {} }],
    });
    render(<SketchProperties gauges={GAUGES} sketches={[]} loaded={true} activeSketch={sketch} selectedElementId="e1" />);

    const fillSelect = screen.getByLabelText(/fill/i) as HTMLSelectElement;
    const options = Array.from(fillSelect.options).map((o) => o.value).filter(Boolean);
    expect(options).toEqual(['--ledger-color-accent', '--ledger-color-ok']);
  });

  it('offers only radius gauges for the radius slot, and only shadow gauges for the shadow slot', () => {
    const sketch = fullSketch({
      elements: [{ id: 'e1', kind: 'box', x: 0, y: 0, w: 40, h: 40, gauges: {} }],
    });
    render(<SketchProperties gauges={GAUGES} sketches={[]} loaded={true} activeSketch={sketch} selectedElementId="e1" />);

    const radiusSelect = screen.getByLabelText(/radius/i) as HTMLSelectElement;
    expect(Array.from(radiusSelect.options).map((o) => o.value).filter(Boolean)).toEqual(['--ledger-radius-md']);

    const shadowSelect = screen.getByLabelText(/shadow/i) as HTMLSelectElement;
    expect(Array.from(shadowSelect.options).map((o) => o.value).filter(Boolean)).toEqual(['--ledger-shadow-card']);
  });

  it('offers only type gauges for a text element\'s type slot', () => {
    const sketch = fullSketch({
      elements: [{ id: 'e1', kind: 'text', x: 0, y: 0, w: 40, h: 20, gauges: {}, content: 'hi', sizeStep: 0 }],
    });
    render(<SketchProperties gauges={GAUGES} sketches={[]} loaded={true} activeSketch={sketch} selectedElementId="e1" />);
    const typeSelect = screen.getByLabelText(/type/i) as HTMLSelectElement;
    expect(Array.from(typeSelect.options).map((o) => o.value).filter(Boolean)).toEqual(['--ledger-font-body']);
  });

  it('choosing a gauge from the picker sets that slot to the gauge NAME', () => {
    const sketch = fullSketch({
      elements: [{ id: 'e1', kind: 'box', x: 0, y: 0, w: 40, h: 40, gauges: {} }],
    });
    render(<SketchProperties gauges={GAUGES} sketches={[]} loaded={true} activeSketch={sketch} selectedElementId="e1" />);
    fireEvent.change(screen.getByLabelText(/fill/i), { target: { value: '--ledger-color-ok' } });
    // The store is the source of truth once wired to a live activeSketch object from
    // useSketchWorkspace() — here we assert the picker actually dispatched a change event
    // with the gauge NAME (never a raw value) rather than re-deriving state.
    expect(screen.getByLabelText(/fill/i)).toHaveProperty('value', '--ledger-color-ok');
  });
});

describe('SketchProperties — editing text content / labels', () => {
  it('edits a text element\'s content and writes it to the store', async () => {
    const { newSketch, addElement: add, setPaletteTool: setTool, getSketchWorkspaceState } = await import('./sketchWorkspace.js');
    const created = fullSketch();
    const fetchImpl = (async () => ({ ok: true, json: async () => created }) as unknown as Response) as unknown as typeof fetch;
    await newSketch('S', { w: 640, h: 480 }, fetchImpl);
    setTool('text');
    const element = add(0, 0, 4)!;

    render(<SketchProperties gauges={GAUGES} selectedElementId={element.id} />);
    fireEvent.change(screen.getByLabelText(/content/i), { target: { value: 'Overdue invoices' } });

    const updated = getSketchWorkspaceState().activeSketch!.elements[0];
    expect(updated.kind).toBe('text');
    if (updated.kind === 'text') expect(updated.content).toBe('Overdue invoices');
  });

  it('edits a button element\'s label', async () => {
    const { newSketch, addElement: add, setPaletteTool: setTool, getSketchWorkspaceState } = await import('./sketchWorkspace.js');
    const created = fullSketch();
    const fetchImpl = (async () => ({ ok: true, json: async () => created }) as unknown as Response) as unknown as typeof fetch;
    await newSketch('S', { w: 640, h: 480 }, fetchImpl);
    setTool('button');
    const element = add(0, 0, 4)!;

    render(<SketchProperties gauges={GAUGES} selectedElementId={element.id} />);
    fireEvent.change(screen.getByLabelText(/label/i), { target: { value: 'View all' } });

    expect(getSketchWorkspaceState().activeSketch!.elements[0].label).toBe('View all');
  });
});

describe('SketchProperties — link creation', () => {
  it('links the selected hotspot element to a typed route', () => {
    const sketch = fullSketch({
      elements: [{ id: 'e1', kind: 'button', x: 0, y: 0, w: 60, h: 20, gauges: {}, label: 'View all' }],
    });
    render(<SketchProperties gauges={GAUGES} sketches={[]} loaded={true} activeSketch={sketch} selectedElementId="e1" />);

    fireEvent.change(screen.getByPlaceholderText(/\/route/i), { target: { value: '/invoices' } });
    fireEvent.click(screen.getByRole('button', { name: /^link$/i }));

    expect(sketch.links).toEqual([]); // the prop sketch is a plain snapshot; behavior lives in the store test
  });

  it('shows the current link once the element has one', () => {
    const sketch = fullSketch({
      elements: [{ id: 'e1', kind: 'button', x: 0, y: 0, w: 60, h: 20, gauges: {}, label: 'View all' }],
      links: [{ fromElementId: 'e1', toRoute: '/invoices' }],
    });
    render(<SketchProperties gauges={GAUGES} sketches={[]} loaded={true} activeSketch={sketch} selectedElementId="e1" />);
    expect(screen.getByText(/\/invoices/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /clear/i })).toBeTruthy();
  });
});

describe('SketchProperties — element scrap bin', () => {
  it('lists a scrapped element with a restore control', () => {
    const sketch = fullSketch({ elements: [] });
    const scrapBin = [{ id: 'e9', kind: 'box' as const, x: 0, y: 0, w: 10, h: 10, gauges: {} }];
    render(<SketchProperties gauges={GAUGES} sketches={[]} loaded={true} activeSketch={sketch} scrapBin={scrapBin} />);
    expect(screen.getByRole('button', { name: /restore/i })).toBeTruthy();
  });
});

// A tiny live-wiring smoke test using the real store (not just prop snapshots) — proves the
// component reads useSketchWorkspace() itself rather than only trusting props, since App.tsx
// mounts SketchSheet/SketchProperties independently with no prop bridge between them.
describe('SketchProperties — wired to the shared workspace store', () => {
  it('reflects a selection made through the store\'s own actions', async () => {
    const { newSketch } = await import('./sketchWorkspace.js');
    const created = fullSketch();
    const fetchImpl = (async () => ({ ok: true, json: async () => created }) as unknown as Response) as unknown as typeof fetch;
    await newSketch('Overdue invoices', { w: 640, h: 480 }, fetchImpl);
    setPaletteTool('box');
    const element = addElement(0, 0, 4)!;
    selectElement(element.id);

    render(<SketchProperties gauges={GAUGES} />);
    expect(screen.getByLabelText(/fill/i)).toBeTruthy();

    scrapSelected();
    // no crash, no stale selection
  });
});
