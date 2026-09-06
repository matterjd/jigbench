import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { jigPaths } from '@jigbench/core';
import { atomicWriteFile } from '../atomic-write.js';
import { pathExists } from '../fs-util.js';
import { logger } from '../logger.js';

/**
 * S6 — the shop heartbeat (EXECUTION-PLAN.md §4 row S6, ADR-001: the agent pulls, Jig never
 * pushes). Files are the state, and the MCP process (`jigbench mcp`, launched by the agent
 * itself) is NOT the bench server process — so `.jig/cache/shop.json` is the only way the
 * bench finds out an agent is connected at all: written on `initialize`, refreshed on an
 * interval while connected, deleted on close. A `lastSeen` older than the stale threshold
 * reads as "gone" even if a crash left the file behind — the freshness check is what
 * actually decides `wiring.shop`, not the file's mere existence.
 */

export const SHOP_HEARTBEAT_STALE_MS = 30_000;
export const SHOP_HEARTBEAT_REFRESH_MS = 10_000;

export interface ShopHeartbeatFile {
  client: string;
  pid: number;
  connectedAt: string;
  lastSeen: string;
}

export function shopHeartbeatFile(repoRoot: string): string {
  return join(jigPaths(repoRoot).cache, 'shop.json');
}

export function isHeartbeatFresh(
  lastSeenIso: string,
  now: number = Date.now(),
  staleMs: number = SHOP_HEARTBEAT_STALE_MS,
): boolean {
  const t = Date.parse(lastSeenIso);
  if (!Number.isFinite(t)) return false;
  return now - t < staleMs;
}

/** The RAW read side — parses `.jig/cache/shop.json` and returns its fields (including
 * `lastSeen`) with no freshness filtering applied. `JigStore` (wave-4 council finding 3)
 * keeps exactly this shape cached between `reload()`s and re-runs `isHeartbeatFresh` against
 * it on every `getWiring()`/`getShopInfo()` call — so staleness is judged against the CURRENT
 * time whenever a caller asks, not against whatever time `reload()` last happened to run at.
 * Never throws: a missing file or malformed JSON both read as `null` (no heartbeat at all). */
export async function readShopHeartbeatRaw(repoRoot: string): Promise<ShopHeartbeatFile | null> {
  const file = shopHeartbeatFile(repoRoot);
  if (!(await pathExists(file))) return null;
  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as Partial<ShopHeartbeatFile>;
    if (typeof raw.client !== 'string' || typeof raw.lastSeen !== 'string') return null;
    return {
      client: raw.client,
      pid: typeof raw.pid === 'number' ? raw.pid : 0,
      connectedAt: typeof raw.connectedAt === 'string' ? raw.connectedAt : raw.lastSeen,
      lastSeen: raw.lastSeen,
    };
  } catch (err) {
    logger.warn('shop.json failed to parse; reporting the shop as not connected', String(err));
    return null;
  }
}

/** The read side — used by anything that just wants to know "is an agent connected right
 * now, as of THIS call", without owning the write/refresh lifecycle or needing the raw
 * `lastSeen` itself. Freshness is judged at call time (`isHeartbeatFresh`'s own `Date.now()`
 * default) against whatever is on disk right now. Never throws: a missing file, a stale one,
 * or malformed JSON all read as "no shop connected". */
export async function readShopHeartbeat(repoRoot: string): Promise<{ client: string; connectedAt: string } | null> {
  const raw = await readShopHeartbeatRaw(repoRoot);
  if (!raw || !isHeartbeatFresh(raw.lastSeen)) return null;
  return { client: raw.client, connectedAt: raw.connectedAt };
}

/**
 * The write side — one instance per connected MCP client (one `jigbench mcp` process talks
 * to exactly one agent over stdio at a time). `start()` writes the file immediately (the
 * `initialize` handshake) and refreshes `lastSeen` on `refreshMs` while connected; `stop()`
 * clears the timer and deletes the file (the transport closing, or the process exiting
 * cleanly) — belt and suspenders alongside `readShopHeartbeat`'s own freshness check, which
 * covers the crash case where `stop()` never runs at all.
 */
export class ShopHeartbeat {
  private timer: ReturnType<typeof setInterval> | undefined;
  private connectedAt = '';
  private client = '';
  // Tracks the most recently scheduled refresh write so `stop()` can wait for it before
  // deleting the file — otherwise a refresh already in flight when `stop()` clears the
  // interval can still land its rename after the delete, briefly resurrecting the file.
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(
    private readonly repoRoot: string,
    private readonly refreshMs: number = SHOP_HEARTBEAT_REFRESH_MS,
  ) {}

  async start(client: string): Promise<void> {
    this.client = client;
    this.connectedAt = new Date().toISOString();
    // The very first write's lastSeen is EXACTLY connectedAt (one timestamp, not two
    // independent `new Date()` calls a fraction of a millisecond apart) — both mean "the
    // handshake just completed", so they should never be observably different.
    await this.write(this.connectedAt);
    this.timer = setInterval(() => {
      this.pendingWrite = this.write().catch((err) => logger.warn('shop heartbeat refresh failed', String(err)));
    }, this.refreshMs);
    this.timer.unref?.();
  }

  private async write(lastSeen: string = new Date().toISOString()): Promise<void> {
    const payload: ShopHeartbeatFile = {
      client: this.client,
      pid: process.pid,
      connectedAt: this.connectedAt,
      lastSeen,
    };
    await atomicWriteFile(shopHeartbeatFile(this.repoRoot), JSON.stringify(payload, null, 2) + '\n');
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.pendingWrite.catch(() => {});
    await rm(shopHeartbeatFile(this.repoRoot), { force: true }).catch(() => {});
  }
}
