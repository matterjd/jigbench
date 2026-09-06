import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JIG_FORMAT, type GaugeSet } from '@jigbench/core';
import { attachSketchesRoute } from './route.js';
import { SketchStore } from './store.js';

function gaugeSet(): GaugeSet {
  return {
    jigFormat: JIG_FORMAT,
    generatedAt: '2026-09-06T00:00:00.000Z',
    gauges: [
      { name: '--ledger-color-accent', $type: 'color', $value: '#1a56db', category: 'colour', source: { file: 'x.scss', line: 1 } },
    ],
  };
}

let repoRoot: string;
let close: (() => Promise<void>) | undefined;

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'jig-sketch-route-'));
});

afterEach(async () => {
  if (close) {
    await close();
    close = undefined;
  }
  await rm(repoRoot, { recursive: true, force: true });
});

async function serve(): Promise<{ url: string; store: SketchStore }> {
  const store = new SketchStore(repoRoot);
  await store.init();
  const app = express();
  app.use(express.json());
  attachSketchesRoute(app, store, () => gaugeSet());
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const url = typeof address === 'object' && address ? `http://localhost:${address.port}` : '';
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return { url, store };
}

describe('GET /api/sketches', () => {
  it('reports an empty list honestly', async () => {
    const { url } = await serve();
    const res = await fetch(`${url}/api/sketches`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sketches: [] });
  });
});

describe('POST /api/sketches', () => {
  it('creates a sketch and returns 201 with the full record', async () => {
    const { url } = await serve();
    const res = await fetch(`${url}/api/sketches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Overdue invoices', size: { w: 640, h: 480 } }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('0001');
    expect(body.name).toBe('Overdue invoices');
  });

  it('400s a blank name', async () => {
    const { url } = await serve();
    const res = await fetch(`${url}/api/sketches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '  ', size: { w: 640, h: 480 } }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/sketches/:id', () => {
  it('404s an id that does not exist', async () => {
    const { url } = await serve();
    const res = await fetch(`${url}/api/sketches/9999`);
    expect(res.status).toBe(404);
  });

  it('returns the full sketch, elements included', async () => {
    const { url, store } = await serve();
    const created = await store.create({ name: 'Overdue invoices', size: { w: 640, h: 480 } });
    const res = await fetch(`${url}/api/sketches/${created.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.elements).toEqual([]);
  });
});

describe('PUT /api/sketches/:id', () => {
  it('replaces the sketch content and round-trips through GET', async () => {
    const { url, store } = await serve();
    const created = await store.create({ name: 'Overdue invoices', size: { w: 640, h: 480 } });

    const putRes = await fetch(`${url}/api/sketches/${created.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Overdue invoices',
        size: { w: 640, h: 480 },
        elements: [{ id: 'e1', kind: 'box', x: 0, y: 0, w: 40, h: 40, gauges: {} }],
        links: [],
      }),
    });
    expect(putRes.status).toBe(200);

    const getRes = await fetch(`${url}/api/sketches/${created.id}`);
    const body = await getRes.json();
    expect(body.elements).toHaveLength(1);
  });

  it('404s updating an id that does not exist', async () => {
    const { url } = await serve();
    const res = await fetch(`${url}/api/sketches/9999`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x', size: { w: 1, h: 1 }, elements: [], links: [] }),
    });
    expect(res.status).toBe(404);
  });

  it('400s an element outside the closed primitive set', async () => {
    const { url, store } = await serve();
    const created = await store.create({ name: 'Overdue invoices', size: { w: 640, h: 480 } });
    const res = await fetch(`${url}/api/sketches/${created.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Overdue invoices',
        size: { w: 640, h: 480 },
        elements: [{ id: 'e1', kind: 'video', x: 0, y: 0, w: 40, h: 40 }],
        links: [],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('400s a raw hex value sitting in a gauge slot', async () => {
    const { url, store } = await serve();
    const created = await store.create({ name: 'Overdue invoices', size: { w: 640, h: 480 } });
    const res = await fetch(`${url}/api/sketches/${created.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Overdue invoices',
        size: { w: 640, h: 480 },
        elements: [{ id: 'e1', kind: 'box', x: 0, y: 0, w: 40, h: 40, gauges: { fill: '#ff00aa' } }],
        links: [],
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/sketches/:id/scrap + restore', () => {
  it('scraps then restores, 404ing an unknown id either way', async () => {
    const { url, store } = await serve();
    const created = await store.create({ name: 'Overdue invoices', size: { w: 640, h: 480 } });

    const scrapRes = await fetch(`${url}/api/sketches/${created.id}/scrap`, { method: 'POST' });
    expect(scrapRes.status).toBe(200);
    expect((await scrapRes.json()).scrapped).toBe(true);

    const restoreRes = await fetch(`${url}/api/sketches/${created.id}/restore`, { method: 'POST' });
    expect(restoreRes.status).toBe(200);
    expect((await restoreRes.json()).scrapped).toBeUndefined();

    const missing = await fetch(`${url}/api/sketches/9999/scrap`, { method: 'POST' });
    expect(missing.status).toBe(404);
  });
});

describe('GET /api/sketches/:id/html', () => {
  it('renders the gauge-value-carrying HTML and never echoes raw markup from a label', async () => {
    const { url, store } = await serve();
    const created = await store.create({ name: 'Overdue invoices', size: { w: 640, h: 480 } });
    await store.update(created.id, {
      name: created.name,
      size: created.size,
      elements: [
        { id: 'e1', kind: 'box', x: 0, y: 0, w: 100, h: 40, gauges: { fill: '--ledger-color-accent' } },
        { id: 'e2', kind: 'button', x: 0, y: 50, w: 80, h: 24, gauges: {}, label: '<script>evil()</script>' },
      ],
      links: [],
    });

    const res = await fetch(`${url}/api/sketches/${created.id}/html`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('--ledger-color-accent: #1a56db');
    expect(html).not.toContain('<script>evil()</script>');
  });

  it('404s the html render for an id that does not exist', async () => {
    const { url } = await serve();
    const res = await fetch(`${url}/api/sketches/9999/html`);
    expect(res.status).toBe(404);
  });
});
