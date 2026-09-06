import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { JIG_FORMAT, jigPaths, type Survey } from '@jigbench/core';
import { JigStore } from '../store.js';
import { OrdersService } from '../orders/service.js';
import { OllamaDrafter } from '../orders/drafters/ollama.js';
import { FixtureStore } from '../fixtures/store.js';
import { createJigMcpServer } from './server.js';

/**
 * S6 — the `jig://` resources (EXECUTION-PLAN.md §4 S6): `jig://work-orders/{id}` (a
 * template, one markdown file per order), `jig://work-orders` (the index, a markdown
 * table), `jig://survey` and `jig://gauges` (both application/json).
 */

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  // maxRetries/retryDelay: a shop-heartbeat rm() racing this recursive delete under
  // `.jig/cache/` is what turns into Windows' ENOTEMPTY (CI run 34039471247) — the same
  // shape of test tree tools.test.ts hit it in; this is the defense-in-depth net.
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));
});

const SURVEY: Survey = {
  jigFormat: JIG_FORMAT,
  stack: ['angular'],
  components: [],
  routes: [],
  endpoints: [],
  schemas: [],
  docs: [],
  generatedAt: '2026-01-01T00:00:00.000Z',
};

async function freshRig() {
  const repoRoot = await mkdtemp(join(tmpdir(), 'jig-mcp-resources-'));
  tempDirs.push(repoRoot);
  const store = new JigStore(repoRoot);
  await store.init();
  await writeFile(join(jigPaths(repoRoot).survey, 'survey.json'), JSON.stringify(SURVEY, null, 2), 'utf8');
  await store.reload();

  const ollama = new OllamaDrafter({ model: 'qwen2.5-coder:7b' });
  vi.spyOn(ollama, 'available').mockResolvedValue(false);
  const orders = new OrdersService({ store, ollama });
  const fixtures = new FixtureStore(repoRoot, store);
  await fixtures.init();

  const mcpServer = createJigMcpServer({ repoRoot, store, orders, fixtures });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);

  return { repoRoot, store, orders, fixtures, client };
}

async function markedOrder(store: JigStore) {
  const { workOrder } = await store.createMarkAndWorkOrder({
    target: { path: 'body > app-invoice-list', component: 'InvoiceListComponent' },
    prompt: 'flag overdue rows',
  });
  return workOrder;
}

describe('jig://work-orders/{id}', () => {
  it('returns the work order\'s markdown file as text/markdown', async () => {
    const { store, client } = await freshRig();
    const order = await markedOrder(store);

    const result = await client.readResource({ uri: `jig://work-orders/${order.id}` });
    expect(result.contents).toHaveLength(1);
    const content = result.contents[0]!;
    expect(content.mimeType).toBe('text/markdown');
    expect(String(content.text)).toContain('## What');
    expect(String(content.text)).toContain('flag overdue rows');
    await client.close();
  });

  it('is listed by resources/templates/list', async () => {
    const { client } = await freshRig();
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.some((t) => t.uriTemplate === 'jig://work-orders/{id}')).toBe(true);
    await client.close();
  });

  it('errors readably (never a crash) for an unknown id', async () => {
    const { client } = await freshRig();
    await expect(client.readResource({ uri: 'jig://work-orders/9999' })).rejects.toThrow(/9999/);
    await client.close();
  });
});

describe('jig://work-orders (the index)', () => {
  it('is a markdown table listing every work order', async () => {
    const { store, client } = await freshRig();
    const order = await markedOrder(store);

    const result = await client.readResource({ uri: 'jig://work-orders' });
    const content = result.contents[0]!;
    expect(content.mimeType).toBe('text/markdown');
    expect(String(content.text)).toContain(order.id);
    expect(String(content.text)).toContain(order.slug);
    await client.close();
  });
});

describe('jig://survey', () => {
  it('returns the merged survey as application/json', async () => {
    const { client } = await freshRig();
    const result = await client.readResource({ uri: 'jig://survey' });
    const content = result.contents[0]!;
    expect(content.mimeType).toBe('application/json');
    const parsed = JSON.parse(String(content.text));
    expect(parsed.stack).toEqual(['angular']);
    await client.close();
  });
});

describe('jig://gauges', () => {
  it('returns the gauge set as application/json', async () => {
    const { client } = await freshRig();
    const result = await client.readResource({ uri: 'jig://gauges' });
    const content = result.contents[0]!;
    expect(content.mimeType).toBe('application/json');
    const parsed = JSON.parse(String(content.text));
    expect(Array.isArray(parsed.gauges)).toBe(true);
    await client.close();
  });
});

describe('resources/list', () => {
  it('lists the static resources', async () => {
    const { client } = await freshRig();
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual(['jig://gauges', 'jig://survey', 'jig://work-orders'].sort());
    await client.close();
  });
});
