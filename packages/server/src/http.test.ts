import { afterEach, describe, expect, it } from 'vitest';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { JIG_FORMAT, jigPaths } from '@jigbench/core';
import { createJigServer, type JigServerHandle } from './http.js';
import { createPlateProxy, type PlateProxyHandle, type PlateStatus } from './plate/proxy.js';

let handle: JigServerHandle | undefined;

afterEach(async () => {
  if (handle) {
    await handle.close();
    handle = undefined;
  }
});

async function freshServer(): Promise<JigServerHandle> {
  const repoRoot = await mkdtemp(join(tmpdir(), 'jig-http-'));
  handle = await createJigServer({
    repoRoot,
    port: 0,
    openBrowser: false,
    benchDistDir: join(tmpdir(), 'jig-no-such-bench-dist'),
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

describe('POST /api/marks', () => {
  it('creates a mark and a marked work order, then broadcasts the new state over WS', async () => {
    const { url } = await freshServer();

    const ws = new WebSocket(url.replace('http', 'ws') + '/ws');
    const messages: unknown[] = [];
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

    await new Promise((r) => setTimeout(r, 50));
    expect(messages).toHaveLength(2);
    const last = messages[1] as { type: string; state: { workOrders: unknown[] } };
    expect(last.type).toBe('state');
    expect(last.state.workOrders).toHaveLength(1);

    ws.close();
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
