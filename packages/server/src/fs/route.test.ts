import { afterEach, describe, expect, it } from 'vitest';
import express, { type Express } from 'express';
import { createServer as createHttpServer, request as httpRequest, type Server as HttpServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachFsRoute } from './route.js';

let server: HttpServer | undefined;
let url = '';
let dirs: string[] = [];

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs = [];
});

/** `fetch` silently drops a caller-set `Host` (a forbidden header name in the Fetch spec), so
 * the #18 rebinding tests speak raw `node:http`, which sends whatever Host it is given. */
function rawGet(target: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(target, { method: 'GET', headers }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function boot(options: { host?: string } = {}): Promise<{ app: Express; url: string }> {
  const app = express();
  attachFsRoute(app, options);
  server = createHttpServer(app);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  url = `http://127.0.0.1:${port}`;
  return { app, url };
}

async function freshDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'jig-fsroute-'));
  dirs.push(d);
  return d;
}

describe('GET /api/fs/roots', () => {
  it('reports at least one root that really exists on this machine', async () => {
    const { url } = await boot();
    const res = await fetch(`${url}/api/fs/roots`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.roots)).toBe(true);
    expect(body.roots.length).toBeGreaterThan(0);
    for (const root of body.roots) {
      expect(typeof root.name).toBe('string');
      expect(typeof root.path).toBe('string');
    }
  });

  it('refuses a cross-origin request even though it is a GET', async () => {
    const { url } = await boot();
    const res = await fetch(`${url}/api/fs/roots`, { headers: { origin: 'http://evil.example' } });
    expect(res.status).toBe(403);
  });

  it("#18: refuses a request whose Host is not the bench's own address (DNS rebinding) — even with no Origin at all", async () => {
    const { url } = await boot();
    const port = new URL(url).port;
    const res = await rawGet(`${url}/api/fs/roots`, { host: `attacker.example:${port}` });
    expect(res.status).toBe(403);
    expect(res.body).not.toContain('"roots"');
  });

  it('#18: answers to the explicit host the server was bound to, and to loopback either way', async () => {
    const { url } = await boot({ host: '192.168.1.5' });
    const port = new URL(url).port;
    expect((await rawGet(`${url}/api/fs/roots`, { host: `192.168.1.5:${port}` })).status).toBe(200);
    expect((await rawGet(`${url}/api/fs/roots`, { host: `localhost:${port}` })).status).toBe(200);
    expect((await rawGet(`${url}/api/fs/roots`, { host: `attacker.example:${port}` })).status).toBe(403);
  });
});

describe('GET /api/fs/list', () => {
  it('lists only directories, with hints and hidden/node_modules/.git filtered out', async () => {
    const repoRoot = await freshDir();
    await mkdir(join(repoRoot, 'my-app'), { recursive: true });
    await writeFile(join(repoRoot, 'my-app', 'package.json'), '{}', 'utf8');
    await mkdir(join(repoRoot, 'my-app', '.git'), { recursive: true });
    await mkdir(join(repoRoot, 'my-app', 'docs'), { recursive: true });
    await mkdir(join(repoRoot, 'node_modules'), { recursive: true });
    await mkdir(join(repoRoot, '.hidden'), { recursive: true });
    await writeFile(join(repoRoot, 'a-file.txt'), 'nope', 'utf8'); // not a directory — excluded

    const { url } = await boot();
    const res = await fetch(`${url}/api/fs/list?path=${encodeURIComponent(repoRoot)}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    const names = body.entries.map((e: { name: string }) => e.name).sort();
    expect(names).toEqual(['my-app']); // node_modules, .hidden, a-file.txt all excluded

    const myApp = body.entries.find((e: { name: string }) => e.name === 'my-app');
    expect(myApp.hasGit).toBe(true);
    expect(myApp.hasPackageJson).toBe(true);
    expect(myApp.hasAngularJson).toBe(false);
    expect(myApp.hasCsproj).toBe(false);
    expect(myApp.hasDocs).toBe(true);
  });

  it('never returns file contents — only directory metadata', async () => {
    const repoRoot = await freshDir();
    await writeFile(join(repoRoot, 'secret.txt'), 'do not leak this', 'utf8');
    const { url } = await boot();
    const res = await fetch(`${url}/api/fs/list?path=${encodeURIComponent(repoRoot)}`);
    const text = await res.text();
    expect(text).not.toContain('do not leak this');
  });

  it('returns a parent link computed by the API itself, and following it lists the parent', async () => {
    const repoRoot = await freshDir();
    const child = join(repoRoot, 'child');
    await mkdir(child, { recursive: true });

    const { url } = await boot();
    const childRes = await fetch(`${url}/api/fs/list?path=${encodeURIComponent(child)}`);
    const childBody = await childRes.json();
    expect(typeof childBody.parent).toBe('string');

    const parentRes = await fetch(`${url}/api/fs/list?path=${encodeURIComponent(childBody.parent)}`);
    expect(parentRes.status).toBe(200);
    const parentBody = await parentRes.json();
    expect(parentBody.entries.some((e: { name: string }) => e.name === 'child')).toBe(true);
  });

  it('normalises a path containing ".." segments to the real directory rather than erroring or leaking a raw string', async () => {
    const repoRoot = await freshDir();
    const child = join(repoRoot, 'child');
    await mkdir(child, { recursive: true });
    const traversal = join(child, '..'); // resolves back to repoRoot

    const { url } = await boot();
    const res = await fetch(`${url}/api/fs/list?path=${encodeURIComponent(traversal)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.some((e: { name: string }) => e.name === 'child')).toBe(true);
  });

  it('400s with an honest message on a path that does not exist', async () => {
    const { url } = await boot();
    const res = await fetch(`${url}/api/fs/list?path=${encodeURIComponent(join(tmpdir(), 'jig-does-not-exist-xyz'))}`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
  });

  it('400s on a path that is a file, not a directory', async () => {
    const repoRoot = await freshDir();
    const file = join(repoRoot, 'im-a-file.txt');
    await writeFile(file, 'x', 'utf8');
    const { url } = await boot();
    const res = await fetch(`${url}/api/fs/list?path=${encodeURIComponent(file)}`);
    expect(res.status).toBe(400);
  });

  it('400s when no path is given at all', async () => {
    const { url } = await boot();
    const res = await fetch(`${url}/api/fs/list`);
    expect(res.status).toBe(400);
  });

  it('refuses a cross-origin request even though it is a GET', async () => {
    const repoRoot = await freshDir();
    const { url } = await boot();
    const res = await fetch(`${url}/api/fs/list?path=${encodeURIComponent(repoRoot)}`, {
      headers: { origin: 'http://evil.example' },
    });
    expect(res.status).toBe(403);
  });

  it('#18: 400s a UNC path in either spelling without touching it — Windows would open an SMB connection to the named host', async () => {
    const { url } = await boot();
    for (const unc of ['\\\\evil.example\\share', '//evil.example/share']) {
      const res = await fetch(`${url}/api/fs/list?path=${encodeURIComponent(unc)}`);
      expect(res.status, unc).toBe(400);
      expect((await res.json()).error).toMatch(/UNC/);
    }
  });

  it("#18: refuses a listing whose Host is not the bench's own address (DNS rebinding), with no Origin at all", async () => {
    const repoRoot = await freshDir();
    const { url } = await boot();
    const port = new URL(url).port;
    const res = await rawGet(`${url}/api/fs/list?path=${encodeURIComponent(repoRoot)}`, { host: `attacker.example:${port}` });
    expect(res.status).toBe(403);
    expect(res.body).not.toContain('"entries"');
  });
});
