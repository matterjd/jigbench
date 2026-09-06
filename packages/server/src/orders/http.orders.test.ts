import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJigServer, type JigServerHandle } from '../http.js';

/**
 * The HTTP-layer counterpart to `service.test.ts`: real `fetch` against a real listening
 * `createJigServer` instance (the same style `../http.test.ts` already uses), proving the
 * orders routes map `OrdersService`'s thrown errors onto the right status codes end to
 * end — not just that the service class itself throws the right error type.
 */

let handle: JigServerHandle | undefined;

afterEach(async () => {
  if (handle) {
    await handle.close();
    handle = undefined;
  }
});

async function freshServer(): Promise<JigServerHandle> {
  const repoRoot = await mkdtemp(join(tmpdir(), 'jig-orders-http-'));
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

/** No override hook exists to inject a fake drafter into `createJigServer` — the real
 * server always points at the real Ollama endpoint, exactly as the CLI does. On a desk
 * where Ollama is actually reachable (this one), a `/draft` call genuinely dispatches a
 * model request (seconds, not milliseconds); on a desk without it, human drafting lands
 * near-instantly. Polling (rather than a fixed sleep) is correct either way. */
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

describe('orders routes — illegal transitions map to 409, not 400 or a crash', () => {
  it('POST .../release on a work order that is still marked (never drafted) is 409', async () => {
    const { url } = await freshServer();
    const id = await createMarkedOrder(url);

    const res = await fetch(`${url}/api/work-orders/${id}/release`, { method: 'POST' });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/not drafted/i);
  });

  it('POST .../restore on a work order that was never scrapped is 409', async () => {
    const { url } = await freshServer();
    const id = await createMarkedOrder(url);

    const res = await fetch(`${url}/api/work-orders/${id}/restore`, { method: 'POST' });

    expect(res.status).toBe(409);
  });

  it('POST .../draft on an order that is not marked is 409, checked synchronously before the 202 path', async () => {
    const { url } = await freshServer();
    const id = await createMarkedOrder(url);
    await fetch(`${url}/api/work-orders/${id}/scrap`, { method: 'POST' }); // marked -> scrapped

    const res = await fetch(`${url}/api/work-orders/${id}/draft`, { method: 'POST' });

    expect(res.status).toBe(409);
  });

  it(
    'PATCH the human face once released is 409',
    async () => {
      const { url } = await freshServer();
      const id = await createMarkedOrder(url);
      await fetch(`${url}/api/work-orders/${id}/draft`, { method: 'POST' });
      await waitForState(url, id, 'drafted');
      await fetch(`${url}/api/work-orders/${id}/release`, { method: 'POST' });

      const res = await fetch(`${url}/api/work-orders/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ why: 'too late' }),
      });

      expect(res.status).toBe(409);
    },
    70_000,
  );

  it('any orders route on an unknown work order id is 404, not a 500', async () => {
    const { url } = await freshServer();

    const release = await fetch(`${url}/api/work-orders/9999/release`, { method: 'POST' });
    const scrap = await fetch(`${url}/api/work-orders/9999/scrap`, { method: 'POST' });
    const patch = await fetch(`${url}/api/work-orders/9999`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    expect(release.status).toBe(404);
    expect(scrap.status).toBe(404);
    expect(patch.status).toBe(404);
  });
});

describe('orders routes — the full loop, end to end over real HTTP', () => {
  it(
    'mark -> draft -> release -> scrap -> restore, each landing the right state',
    async () => {
      const { url } = await freshServer();
      const id = await createMarkedOrder(url);

      const draftRes = await fetch(`${url}/api/work-orders/${id}/draft`, { method: 'POST' });
      expect(draftRes.status).toBe(202);
      await waitForState(url, id, 'drafted');

      const released = await (await fetch(`${url}/api/work-orders/${id}/release`, { method: 'POST' })).json();
      expect(released.state).toBe('released');
      expect(released.shop).toBeTruthy();

      const scrapped = await (await fetch(`${url}/api/work-orders/${id}/scrap`, { method: 'POST' })).json();
      expect(scrapped.state).toBe('scrapped');

      const restored = await (await fetch(`${url}/api/work-orders/${id}/restore`, { method: 'POST' })).json();
      expect(restored.state).toBe('released');
    },
    70_000,
  );

  it('GET /api/drafter reports a driver, a reason, and both availability flags', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/drafter`);
    const body = await res.json();

    expect(['model', 'shop', 'person']).toContain(body.driver);
    expect(typeof body.reason).toBe('string');
    expect(body.available).toEqual(expect.objectContaining({ ollama: expect.any(Boolean), shop: expect.any(Boolean) }));
  });
});
