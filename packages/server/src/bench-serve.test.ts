import { describe, expect, it, afterEach } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
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
});
