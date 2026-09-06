import { useEffect, useRef, type RefObject } from 'react';
import type { WorkOrder } from '@jigbench/core';

const SNAPSHOTTABLE_STATES: readonly WorkOrder['state'][] = ['released', 'in-the-shop', 'trial-fit'];

/**
 * The trial-fit mirror's "before" frame (`TrialFitMirror.tsx`) is only ever honest if
 * something captures the release-moment snapshot WHILE the primary plate is still showing
 * the as-is app — by the time an order reaches `trial-fit` and `TrialFitMirror` mounts in
 * `PlateBench`'s place, the primary plate's iframe is already gone. So this runs from
 * `App.tsx`, against the SAME `iframeRef`/`plateOrigin` `FixturePanel`/`TrayRegion` already
 * use, watching for the first order to reach a "past release" state and firing exactly one
 * `jig:snapshot` per order id, ever — a best-effort capture (the reply may never arrive if
 * the plate is mid-navigation; this never retries, since a later trial-fit view would just
 * show an honest void rather than a wrong "before").
 */
export function useAutoSnapshot(
  workOrders: readonly WorkOrder[],
  iframeRef: RefObject<HTMLIFrameElement | null>,
  plateOrigin: string | null,
  fetchImpl: typeof fetch = fetch,
): void {
  const captured = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!plateOrigin) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;

    const target = workOrders.find((w) => SNAPSHOTTABLE_STATES.includes(w.state) && !captured.current.has(w.id));
    if (!target) return;

    // Claimed immediately, before the reply arrives — a request that never gets a reply
    // (the plate navigated away, the origin never answered) is never retried; the next
    // order to reach release gets its own turn on a later effect run instead.
    const targetId = target.id;
    captured.current.add(targetId);

    function onMessage(event: MessageEvent): void {
      if (event.origin !== plateOrigin) return;
      const data = event.data as { type?: unknown; html?: unknown } | null;
      if (!data || data.type !== 'jig:snapshotted' || typeof data.html !== 'string') return;
      window.removeEventListener('message', onMessage);
      void fetchImpl('/api/plate/snapshot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: targetId, html: data.html }),
      });
    }
    window.addEventListener('message', onMessage);
    win.postMessage({ type: 'jig:snapshot' }, plateOrigin);

    return () => window.removeEventListener('message', onMessage);
  }, [workOrders, iframeRef, plateOrigin, fetchImpl]);
}
