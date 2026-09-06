import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathExists } from '../fs-util.js';
import {
  ShopHeartbeat,
  isHeartbeatFresh,
  readShopHeartbeat,
  shopHeartbeatFile,
  SHOP_HEARTBEAT_STALE_MS,
} from './heartbeat.js';

/**
 * S6 — the shop heartbeat (EXECUTION-PLAN.md §4 row S6): files are the state, and the MCP
 * process is not the bench server process, so `.jig/cache/shop.json` is how the bench finds
 * out an agent is connected at all. Written on `initialize`, refreshed every ~10s while
 * connected, removed on close; a `lastSeen` older than 30s reads as gone even if the file
 * itself is still there (a crash that skipped cleanup).
 */

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function freshRepoRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'jig-heartbeat-'));
  tempDirs.push(dir);
  return dir;
}

describe('isHeartbeatFresh', () => {
  it('is fresh just under the stale threshold', () => {
    const now = Date.now();
    const lastSeen = new Date(now - (SHOP_HEARTBEAT_STALE_MS - 1)).toISOString();
    expect(isHeartbeatFresh(lastSeen, now)).toBe(true);
  });

  it('is stale at or past the threshold', () => {
    const now = Date.now();
    const lastSeen = new Date(now - SHOP_HEARTBEAT_STALE_MS).toISOString();
    expect(isHeartbeatFresh(lastSeen, now)).toBe(false);
  });

  it('treats an unparsable timestamp as stale, not a crash', () => {
    expect(isHeartbeatFresh('not-a-date')).toBe(false);
  });
});

describe('ShopHeartbeat', () => {
  it('start() writes .jig/cache/shop.json with client, pid, connectedAt, lastSeen', async () => {
    const repoRoot = await freshRepoRoot();
    const heartbeat = new ShopHeartbeat(repoRoot);
    try {
      await heartbeat.start('Claude Code 2.1.259');
      const raw = JSON.parse(await readFile(shopHeartbeatFile(repoRoot), 'utf8'));
      expect(raw.client).toBe('Claude Code 2.1.259');
      expect(raw.pid).toBe(process.pid);
      expect(typeof raw.connectedAt).toBe('string');
      expect(typeof raw.lastSeen).toBe('string');
      expect(raw.connectedAt).toBe(raw.lastSeen); // first write: identical
    } finally {
      await heartbeat.stop();
    }
  });

  it('refreshes lastSeen on the configured interval while connected', async () => {
    // Real timers, a very short interval — fake timers don't reliably interleave with the
    // real fs I/O `write()` performs (atomicWriteFile's mkdir/write/rename land on libuv's
    // thread pool, not the JS timer queue `vi.advanceTimersByTimeAsync` can flush), so this
    // proves the actual refresh behavior end to end instead.
    const repoRoot = await freshRepoRoot();
    const heartbeat = new ShopHeartbeat(repoRoot, 20);
    await heartbeat.start('Claude Code');
    const first = JSON.parse(await readFile(shopHeartbeatFile(repoRoot), 'utf8'));

    await vi.waitFor(async () => {
      const raw = JSON.parse(await readFile(shopHeartbeatFile(repoRoot), 'utf8'));
      expect(raw.lastSeen).not.toBe(first.lastSeen);
    });
    const second = JSON.parse(await readFile(shopHeartbeatFile(repoRoot), 'utf8'));

    expect(second.connectedAt).toBe(first.connectedAt); // connectedAt never changes
    await heartbeat.stop();
  });

  it('stop() deletes the heartbeat file', async () => {
    const repoRoot = await freshRepoRoot();
    const heartbeat = new ShopHeartbeat(repoRoot);
    await heartbeat.start('Claude Code');
    expect(await pathExists(shopHeartbeatFile(repoRoot))) .toBe(true);
    await heartbeat.stop();
    expect(await pathExists(shopHeartbeatFile(repoRoot))).toBe(false);
  });

  it('stop() before start() (or a second stop()) never throws', async () => {
    const repoRoot = await freshRepoRoot();
    const heartbeat = new ShopHeartbeat(repoRoot);
    await expect(heartbeat.stop()).resolves.toBeUndefined();
  });
});

describe('readShopHeartbeat', () => {
  it('returns null when no heartbeat file exists', async () => {
    const repoRoot = await freshRepoRoot();
    expect(await readShopHeartbeat(repoRoot)).toBeNull();
  });

  it('returns the client + connectedAt when the file is fresh', async () => {
    const repoRoot = await freshRepoRoot();
    const heartbeat = new ShopHeartbeat(repoRoot);
    await heartbeat.start('Claude Desktop 1.0');
    const info = await readShopHeartbeat(repoRoot);
    expect(info).toEqual({ client: 'Claude Desktop 1.0', connectedAt: expect.any(String) });
    await heartbeat.stop();
  });

  it('returns null when the file is stale (lastSeen past the threshold)', async () => {
    const repoRoot = await freshRepoRoot();
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    const file = shopHeartbeatFile(repoRoot);
    await mkdir(dirname(file), { recursive: true });
    const stale = new Date(Date.now() - SHOP_HEARTBEAT_STALE_MS - 1000).toISOString();
    await writeFile(file, JSON.stringify({ client: 'gone', pid: 1, connectedAt: stale, lastSeen: stale }), 'utf8');
    expect(await readShopHeartbeat(repoRoot)).toBeNull();
  });

  it('returns null (never throws) when the file is malformed JSON', async () => {
    const repoRoot = await freshRepoRoot();
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    const file = shopHeartbeatFile(repoRoot);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, '{ not json', 'utf8');
    await expect(readShopHeartbeat(repoRoot)).resolves.toBeNull();
  });
});
