import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createJigServer, type JigServerHandle } from './http.js';
import type { PlateProxyHandle, PlateStatus } from './plate/proxy.js';

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
    });
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
