// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToolpathBar } from './ToolpathBar.js';
import type { PlateEvent } from '../plate/usePlateBridge.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * F11 / CHASSIS.md's Toolpath tool: record over the plate's own `jig:event` stream (posted
 * in via the `lastEvent` prop, PlateBench's new `onEvent` seam), name + save it, then replay
 * a saved one by pace-posting the right messages through `post`. `fireEvent` + a routed fake
 * fetch — same convention `fixtures/FixturePanel.test.tsx` already established (no
 * `@testing-library/user-event` dependency in this package).
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

describe('ToolpathBar — record and save', () => {
  it('starts idle: a record control and an honest "no toolpaths yet"', async () => {
    const { fetchImpl } = routedFetch({ 'GET /api/toolpaths': { toolpaths: [] } });
    render(<ToolpathBar lastEvent={null} post={vi.fn()} fetchImpl={fetchImpl} />);
    expect(await screen.findByText(/no toolpaths yet/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /record/i })).toBeTruthy();
  });

  it('record -> a click -> stop -> name -> save posts the recorded steps to POST /api/toolpaths', async () => {
    const { fetchImpl, calls } = routedFetch({
      'GET /api/toolpaths': { toolpaths: [] },
      'POST /api/toolpaths': { id: '0001', name: 'open-and-edit', createdAt: 'now', steps: [] },
    });
    let event: PlateEvent | null = null;
    const { rerender } = render(<ToolpathBar lastEvent={event} post={vi.fn()} fetchImpl={fetchImpl} />);
    await screen.findByText(/no toolpaths yet/i);

    fireEvent.click(screen.getByRole('button', { name: /^record$/i }));
    expect(await screen.findByRole('button', { name: /^stop$/i })).toBeTruthy();

    event = { type: 'jig:event', kind: 'click', path: 'app-invoice-list:nth-of-type(1)' };
    rerender(<ToolpathBar lastEvent={event} post={vi.fn()} fetchImpl={fetchImpl} />);
    await waitFor(() => expect(screen.getByText(/1 stop/i)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /^stop$/i }));
    fireEvent.change(screen.getByPlaceholderText(/name this toolpath/i), { target: { value: 'open-and-edit' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(calls.some((c) => c.url === '/api/toolpaths' && c.method === 'POST')).toBe(true));
    const saveCall = calls.find((c) => c.url === '/api/toolpaths' && c.method === 'POST')!;
    const body = saveCall.body as { name: string; steps: { kind: string; path: string; at: number }[] };
    expect(body.name).toBe('open-and-edit');
    expect(body.steps).toHaveLength(1);
    expect(body.steps[0]).toMatchObject({ kind: 'click', path: 'app-invoice-list:nth-of-type(1)' });
    // Real Date.now() drives useToolpathRecorder's default clock here (ToolpathBar takes no
    // `now` override) — a few ms of real test-execution time legitimately elapse between
    // start() and the event, so `at` is "small and non-negative", never exactly 0.
    expect(body.steps[0].at).toBeGreaterThanOrEqual(0);
    expect(body.steps[0].at).toBeLessThan(2000);
  });
});

describe('ToolpathBar — replay', () => {
  // shouldAdvanceTime keeps real wall-clock progressing alongside the fake timers, so
  // @testing-library's own setTimeout-based waitFor/findBy* polling still resolves — without
  // it, fake timers never advance on their own and every findBy*/waitFor call here hangs
  // until vitest's real 5s test timeout (hit while first authoring this suite).
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

  it('lists saved toolpaths and replays one via post(), pacing by its recorded offsets', async () => {
    const toolpath = {
      id: '0001',
      name: 'open-and-edit',
      createdAt: 'now',
      startUrl: '/invoices',
      steps: [{ kind: 'click', path: 'app-invoice-list:nth-of-type(1)', at: 0 }],
    };
    const { fetchImpl } = routedFetch({
      'GET /api/toolpaths': { toolpaths: [{ id: '0001', name: 'open-and-edit', createdAt: 'now', stepCount: 1 }] },
      'GET /api/toolpaths/0001': toolpath,
    });
    const post = vi.fn();

    render(<ToolpathBar lastEvent={null} post={post} fetchImpl={fetchImpl} />);
    await screen.findByText('open-and-edit');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /replay/i }));
      await Promise.resolve(); // let the GET /api/toolpaths/:id fetch resolve
    });

    expect(post).toHaveBeenCalledWith({ type: 'jig:navigate', path: '/invoices' });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(post).toHaveBeenCalledWith({ type: 'jig:click', path: 'app-invoice-list:nth-of-type(1)' });
  });

  it('a speed control offers 0.5x / 1x / 2x, 1x active by default', async () => {
    const { fetchImpl } = routedFetch({ 'GET /api/toolpaths': { toolpaths: [] } });
    render(<ToolpathBar lastEvent={null} post={vi.fn()} fetchImpl={fetchImpl} />);
    await screen.findByText(/no toolpaths yet/i);

    expect(screen.getByRole('button', { name: '0.5×' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '1×' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '2×' })).toBeTruthy();
  });

  it('"printed" stops a running replay before its later steps fire', async () => {
    const toolpath = { id: '0001', name: 'a', createdAt: 'now', steps: [{ kind: 'click', path: 'a', at: 5000 }] };
    const { fetchImpl } = routedFetch({
      'GET /api/toolpaths': { toolpaths: [{ id: '0001', name: 'a', createdAt: 'now', stepCount: 1 }] },
      'GET /api/toolpaths/0001': toolpath,
    });
    const post = vi.fn();

    render(<ToolpathBar lastEvent={null} post={post} fetchImpl={fetchImpl} />);
    await screen.findByText('a');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /replay/i }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: /printed/i }));
    post.mockClear();

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(post).not.toHaveBeenCalled();
  });
});
