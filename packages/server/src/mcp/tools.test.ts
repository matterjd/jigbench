import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
 * S6 — the nine `jig_*` tools (EXECUTION-PLAN.md §4 S6). Exercised through a real MCP
 * `Client` over the SDK's `InMemoryTransport` (fast, in-process — no stdio, no subprocess),
 * so this proves the actual wire contract (tool names, zod input validation, CallToolResult
 * shape) rather than just calling handler functions directly.
 */

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const SURVEY: Survey = {
  jigFormat: JIG_FORMAT,
  stack: ['angular', 'dotnet'],
  components: [
    {
      name: 'InvoiceListComponent',
      selector: 'app-invoice-list',
      file: 'src/app/invoice-list/invoice-list.component.ts',
      standalone: true,
      inline: false,
      inputs: [],
      outputs: [],
      styleUrls: [],
    },
  ],
  routes: [{ path: 'invoices', component: 'InvoiceListComponent', file: 'src/app/app.routes.ts' }],
  endpoints: [{ method: 'GET', path: '/api/invoices', file: 'Endpoints/InvoiceEndpoints.cs' }],
  schemas: [{ schemaRef: 'InvoiceDto', schema: { type: 'object', properties: { id: { type: 'string' } } } }],
  docs: [],
  generatedAt: '2026-01-01T00:00:00.000Z',
  adapters: [{ adapter: 'angular', appRoot: '/repo', stub: false }],
};

