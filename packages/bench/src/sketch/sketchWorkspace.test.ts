import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Sketch, SketchSummary } from '@jigbench/core';
import {
  addElement,
  clearElementLink,
  getSketchWorkspaceState,
  loadSketches,
  moveElement,
  newSketch,
  openSketch,
  printed,
  resetSketchWorkspaceForTests,
  resizeElement,
  restoreScrapped,
  restoreSketch,
  save,
  scrapSelected,
  scrapSketch,
  selectElement,
  setElementGauge,
  setElementLink,
  setPaletteTool,
} from './sketchWorkspace.js';

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

function fullSketch(overrides: Partial<Sketch> = {}): Sketch {
  return {
    jigFormat: 1,
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

afterEach(() => {
  resetSketchWorkspaceForTests();
  vi.restoreAllMocks();
});

describe('loadSketches — honest empty', () => {
  it('reports loaded=true with an empty list when there are none yet', async () => {
    const { fetchImpl } = routedFetch({ 'GET /api/sketches': { sketches: [] } });
    await loadSketches(fetchImpl);
    const state = getSketchWorkspaceState();
    expect(state.loaded).toBe(true);
    expect(state.sketches).toEqual([]);
  });

  it('lists whatever the server returns', async () => {
    const summaries: SketchSummary[] = [
      { id: '0001', name: 'Overdue invoices', createdAt: 'a', updatedAt: 'a', size: { w: 1, h: 1 }, elementCount: 0 },
    ];
    const { fetchImpl } = routedFetch({ 'GET /api/sketches': { sketches: summaries } });
    await loadSketches(fetchImpl);
    expect(getSketchWorkspaceState().sketches).toEqual(summaries);
  });
});

describe('newSketch / openSketch', () => {
  it('creates a sketch and makes it the active one, with a matching saved snapshot', async () => {
    const created = fullSketch();
    const { fetchImpl, calls } = routedFetch({
      'POST /api/sketches': created,
      'GET /api/sketches': { sketches: [] },
    });
    await newSketch('Overdue invoices', { w: 640, h: 480 }, fetchImpl);
    expect(calls[0]).toMatchObject({ url: '/api/sketches', method: 'POST' });
    const state = getSketchWorkspaceState();
    expect(state.activeSketch?.id).toBe('0001');
    expect(state.savedSketch?.id).toBe('0001');
  });

  it('does nothing on a blank name', async () => {
    const { fetchImpl, calls } = routedFetch({});
    await newSketch('   ', { w: 640, h: 480 }, fetchImpl);
    expect(calls).toEqual([]);
  });

  it('opens an existing sketch by id', async () => {
    const existing = fullSketch({ id: '0002', name: 'Second' });
    const { fetchImpl } = routedFetch({ 'GET /api/sketches/0002': existing });
    await openSketch('0002', fetchImpl);
    expect(getSketchWorkspaceState().activeSketch?.name).toBe('Second');
  });
});

describe('addElement — palette drop snaps to the grid', () => {
  it('drops a box at the nearest grid multiple', async () => {
    const { fetchImpl } = routedFetch({ 'POST /api/sketches': fullSketch() });
    await newSketch('Overdue invoices', { w: 640, h: 480 }, fetchImpl);
    setPaletteTool('box');

    const element = addElement(6, 9, 4); // grid = 4
    expect(element).toBeDefined();
    expect(element!.x).toBe(8); // snap(6,4) = 8
    expect(element!.y).toBe(8); // snap(9,4) = 8
    expect(getSketchWorkspaceState().activeSketch?.elements).toHaveLength(1);
    expect(getSketchWorkspaceState().selectedElementId).toBe(element!.id);
  });

  it('drops the current palette tool kind, with sensible per-kind defaults', async () => {
    const { fetchImpl } = routedFetch({ 'POST /api/sketches': fullSketch() });
    await newSketch('S', { w: 640, h: 480 }, fetchImpl);
    setPaletteTool('text');
    const element = addElement(0, 0, 4);
    expect(element?.kind).toBe('text');
    if (element?.kind === 'text') {
      expect(element.content).toBe('');
      expect(typeof element.sizeStep).toBe('number');
    }
  });

  it('does nothing without an active sketch', () => {
    expect(addElement(0, 0, 4)).toBeUndefined();
  });
});

describe('moveElement / resizeElement — snapping', () => {
  it('snaps a move to the grid', async () => {
    const { fetchImpl } = routedFetch({ 'POST /api/sketches': fullSketch() });
    await newSketch('S', { w: 640, h: 480 }, fetchImpl);
    const element = addElement(0, 0, 4)!;
    moveElement(element.id, 13, 15, 4);
    const moved = getSketchWorkspaceState().activeSketch!.elements[0];
    expect(moved.x).toBe(12);
    expect(moved.y).toBe(16);
  });

  it('snaps a resize to the grid and never below one grid unit', async () => {
    const { fetchImpl } = routedFetch({ 'POST /api/sketches': fullSketch() });
    await newSketch('S', { w: 640, h: 480 }, fetchImpl);
    const element = addElement(0, 0, 4)!;
    resizeElement(element.id, 17, 1, 4);
    const resized = getSketchWorkspaceState().activeSketch!.elements[0];
    expect(resized.w).toBe(16);
    expect(resized.h).toBe(4); // floored up to one grid unit, never 0
  });
});

describe('gauge slots — always set to a name, never a raw value by construction', () => {
  it('sets a slot to whatever name it is given', async () => {
    const { fetchImpl } = routedFetch({ 'POST /api/sketches': fullSketch() });
    await newSketch('S', { w: 640, h: 480 }, fetchImpl);
    const element = addElement(0, 0, 4)!;
    setElementGauge(element.id, 'fill', '--ledger-color-accent');
    const updated = getSketchWorkspaceState().activeSketch!.elements[0];
    expect(updated.gauges).toEqual({ fill: '--ledger-color-accent' });
  });
});

describe('links — exactly one of toSketchId/toRoute', () => {
  it('links a hotspot element to a surveyed route', async () => {
    const { fetchImpl } = routedFetch({ 'POST /api/sketches': fullSketch() });
    await newSketch('S', { w: 640, h: 480 }, fetchImpl);
    const element = addElement(0, 0, 4)!;
    setElementLink(element.id, { toRoute: '/invoices' });
    expect(getSketchWorkspaceState().activeSketch!.links).toEqual([{ fromElementId: element.id, toRoute: '/invoices' }]);
  });

  it('replaces an existing link from the same element rather than duplicating it', async () => {
    const { fetchImpl } = routedFetch({ 'POST /api/sketches': fullSketch() });
    await newSketch('S', { w: 640, h: 480 }, fetchImpl);
    const element = addElement(0, 0, 4)!;
    setElementLink(element.id, { toRoute: '/a' });
    setElementLink(element.id, { toSketchId: '0002' });
    expect(getSketchWorkspaceState().activeSketch!.links).toEqual([{ fromElementId: element.id, toSketchId: '0002' }]);
  });

  it('clears a link', async () => {
    const { fetchImpl } = routedFetch({ 'POST /api/sketches': fullSketch() });
    await newSketch('S', { w: 640, h: 480 }, fetchImpl);
    const element = addElement(0, 0, 4)!;
    setElementLink(element.id, { toRoute: '/a' });
    clearElementLink(element.id);
    expect(getSketchWorkspaceState().activeSketch!.links).toEqual([]);
  });
});

describe('scrapSelected / restoreScrapped — Delete scraps into the sketch\'s own scrap list', () => {
  it('moves the selected element into the scrap bin and clears the selection', async () => {
    const { fetchImpl } = routedFetch({ 'POST /api/sketches': fullSketch() });
    await newSketch('S', { w: 640, h: 480 }, fetchImpl);
    const element = addElement(0, 0, 4)!;
    selectElement(element.id);

    scrapSelected();

    const state = getSketchWorkspaceState();
    expect(state.activeSketch?.elements).toEqual([]);
    expect(state.scrapBin.map((e) => e.id)).toEqual([element.id]);
    expect(state.selectedElementId).toBeNull();
  });

  it('also drops any link FROM the scrapped element', async () => {
    const { fetchImpl } = routedFetch({ 'POST /api/sketches': fullSketch() });
    await newSketch('S', { w: 640, h: 480 }, fetchImpl);
    const element = addElement(0, 0, 4)!;
    setElementLink(element.id, { toRoute: '/x' });
    selectElement(element.id);
    scrapSelected();
    expect(getSketchWorkspaceState().activeSketch?.links).toEqual([]);
  });

  it('restores a scrapped element back onto the sheet', async () => {
    const { fetchImpl } = routedFetch({ 'POST /api/sketches': fullSketch() });
    await newSketch('S', { w: 640, h: 480 }, fetchImpl);
    const element = addElement(0, 0, 4)!;
    selectElement(element.id);
    scrapSelected();

    restoreScrapped(element.id);

    const state = getSketchWorkspaceState();
    expect(state.activeSketch?.elements.map((e) => e.id)).toEqual([element.id]);
    expect(state.scrapBin).toEqual([]);
  });
});

describe('printed — returns the sheet to its saved state', () => {
  it('discards every unsaved edit: adds, moves, scraps', async () => {
    const { fetchImpl } = routedFetch({ 'POST /api/sketches': fullSketch() });
    await newSketch('S', { w: 640, h: 480 }, fetchImpl);
    addElement(0, 0, 4);
    addElement(20, 20, 4);

    printed();

    const state = getSketchWorkspaceState();
    expect(state.activeSketch).toEqual(state.savedSketch);
    expect(state.activeSketch?.elements).toEqual([]);
    expect(state.scrapBin).toEqual([]);
    expect(state.selectedElementId).toBeNull();
  });
});

describe('save — persists the draft and refreshes the saved snapshot', () => {
  it('PUTs the current elements/links and updates savedSketch to match', async () => {
    const created = fullSketch();
    const { fetchImpl, calls } = routedFetch({
      'POST /api/sketches': created,
      'GET /api/sketches': { sketches: [] },
      'PUT /api/sketches/0001': (call) => ({ ...created, ...(call.body as object), updatedAt: 'later' }),
    });
    await newSketch('Overdue invoices', { w: 640, h: 480 }, fetchImpl);
    addElement(0, 0, 4);

    await save(fetchImpl);

    const putCall = calls.find((c) => c.method === 'PUT')!;
    expect(putCall).toBeDefined();
    const body = putCall.body as { elements: unknown[] };
    expect(body.elements).toHaveLength(1);

    const state = getSketchWorkspaceState();
    expect(state.activeSketch?.updatedAt).toBe('later');
    expect(state.savedSketch).toEqual(state.activeSketch);
  });
});

describe('scrapSketch / restoreSketch — whole-document lifecycle', () => {
  it('scraps the active sketch, closing it, and refreshes the list', async () => {
    const created = fullSketch();
    const { fetchImpl } = routedFetch({
      'POST /api/sketches': created,
      'GET /api/sketches': { sketches: [] },
      'POST /api/sketches/0001/scrap': { ...created, scrapped: true },
    });
    await newSketch('Overdue invoices', { w: 640, h: 480 }, fetchImpl);
    await scrapSketch('0001', fetchImpl);
    expect(getSketchWorkspaceState().activeSketch).toBeNull();
  });

  it('restores a scrapped sketch and refreshes the list', async () => {
    const { fetchImpl, calls } = routedFetch({
      'POST /api/sketches/0001/restore': fullSketch(),
      'GET /api/sketches': { sketches: [{ id: '0001', name: 'x', createdAt: 'a', updatedAt: 'a', size: { w: 1, h: 1 }, elementCount: 0 }] },
    });
    await restoreSketch('0001', fetchImpl);
    expect(calls.some((c) => c.url === '/api/sketches/0001/restore' && c.method === 'POST')).toBe(true);
    expect(getSketchWorkspaceState().sketches).toHaveLength(1);
  });
});
