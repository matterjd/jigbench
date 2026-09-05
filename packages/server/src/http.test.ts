import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createJigServer, type JigServerHandle } from './http.js';

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