async function freshRig() {
  const repoRoot = await mkdtemp(join(tmpdir(), 'jig-mcp-tools-'));
  tempDirs.push(repoRoot);
  const store = new JigStore(repoRoot);
  await store.init();

  const paths = jigPaths(repoRoot);
  await writeFile(join(paths.survey, 'survey.json'), JSON.stringify(SURVEY, null, 2), 'utf8');
  await writeFile(
    paths.gaugesFile,
    JSON.stringify(
      {
        jigFormat: JIG_FORMAT,
        gauges: [
          { name: '--ink', $type: 'color', $value: '#111111', category: 'colour', source: { file: 'src/styles.scss', line: 3 }, usages: [{ file: 'src/app/app.ts', count: 2 }] },
          { name: '--space-2', $type: 'dimension', $value: '8px', category: 'space', source: { file: 'src/styles.scss', line: 4 } },
        ],
        generatedAt: '2026-01-01T00:00:00.000Z',
      },
      null,
      2,
    ),
    'utf8',
  );
  await writeFile(
    join(paths.survey, 'docs.json'),
    JSON.stringify(
      {
        jigFormat: JIG_FORMAT,
        root: 'docs/handbook',
        clampedAt: '2026-01-01T00:00:00.000Z',
        files: [{ file: 'docs/handbook/billing.md', kind: 'md', chunks: 1 }],
        chunks: [
          {
            id: 'docs/handbook/billing.md#L1-3',
            file: 'docs/handbook/billing.md',
            headingPath: ['Billing', 'Due dates'],
            startLine: 1,
            endLine: 3,
            text: 'Invoices are overdue 30 days after the due date.',
            words: 8,
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );
  await store.reload();

  const ollama = new OllamaDrafter({ model: 'qwen2.5-coder:7b' });
  vi.spyOn(ollama, 'available').mockResolvedValue(false);
  const orders = new OrdersService({ store, ollama });

  const fixtures = new FixtureStore(repoRoot, store);
  await fixtures.init();
  await fixtures.create({ name: 'demo' }, SURVEY);

  return { repoRoot, store, orders, fixtures };
}

async function connectedClient(rig: Awaited<ReturnType<typeof freshRig>>) {
  const mcpServer = createJigMcpServer({ repoRoot: rig.repoRoot, store: rig.store, orders: rig.orders, fixtures: rig.fixtures, clientName: 'test-shop' });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'Claude Code', version: '2.1.259' });
  await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

/** Seeds a `marked` order without auto-drafting it away — same helper pattern
 * `service.shop-draft.test.ts` uses. */
async function markedOrder(store: JigStore) {
  const { workOrder } = await store.createMarkAndWorkOrder({
    target: { path: 'body > app-invoice-list', component: 'InvoiceListComponent' },
    prompt: 'flag overdue rows',
  });
  return workOrder.id;
}

async function releasedOrder(store: JigStore, orders: OrdersService): Promise<string> {
  const { workOrder } = await orders.createMark({ pick: { path: 'body > app-invoice-list', component: 'InvoiceListComponent' }, prompt: 'flag overdue rows' });
  await vi.waitFor(() => expect(store.getWorkOrder(workOrder.id)?.state).toBe('drafted'));
  const released = await orders.release(workOrder.id);
  return released.id;
}

describe('tools/list', () => {
  it('names all nine jig_* tools', async () => {
    const rig = await freshRig();
    const client = await connectedClient(rig);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      ['jig_claim', 'jig_docs', 'jig_draft', 'jig_fixture', 'jig_gauges', 'jig_report', 'jig_survey', 'jig_work_order', 'jig_work_orders'].sort(),
    );
    await client.close();
  });
});

describe('jig_survey', () => {
  it('defaults to a summary: counts, stack, app roots', async () => {
    const rig = await freshRig();
    const client = await connectedClient(rig);
    const result = await client.callTool({ name: 'jig_survey', arguments: {} });
    expect(result.isError).toBeFalsy();
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.stack).toEqual(['angular', 'dotnet']);
    expect((payload.counts as Record<string, number>).components).toBe(1);
    expect(payload.appRoots).toEqual([{ adapter: 'angular', appRoot: '/repo', stub: false }]);
    await client.close();
  });

  it('returns just the components section when asked', async () => {
    const rig = await freshRig();
    const client = await connectedClient(rig);
    const result = await client.callTool({ name: 'jig_survey', arguments: { section: 'components' } });
    const payload = result.structuredContent as { components: unknown[] };
    expect(payload.components).toHaveLength(1);
    await client.close();
  });

  it('rejects an unknown section as an isError result — zod input validation, not a crash', async () => {
    const rig = await freshRig();
    const client = await connectedClient(rig);
    const result = await client.callTool({ name: 'jig_survey', arguments: { section: 'nonsense' } });
    expect(result.isError).toBe(true);
    await client.close();
  });
});

describe('jig_gauges', () => {
  it('returns every gauge with its usages when no category is given', async () => {
    const rig = await freshRig();
    const client = await connectedClient(rig);
    const result = await client.callTool({ name: 'jig_gauges', arguments: {} });
    const payload = result.structuredContent as { gauges: Array<{ name: string }> };
    expect(payload.gauges.map((g) => g.name).sort()).toEqual(['--ink', '--space-2']);
    await client.close();
  });

  it('filters by category', async () => {
    const rig = await freshRig();
    const client = await connectedClient(rig);
    const result = await client.callTool({ name: 'jig_gauges', arguments: { category: 'colour' } });
    const payload = result.structuredContent as { gauges: Array<{ name: string }> };
    expect(payload.gauges.map((g) => g.name)).toEqual(['--ink']);
    await client.close();
  });
});

describe('jig_work_orders', () => {
  it('lists every work order with id, slug, state, what, age, draftedBy, file', async () => {
    const rig = await freshRig();
    await markedOrder(rig.store);
    const client = await connectedClient(rig);
    const result = await client.callTool({ name: 'jig_work_orders', arguments: {} });
    const payload = result.structuredContent as { workOrders: Array<Record<string, unknown>> };
    expect(payload.workOrders).toHaveLength(1);
    const row = payload.workOrders[0]!;
    expect(row.id).toBe('0001');
    expect(row.slug).toBe('flag-overdue-rows');
    expect(row.state).toBe('marked');
    expect(row.what).toBe('flag overdue rows');
    expect(row.draftedBy).toBe('person');
    expect(typeof row.age).toBe('string');
    expect(String(row.file).replace(/\\/g, '/')).toContain('.jig/work-orders/0001-flag-overdue-rows.md');
    await client.close();
  });

  it('filters by state', async () => {
    const rig = await freshRig();
    await markedOrder(rig.store);
    const client = await connectedClient(rig);
    const result = await client.callTool({ name: 'jig_work_orders', arguments: { state: 'drafted' } });
    const payload = result.structuredContent as { workOrders: unknown[] };
    expect(payload.workOrders).toEqual([]);
    await client.close();
  });
});

describe('jig_work_order', () => {
  it('returns both faces, the file path, and the resolved marks', async () => {
    const rig = await freshRig();
    const id = await markedOrder(rig.store);
    const client = await connectedClient(rig);
    const result = await client.callTool({ name: 'jig_work_order', arguments: { id } });
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.id).toBe(id);
    expect((payload.human as Record<string, unknown>).what).toBe('flag overdue rows');
    expect(payload.shop).toBeNull();
    expect(Array.isArray(payload.marks)).toBe(true);
    expect((payload.marks as unknown[]).length).toBe(1);
    await client.close();
  });

  it('returns an isError tool result for an unknown id, never a crash', async () => {
    const rig = await freshRig();
    const client = await connectedClient(rig);
    const result = await client.callTool({ name: 'jig_work_order', arguments: { id: '9999' } });
    expect(result.isError).toBe(true);
    expect(String((result.content as Array<{ text: string }>)[0]?.text)).toContain('9999');
    await client.close();
  });
});

describe('jig_fixture', () => {
  it('lists every fixture with a hint about the plate, when no id is given', async () => {
    const rig = await freshRig();
    const client = await connectedClient(rig);
    const result = await client.callTool({ name: 'jig_fixture', arguments: {} });
    const payload = result.structuredContent as { fixtures: Array<{ name: string }>; hint: string };
    expect(payload.fixtures.map((f) => f.name)).toEqual(['demo']);
    expect(payload.hint.toLowerCase()).toContain('plate');
    await client.close();
  });

  it('returns one fixture by id', async () => {
    const rig = await freshRig();
    const client = await connectedClient(rig);
    const one = await rig.fixtures.list();
    const result = await client.callTool({ name: 'jig_fixture', arguments: { id: one[0]!.id } });
    const payload = result.structuredContent as { fixture: { name: string } };
    expect(payload.fixture.name).toBe('demo');
    await client.close();
  });

  it('returns an isError result for an unknown fixture id', async () => {
    const rig = await freshRig();
    const client = await connectedClient(rig);
    const result = await client.callTool({ name: 'jig_fixture', arguments: { id: 'nope' } });
    expect(result.isError).toBe(true);
    await client.close();
  });
});

