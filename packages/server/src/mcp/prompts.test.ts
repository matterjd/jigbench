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
import { createJigMcpServer } from './server.js';

/**
 * S6 — the `implement-work-order` prompt (EXECUTION-PLAN.md §4 S6): tells the agent to read
 * the work order resource, claim it, implement the shop face test-first in the app repo, run
 * the app's tests, then report it done. Terse, in Jig's tongue (docs/design/COMMISSION.md §3).
 */

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function freshRig() {
  const repoRoot = await mkdtemp(join(tmpdir(), 'jig-mcp-prompts-'));
  tempDirs.push(repoRoot);
  const store = new JigStore(repoRoot);
  await store.init();
  const ollama = new OllamaDrafter({ model: 'qwen2.5-coder:7b' });
  vi.spyOn(ollama, 'available').mockResolvedValue(false);
  const orders = new OrdersService({ store, ollama });
  const fixtures = new FixtureStore(repoRoot, store);
  await fixtures.init();

  const mcpServer = createJigMcpServer({ repoRoot, store, orders, fixtures });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
  return { client };
}

describe('prompts/list', () => {
  it('names implement-work-order', async () => {
    const { client } = await freshRig();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(['implement-work-order']);
    await client.close();
  });
});

describe('prompts/get implement-work-order', () => {
  it('returns a message covering the whole loop: read, claim, implement test-first, report', async () => {
    const { client } = await freshRig();
    const result = await client.getPrompt({ name: 'implement-work-order', arguments: { id: '0001' } });
    expect(result.messages.length).toBeGreaterThan(0);
    const text = result.messages
      .map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');

    expect(text).toContain('jig://work-orders/0001');
    expect(text).toContain('jig_claim');
    expect(text).toMatch(/test.first/i);
    expect(text).toContain('jig_report');
    await client.close();
  });
});
