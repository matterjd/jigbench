// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
