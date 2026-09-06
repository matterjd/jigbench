import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JIG_FORMAT, type Survey } from '@jigbench/core';
import { attachFixturesRoute } from './route.js';
import { FixtureStore } from './store.js';

function stubSurvey(): Survey {
  return {
    jigFormat: JIG_FORMAT,
    stack: [],
    components: [],
    routes: [],
    endpoints: [
      {
        method: 'GET',
        path: '/api/invoices',
        responseSchema: { type: 'array', items: { $ref: '#/schemas/InvoiceDto' } },
      },
    ],
    schemas: [
      {
        schemaRef: 'InvoiceDto',
        schema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
      {
        schemaRef: 'CreateInvoiceRequest',
        schema: {
          type: 'object',
          required: ['customerId', 'notes'],
          properties: { customerId: { type: 'string' }, notes: { type: 'string' } },
        },
      },
    ],
    docs: [],
    generatedAt: '2026-09-05T00:00:00.000Z',
  };
}

let repoRoot: string;
let close: (() => Promise<void>) | undefined;

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'jig-fixtures-route-'));
});

afterEach(async () => {
  if (close) {
    await close();
    close = undefined;
  }
  await rm(repoRoot, { recursive: true, force: true });
});

async function serve(): Promise<{ url: string; store: FixtureStore }> {
  const store = new FixtureStore(repoRoot);
  await store.init();
  const app = express();
  app.use(express.json());
  attachFixturesRoute(app, store, () => stubSurvey());
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const url = typeof address === 'object' && address ? `http://localhost:${address.port}` : '';
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return { url, store };
}

describe('GET /api/fixtures', () => {
  it('reports an empty list and no active fixture honestly', async () => {
    const { url } = await serve();
    const res = await fetch(`${url}/api/fixtures`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fixtures: [], active: null });
  });
});

describe('POST /api/fixtures', () => {
  it('creates a fixture from the current survey and returns 201 with the full fixture', async () => {
    const { url } = await serve();
    const res = await fetch(`${url}/api/fixtures`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'overdue-heavy', seed: 42 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('overdue-heavy');
    expect(body.seed).toBe(42);
    expect(body.responses['GET /api/invoices']).toHaveLength(8);

    const list = await (await fetch(`${url}/api/fixtures`)).json();
    expect(list.fixtures).toHaveLength(1);
    expect(list.fixtures[0].id).toBe('overdue-heavy');
  });

  it('rejects a missing name with 400', async () => {
    const { url } = await serve();
    const res = await fetch(`${url}/api/fixtures`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate name with 409', async () => {
    const { url } = await serve();
    await fetch(`${url}/api/fixtures`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'dup' }),
    });
    const res = await fetch(`${url}/api/fixtures`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'dup' }),
    });
    expect(res.status).toBe(409);
  });
});

describe('GET /api/fixtures/:id', () => {
  it('404s honestly for an unknown id', async () => {
    const { url } = await serve();
    const res = await fetch(`${url}/api/fixtures/nope`);
    expect(res.status).toBe(404);
  });
});

describe('load / unload', () => {
  it('POST /api/fixtures/:id/load sets it active; GET /api/fixtures reflects it', async () => {
    const { url } = await serve();
    await fetch(`${url}/api/fixtures`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'a', seed: 1 }),
    });
    const loadRes = await fetch(`${url}/api/fixtures/a/load`, { method: 'POST' });
    expect(loadRes.status).toBe(200);
    expect(await loadRes.json()).toEqual({ active: 'a' });

    const list = await (await fetch(`${url}/api/fixtures`)).json();
    expect(list.active).toBe('a');
  });

  it('POST /api/fixtures/unload clears the active fixture', async () => {
    const { url } = await serve();
    await fetch(`${url}/api/fixtures`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'a', seed: 1 }),
    });
    await fetch(`${url}/api/fixtures/a/load`, { method: 'POST' });
    const res = await fetch(`${url}/api/fixtures/unload`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ active: null });

    const list = await (await fetch(`${url}/api/fixtures`)).json();
    expect(list.active).toBeNull();
  });

  it('loading an unknown id 404s', async () => {
    const { url } = await serve();
    const res = await fetch(`${url}/api/fixtures/nope/load`, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('loading a scrapped fixture 409s', async () => {
    const { url } = await serve();
    await fetch(`${url}/api/fixtures`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'a', seed: 1 }),
    });
    await fetch(`${url}/api/fixtures/a/scrap`, { method: 'POST' });
    const res = await fetch(`${url}/api/fixtures/a/load`, { method: 'POST' });
    expect(res.status).toBe(409);
  });
});

describe('scrap / restore (Law II — no DELETE route exists)', () => {
  it('POST /api/fixtures/:id/scrap marks it scrapped; restore clears it', async () => {
    const { url } = await serve();
    await fetch(`${url}/api/fixtures`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'a', seed: 1 }),
    });

    const scrapRes = await fetch(`${url}/api/fixtures/a/scrap`, { method: 'POST' });
    expect(scrapRes.status).toBe(200);
    expect((await scrapRes.json()).scrapped).toBe(true);

    const listAfterScrap = await (await fetch(`${url}/api/fixtures`)).json();
    expect(listAfterScrap.fixtures[0].scrapped).toBe(true);

    const restoreRes = await fetch(`${url}/api/fixtures/a/restore`, { method: 'POST' });
    expect(restoreRes.status).toBe(200);
    expect((await restoreRes.json()).scrapped).toBeUndefined();
  });

  it('there is no DELETE /api/fixtures/:id route', async () => {
    const { url } = await serve();
    await fetch(`${url}/api/fixtures`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'a', seed: 1 }),
    });
    const res = await fetch(`${url}/api/fixtures/a`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/plate/fill', () => {
  it('resolves field values from the fixture\'s forms for a schemaRef', async () => {
    const { url } = await serve();
    await fetch(`${url}/api/fixtures`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'a', seed: 1 }),
    });
    await fetch(`${url}/api/fixtures/a/load`, { method: 'POST' });

    const res = await fetch(`${url}/api/plate/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fixture: 'a', schemaRef: 'CreateInvoiceRequest' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = (body.fields as Array<{ name: string }>).map((f) => f.name).sort();
    expect(names).toEqual(['customerId', 'notes']);
  });

  it('404s for an unknown schemaRef', async () => {
    const { url } = await serve();
    await fetch(`${url}/api/fixtures`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'a', seed: 1 }),
    });
    const res = await fetch(`${url}/api/plate/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fixture: 'a', schemaRef: 'NoSuchSchema' }),
    });
    expect(res.status).toBe(404);
  });

  it('404s for an unknown fixture name', async () => {
    const { url } = await serve();
    const res = await fetch(`${url}/api/plate/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fixture: 'nope', schemaRef: 'CreateInvoiceRequest' }),
    });
    expect(res.status).toBe(404);
  });
});
