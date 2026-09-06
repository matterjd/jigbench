// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkOrder } from '@jigbench/core';
import { TrialFitMirror } from './TrialFitMirror.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * F11 / CHASSIS.md's trial-fit mode: the honest void before a trial fit exists, the
 * two-frame split once one does (left = release-moment snapshot, right = the live mirror),
 * the changes list, the scrubber driving both, and one `printed` returning to a single
 * frame.
 */

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

function orderAt(state: WorkOrder['state'], overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    jigFormat: 1,
    id: '0007',
    slug: 'rename-the-total-column',
    state,
    draftedBy: 'model',
    marks: ['m-0001'],
    human: { what: 'x', why: 'y', where: 'z', acceptance: [] },
    log: [],
    ...overrides,
  };
}

describe('TrialFitMirror — the honest void before a trial fit exists', () => {
  it('says so with no work orders at all', () => {
    render(<TrialFitMirror workOrders={[]} fetchImpl={routedFetch({}).fetchImpl} />);
    expect(screen.getByText(/trial fit/i)).toBeTruthy();
    expect(screen.getByText(/not yet/i)).toBeTruthy();
  });

  it('names the order number once one is released but the shop has not returned it', () => {
    render(<TrialFitMirror workOrders={[orderAt('released')]} fetchImpl={routedFetch({}).fetchImpl} />);
    expect(screen.getByText(/the shop has not returned #0007/i)).toBeTruthy();
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('never renders a spinner', () => {
    render(<TrialFitMirror workOrders={[orderAt('in-the-shop')]} fetchImpl={routedFetch({}).fetchImpl} />);
    expect(document.querySelector('[class*="spinner"]')).toBeNull();
  });
});

describe('TrialFitMirror — split once trial-fit is reached', () => {
  function trialFitOrder(): WorkOrder {
    return orderAt('trial-fit', {
      shop: {
        files: ['a.html'],
        patterns: [],
        tests: [],
        brief: 'x',
        trialFit: { summary: 'renamed the Total column', files: ['a.html'] },
      },
    });
  }

  it('renders two frames: the snapshot (before) and the mirror (after)', async () => {
    const { fetchImpl } = routedFetch({
      'POST /api/plate/mirror': { target: 'http://localhost:4200', port: 4602 },
      'GET /api/plate': { target: 'http://localhost:4200', port: 4601, status: 'up', changes: [], mirror: { port: 4602, status: 'up' } },
    });
    render(<TrialFitMirror workOrders={[trialFitOrder()]} fetchImpl={fetchImpl} />);

    await waitFor(() => expect(document.querySelectorAll('iframe')).toHaveLength(2));
    expect(screen.getByText(/before/i)).toBeTruthy();
    expect(screen.getByText(/snapshot at release/i)).toBeTruthy();
    expect(screen.getByText(/after/i)).toBeTruthy();
    expect(screen.getByText(/live/i)).toBeTruthy();

    const [left, right] = Array.from(document.querySelectorAll('iframe'));
    expect(left.getAttribute('src')).toBe('/api/plate/snapshot/0007');
    expect(right.getAttribute('src')).toBe('http://localhost:4602/');
  });

  // Wave-4 council finding 4 (MEDIUM): the "before" (snapshot) frame is sandboxed as a third
  // layer of defense — allow-same-origin (so snapshotHighlight.ts can still reach
  // contentDocument) but NOT allow-scripts, so anything that slipped past both sanitization
  // passes still can't execute.
  it('sandboxes the "before" snapshot iframe (allow-same-origin, no scripts) but leaves the live "after" mirror unsandboxed', async () => {
    const { fetchImpl } = routedFetch({
      'POST /api/plate/mirror': { target: 'http://localhost:4200', port: 4602 },
      'GET /api/plate': { target: 'http://localhost:4200', port: 4601, status: 'up', changes: [], mirror: { port: 4602, status: 'up' } },
    });
    render(<TrialFitMirror workOrders={[trialFitOrder()]} fetchImpl={fetchImpl} />);
    await waitFor(() => expect(document.querySelectorAll('iframe')).toHaveLength(2));

    const [left, right] = Array.from(document.querySelectorAll('iframe'));
    expect(left.getAttribute('sandbox')).toBe('allow-same-origin');
    expect(left.getAttribute('sandbox')).not.toContain('allow-scripts');
    expect(right.getAttribute('sandbox')).toBeNull();
  });

  it('starts the mirror once (POST /api/plate/mirror) when entering trial-fit', async () => {
    const { fetchImpl, calls } = routedFetch({
      'POST /api/plate/mirror': { target: 'http://localhost:4200', port: 4602 },
      'GET /api/plate': { target: 'http://localhost:4200', port: 4601, status: 'up', changes: [], mirror: { port: 4602, status: 'up' } },
    });
    render(<TrialFitMirror workOrders={[trialFitOrder()]} fetchImpl={fetchImpl} />);

    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/plate/mirror')).toBe(true));
  });

  it('lists the changes the shop reported', async () => {
    const { fetchImpl } = routedFetch({
      'POST /api/plate/mirror': { target: 'http://localhost:4200', port: 4602 },
      'GET /api/plate': { target: 'http://localhost:4200', port: 4601, status: 'up', changes: [], mirror: { port: 4602, status: 'up' } },
    });
    render(<TrialFitMirror workOrders={[trialFitOrder()]} fetchImpl={fetchImpl} />);
    await waitFor(() => expect(document.querySelectorAll('iframe')).toHaveLength(2));
    expect(screen.getByText('a.html')).toBeTruthy();
    expect(screen.getByText(/renamed the Total column/i)).toBeTruthy();
  });

  it('one printed affordance returns to a single frame', async () => {
    const { fetchImpl } = routedFetch({
      'POST /api/plate/mirror': { target: 'http://localhost:4200', port: 4602 },
      'GET /api/plate': { target: 'http://localhost:4200', port: 4601, status: 'up', changes: [], mirror: { port: 4602, status: 'up' } },
    });
    const onPrinted = vi.fn();
    render(<TrialFitMirror workOrders={[trialFitOrder()]} fetchImpl={fetchImpl} onPrinted={onPrinted} />);
    await waitFor(() => expect(document.querySelectorAll('iframe')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: /printed/i }));
    expect(onPrinted).toHaveBeenCalledTimes(1);
  });
});

describe('TrialFitMirror — the scrubber drives both plates', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

  function trialFitOrder(): WorkOrder {
    return orderAt('trial-fit', {
      shop: { files: [], patterns: [], tests: [], brief: 'x', trialFit: { summary: 'done', files: [] } },
    });
  }

  it('replaying a toolpath posts the message to the right (live) plate and highlights the left (snapshot) plate', async () => {
    const toolpath = {
      id: '0001',
      name: 'a',
      createdAt: 'now',
      steps: [{ kind: 'click', path: '#target', at: 0 }],
    };
    const { fetchImpl } = routedFetch({
      'POST /api/plate/mirror': { target: 'http://localhost:4200', port: 4602 },
      'GET /api/plate': { target: 'http://localhost:4200', port: 4601, status: 'up', changes: [], mirror: { port: 4602, status: 'up' } },
      'GET /api/toolpaths': { toolpaths: [{ id: '0001', name: 'a', createdAt: 'now', stepCount: 1 }] },
      'GET /api/toolpaths/0001': toolpath,
    });

    render(<TrialFitMirror workOrders={[trialFitOrder()]} fetchImpl={fetchImpl} />);
    await waitFor(() => expect(document.querySelectorAll('iframe')).toHaveLength(2));

    const [left, right] = Array.from(document.querySelectorAll('iframe')) as HTMLIFrameElement[];
    // The snapshot iframe is same-origin in a real browser (served from the bench's own
    // origin) — jsdom gives every bare iframe a real, writable contentDocument. With a `src`
    // attribute set (jsdom does not actually fetch it), the initial document has no <body>
    // yet — document.write() is the standard way to populate one synchronously in a test.
    const leftDoc = left.contentDocument!;
    leftDoc.open();
    leftDoc.write('<button id="target">go</button>');
    leftDoc.close();
    (leftDoc.getElementById('target') as HTMLElement).getBoundingClientRect = () =>
      ({ x: 1, y: 2, width: 3, height: 4, top: 2, left: 1, right: 4, bottom: 6, toJSON: () => ({}) }) as DOMRect;

    const posted: unknown[] = [];
    Object.defineProperty(right, 'contentWindow', { value: { postMessage: (msg: unknown) => posted.push(msg) } });

    fireEvent.click(await screen.findByRole('button', { name: /replay/i }));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => vi.advanceTimersByTime(0));

    expect(posted).toContainEqual({ type: 'jig:click', path: '#target' });
    expect(left.contentDocument!.querySelector('[data-jig-snapshot-highlight]') ?? leftDoc.querySelector('[data-jig-snapshot-highlight]')).toBeTruthy();
  });
});
