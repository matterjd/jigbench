import { describe, expect, it, afterEach, afterAll, beforeAll } from 'vitest';
import express from 'express';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachBenchServing, chooseBenchServeMode } from './bench-serve.js';

describe('chooseBenchServeMode', () => {
  it('prefers a production build when one exists', () => {
    expect(chooseBenchServeMode(true, true)).toBe('static');
    expect(chooseBenchServeMode(true, false)).toBe('static');
  });

  it('falls back to the dev-server proxy when no build exists but one is configured', () => {
    expect(chooseBenchServeMode(false, true)).toBe('proxy');
  });

  it('is honest that nothing is wired when neither exists', () => {
    expect(chooseBenchServeMode(false, false)).toBe('not-built');
  });
});

describe('attachBenchServing', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  async function listen(app: express.Express): Promise<number> {
    server = createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port assigned');
    return address.port;
  }

  it('serves an honest "not built" page when no dist and no dev server exist', async () => {
    const app = express();
    const mode = attachBenchServing(app, { benchDistDir: join(tmpdir(), 'jig-no-such-dist-dir') });
    expect(mode).toBe('not-built');

    const port = await listen(app);
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain('not wired');
  });

  it('serves the real index.html when a production build exists', async () => {
    const distDir = await mkdtemp(join(tmpdir(), 'jig-bench-dist-'));
    await writeFile(join(distDir, 'index.html'), '<!doctype html><title>jig bench</title>', 'utf8');

    const app = express();
    const mode = attachBenchServing(app, { benchDistDir: distDir });
    expect(mode).toBe('static');

    const port = await listen(app);
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const text = await res.text();
    expect(text).toContain('jig bench');
  });

  it('never intercepts /api routes', async () => {
    const app = express();
    attachBenchServing(app, { benchDistDir: join(tmpdir(), 'jig-no-such-dist-dir-2') });
    app.get('/api/ping', (_req, res) => res.json({ pong: true }));

    const port = await listen(app);
    const res = await fetch(`http://127.0.0.1:${port}/api/ping`);
    expect(await res.json()).toEqual({ pong: true });
  });

  describe('path traversal', () => {
    // A file OUTSIDE the served dist dir, in its parent — every attack below targets it by
    // path. If any of them leak SECRET, the containment check is broken.
    // Runs its own server, independent of the outer `server`/`afterEach` pair above (that
    // pair closes after every test, which would kill a server shared across an `it.each`).
    let ownServer: Server;
    let port: number;

    beforeAll(async () => {
      const parentDir = await mkdtemp(join(tmpdir(), 'jig-traversal-parent-'));
      const distDir = join(parentDir, 'dist');
      await mkdir(distDir);
      await writeFile(join(parentDir, 'secret.txt'), 'SECRET', 'utf8');
      await writeFile(join(distDir, 'index.html'), '<!doctype html><title>jig bench</title>', 'utf8');

      const app = express();
      attachBenchServing(app, { benchDistDir: distDir });
      ownServer = createServer(app);
      await new Promise<void>((resolveListen) => ownServer.listen(0, resolveListen));
      const address = ownServer.address();
      if (!address || typeof address === 'string') throw new Error('no port assigned');
      port = address.port;
    });

    afterAll(async () => {
      await new Promise<void>((resolveClose) => ownServer.close(() => resolveClose()));
    });

    /** `fetch`/undici parse the URL through the WHATWG URL parser, which collapses `..`
     * segments client-side before the request is ever sent — so a fetch-based test would
     * exercise the CLIENT's normalization, not the server's containment check, and would
     * pass even against the original vulnerable code. `node:http`'s low-level `request()`
     * writes `path` onto the request line verbatim, which is what a raw attacker request
     * (and the PoC that found this bug) actually looks like on the wire. */
    function rawGet(path: string): Promise<{ status: number; body: string }> {
      return new Promise((resolveReq, rejectReq) => {
        const req = httpRequest({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () =>
            resolveReq({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
          );
        });
        req.on('error', rejectReq);
        req.end();
      });
    }

    it.each([
      ['raw dot-segments', '/../secret.txt'],
      ['percent-encoded slash', '/..%2fsecret.txt'],
      ['percent-encoded dots', '/%2e%2e/secret.txt'],
      // Windows accepts `\` as a path separator too, and `path.join`/`path.resolve` treat
      // it identically to `/` on win32 — the ORIGINAL `join()` code escaped this one all the
      // way to the drive root (`C:\secret.txt`, two levels above the dist dir's parent).
      ['backslash dot-segments (Windows separator)', '/..\\..\\secret.txt'],
    ])('rejects %s (%s) with 4xx and no leaked content', async (_label, path) => {
      const { status, body } = await rawGet(path);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
      expect(body).not.toContain('SECRET');
    });

    it('still serves the real index.html for a plain request', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('jig bench');
    });
  });
});