describe('jig_docs', () => {
  it('ranks doc chunks against the query, with provenance', async () => {
    const rig = await freshRig();
    const client = await connectedClient(rig);
    const result = await client.callTool({ name: 'jig_docs', arguments: { q: 'overdue invoice due date' } });
    const payload = result.structuredContent as { results: Array<{ text: string; provenance: string }> };
    expect(payload.results.length).toBeGreaterThan(0);
    expect(payload.results[0]!.text).toContain('overdue');
    expect(payload.results[0]!.provenance).toContain('billing.md');
    await client.close();
  });

  it('answers an honest empty list when nothing is clamped', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-mcp-tools-nodocs-'));
    tempDirs.push(repoRoot);
    const store = new JigStore(repoRoot);
    await store.init();
    const ollama = new OllamaDrafter({ model: 'qwen2.5-coder:7b' });
    vi.spyOn(ollama, 'available').mockResolvedValue(false);
    const orders = new OrdersService({ store, ollama });
    const fixtures = new FixtureStore(repoRoot, store);
    await fixtures.init();

    const client = await connectedClient({ repoRoot, store, orders, fixtures });
    const result = await client.callTool({ name: 'jig_docs', arguments: { q: 'anything' } });
    const payload = result.structuredContent as { results: unknown[] };
    expect(payload.results).toEqual([]);
    await client.close();
  });
});

describe('jig_draft', () => {
  it('drafts a marked order, badged draftedBy shop, and persists to disk', async () => {
    const rig = await freshRig();
    const id = await markedOrder(rig.store);
    const client = await connectedClient(rig);

    const result = await client.callTool({
      name: 'jig_draft',
      arguments: { id, human: { what: 'flag overdue rows', why: 'visibility', where: 'InvoiceListComponent', acceptance: ['overdue rows are red'] } },
    });
    expect(result.isError).toBeFalsy();
    const payload = result.structuredContent as { state: string; draftedBy: string };
    expect(payload.state).toBe('drafted');
    expect(payload.draftedBy).toBe('shop');

    const onDisk = await readFile(join(jigPaths(rig.repoRoot).workOrders, `${id}-flag-overdue-rows.md`), 'utf8');
    expect(onDisk).toContain('draftedBy: shop');
    await client.close();
  });

  it('returns an isError result (never a crash) for an order that is not marked', async () => {
    const rig = await freshRig();
    const id = await markedOrder(rig.store);
    const client = await connectedClient(rig);
    const human = { what: 'x', why: 'y', where: 'z', acceptance: [] };
    await client.callTool({ name: 'jig_draft', arguments: { id, human } }); // now drafted

    const result = await client.callTool({ name: 'jig_draft', arguments: { id, human } });
    expect(result.isError).toBe(true);
    expect(String((result.content as Array<{ text: string }>)[0]?.text)).toMatch(/not marked/);
    await client.close();
  });
});

describe('jig_claim', () => {
  it('moves a released order to in-the-shop, badged with the connected client name', async () => {
    const rig = await freshRig();
    const id = await releasedOrder(rig.store, rig.orders);
    const client = await connectedClient(rig);

    const result = await client.callTool({ name: 'jig_claim', arguments: { id } });
    const payload = result.structuredContent as { state: string };
    expect(payload.state).toBe('in-the-shop');
    expect(rig.store.getWorkOrder(id)?.log.at(-1)?.note).toBe('Claude Code 2.1.259');
    await client.close();
  });

  it('returns an isError result for a work order that is not released', async () => {
    const rig = await freshRig();
    const id = await markedOrder(rig.store);
    const client = await connectedClient(rig);
    const result = await client.callTool({ name: 'jig_claim', arguments: { id } });
    expect(result.isError).toBe(true);
    await client.close();
  });
});

describe('jig_report', () => {
  it('moves a claimed order to trial-fit with the summary and files', async () => {
    const rig = await freshRig();
    const id = await releasedOrder(rig.store, rig.orders);
    await rig.orders.claim(id, 'Claude Code');
    const client = await connectedClient(rig);

    const result = await client.callTool({ name: 'jig_report', arguments: { id, summary: 'renamed the Total column', files: ['a.html'] } });
    const payload = result.structuredContent as { state: string };
    expect(payload.state).toBe('trial-fit');
    expect(rig.store.getWorkOrder(id)?.shop?.trialFit).toEqual({ summary: 'renamed the Total column', files: ['a.html'] });
    await client.close();
  });

  it('returns an isError result for a work order that was never claimed', async () => {
    const rig = await freshRig();
    const id = await releasedOrder(rig.store, rig.orders);
    const client = await connectedClient(rig);
    const result = await client.callTool({ name: 'jig_report', arguments: { id, summary: 'x' } });
    expect(result.isError).toBe(true);
    await client.close();
  });
});
