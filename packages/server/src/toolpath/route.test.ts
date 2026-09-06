import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJigServer, type JigServerHandle } from '../http.js';
import { FakeOllamaDrafter } from '../orders/drafters/fake.js';

/**
 * S8's REST surface for toolpaths, the HTTP-layer counterpart to `store.test.ts` — real
 * `fetch` against a real listening server, the same style `fixtures/route.ts` is tested at
 * (via `http.orders.test.ts`'s sibling pattern).
 */

let handle: JigServerHandle | undefined;

afterEach(async () => {
  if (handle) {
    await handle.close();
    handle = undefined;
  }
});

async function freshServer(): Promise<JigServerHandle> {
  const repoRoot = await mkdtemp(join(tmpdir(), 'jig-toolpath-route-'));
  // This file never posts to /api/marks or /api/drafter, so it never actually triggers
  // OrdersService's own drafter selection — the override below is defense-in-depth (merge/s8
  // wave-3), matching the same fake-drafter pattern every `createJigServer` test call uses so
  // this file can never regress into reaching the real Ollama process.
  handle = await createJigServer({
    repoRoot,
    port: 0,
    openBrowser: false,
    benchDistDir: join(tmpdir(), 'jig-no-such-bench-dist'),
    drafters: { ollama: new FakeOllamaDrafter() },
  });
  return handle;
}

const steps = [
  { kind: 'navigate', path: '/invoices', at: 0 },
  { kind: 'click', path: 'app-invoice-list:nth-of-type(1)', at: 340 },
  { kind: 'input', path: 'input:nth-of-type(1)', value: 'INV-1042', at: 1800 },
];

describe('GET /api/toolpaths', () => {
  it('starts empty', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/toolpaths`);
    expect(res.status).toBe(200);
    expect((await res.json()).toolpaths).toEqual([]);
  });
});

describe('POST /api/toolpaths', () => {
  it('saves a recording and 201s the full toolpath, with the file readable back over GET', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/toolpaths`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'open-and-edit', startUrl: '/invoices', steps }),
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.id).toBe('0001');
    expect(created.steps).toEqual(steps);

    const listRes = await fetch(`${url}/api/toolpaths`);
    const list = await listRes.json();
    expect(list.toolpaths).toEqual([expect.objectContaining({ id: '0001', name: 'open-and-edit', stepCount: 3 })]);

    const oneRes = await fetch(`${url}/api/toolpaths/0001`);
    expect(oneRes.status).toBe(200);
    expect((await oneRes.json()).steps).toEqual(steps);
  });

  it('400s a request with no name', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/toolpaths`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ steps: [] }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/toolpaths/:id', () => {
  it('404s an unknown id', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/toolpaths/nope`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/toolpaths/:id/scrap and /restore', () => {
  it('scrap marks it scrapped (still GET-able); restore clears the flag', async () => {
    const { url } = await freshServer();
    await fetch(`${url}/api/toolpaths`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'a', steps: [] }),
    });

    const scrapRes = await fetch(`${url}/api/toolpaths/0001/scrap`, { method: 'POST' });
    expect(scrapRes.status).toBe(200);
    expect((await scrapRes.json()).scrapped).toBe(true);

    const restoreRes = await fetch(`${url}/api/toolpaths/0001/restore`, { method: 'POST' });
    expect(restoreRes.status).toBe(200);
    expect((await restoreRes.json()).scrapped).toBeUndefined();
  });

  it('404s scrapping an unknown id', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/toolpaths/nope/scrap`, { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

describe('same-origin gate covers the new toolpath POSTs', () => {
  it('rejects POST /api/toolpaths from a foreign Origin with 403', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/toolpaths`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
      body: JSON.stringify({ name: 'a', steps: [] }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects POST /api/toolpaths/:id/scrap from a foreign Origin with 403', async () => {
    const { url } = await freshServer();
    await fetch(`${url}/api/toolpaths`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'a', steps: [] }),
    });
    const res = await fetch(`${url}/api/toolpaths/0001/scrap`, {
      method: 'POST',
      headers: { origin: 'http://evil.example' },
    });
    expect(res.status).toBe(403);
  });
});
