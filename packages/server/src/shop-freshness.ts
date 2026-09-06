import type { JigStore } from './store.js';

/**
 * Wave-4 council finding 3 (HIGH), second half. `JigStore.getWiring()`/`getShopInfo()`
 * already judge the shop heartbeat's freshness at READ time (against `Date.now()` on every
 * call, not baked in at the last `reload()`) — but nothing calls them just because time
 * passes. If an agent exits ungracefully (no `ShopHeartbeat.stop()`, so `.jig/cache/shop.json`
 * is never deleted) and no `.jig/` file event or HTTP request happens to land afterward,
 * `wiring.shop` can sit at 'wired' with nobody ever noticing it should have gone stale.
 *
 * This is the periodic reader that closes that gap: on an interval, it re-checks
 * `store.getWiring().shop` and calls `onFlip` exactly when the wired/none value CHANGES since
 * the last check — never on every tick, only on a transition. `createJigServer` (http.ts)
 * wires `onFlip` to the same `broadcastState` every other state change already uses, so the
 * bench's ShopLane goes back to "none connected" within one tick of the heartbeat actually
 * going stale (default: every 10s, so within ~30-40s of the crash), with no `.jig/` file
 * write required to trigger it.
 */

export const SHOP_FRESHNESS_TICK_MS = 10_000;

export interface ShopFreshnessWatcher {
  stop(): void;
}

export function watchShopFreshness(
  store: Pick<JigStore, 'getWiring'>,
  onFlip: () => void,
  intervalMs: number = SHOP_FRESHNESS_TICK_MS,
): ShopFreshnessWatcher {
  let lastWired = store.getWiring().shop === 'wired';
  const timer = setInterval(() => {
    const nowWired = store.getWiring().shop === 'wired';
    if (nowWired !== lastWired) {
      lastWired = nowWired;
      onFlip();
    }
  }, intervalMs);
  timer.unref?.();

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
