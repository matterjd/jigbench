import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJigServer, type JigServerHandle } from '../http.js';

/**
 * S8's REST surface for the two shop-driven ladder moves — `POST /api/work-orders/:id/claim`
 * and `POST /api/work-orders/:id/report` — the HTTP-layer counterpart to
 * `service.trialfit.test.ts`, same style as `http.orders.test.ts`'s sibling routes.
 */

let handle: JigServerHandle | undefined;

afterEach(async () => {
  if (handle) {
    await handle.close();
    handle = undefined;
  }
});

async function freshServer(): Promise<JigServerHandle> {
  const repoRoot = await mkdtemp(join(tmpdir(), 'jig-orders-trialfit-http-'));
  handle = await createJigServer({
    repoRoot,
    port: 0,
    openBrowser: false,
    benchDistDir: join(tmpdir(), 'jig-no-such-bench-dist'),
  });
  return handle;
}

async function createMarkedOrder(url: string): Promise<string> {
  const res = await fetch(`${url}/api/marks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ target: { path: 'x' }, prompt: 'x' }),
  });
  const body = await res.json();
  return body.workOrder.id as string;
}

async function waitForState(url: string, id: string, state: string, timeoutMs = 60_000): Promise<void> {
  const started = Date.now();
  for (;;) {
    const body = await (await fetch(`${url}/api/state`)).json();
    const wo = body.workOrders.find((w: { id: string }) => w.id === id);
    if (wo?.state === state) return;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`work order ${id} never reached ${state}; last seen state: ${wo?.state}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function releasedOrder(url: string): Promise<string> {
  const id = await createMarkedOrder(url);
  await waitForState(url, id, 'drafted');
  await fetch(`${url}/api/work-orders/${id}/release`, { method: 'POST' });
  return id;
}

describe('POST /api/work-orders/:id/claim', () => {
  it(
    'moves a released order to in-the-shop',
    async () => {
      const { url } = await freshServer();
      const id = await releasedOrder(url);

      const res = await fetch(`${url}/api/work-orders/${id}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ by: 'Claude Code' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.state).toBe('in-the-shop');
    },
    70_000,
  );

  it('a work order still marked (never released) 409s on claim', async () => {
    const { url } = await freshServer();
    const id = await createMarkedOrder(url);
    const res = await fetch(`${url}/api/work-orders/${id}/claim`, { method: 'POST' });
    expect(res.status).toBe(409);
  });

  it('an unknown work order id 404s on claim', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/work-orders/9999/claim`, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('rejects a foreign Origin with 403', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/work-orders/9999/claim`, {
      method: 'POST',
      headers: { origin: 'http://evil.example' },
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/work-orders/:id/report', () => {
  async function claimedOrder(url: string): Promise<string> {
    const id = await releasedOrder(url);
    await fetch(`${url}/api/work-orders/${id}/claim`, { method: 'POST' });
    return id;
  }

  it(
    'moves a claimed order to trial-fit and stores the summary',
    async () => {
      const { url } = await freshServer();
      const id = await claimedOrder(url);

      const res = await fetch(`${url}/api/work-orders/${id}/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ summary: 'renamed the Total column', files: ['a.html'] }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.state).toBe('trial-fit');
      expect(body.shop.trialFit).toEqual({ summary: 'renamed the Total column', files: ['a.html'] });
    },
    70_000,
  );

  it(
    'a released-but-not-claimed order 409s on report',
    async () => {
      const { url } = await freshServer();
      const id = await releasedOrder(url);
      const res = await fetch(`${url}/api/work-orders/${id}/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ summary: 'x' }),
      });
      expect(res.status).toBe(409);
    },
    70_000,
  );

  it(
    '400s a report with no summary',
    async () => {
      const { url } = await freshServer();
      const id = await claimedOrder(url);
      const res = await fetch(`${url}/api/work-orders/${id}/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    },
    70_000,
  );

  it('an unknown work order id 404s on report', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/work-orders/9999/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ summary: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  it('rejects a foreign Origin with 403', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/work-orders/9999/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
      body: JSON.stringify({ summary: 'x' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('orders routes — the shop half of the loop, end to end over real HTTP', () => {
  it(
    'mark -> draft -> release -> claim -> report, each landing the right state',
    async () => {
      const { url } = await freshServer();
      const id = await createMarkedOrder(url);
      await waitForState(url, id, 'drafted');

      await fetch(`${url}/api/work-orders/${id}/release`, { method: 'POST' });
      await waitForState(url, id, 'released');

      await fetch(`${url}/api/work-orders/${id}/claim`, { method: 'POST' });
      await waitForState(url, id, 'in-the-shop');

      await fetch(`${url}/api/work-orders/${id}/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ summary: 'done' }),
      });
      await waitForState(url, id, 'trial-fit');
    },
    70_000,
  );
});
