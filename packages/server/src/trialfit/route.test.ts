import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { attachTrialFitRoute } from './route.js';
import { TrialFitMirror } from './mirror.js';
import { SnapshotStore } from './snapshot.js';
import type { PlateProxyHandle, PlateStatus } from '../plate/proxy.js';

/**
 * S8's REST surface for the trial-fit mirror. Route-logic tests run directly against express
 * (same style `plate/route.test.ts` uses) rather than the full `createJigServer` stack — the
 * "default port = primary plate's port + 1" rule only needs to be observed as an ARGUMENT
 * `mirror.start()` receives, not proven by actually binding a second socket at an
 * OS-ephemeral-port-derived address (which risks colliding with some OTHER ephemeral socket
 * this same test run opened moments earlier — a real failure this file hit once during
 * authoring). One true end-to-end test at the bottom proves the mirror really proxies,
 * using an explicit port so its bind can never collide with anything.
 */

let close: (() => Promise<void>) | undefined;
let repoRoot: string | undefined;
let fakeUpstream: HttpServer | undefined;

afterEach(async () => {
  if (close) {
    await close();
    close = undefined;
  }
  if (repoRoot) {
    await rm(repoRoot, { recursive: true, force: true });
    repoRoot = undefined;
  }
  if (fakeUpstream) {
    await new Promise<void>((resolve) => fakeUpstream!.close(() => resolve()));
    fakeUpstream = undefined;
  }
});

function fakePlate(status: PlateStatus, port: number): PlateProxyHandle {
  return {
    url: `http://localhost:${port}/`,
    port,
    boundAddress: '127.0.0.1',
    start: async (target: string) => {
      void target;
      return `http://localhost:${port}/`;
    },
    getStatus: async () => status,
    close: async () => {},
  };
}

async function serve(app: express.Express): Promise<string> {
  const server = createHttpServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const url = typeof address === 'object' && address ? `http://localhost:${address.port}` : '';
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return url;
}

async function freshSnapshotStore(): Promise<SnapshotStore> {
  repoRoot = await mkdtemp(join(tmpdir(), 'jig-trialfit-route-'));
  const store = new SnapshotStore(repoRoot);
  await store.init();
  return store;
}

describe('POST /api/plate/mirror — routing logic', () => {
  it('defaults target to the primary plate\'s own target, and port to the primary plate\'s port + 1', async () => {
    const snapshotStore = await freshSnapshotStore();
    const primaryPlate = fakePlate({ target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] }, 4601);
    const mirror = { start: vi.fn().mockResolvedValue({ port: 4602 }) } as unknown as TrialFitMirror;

    const app = express();
    app.use(express.json());
    attachTrialFitRoute(app, { mirror, snapshotStore, primaryPlate });
    const url = await serve(app);

    const res = await fetch(`${url}/api/plate/mirror`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(mirror.start).toHaveBeenCalledWith('http://localhost:4200', 4602);
    expect(await res.json()).toEqual({ target: 'http://localhost:4200', port: 4602 });
  });

  it('an explicit target/port in the body overrides both defaults', async () => {
    const snapshotStore = await freshSnapshotStore();
    const primaryPlate = fakePlate({ target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] }, 4601);
    const mirror = { start: vi.fn().mockResolvedValue({ port: 9999 }) } as unknown as TrialFitMirror;

    const app = express();
    app.use(express.json());
    attachTrialFitRoute(app, { mirror, snapshotStore, primaryPlate });
    const url = await serve(app);

    await fetch(`${url}/api/plate/mirror`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'http://localhost:9000', port: 9999 }),
    });
    expect(mirror.start).toHaveBeenCalledWith('http://localhost:9000', 9999);
  });

  it('409s when there is no primary plate and no target was given', async () => {
    const snapshotStore = await freshSnapshotStore();
    const mirror = { start: vi.fn() } as unknown as TrialFitMirror;

    const app = express();
    app.use(express.json());
    attachTrialFitRoute(app, { mirror, snapshotStore });
    const url = await serve(app);

    const res = await fetch(`${url}/api/plate/mirror`, { method: 'POST' });
    expect(res.status).toBe(409);
    expect(mirror.start).not.toHaveBeenCalled();
  });

  it('with no primary plate, an explicit target still works (default port 4602)', async () => {
    const snapshotStore = await freshSnapshotStore();
    const mirror = { start: vi.fn().mockResolvedValue({ port: 4602 }) } as unknown as TrialFitMirror;

    const app = express();
    app.use(express.json());
    attachTrialFitRoute(app, { mirror, snapshotStore });
    const url = await serve(app);

    const res = await fetch(`${url}/api/plate/mirror`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'http://localhost:4200' }),
    });
    expect(res.status).toBe(200);
    expect(mirror.start).toHaveBeenCalledWith('http://localhost:4200', 4602);
  });
});

