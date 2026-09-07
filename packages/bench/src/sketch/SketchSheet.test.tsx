// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SketchSheet } from './SketchSheet.js';
import { resetSketchWorkspaceForTests, setPaletteTool } from './sketchWorkspace.js';
import type { SketchSummary } from '@jigbench/core';

afterEach(() => {
  cleanup();
  resetSketchWorkspaceForTests();
});

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function jsonResponse(body: unknown): Response {
  return { ok: true, json: () => Promise.resolve(body) } as unknown as Response;
}

function routedFetch(routes: Record<string, unknown | ((call: Call) => unknown)>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const call: Call = { url: String(url), method, body };
    calls.push(call);
    const key = Object.keys(routes).find((k) => {
      const [m, pattern] = k.split(' ', 2);
      return m === method && new RegExp(`^${pattern}$`).test(String(url));
    });
    const entry = key ? routes[key] : { error: `no route for ${method} ${url}` };
    const result = typeof entry === 'function' ? (entry as (call: Call) => unknown)(call) : entry;
    return jsonResponse(result);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

beforeEach(() => {
  setPaletteTool('box');
});

describe('SketchSheet — honest empty', () => {
  it('says so in words when there are no sketches yet, and offers to start one', async () => {
    const { fetchImpl } = routedFetch({ 'GET /api/sketches': { sketches: [] } });
    render(<SketchSheet fetchImpl={fetchImpl} />);
    expect(await screen.findByText(/no sketches yet/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/name this sketch/i)).toBeTruthy();
  });

  it('lists existing sketches with an open control', async () => {
    const sketches: SketchSummary[] = [
      { id: '0001', name: 'Overdue invoices', createdAt: 'a', updatedAt: 'a', size: { w: 640, h: 480 }, elementCount: 2 },
    ];
    const { fetchImpl } = routedFetch({ 'GET /api/sketches': { sketches } });
    render(<SketchSheet fetchImpl={fetchImpl} />);
    expect(await screen.findByText('Overdue invoices')).toBeTruthy();
    expect(screen.getByRole('button', { name: /edit/i })).toBeTruthy();
  });
});

describe('SketchSheet — new + open', () => {
  it('creates a sketch from the name field and shows its sheet', async () => {
    const created = {
      jigFormat: 1,
      id: '0001',
      name: 'Overdue invoices',
      createdAt: 'a',
      updatedAt: 'a',
      size: { w: 640, h: 480 },
      elements: [],
      links: [],
    };
    const { fetchImpl } = routedFetch({
      'GET /api/sketches': { sketches: [] },
      'POST /api/sketches': created,
    });
    render(<SketchSheet fetchImpl={fetchImpl} />);
    await screen.findByText(/no sketches yet/i);

    fireEvent.change(screen.getByPlaceholderText(/name this sketch/i), { target: { value: 'Overdue invoices' } });
    fireEvent.click(screen.getByRole('button', { name: /^new$/i }));

    expect(await screen.findByLabelText('sketch sheet')).toBeTruthy();
  });

  it('opens an existing sketch', async () => {
    const sketches: SketchSummary[] = [
      { id: '0001', name: 'Overdue invoices', createdAt: 'a', updatedAt: 'a', size: { w: 640, h: 480 }, elementCount: 0 },
    ];
    const full = { jigFormat: 1, id: '0001', name: 'Overdue invoices', createdAt: 'a', updatedAt: 'a', size: { w: 640, h: 480 }, elements: [], links: [] };
    const { fetchImpl } = routedFetch({ 'GET /api/sketches': { sketches }, 'GET /api/sketches/0001': full });
    render(<SketchSheet fetchImpl={fetchImpl} />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    expect(await screen.findByLabelText('sketch sheet')).toBeTruthy();
  });
});

describe('SketchSheet — click-to-add snaps to the grid', () => {
  async function openEmptySketch(fetchImpl: typeof fetch) {
    render(<SketchSheet fetchImpl={fetchImpl} gauges={[]} />);
    await screen.findByText(/no sketches yet/i);
    fireEvent.change(screen.getByPlaceholderText(/name this sketch/i), { target: { value: 'S' } });
    fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
    return screen.findByLabelText('sketch sheet');
  }

  it('adds a box element at the clicked point, snapped to the 4px fallback grid', async () => {
    const created = { jigFormat: 1, id: '0001', name: 'S', createdAt: 'a', updatedAt: 'a', size: { w: 640, h: 480 }, elements: [], links: [] };
    const { fetchImpl } = routedFetch({ 'GET /api/sketches': { sketches: [] }, 'POST /api/sketches': created });
    const sheet = await openEmptySketch(fetchImpl);

    fireEvent.click(sheet, { clientX: 6, clientY: 9 });

    const el = await screen.findByTestId(/^sketch-element-/);
    expect(el.style.left).toBe('8px'); // snap(6,4)
    expect(el.style.top).toBe('8px'); // snap(9,4)
  });
});

describe('SketchSheet — save / printed', () => {
  it('has no save affordance for a freshly-created (already-saved) sketch', async () => {
    const created = { jigFormat: 1, id: '0001', name: 'S', createdAt: 'a', updatedAt: 'a', size: { w: 640, h: 480 }, elements: [], links: [] };
    const { fetchImpl } = routedFetch({ 'GET /api/sketches': { sketches: [] }, 'POST /api/sketches': created });
    render(<SketchSheet fetchImpl={fetchImpl} gauges={[]} />);
    await screen.findByText(/no sketches yet/i);
    fireEvent.change(screen.getByPlaceholderText(/name this sketch/i), { target: { value: 'S' } });
    fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
    await screen.findByLabelText('sketch sheet');

    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^printed$/i })).toBeNull();
  });

  it('shows save + printed once an element is added, and save PUTs the draft', async () => {
    const created = { jigFormat: 1, id: '0001', name: 'S', createdAt: 'a', updatedAt: 'a', size: { w: 640, h: 480 }, elements: [], links: [] };
    const { fetchImpl, calls } = routedFetch({
      'GET /api/sketches': { sketches: [] },
      'POST /api/sketches': created,
      'PUT /api/sketches/0001': (call) => ({ ...created, ...(call.body as object), updatedAt: 'later' }),
    });
    render(<SketchSheet fetchImpl={fetchImpl} gauges={[]} />);
    await screen.findByText(/no sketches yet/i);
    fireEvent.change(screen.getByPlaceholderText(/name this sketch/i), { target: { value: 'S' } });
    fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
    const sheet = await screen.findByLabelText('sketch sheet');

    fireEvent.click(sheet, { clientX: 0, clientY: 0 });
    expect(await screen.findByRole('button', { name: /^save$/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const putCall = calls.find((c) => c.method === 'PUT')!;
    expect((putCall.body as { elements: unknown[] }).elements).toHaveLength(1);
    // Once saved, the draft matches the snapshot again -- no save/printed affordance left.
    await waitFor(() => expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull());
  });

  it('printed discards an unsaved add and hides itself again', async () => {
    const created = { jigFormat: 1, id: '0001', name: 'S', createdAt: 'a', updatedAt: 'a', size: { w: 640, h: 480 }, elements: [], links: [] };
    const { fetchImpl } = routedFetch({ 'GET /api/sketches': { sketches: [] }, 'POST /api/sketches': created });
    render(<SketchSheet fetchImpl={fetchImpl} gauges={[]} />);
    await screen.findByText(/no sketches yet/i);
    fireEvent.change(screen.getByPlaceholderText(/name this sketch/i), { target: { value: 'S' } });
    fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
    const sheet = await screen.findByLabelText('sketch sheet');

    fireEvent.click(sheet, { clientX: 0, clientY: 0 });
    await screen.findByTestId(/^sketch-element-/);

    fireEvent.click(screen.getByRole('button', { name: /^printed$/i }));

    expect(screen.queryByTestId(/^sketch-element-/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^printed$/i })).toBeNull();
  });
});

describe('SketchSheet — real snapping: grid, then alignment to other elements\' edges (S13)', () => {
  it('dragging an element near another element\'s edge lands the final position on a 4px-grid multiple AND draws an alignment line at the matching edge, even when the raw drag position is off both', async () => {
    const created = { jigFormat: 1, id: '0001', name: 'S', createdAt: 'a', updatedAt: 'a', size: { w: 900, h: 700 }, elements: [], links: [] };
    const { fetchImpl } = routedFetch({ 'GET /api/sketches': { sketches: [] }, 'POST /api/sketches': created });
    render(<SketchSheet fetchImpl={fetchImpl} gauges={[]} />);
    await screen.findByText(/no sketches yet/i);
    fireEvent.change(screen.getByPlaceholderText(/name this sketch/i), { target: { value: 'S' } });
    fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
    const sheet = await screen.findByLabelText('sketch sheet');

    // Element A (the neighbour): a 160x96 box at (32,128) — right edge 192, top edge 128.
    fireEvent.click(sheet, { clientX: 32, clientY: 128 });
    await screen.findByTestId(/^sketch-element-/);
    // Element B (to be dragged): a second 160x96 box, far away at (400,400).
    fireEvent.click(sheet, { clientX: 400, clientY: 400 });
    const elements = await screen.findAllByTestId(/^sketch-element-/);
    expect(elements).toHaveLength(2);
    const elementB = elements[1];
    expect(elementB.style.left).toBe('400px');
    expect(elementB.style.top).toBe('400px');

    // Drag B so its raw (pre-alignment) grid-snapped position is 188,124 — 4px off A's right
    // edge (192) and top edge (128), well within the 6px alignment threshold.
    fireEvent.mouseDown(elementB, { clientX: 450, clientY: 450 });
    fireEvent.mouseMove(window, { clientX: 450 - 211, clientY: 450 - 275 });

    // While the drag holds: final coordinates already land exactly on the neighbour's edges —
    // multiples of 4 — not the raw 188/124 grid-only snap. An alignment line is drawn on each
    // held axis, at the matching edge.
    expect(elementB.style.left).toBe('192px');
    expect(elementB.style.top).toBe('128px');
    expect(Number.parseInt(elementB.style.left, 10) % 4).toBe(0);
    expect(Number.parseInt(elementB.style.top, 10) % 4).toBe(0);
    const vLine = screen.getByTestId('sketch-align-v');
    const hLine = screen.getByTestId('sketch-align-h');
    expect(vLine.style.left).toBe('192px');
    expect(hLine.style.top).toBe('128px');

    fireEvent.mouseUp(window);

    // Releasing the drag clears the alignment lines again.
    expect(screen.queryByTestId('sketch-align-v')).toBeNull();
  });
});

describe('SketchSheet — "build this screen" is a prompt target (S12/S13)', () => {
  it('renders a "build this screen" button that calls onBuildScreen when an open sketch is on the sheet', async () => {
    const created = { jigFormat: 1, id: '0001', name: 'S', createdAt: 'a', updatedAt: 'a', size: { w: 640, h: 480 }, elements: [], links: [] };
    const { fetchImpl } = routedFetch({ 'GET /api/sketches': { sketches: [] }, 'POST /api/sketches': created });
    const onBuildScreen = vi.fn();
    render(<SketchSheet fetchImpl={fetchImpl} onBuildScreen={onBuildScreen} />);
    await screen.findByText(/no sketches yet/i);
    fireEvent.change(screen.getByPlaceholderText(/name this sketch/i), { target: { value: 'S' } });
    fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
    await screen.findByLabelText('sketch sheet');

    fireEvent.click(screen.getByRole('button', { name: /build this screen/i }));
    expect(onBuildScreen).toHaveBeenCalled();
  });
});

describe('SketchSheet — Delete scraps the selected element', () => {
  it('removes the selected element from the sheet on Delete', async () => {
    const created = { jigFormat: 1, id: '0001', name: 'S', createdAt: 'a', updatedAt: 'a', size: { w: 640, h: 480 }, elements: [], links: [] };
    const { fetchImpl } = routedFetch({ 'GET /api/sketches': { sketches: [] }, 'POST /api/sketches': created });
    render(<SketchSheet fetchImpl={fetchImpl} gauges={[]} />);
    await screen.findByText(/no sketches yet/i);
    fireEvent.change(screen.getByPlaceholderText(/name this sketch/i), { target: { value: 'S' } });
    fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
    const sheet = await screen.findByLabelText('sketch sheet');

    fireEvent.click(sheet, { clientX: 0, clientY: 0 });
    const el = await screen.findByTestId(/^sketch-element-/);

    fireEvent.keyDown(window, { key: 'Delete' });

    await waitFor(() => expect(screen.queryByTestId(/^sketch-element-/)).toBeNull());
    expect(el).toBeTruthy();
  });
});
