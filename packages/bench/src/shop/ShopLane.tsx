import type { ShopInfo, Wiring, WorkOrder } from '@jigbench/core';
import './ShopLane.css';

/**
 * CHASSIS.md: "a narrow wyrd strip beside the logbook — the connected agent (Claude Code
 * · connected / none), and which released orders it holds."
 *
 * Retest defect 22 (2026-09-06 evening): "did not see it reflected in jig" — this used to
 * fetch `/api/state` exactly ONCE on mount and never again, so a shop connection made after
 * the bench page had already loaded (the normal order of operations) never showed up
 * without a manual reload. `wiring`/`shop` are now props sourced from `App.tsx`'s
 * `useJigState()` — the SAME live state, pushed on every WS broadcast, including the
 * shop-freshness watcher's own wired/none flip.
 */
export interface ShopLaneProps {
  workOrders: readonly WorkOrder[];
  /** The bench's live wiring state — `null` before the first state message has ever
   * arrived. Absent/null both read as "not connected", never a stale "connected". */
  wiring: Wiring | null;
  /** The connected agent's own name/connectedAt, or `null` — covers both "not connected"
   * and "connected but the server didn't name a client" (falls back to a plain
   * "connected" below). */
  shop: ShopInfo | null;
}

export function ShopLane({ workOrders, wiring, shop }: ShopLaneProps) {
  const connected = wiring?.shop === 'wired';
  const clientName = shop?.client ?? null;

  const released = workOrders.filter((w) => w.state === 'released');
  const held = workOrders.filter((w) => w.state === 'in-the-shop');

  return (
    <div className={'jig-shop' + (connected ? ' jig-shop--connected' : '')} aria-label="the shop — connected agents">
      <span className="jig-shop__title">the shop</span>

      <div className="jig-shop__status">
        <span aria-hidden="true" className="jig-shop__dot" />
        {connected ? (clientName ? `connected · ${clientName}` : 'connected') : 'none connected'}
      </div>

      <div className="jig-shop__released">
        {released.length === 0 ? (
          <span className="jig-shop__say">nothing released — the shop has nothing to pick up</span>
        ) : (
          <>
            {released.map((o) => (
              <span key={o.id} className="jig-shop__num" title={`released, waiting for the shop`}>
                #{o.id}
              </span>
            ))}
            <span className="jig-shop__say">{released.length} released</span>
          </>
        )}
      </div>

      <div className="jig-shop__held">
        {held.length === 0 ? (
          <span className="jig-shop__say">none held</span>
        ) : (
          <>
            {held.map((o) => (
              <span key={o.id} className="jig-shop__num" title="in the shop">
                #{o.id}
              </span>
            ))}
            <span className="jig-shop__say">{held.length} held</span>
          </>
        )}
      </div>
    </div>
  );
}