describe('POST /api/plate/mirror — a real mirror really proxies (explicit port, no collision risk)', () => {
  it('starts a real second proxy bound to 127.0.0.1 that answers real requests', async () => {
    fakeUpstream = createHttpServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('upstream');
    });
    await new Promise<void>((resolve) => fakeUpstream!.listen(0, resolve));
    const upstreamAddress = fakeUpstream.address();
    const upstreamPort = typeof upstreamAddress === 'object' && upstreamAddress ? upstreamAddress.port : 0;

    const snapshotStore = await freshSnapshotStore();
    const mirror = new TrialFitMirror('http://localhost:4600');

    const app = express();
    app.use(express.json());
    attachTrialFitRoute(app, { mirror, snapshotStore });
    const url = await serve(app);

    const res = await fetch(`${url}/api/plate/mirror`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: `http://127.0.0.1:${upstreamPort}`, port: 0 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.port).toBeGreaterThan(0);

    const proxied = await fetch(`http://127.0.0.1:${body.port}/`);
    expect(await proxied.text()).toBe('upstream');
    expect((proxied as Response).url).toContain('127.0.0.1');

    await mirror.close();
  });
});

describe('POST /api/plate/snapshot + GET /api/plate/snapshot/:id', () => {
  it('stores the html and serves it back as text/html', async () => {
    const snapshotStore = await freshSnapshotStore();
    const mirror = { start: vi.fn() } as unknown as TrialFitMirror;
    const app = express();
    app.use(express.json());
    attachTrialFitRoute(app, { mirror, snapshotStore });
    const url = await serve(app);

    const html = '<!doctype html><html><body>captured</body></html>';
    const saveRes = await fetch(`${url}/api/plate/snapshot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '0007', html }),
    });
    expect(saveRes.status).toBe(201);

    const getRes = await fetch(`${url}/api/plate/snapshot/0007`);
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get('content-type')).toMatch(/text\/html/);
    expect(await getRes.text()).toBe(html);
  });

  it('404s an id that was never saved', async () => {
    const snapshotStore = await freshSnapshotStore();
    const mirror = { start: vi.fn() } as unknown as TrialFitMirror;
    const app = express();
    app.use(express.json());
    attachTrialFitRoute(app, { mirror, snapshotStore });
    const url = await serve(app);

    const res = await fetch(`${url}/api/plate/snapshot/nope`);
    expect(res.status).toBe(404);
  });

  it('400s a save with no id or no html', async () => {
    const snapshotStore = await freshSnapshotStore();
    const mirror = { start: vi.fn() } as unknown as TrialFitMirror;
    const app = express();
    app.use(express.json());
    attachTrialFitRoute(app, { mirror, snapshotStore });
    const url = await serve(app);

    const res = await fetch(`${url}/api/plate/snapshot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '0007' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('same-origin gate covers the new trial-fit POSTs (via the real server, not the bare express app above)', () => {
  it('rejects POST /api/plate/mirror and POST /api/plate/snapshot from a foreign Origin with 403', async () => {
    const { createJigServer } = await import('../http.js');
    const root = await mkdtemp(join(tmpdir(), 'jig-trialfit-origin-'));
    const handle = await createJigServer({ repoRoot: root, port: 0, openBrowser: false, benchDistDir: join(tmpdir(), 'jig-no-such-bench-dist') });
    try {
      const mirrorRes = await fetch(`${handle.url}/api/plate/mirror`, { method: 'POST', headers: { origin: 'http://evil.example' } });
      expect(mirrorRes.status).toBe(403);

      const snapshotRes = await fetch(`${handle.url}/api/plate/snapshot`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
        body: JSON.stringify({ id: '0007', html: '<p>x</p>' }),
      });
      expect(snapshotRes.status).toBe(403);
    } finally {
      await handle.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
