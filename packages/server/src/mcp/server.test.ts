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
import { readShopHeartbeat } from './heartbeat.js';
import { createJigMcpServer, formatClientLabel } from './server.js';

/**
 * S6 — the MCP server core (EXECUTION-PLAN.md §4 S6, ADR-001). This covers only what
 * `createJigMcpServer` itself wires up: server identity and the shop heartbeat lifecycle
 * (start on `initialize`, stop on close). The nine tools, the resources, and the prompt are
 * each their own slice with their own tests — `tools.ts`/`resources.ts`/`prompts.ts` are
 * still no-ops as of this commit.
 */

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
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
    expect(client.getServerVersion()).toEqual({ name: 'jig', version: '0.1.0' });

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
    });
    expect(info.client).toBe('Claude Code 2.1.259');

    await client.close();
  });

  it('deletes the shop heartbeat once the client disconnects', async () => {
    const { repoRoot, store, orders, fixtures } = await freshRig();
    const mcpServer = createJigMcpServer({ repoRoot, store, orders, fixtures });

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
    await vi.waitFor(async () => expect(await readShopHeartbeat(repoRoot)).not.toBeNull());

    await client.close();

    await vi.waitFor(async () => expect(await readShopHeartbeat(repoRoot)).toBeNull());
  });
});
