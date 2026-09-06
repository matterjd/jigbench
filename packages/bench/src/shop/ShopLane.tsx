import { useEffect, useState } from 'react';
import type { WorkOrder } from '@jigbench/core';
import './ShopLane.css';

/**
 * CHASSIS.md: "a narrow wyrd strip beside the logbook — the connected agent (Claude Code
 * · connected / none), and which released orders it holds." S6 wires a real agent
 * connection; until then this reads `wiring.shop` from `/api/state` honestly — 'none'
 * every time, exactly like the SIM strip's own chip for the same field.
 */
export interface ShopLaneProps {
  workOrders: readonly WorkOrder[];
  fetchImpl?: typeof fetch;
}

export function ShopLane({ workOrders, fetchImpl = fetch }: ShopLaneProps) {
  const [connected, setConnected] = useState(false);
  // S6 exposed /api/state's top-level `shop: {client, connectedAt}` (http.ts's
  // composedState) but nothing rendered WHO is connected — only wired/none. null covers both
  // "not connected" and "connected but the server didn't name a client" (falls back to a
  // plain "connected" below).
  const [clientName, setClientName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchImpl('/api/state')
      .then((res) => res.json())
      .then((data: { wiring?: { shop?: string }; shop?: { client?: string } | null }) => {
        if (cancelled) return;
        setConnected(data.wiring?.shop === 'wired');
        setClientName(typeof data.shop?.client === 'string' ? data.shop.client : null);
      })
      .catch(() => {
        if (!cancelled) {
          setConnected(false);
          setClientName(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchImpl]);

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
