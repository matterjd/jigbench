import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { createPlateProxy, type CreatePlateProxyOptions, type PlateProxyHandle } from './proxy.js';

const BENCH_ORIGIN = 'http://localhost:4600';

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

/** `createPlateProxy` binds an explicit host (the loopback-only default, or whatever
 * `options.host` overrides it to) — unlike the old implicit "any interface" bind, that
 * routes through Node's `dns.lookup` internally even for an IP literal, so
 * `httpServer.address()` (and therefore `.url`/`.port`/`.boundAddress`) is not
 * synchronously populated the instant `createPlateProxy` returns. `getStatus()` is already
 * async for an unrelated reason (it probes the target), so awaiting it once here gives the
 * bind time to complete before a test reads `.url`/`.port`. */
async function readyPlate(options: CreatePlateProxyOptions): Promise<PlateProxyHandle> {
  const handle = createPlateProxy(options);
  // getStatus() alone isn't always enough: when there is no target (or an unreachable one
  // that fails near-instantly), its promise can resolve on a plain microtask — faster than
  // the threadpool round trip our own dns.lookup-driven bind needs. Poll for the real,
  // OS-assigned port (falls back to the *requested* `port: 0` until the bind completes) so
  // this is deterministic rather than racing two unrelated async operations against a hope.
  for (let attempt = 0; attempt < 50 && handle.port === 0; attempt++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  return handle;
}

describe('createPlateProxy — network binding', () => {
  it('binds loopback-only by default, not all interfaces', async () => {
    plate = createPlateProxy({ benchOrigin: BENCH_ORIGIN, port: 0 });
    // Force at least one tick so the underlying httpServer has finished its (async) bind —
    // mirrors http.test.ts's same-shaped assertion for the bench server.
    await plate.getStatus();
    expect(plate.boundAddress).toBe('127.0.0.1');
  });

  it('binds the given host when one is passed (parity with --host)', async () => {
    // '::1' rather than '0.0.0.0': both are a non-default host for this assertion's purposes,
    // and binding all-interfaces from inside a sandboxed test runner can wedge the process's
    // loopback routing for every test after it — '::1' is still loopback, just not the
    // default, so it proves the same parity point without that side effect.
    plate = createPlateProxy({ benchOrigin: BENCH_ORIGIN, port: 0, host: '::1' });
    await plate.getStatus();
    expect(plate.boundAddress).toBe('::1');
  });
});

describe('createPlateProxy — no target configured', () => {
  it('serves an honest "no target" page rather than proxying or spinning', async () => {
    plate = await readyPlate({ benchOrigin: BENCH_ORIGIN, port: 0 });
    const res = await fetch(plate.url);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body.toLowerCase()).toContain('no target');
    expect(body).not.toMatch(/spinner|loading/i);
  });

  it('reports status "none" with no changes', async () => {
    plate = await readyPlate({ benchOrigin: BENCH_ORIGIN, port: 0 });
    const status = await plate.getStatus();
    expect(status).toEqual({ target: null, port: plate.port, status: 'none', changes: [] });
  });

  it('still serves the loupe script even with no target', async () => {
    plate = await readyPlate({ benchOrigin: BENCH_ORIGIN, port: 0 });
    const res = await fetch(`${plate.url}__jig/loupe.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('jig');
  });
});

describe('createPlateProxy — target unreachable', () => {
  it('serves a plain page saying so, with the target URL and how to start it — never a spinner', async () => {
    plate = await readyPlate({ benchOrigin: BENCH_ORIGIN, target: 'http://localhost:1', port: 0 });
    const res = await fetch(plate.url);
    const body = await res.text();
    expect(body.toLowerCase()).toContain('unreachable');
    expect(body).toContain('http://localhost:1');
    expect(body).not.toMatch(/spinner|loading/i);
  });

  it('reports status "down"', async () => {
    plate = await readyPlate({ benchOrigin: BENCH_ORIGIN, target: 'http://localhost:1', port: 0 });
    const status = await plate.getStatus();
    expect(status.status).toBe('down');
    expect(status.target).toBe('http://localhost:1');
  });
});

describe('createPlateProxy — HTML injection', () => {
  it('injects the loupe script into a plain HTML response and fixes content-length', async () => {
    fakeUpstream = createHttpServer((_req, res) => {
      const body = '<html><head></head><body><p>hi</p></body></html>';
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
    });
    const port = await listen(fakeUpstream);
    plate = await readyPlate({ benchOrigin: BENCH_ORIGIN, target: `http://localhost:${port}`, port: 0 });

    const res = await fetch(plate.url);
    const body = await res.text();
    expect(body).toContain(`<script src="/__jig/loupe.js" data-jig-bench="${BENCH_ORIGIN}"></script>`);
    expect(Number(res.headers.get('content-length'))).toBe(Buffer.byteLength(body));
  });

  it('decompresses a gzip upstream response before injecting, and drops content-encoding', async () => {
    fakeUpstream = createHttpServer((_req, res) => {
      const raw = '<html><body><p>gzipped</p></body></html>';
      const gz = gzipSync(Buffer.from(raw, 'utf8'));
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-encoding': 'gzip',
      });
      res.end(gz);
    });
    const port = await listen(fakeUpstream);
    plate = await readyPlate({ benchOrigin: BENCH_ORIGIN, target: `http://localhost:${port}`, port: 0 });

    const res = await fetch(plate.url);
    expect(res.headers.get('content-encoding')).toBeNull();
    const body = await res.text();
    expect(body).toContain('<p>gzipped</p>');
    expect(body).toContain('/__jig/loupe.js');
  });

  it('leaves non-HTML responses byte-for-byte unmodified', async () => {
    fakeUpstream = createHttpServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    const port = await listen(fakeUpstream);
    plate = await readyPlate({ benchOrigin: BENCH_ORIGIN, target: `http://localhost:${port}`, port: 0 });

    const res = await fetch(`${plate.url}api/thing`);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('requests upstream with accept-encoding: identity', async () => {
    let seenAcceptEncoding = '';
    fakeUpstream = createHttpServer((req, res) => {
      seenAcceptEncoding = String(req.headers['accept-encoding'] ?? '');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body></body></html>');
    });
    const port = await listen(fakeUpstream);
    plate = await readyPlate({ benchOrigin: BENCH_ORIGIN, target: `http://localhost:${port}`, port: 0 });
    await fetch(plate.url);
    expect(seenAcceptEncoding).toBe('identity');
  });
});

describe('createPlateProxy — header handling reports itself', () => {
  it('removes x-frame-options on the live proxied response and reports the change via getStatus', async () => {
    fakeUpstream = createHttpServer((_req, res) => {
      res.writeHead(200, {
        'content-type': 'text/html',
        'x-frame-options': 'DENY',
      });
      res.end('<html><body></body></html>');
    });
    const port = await listen(fakeUpstream);
    plate = await readyPlate({ benchOrigin: BENCH_ORIGIN, target: `http://localhost:${port}`, port: 0 });

    const res = await fetch(plate.url);
    expect(res.headers.get('x-frame-options')).toBeNull();

    const status = await plate.getStatus();
    expect(status.status).toBe('up');
    expect(status.changes.some((c) => c.header === 'x-frame-options')).toBe(true);
  });
});

describe('createPlateProxy — interceptor seam', () => {
  it('lets an interceptor short-circuit the proxy entirely', async () => {
    fakeUpstream = createHttpServer((_req, res) => {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('should never be reached');
    });
    const port = await listen(fakeUpstream);
    plate = await readyPlate({
      benchOrigin: BENCH_ORIGIN,
      target: `http://localhost:${port}`,
      port: 0,
      interceptors: [
        (req) => {
          if (new URL(req.url ?? '/', 'http://x').pathname === '/api/fixture') {
            return new Response(JSON.stringify({ fixture: true }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          return undefined;
        },
      ],
    });

    const res = await fetch(`${plate.url}api/fixture`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fixture: true });
  });

  it('falls through to the real proxy when every interceptor declines', async () => {
    fakeUpstream = createHttpServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('upstream body');
    });
    const port = await listen(fakeUpstream);
    plate = await readyPlate({
      benchOrigin: BENCH_ORIGIN,
      target: `http://localhost:${port}`,
      port: 0,
      interceptors: [() => undefined],
    });

    const res = await fetch(plate.url);
    expect(await res.text()).toBe('upstream body');
  });
});

describe('createPlateProxy.start()', () => {
  it('implements PlateHost.start by (re)pointing the proxy and returning the plate URL', async () => {
    fakeUpstream = createHttpServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body>a</body></html>');
    });
    const port = await listen(fakeUpstream);
    plate = await readyPlate({ benchOrigin: BENCH_ORIGIN, port: 0 });

    const before = await plate.getStatus();
    expect(before.status).toBe('none');

    const url = await plate.start(`http://localhost:${port}`);
    expect(url).toBe(plate.url);

    const after = await plate.getStatus();
    expect(after.status).toBe('up');
  });
});
