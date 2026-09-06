import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jigPaths } from '@jigbench/core';
import { JigStore } from './store.js';
import { SHOP_HEARTBEAT_STALE_MS } from './mcp/heartbeat.js';
import { watchShopFreshness } from './shop-freshness.js';

/**
 * Wave-4 council finding 3 (HIGH), second half: `getWiring()`/`getShopInfo()` now judge
 * freshness at READ time (store.test.ts's own "re-evaluates freshness at READ time" test),
 * but nothing calls them just because time passes — if no HTTP request or WS broadcast
 * happens to land after a crash, wiring.shop can sit at 'wired' indefinitely with no reader
 * ever noticing. This periodic tick is that reader: it re-checks `store.getWiring().shop` on
 * an interval and fires `onFlip` exactly when the wired/none value CHANGES, so
 * `createJigServer` (http.ts) can broadcast the new state to connected bench clients within
 * one tick of the heartbeat actually going stale — no .jig/ file event required.
 */

async function freshRepo(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'jig-shop-freshness-'));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('watchShopFreshness', () => {
  it('does not fire onFlip while the heartbeat stays fresh', async () => {
    const repoRoot = await freshRepo();
    const store = new JigStore(repoRoot);
    await store.init();
    const paths = jigPaths(repoRoot);
    await mkdir(paths.cache, { recursive: true });

    vi.useFakeTimers();
    const now = new Date().toISOString();
    await writeFile(join(paths.cache, 'shop.json'), JSON.stringify({ client: 'Claude Code', pid: 1, connectedAt: now, lastSeen: now }), 'utf8');
    await store.reload();
    expect(store.getWiring().shop).toBe('wired');

    const onFlip = vi.fn();
    const watcher = watchShopFreshness(store, onFlip, 10_000);
    try {
      await vi.advanceTimersByTimeAsync(20_000); // well under the 30s stale threshold
      expect(store.getWiring().shop).toBe('wired');
      expect(onFlip).not.toHaveBeenCalled();
    } finally {
      watcher.stop();
    }
  });

  it('fires onFlip exactly once when the heartbeat goes stale, and wiring.shop reads "none" from then on', async () => {
    const repoRoot = await freshRepo();
    const store = new JigStore(repoRoot);
    await store.init();
    const paths = jigPaths(repoRoot);
    await mkdir(paths.cache, { recursive: true });

    vi.useFakeTimers();
    const now = new Date().toISOString();
    await writeFile(join(paths.cache, 'shop.json'), JSON.stringify({ client: 'Claude Code', pid: 1, connectedAt: now, lastSeen: now }), 'utf8');
    await store.reload();
    expect(store.getWiring().shop).toBe('wired');

    const onFlip = vi.fn();
    const watcher = watchShopFreshness(store, onFlip, 10_000);
    try {
      // Past SHOP_HEARTBEAT_STALE_MS (30s) with no further heartbeat write — no reload()
      // call anywhere in this test either; only the tick + the read-time freshness check.
      await vi.advanceTimersByTimeAsync(SHOP_HEARTBEAT_STALE_MS + 10_000);

      expect(store.getWiring().shop).toBe('none');
      expect(onFlip).toHaveBeenCalledTimes(1);

      // Further ticks with nothing changed must not fire onFlip again.
      await vi.advanceTimersByTimeAsync(30_000);
      expect(onFlip).toHaveBeenCalledTimes(1);
    } finally {
      watcher.stop();
    }
  });

  it('stop() clears the interval — no further onFlip calls after stopping', async () => {
    const repoRoot = await freshRepo();
    const store = new JigStore(repoRoot);
    await store.init();
    const paths = jigPaths(repoRoot);
    await mkdir(paths.cache, { recursive: true });

    vi.useFakeTimers();
    const now = new Date().toISOString();
    await writeFile(join(paths.cache, 'shop.json'), JSON.stringify({ client: 'Claude Code', pid: 1, connectedAt: now, lastSeen: now }), 'utf8');
    await store.reload();

    const onFlip = vi.fn();
    const watcher = watchShopFreshness(store, onFlip, 10_000);
    watcher.stop();

    await vi.advanceTimersByTimeAsync(SHOP_HEARTBEAT_STALE_MS + 10_000);
    expect(onFlip).not.toHaveBeenCalled();
  });
});
