import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { JigStore } from '../store.js';
import { OrdersService } from '../orders/service.js';
import { OllamaDrafter } from '../orders/drafters/ollama.js';
import { FixtureStore } from '../fixtures/store.js';
import { readFile } from 'node:fs/promises';
import { shopHeartbeatFile, readShopHeartbeat } from './heartbeat.js';
import { createJigMcpServer, formatClientLabel, heartbeatRefreshMsFromEnv } from './server.js';

/**
 * S6 — the MCP server core (EXECUTION-PLAN.md §4 S6, ADR-001). This covers only what
 * `createJigMcpServer` itself wires up: server identity and the shop heartbeat lifecycle
 * (start on `initialize`, stop on close). The nine tools, the resources, and the prompt are
 * each their own slice with their own tests — `tools.ts`/`resources.ts`/`prompts.ts` are
 * still no-ops as of this commit.
 */

/**
 * Every `vi.waitFor` below waits on `.jig/cache/shop.json` — a file `atomicWriteFile` puts
 * there (or `stop()`'s `rm()` takes away) while `heartbeat.start()` runs fire-and-forget off
 * `oninitialized`, which is why these are waits and not reads. `vi.waitFor`'s default budget is
 * ONE second, and that write's own transient-error backoff can spend most of it before the file
 * ever appears: `mkdir` + `writeFile` retried up to 5 times (150 ms of sleeps) and then `rename`
 * retried up to 8 (420 ms), all of it defence against exactly the Windows filesystem lag a CI
 * runner has. On a loaded windows-latest runner — four vitest workers on two cores — that is how
 * main's push run at `365ebef` went red: `AssertionError: expected null not to be null` at
 * `server.test.ts:84`, run 34296840719, with 1682 other tests passing.
 *
 * So: an explicit budget, the shape `orders/service.test.ts` and `watcher.test.ts` already use,
 * with an explicit per-test timeout above it (PR #34's shape for the same class of red). A test
 * that is really hung still fails — it just fails on a real cause instead of on the default.
 */
const HEARTBEAT_WAIT = { timeout: 10_000, interval: 20 } as const;
const HEARTBEAT_TEST_TIMEOUT_MS = 20_000;

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  // maxRetries/retryDelay: a shop-heartbeat rm() racing this recursive delete under
  // `.jig/cache/` is what turns into Windows' ENOTEMPTY (CI run 34039471247) — the same
  // shape of test tree tools.test.ts hit it in; this is the defense-in-depth net.
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));
});

async function freshRig() {
  const repoRoot = await mkdtemp(join(tmpdir(), 'jig-mcp-server-'));
  tempDirs.push(repoRoot);
  const store = new JigStore(repoRoot);
  await store.init();
  const ollama = new OllamaDrafter({ model: 'qwen2.5-coder:7b' });
  vi.spyOn(ollama, 'available').mockResolvedValue(false);
  const orders = new OrdersService({ store, ollama });
  const fixtures = new FixtureStore(repoRoot, store);
  await fixtures.init();
  return { repoRoot, store, orders, fixtures };
}

describe('formatClientLabel', () => {
  it('joins a name and version when both are present', () => {
    expect(formatClientLabel({ name: 'Claude Code', version: '2.1.259' }, 'fallback')).toBe('Claude Code 2.1.259');
  });

  it('uses just the name when no version is given', () => {
    expect(formatClientLabel({ name: 'Claude Code' }, 'fallback')).toBe('Claude Code');
  });

  it('falls back when no client info is available at all', () => {
    expect(formatClientLabel(undefined, 'fallback')).toBe('fallback');
  });
});

