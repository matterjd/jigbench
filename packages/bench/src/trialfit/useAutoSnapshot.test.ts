// @vitest-environment jsdom
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import type { WorkOrder } from '@jigbench/core';
import { useAutoSnapshot } from './useAutoSnapshot.js';

afterEach(() => cleanup());

/**
 * The trial-fit mirror's "before" frame is only ever honest if SOMETHING captures the
 * release-moment snapshot while the PRIMARY plate is still showing the as-is app — by the
 * time an order reaches `trial-fit` and `TrialFitMirror` mounts, `PlateBench` (and its
 * iframe) is already unmounted, so this has to run earlier, from `App.tsx`, against the
 * primary plate's own iframe ref. Found missing while driving the real bench live in a
 * browser: `GET /api/plate/snapshot/:id` 404'd because nothing had ever POSTed one.
 */

const PLATE_ORIGIN = 'http://localhost:4601';

function order(id: string, state: WorkOrder['state']): WorkOrder {
  return {
    jigFormat: 1,
    id,
    slug: 'x',
    state,
    draftedBy: 'person',
    marks: [],
    human: { what: 'x', why: 'y', where: 'z', acceptance: [] },
    log: [],
  };
}

function iframeWithPostMessage(): { iframe: HTMLIFrameElement; posted: unknown[] } {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  const posted: unknown[] = [];
  Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: (msg: unknown) => posted.push(msg) } });
  return { iframe, posted };
}

describe('useAutoSnapshot', () => {
  it('does nothing while every order is still marked/drafted', () => {
    const { iframe, posted } = iframeWithPostMessage();
    const ref = createRef<HTMLIFrameElement>();
    (ref as { current: HTMLIFrameElement }).current = iframe;

    renderHook(() => useAutoSnapshot([order('0001', 'marked'), order('0002', 'drafted')], ref, PLATE_ORIGIN));

    expect(posted).toEqual([]);
  });

  it('posts jig:snapshot once an order reaches released', () => {
    const { iframe, posted } = iframeWithPostMessage();
    const ref = createRef<HTMLIFrameElement>();
    (ref as { current: HTMLIFrameElement }).current = iframe;

    renderHook(() => useAutoSnapshot([order('0001', 'released')], ref, PLATE_ORIGIN));

    expect(posted).toContainEqual({ type: 'jig:snapshot' });
  });

  it('uploads the reply to POST /api/plate/snapshot keyed by the order id', async () => {
    const { iframe } = iframeWithPostMessage();
    const ref = createRef<HTMLIFrameElement>();
    (ref as { current: HTMLIFrameElement }).current = iframe;
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    renderHook(() => useAutoSnapshot([order('0007', 'released')], ref, PLATE_ORIGIN, fetchImpl));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'jig:snapshotted', html: '<html>captured</html>' }, origin: PLATE_ORIGIN }),
      );
    });

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/plate/snapshot');
    expect(JSON.parse(String(init.body))).toEqual({ id: '0007', html: '<html>captured</html>' });
  });

  it('ignores a jig:snapshotted reply from the wrong origin', async () => {
    const { iframe } = iframeWithPostMessage();
    const ref = createRef<HTMLIFrameElement>();
    (ref as { current: HTMLIFrameElement }).current = iframe;
    const fetchImpl = vi.fn();

    renderHook(() => useAutoSnapshot([order('0007', 'released')], ref, PLATE_ORIGIN, fetchImpl));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'jig:snapshotted', html: '<html>evil</html>' }, origin: 'http://evil.example' }),
      );
    });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never re-requests a snapshot for the same order id twice, even across re-renders', () => {
    const { iframe, posted } = iframeWithPostMessage();
    const ref = createRef<HTMLIFrameElement>();
    (ref as { current: HTMLIFrameElement }).current = iframe;

    const { rerender } = renderHook(({ orders }) => useAutoSnapshot(orders, ref, PLATE_ORIGIN), {
      initialProps: { orders: [order('0001', 'released')] },
    });
    expect(posted).toHaveLength(1);

    // A later WS broadcast hands the hook a brand-new array reference for the SAME order —
    // this must not re-trigger a capture.
    rerender({ orders: [order('0001', 'in-the-shop')] });
    expect(posted).toHaveLength(1);
  });

  it('captures a second order once it separately reaches released', () => {
    const { iframe, posted } = iframeWithPostMessage();
    const ref = createRef<HTMLIFrameElement>();
    (ref as { current: HTMLIFrameElement }).current = iframe;

    const { rerender } = renderHook(({ orders }) => useAutoSnapshot(orders, ref, PLATE_ORIGIN), {
      initialProps: { orders: [order('0001', 'released')] },
    });
    expect(posted).toHaveLength(1);

    rerender({ orders: [order('0001', 'in-the-shop'), order('0002', 'released')] });
    expect(posted).toHaveLength(2);
  });

  it('does nothing when the plate origin is not yet known', () => {
    const { iframe, posted } = iframeWithPostMessage();
    const ref = createRef<HTMLIFrameElement>();
    (ref as { current: HTMLIFrameElement }).current = iframe;

    renderHook(() => useAutoSnapshot([order('0001', 'released')], ref, null));

    expect(posted).toEqual([]);
  });
});
