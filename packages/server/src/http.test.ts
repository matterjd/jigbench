import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { JIG_FORMAT, jigPaths } from '@jigbench/core';
import { createJigServer, type JigServerHandle } from './http.js';
import { createPlateProxy, type PlateProxyHandle, type PlateStatus } from './plate/proxy.js';
import { FakeOllamaDrafter } from './orders/drafters/fake.js';

let handle: JigServerHandle | undefined;
// Every `freshServer()` call replaces this with a brand-new instance — the deterministic,
// network-free stand-in `createJigServer`'s `drafters.ollama` override accepts in place of
// a real `OllamaDrafter` (wave-3 council: a unit/HTTP test must never depend on a live
// Ollama process, warm or cold). `available: true` so the auto-draft tests below exercise
// the real 'model' driver code path — just against THIS fake, never the real endpoint.
let fakeOllama: FakeOllamaDrafter;

afterEach(async () => {
  if (handle) {
    await handle.close();
    handle = undefined;
  }
});

async function freshServer(): Promise<JigServerHandle> {
  const repoRoot = await mkdtemp(join(tmpdir(), 'jig-http-'));
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

describe('GET /api/health', () => {
  it('reports ok and the clamped repo root', async () => {
    const { url, store } = await freshServer();
    const res = await fetch(`${url}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, repoRoot: store.repoRoot });
  });
});

describe('GET /api/state', () => {
  it('reports a stub survey, empty gauges/marks/work-orders, and honest wiring', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/state`);
    const body = await res.json();

    expect(body.survey.stub).toBe(true);
    expect(body.marks).toEqual([]);
    expect(body.workOrders).toEqual([]);
    expect(body.wiring).toEqual({
      survey: 'stub',
      proxy: 'none',
      drafter: 'stub',
      shop: 'none',
      fixtures: 'none',
      toolpath: 'none',
      sketch: 'none',
      docs: 'none',
    });
    expect(body.shop).toBeNull();
  });

  // S6: "extend /api/state with shop: {client, connectedAt}" — so the bench can show WHO is
  // connected, not just wiring.shop's wired/none. store.reload() is called directly here
  // (deterministic) rather than relying on the watcher's own timing, which the dedicated
  // ".jig/ watcher" tests below cover.
  it('reports shop: {client, connectedAt} once a fresh heartbeat file is on disk and reloaded', async () => {
    const { url, store } = await freshServer();
    const paths = jigPaths(store.repoRoot);
    await mkdir(paths.cache, { recursive: true });
    const now = new Date().toISOString();
    await writeFile(
      join(paths.cache, 'shop.json'),
      JSON.stringify({ client: 'Claude Code 2.1.259', pid: 1, connectedAt: now, lastSeen: now }),
      'utf8',
    );
    await store.reload();

    const body = await (await fetch(`${url}/api/state`)).json();
    expect(body.shop).toEqual({ client: 'Claude Code 2.1.259', connectedAt: now });
    expect(body.wiring.shop).toBe('wired');
  });
});

// S6 — the bench sees the shop's writes even though the MCP process (ADR-001) is a separate
// process: JigWatcher (wired into createJigServer) notices a direct file change under .jig/
// and broadcasts the reloaded state over WS, without any HTTP request driving it.
describe('the .jig/ watcher (S6) — a write from outside this process reaches connected WS clients', () => {
  it('a direct edit to a work order\'s frontmatter broadcasts the new state', async () => {
    const { url, store } = await freshServer();

    const created = await (
      await fetch(`${url}/api/marks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: { path: 'body > x' }, prompt: 'x', draft: false }),
      })
    ).json();
    const id = created.workOrder.id as string;

    const ws = new WebSocket(url.replace('http', 'ws') + '/ws');
    const messages: StateMessage[] = [];
    ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    await new Promise((r) => setTimeout(r, 50));
    messages.length = 0; // drop the initial connection-state push

    // Simulate what an MCP tool call in a SEPARATE process does — edit the file directly,
    // never through this server's own HTTP routes.
    const filePath = join(jigPaths(store.repoRoot).workOrders, `${id}-${created.workOrder.slug}.md`);
    const original = await readFile(filePath, 'utf8');
    const rewritten = original.replace('state: marked', 'state: drafted').replace('draftedBy: person', 'draftedBy: shop');
    expect(rewritten).not.toBe(original); // sanity: the replace actually matched something
    await writeFile(filePath, rewritten, 'utf8');

    await vi.waitFor(
      () => {
        const broadcast = messages.find(
          (m) => m.type === 'state' && m.state?.workOrders.some((w) => w.id === id && w.state === 'drafted'),
        );
        expect(broadcast).toBeTruthy();
      },
      { timeout: 3000 },
    );

    ws.close();
  });

  it('the shop heartbeat appearing under .jig/cache also triggers a broadcast (wiring.shop flips to wired)', async () => {
    const { url, store } = await freshServer();

    const ws = new WebSocket(url.replace('http', 'ws') + '/ws');
    const messages: StateMessage[] = [];
    ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    await new Promise((r) => setTimeout(r, 50));
    messages.length = 0;

    const paths = jigPaths(store.repoRoot);
    await mkdir(paths.cache, { recursive: true });
    const now = new Date().toISOString();
    await writeFile(join(paths.cache, 'shop.json'), JSON.stringify({ client: 'Claude Code', pid: 1, connectedAt: now, lastSeen: now }), 'utf8');

    await vi.waitFor(
      () => {
        const broadcast = messages.find((m: { type: string; state?: { wiring?: { shop?: string } } }) => m.type === 'state' && m.state?.wiring?.shop === 'wired');
        expect(broadcast).toBeTruthy();
      },
      { timeout: 3000 },
    );

    ws.close();
  });
});

describe('GET /api/docs', () => {
  it('is mounted on the real server and reports an honest empty summary before any clamp', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/docs`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ root: null, clampedAt: null, files: [] });
  });
});

describe('GET /api/plate (S3)', () => {
  function fakePlate(status: PlateStatus): PlateProxyHandle {
    return {
      url: `http://localhost:${status.port}/`,
      port: status.port,
      start: async (target: string) => {
        void target;
        return `http://localhost:${status.port}/`;
      },
      getStatus: async () => status,
      close: async () => {},
    };
  }

  it('is absent (404) when no plate proxy is configured, and wiring.proxy stays none', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/plate`);
    expect(res.status).toBe(404);

    const state = await (await fetch(`${url}/api/state`)).json();
    expect(state.wiring.proxy).toBe('none');
  });

  it('reports the plate status and mirrors wiring.proxy as wired once a plate is configured', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-http-plate-'));
    handle = await createJigServer({
      repoRoot,
      port: 0,
      openBrowser: false,
      benchDistDir: join(tmpdir(), 'jig-no-such-bench-dist'),
      plate: fakePlate({ target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] }),
      drafters: { ollama: new FakeOllamaDrafter() },
    });

    const plateRes = await fetch(`${handle.url}/api/plate`);
    expect(plateRes.status).toBe(200);
    expect(await plateRes.json()).toEqual({
      target: 'http://localhost:4200',
      port: 4601,
      status: 'up',
      changes: [],
    });

    const state = await (await fetch(`${handle.url}/api/state`)).json();
    expect(state.wiring.proxy).toBe('wired');
  });
});

describe('bench serving', () => {
  it('reports not-built when no dist dir and no dev server were configured', async () => {
    const { benchServeMode } = await freshServer();
    expect(benchServeMode).toBe('not-built');
  });
});

describe('network binding', () => {
  it('binds loopback-only by default, not all interfaces', async () => {
    const { boundAddress } = await freshServer();
    // ::1 shows up on some CI/IPv6-preferring hosts; both are loopback, neither is
    // 0.0.0.0/:: (all interfaces). What matters is it never comes back as either wildcard.
    expect(['127.0.0.1', '::1']).toContain(boundAddress);
  });
});

describe('same-origin protection', () => {
  it('rejects a cross-origin POST /api/marks with 403 and creates no work order', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/marks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
      body: JSON.stringify({
        target: { path: 'body > invoice-list', component: 'InvoiceListComponent' },
        prompt: 'highlight the due date when overdue',
      }),
    });
    expect(res.status).toBe(403);

    const state = await (await fetch(`${url}/api/state`)).json();
    expect(state.workOrders).toEqual([]);
  });

  it('accepts a same-origin POST /api/marks (Origin matching the bench\'s own Host)', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/marks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: url },
      body: JSON.stringify({
        target: { path: 'body > invoice-list', component: 'InvoiceListComponent' },
        prompt: 'highlight the due date when overdue',
      }),
    });
    expect(res.status).toBe(201);
  });

  it('rejects a WS upgrade carrying a foreign Origin', async () => {
    const { url } = await freshServer();
    const ws = new WebSocket(url.replace('http', 'ws') + '/ws', { origin: 'http://evil.example' });
    const outcome = await new Promise<'open' | 'error-or-close'>((resolvePromise) => {
      ws.on('open', () => resolvePromise('open'));
      ws.on('error', () => resolvePromise('error-or-close'));
      ws.on('close', () => resolvePromise('error-or-close'));
    });
    expect(outcome).toBe('error-or-close');
  });

  it('accepts a WS upgrade with no Origin header (a non-browser client)', async () => {
    const { url } = await freshServer();
    const ws = new WebSocket(url.replace('http', 'ws') + '/ws');
    const outcome = await new Promise<'open' | 'error'>((resolvePromise) => {
      ws.on('open', () => resolvePromise('open'));
      ws.on('error', () => resolvePromise('error'));
    });
    expect(outcome).toBe('open');
    ws.close();
  });
});

interface StateMessage {
  type: string;
  state?: { workOrders: Array<{ id: string; state: string; log: Array<{ event: string }> }> };
}

/** Polls `/api/state` for `id` to leave `awayFrom` — used by seam-2's auto-draft tests
 * instead of a fixed sleep, the same style `orders/http.orders.test.ts`'s own `waitForState`
 * uses. `freshServer()` always injects a `FakeOllamaDrafter` (wave-3 council) now, so the
 * draft this waits on never touches a real model — polling still beats a fixed sleep (the
 * exact tick it lands on is never guaranteed), but the budget no longer needs to cover a
 * real cold-load. */
async function waitUntilOrderLeavesState(url: string, id: string, awayFrom: string, timeoutMs = 5_000): Promise<string> {
  const started = Date.now();
  for (;;) {
    const body = await (await fetch(`${url}/api/state`)).json();
    const wo = body.workOrders.find((w: { id: string }) => w.id === id);
    if (wo && wo.state !== awayFrom) return wo.state as string;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`work order ${id} never left state ${awayFrom}; last seen: ${wo?.state}`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('POST /api/marks', () => {
  it('creates a mark and a marked work order, then broadcasts state over WS for the mark and (seam 2) the auto-draft that follows', async () => {
    const { url } = await freshServer();

    const ws = new WebSocket(url.replace('http', 'ws') + '/ws');
    const messages: StateMessage[] = [];
    ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    // Wait a tick for the initial connection-state push.
    await new Promise((r) => setTimeout(r, 50));
    expect(messages).toHaveLength(1);

    const res = await fetch(`${url}/api/marks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        target: { path: 'body > invoice-list', component: 'InvoiceListComponent' },
        prompt: 'highlight the due date when overdue',
      }),
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.mark.id).toBe('m-0001');
    expect(created.workOrder.state).toBe('marked');

    // The immediate broadcast for the mark's own creation — asserted on CONTENT (the same
    // work order, freshly `marked`), not a fixed total message count. Seam 2 (jigbench
    // wave-3 integration) makes POST /api/marks kick off an auto-draft right after
    // responding, so — unlike before this integration — a second (drafted/draft-failed)
    // broadcast can legitimately arrive in the same window as this one, and the exact
    // total is no longer a stable thing to assert on.
    await new Promise((r) => setTimeout(r, 50));
    const markedBroadcast = messages.find((m) =>
      m.type === 'state' && m.state?.workOrders.some((w) => w.id === created.workOrder.id && w.state === 'marked'),
    );
    expect(markedBroadcast).toBeTruthy();

    // Seam 2 itself: the SAME order leaves `marked` without the bench ever calling
    // POST /api/work-orders/:id/draft — proof the auto-draft actually fired, over the same
    // WS channel the bench watches (not just a REST poll).
    await waitUntilOrderLeavesState(url, created.workOrder.id, 'marked');
    const nonMarkedBroadcast = messages.find((m) =>
      m.type === 'state' && m.state?.workOrders.some((w) => w.id === created.workOrder.id && w.state !== 'marked'),
    );
    expect(nonMarkedBroadcast).toBeTruthy();

    // Wave-3 council spy: the auto-draft answered from the INJECTED fake, never a real
    // Ollama — even one reachable on this very desk. `fakeOllama.calls` is the stand-in's
    // own record of every call it received; a log note naming its unmistakably-fake model
    // (never the real `qwen2.5-coder:7b` default) is the same proof, persisted on the order.
    expect(fakeOllama.calls).toEqual(expect.arrayContaining([{ kind: 'available' }, { kind: 'draft' }]));
    const state = await (await fetch(`${url}/api/state`)).json();
    const wo = state.workOrders.find((w: { id: string }) => w.id === created.workOrder.id);
    expect(wo.log.some((l: { note?: string }) => l.note?.includes(fakeOllama.model))).toBe(true);

    ws.close();
  });

  it('seam 2: does NOT auto-draft when the body carries draft:false — the order stays marked', async () => {
    const { url } = await freshServer();

    const res = await fetch(`${url}/api/marks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        target: { path: 'body > invoice-list', component: 'InvoiceListComponent' },
        prompt: 'highlight the due date when overdue',
        draft: false,
      }),
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.workOrder.state).toBe('marked');

    // Give a real auto-draft every chance to have fired if the `draft:false` opt-out were
    // ignored, then confirm it did not: no drafted/draft-failed log entry, still `marked`.
    await new Promise((r) => setTimeout(r, 300));
    const state = await (await fetch(`${url}/api/state`)).json();
    const wo = state.workOrders.find((w: { id: string }) => w.id === created.workOrder.id);
    expect(wo.state).toBe('marked');
    expect(wo.log.some((l: { event: string }) => l.event === 'drafted' || l.event === 'draft-failed' || l.event === 'queued-to-shop')).toBe(
      false,
    );
  });

  it('rejects a mark with no prompt', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/marks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: { path: 'x' }, prompt: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed target', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/marks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: { nope: true }, prompt: 'hello' }),
    });
    expect(res.status).toBe(400);
  });
});

// --- S7: fixtures wired end-to-end through the real server + a real plate proxy -----------
// F10: "the proxy serves fixture responses for /api/* when a fixture is loaded". This is the
// integration test named in the S7 brief — create -> load -> GET /api/plate shows it -> the
// interceptor wins over a FAKE upstream that would answer differently -> unload -> the
// upstream wins again.
describe('S7 fixtures — end to end through createJigServer + a real plate proxy', () => {
  let fakeUpstream: HttpServer | undefined;
  let plate: PlateProxyHandle | undefined;

  afterEach(async () => {
    if (plate) {
      await plate.close();
      plate = undefined;
    }
    if (fakeUpstream) {
      await new Promise<void>((resolve) => fakeUpstream!.close(() => resolve()));
      fakeUpstream = undefined;
    }
  });

  async function listen(server: HttpServer): Promise<number> {
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (typeof address !== 'object' || !address) throw new Error('no address');
    return address.port;
  }

  it('a loaded fixture answers /api/invoices through the plate proxy; unloading restores the real upstream', async () => {
    fakeUpstream = createHttpServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ source: 'real-upstream' }));
    });
    const upstreamPort = await listen(fakeUpstream);

    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-http-fixtures-'));
    const benchOrigin = 'http://localhost:4600';
    plate = createPlateProxy({ target: `http://localhost:${upstreamPort}`, benchOrigin, port: 0 });

    handle = await createJigServer({
      repoRoot,
      port: 0,
      openBrowser: false,
      benchDistDir: join(tmpdir(), 'jig-no-such-bench-dist'),
      plate,
      drafters: { ollama: new FakeOllamaDrafter() },
    });

    // Seed a real (non-stub) survey with one list endpoint, then reload so the running
    // store — and the fixture route's getSurvey() thunk — see it.
    const paths = jigPaths(repoRoot);
    await mkdir(paths.survey, { recursive: true });
    await writeFile(
      join(paths.survey, 'survey.json'),
      JSON.stringify({
        jigFormat: JIG_FORMAT,
        stack: ['dotnet'],
        components: [],
        routes: [],
        endpoints: [
          {
            method: 'GET',
            path: '/api/invoices',
            responseSchema: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, source: { type: 'string' } } } },
          },
        ],
        schemas: [],
        docs: [],
        generatedAt: new Date().toISOString(),
      }),
      'utf8',
    );
    await handle.store.reload();

    // Wait for the plate's real bind (createPlateProxy binds asynchronously — see proxy.test.ts).
    for (let i = 0; i < 50 && plate.port === 0; i++) await new Promise((r) => setImmediate(r));

    const createRes = await fetch(`${handle.url}/api/fixtures`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'overdue-heavy', seed: 1 }),
    });
    expect(createRes.status).toBe(201);

    const loadRes = await fetch(`${handle.url}/api/fixtures/overdue-heavy/load`, { method: 'POST' });
    expect(loadRes.status).toBe(200);

    const plateStatus = await (await fetch(`${handle.url}/api/plate`)).json();
    expect(plateStatus.fixture).toBe('overdue-heavy');

    const fixturedRes = await fetch(`${plate.url}api/invoices`);
    expect(fixturedRes.headers.get('x-jig-fixture')).toBe('overdue-heavy');
    const fixturedBody = await fixturedRes.json();
    expect(Array.isArray(fixturedBody)).toBe(true);
    expect(fixturedBody).toHaveLength(8);

    await fetch(`${handle.url}/api/fixtures/unload`, { method: 'POST' });

    const realRes = await fetch(`${plate.url}api/invoices`);
    expect(realRes.headers.get('x-jig-fixture')).toBeNull();
    expect(await realRes.json()).toEqual({ source: 'real-upstream' });
  });
});