describe('createJigMcpServer', () => {
  it('advertises itself as "jig" to a connecting client', async () => {
    const { repoRoot, store, orders, fixtures } = await freshRig();
    const mcpServer = createJigMcpServer({ repoRoot, store, orders, fixtures });

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
    expect(client.getServerVersion()).toEqual({ name: 'jig', version: '0.2.0' });

    await client.close();
  });

  it('writes the shop heartbeat on initialize, labeled with the real handshake client name', async () => {
    const { repoRoot, store, orders, fixtures } = await freshRig();
    const mcpServer = createJigMcpServer({ repoRoot, store, orders, fixtures, clientName: 'fallback-name' });

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'Claude Code', version: '2.1.259' });
    await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);

    const info = await vi.waitFor(async () => {
      const heartbeat = await readShopHeartbeat(repoRoot);
      expect(heartbeat).not.toBeNull();
      return heartbeat!;
    }, HEARTBEAT_WAIT);
    expect(info.client).toBe('Claude Code 2.1.259');

    await client.close();
  }, HEARTBEAT_TEST_TIMEOUT_MS);

  it('deletes the shop heartbeat once the client disconnects', async () => {
    const { repoRoot, store, orders, fixtures } = await freshRig();
    const mcpServer = createJigMcpServer({ repoRoot, store, orders, fixtures });

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
    await vi.waitFor(async () => expect(await readShopHeartbeat(repoRoot)).not.toBeNull(), HEARTBEAT_WAIT);

    await client.close();

    await vi.waitFor(async () => expect(await readShopHeartbeat(repoRoot)).toBeNull(), HEARTBEAT_WAIT);
  }, HEARTBEAT_TEST_TIMEOUT_MS);

  // Finding 1 (wave-4 council)'s red control needs a fast heartbeat tick to prove
  // scripts/stdout-guard.sh actually reads the WHOLE run, not just two lines — this is the
  // plumbing that lets JIG_HEARTBEAT_MS reach the real ShopHeartbeat the MCP server starts.
  it('JIG_HEARTBEAT_MS threads through to the shop heartbeat, refreshing lastSeen on that interval', async () => {
    const { repoRoot, store, orders, fixtures } = await freshRig();
    const prior = process.env.JIG_HEARTBEAT_MS;
    process.env.JIG_HEARTBEAT_MS = '20';
    try {
      const mcpServer = createJigMcpServer({ repoRoot, store, orders, fixtures });
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);

      const first = await vi.waitFor(async () => {
        const raw = JSON.parse(await readFile(shopHeartbeatFile(repoRoot), 'utf8'));
        expect(raw.lastSeen).toBeTruthy();
        return raw;
      }, HEARTBEAT_WAIT);
      await vi.waitFor(async () => {
        const raw = JSON.parse(await readFile(shopHeartbeatFile(repoRoot), 'utf8'));
        expect(raw.lastSeen).not.toBe(first.lastSeen);
      }, HEARTBEAT_WAIT);

      await client.close();
    } finally {
      if (prior === undefined) delete process.env.JIG_HEARTBEAT_MS;
      else process.env.JIG_HEARTBEAT_MS = prior;
    }
  }, HEARTBEAT_TEST_TIMEOUT_MS);
});

describe('heartbeatRefreshMsFromEnv', () => {
  it('parses a positive numeric JIG_HEARTBEAT_MS', () => {
    expect(heartbeatRefreshMsFromEnv({ JIG_HEARTBEAT_MS: '50' })).toBe(50);
  });

  it('falls back to undefined (ShopHeartbeat\'s own default) when unset, empty, non-numeric, or non-positive', () => {
    expect(heartbeatRefreshMsFromEnv({})).toBeUndefined();
    expect(heartbeatRefreshMsFromEnv({ JIG_HEARTBEAT_MS: '' })).toBeUndefined();
    expect(heartbeatRefreshMsFromEnv({ JIG_HEARTBEAT_MS: 'nope' })).toBeUndefined();
    expect(heartbeatRefreshMsFromEnv({ JIG_HEARTBEAT_MS: '0' })).toBeUndefined();
    expect(heartbeatRefreshMsFromEnv({ JIG_HEARTBEAT_MS: '-5' })).toBeUndefined();
  });
});
