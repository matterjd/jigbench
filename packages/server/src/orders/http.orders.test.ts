import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJigServer, type JigServerHandle } from '../http.js';
import { FakeOllamaDrafter } from './drafters/fake.js';

/**
 * The HTTP-layer counterpart to `service.test.ts`: real `fetch` against a real listening
 * `createJigServer` instance (the same style `../http.test.ts` already uses), proving the
 * orders routes map `OrdersService`'s thrown errors onto the right status codes end to
 * end — not just that the service class itself throws the right error type.
 */

let handle: JigServerHandle | undefined;
// Reset by every `freshServer()` call — the deterministic, network-free stand-in
// `createJigServer`'s `drafters.ollama` override accepts instead of a real `OllamaDrafter`
// (wave-3 council: this file used to have NO override hook at all, so every test here
// genuinely depended on the desk's actual Ollama process — fast when warm, a 20s+ timeout
// when cold). `available: true` so the auto-draft/release flow below exercises the real
// 'model' driver code path, just against THIS fake, never the real endpoint.
let fakeOllama: FakeOllamaDrafter;

// See ../http.test.ts's matching comment: `selectDrafter` treats `JIG_NO_MODEL=1` as an
// unconditional override past `fakeOllama`'s `available: true`, which would defeat this
// suite's 'model' driver assertions under the CI/S10 command `JIG_NO_MODEL=1 npm test`.
let priorJigNoModel: string | undefined;

beforeEach(() => {
  priorJigNoModel = process.env.JIG_NO_MODEL;
  delete process.env.JIG_NO_MODEL;
});

afterEach(async () => {
  if (priorJigNoModel === undefined) delete process.env.JIG_NO_MODEL;
  else process.env.JIG_NO_MODEL = priorJigNoModel;
  if (handle) {
    await handle.close();
    handle = undefined;
  }
});

async function freshServer(): Promise<JigServerHandle> {
  const repoRoot = await mkdtemp(join(tmpdir(), 'jig-orders-http-'));
  fakeOllama = new FakeOllamaDrafter({ available: true });
  handle = await createJigServer({
    repoRoot,
    port: 0,
    openBrowser: false,
    benchDistDir: join(tmpdir(), 'jig-no-such-bench-dist'),
    drafters: { ollama: fakeOllama },
  });
  return handle;
}

/** `draft: false` — most callers of this helper are testing ladder transitions or PATCH
 * validation, not drafting; they never want seam 2's auto-draft racing their own assertions
 * (now that `freshServer()`'s injected `FakeOllamaDrafter` answers near-instantly rather
 * than a real model's multi-second round trip, that race is winnable either way, where
 * before it never was). The three tests that DO want a draft call `POST .../draft`
 * explicitly and wait for it via `waitForState`. */
async function createMarkedOrder(url: string): Promise<string> {
  const res = await fetch(`${url}/api/marks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ target: { path: 'x' }, prompt: 'x', draft: false }),
  });
  const body = await res.json();
  return body.workOrder.id as string;
}

/** `freshServer()` always injects a `FakeOllamaDrafter` (wave-3 council) now, so a `/draft`
 * call here never dispatches a real model request — it resolves near-instantly against the
 * fake, same as `HumanDrafter` would on a desk with no Ollama at all. Polling (rather than a
 * fixed sleep) is still correct either way; the budget just no longer needs to cover a real
 * cold-load. */
async function waitForState(url: string, id: string, state: string, timeoutMs = 5_000): Promise<void> {
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

  it('PATCH the human face once released is 409', async () => {
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
  });

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

// Finding 2 (wave-3 council, security high): PATCH /api/work-orders/:id used to merge
// req.body straight into `human` with no runtime validation — `Partial<WorkOrderHuman>` is
// just a compile-time annotation, erased at runtime. This block reproduces the exact council
// repro end to end over real HTTP, then proves it 400s (not 200s) and the junk never lands.
describe('PATCH /api/work-orders/:id validates the body (finding 2)', () => {
  it('rejects the council repro body (wrong types + an unknown key) with 400, and nothing persists', async () => {
    const { url } = await freshServer();
    const id = await createMarkedOrder(url);

    const res = await fetch(`${url}/api/work-orders/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ what: 1, evil: { $ref: 'x' }, acceptance: 'not-an-array' }),
    });

    expect(res.status).toBe(400);
    const errorBody = await res.json();
    expect(typeof errorBody.error).toBe('string'); // a plain JSON error, not a stack trace

    const state = await (await fetch(`${url}/api/state`)).json();
    const wo = state.workOrders.find((w: { id: string }) => w.id === id);
    expect(wo.human.what).toBe('x'); // the original prompt-derived value, untouched
    expect(wo.human.evil).toBeUndefined();
  });

  it('still accepts a well-formed patch (control)', async () => {
    const { url } = await freshServer();
    const id = await createMarkedOrder(url);

    const res = await fetch(`${url}/api/work-orders/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ why: 'nobody notices overdue invoices' }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).human.why).toBe('nobody notices overdue invoices');
  });

  it('rejects a request body over the 64kb limit rather than accepting an unbounded one', async () => {
    const { url } = await freshServer();
    const id = await createMarkedOrder(url);
    // 80kb: comfortably over the new 64kb cap, but under express's own 100kb default — so
    // this only fails once the route-specific limit is actually wired in (the RED case).
    const oversized = 'x'.repeat(80 * 1024);

    const res = await fetch(`${url}/api/work-orders/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ why: oversized }),
    });

    expect(res.status).not.toBe(200);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

describe('orders routes — the full loop, end to end over real HTTP', () => {
  it('mark -> draft -> release -> scrap -> restore, each landing the right state', async () => {
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

    // Wave-3 council spy: draft AND release's optional polish-pass probe both answered from
    // the INJECTED fake — never a real Ollama, even one reachable on this desk.
    expect(fakeOllama.calls.filter((c) => c.kind === 'draft')).toHaveLength(1);
    expect(fakeOllama.calls.some((c) => c.kind === 'available')).toBe(true);
  });

  it('GET /api/drafter reports a driver, a reason, and both availability flags', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/drafter`);
    const body = await res.json();

    expect(['model', 'shop', 'person']).toContain(body.driver);
    expect(typeof body.reason).toBe('string');
    expect(body.available).toEqual(expect.objectContaining({ ollama: expect.any(Boolean), shop: expect.any(Boolean) }));
  });
});
