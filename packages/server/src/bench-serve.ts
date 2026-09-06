import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Express } from 'express';
import { logger } from './logger.js';

export type BenchServeMode = 'static' | 'proxy' | 'not-built';

/** Pure decision: given whether a production bench build exists and whether a dev server
 * URL was configured, which serving mode applies. Production always wins when both are
 * somehow present, so a stale dev server never shadows a real build. */
export function chooseBenchServeMode(benchDistExists: boolean, hasDevServerUrl: boolean): BenchServeMode {
  if (benchDistExists) return 'static';
  if (hasDevServerUrl) return 'proxy';
  return 'not-built';
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function notBuiltHtml(): string {
  return `<!doctype html><html><body style="font-family: sans-serif; background:#0a0c0f; color:#e8e6e1; padding: 2rem;">
<h1>Jig bench — not wired</h1>
<p>The bench UI has not been built and no dev server is configured.</p>
<p>Run <code>npm run build --workspace=@jigbench/bench</code>, or <code>npm run dev</code> for a live dev server.</p>
</body></html>`;
}

/** A minimal same-origin reverse proxy to the bench's own Vite dev server — not the S3
 * target-app proxy (no HTML rewrite, no loupe injection, no WebSocket/HMR pass-through).
 * This exists only so `npm run dev` can, if wanted, reach the bench through jigbench's own
 * port; developers can otherwise open the Vite port directly for HMR. */
function proxyToDevServer(devServerUrl: string, req: IncomingMessage, res: ServerResponse): void {
  const target = new URL(req.url ?? '/', devServerUrl);
  const proxied = httpRequest(
    {
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxied.on('error', (err) => {
    logger.warn('bench dev-server proxy failed', String(err));
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('bench dev server unreachable');
  });
  req.pipe(proxied);
}

export interface AttachBenchOptions {
  benchDistDir: string;
  benchDevServerUrl?: string;
}

/** Resolves `reqPath` against `distRoot`, rejecting anything that would land outside it.
 * `req.path` is untrusted and Express does not collapse `..` segments before handing it to
 * middleware, so a raw `GET /../../../package.json` reaches here with the dots intact —
 * `join(distRoot, reqPath)` would then happily walk up out of the dist directory and read
 * whatever real file sits there. Percent-encoded traversal (`%2e%2e`, `..%2f`) is decoded
 * first so it can't dodge the same check; a malformed encoding is itself a rejection.
 * Returns null on any escape attempt or decode failure — the caller turns that into 403. */
function resolveWithinDist(distRoot: string, reqPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(reqPath);
  } catch {
    return null;
  }
  const candidate = resolve(distRoot, `.${decoded}`);
  if (candidate !== distRoot && !candidate.startsWith(distRoot + sep)) {
    return null;
  }
  return candidate;
}

/** Wires the bench-serving behaviour onto an Express app: static from `benchDistDir` in
 * production, proxied to `benchDevServerUrl` in dev, or an honest "not built" page. */
export function attachBenchServing(app: Express, options: AttachBenchOptions): BenchServeMode {
  const distRoot = resolve(options.benchDistDir);
  const benchDistExists = existsSync(join(distRoot, 'index.html'));
  const mode = chooseBenchServeMode(benchDistExists, Boolean(options.benchDevServerUrl));

  app.use(async (req, res, next) => {
    if (req.path.startsWith('/api')) return next();

    if (mode === 'static') {
      // A bench URL never legitimately contains a backslash. On win32, `path.resolve`/`join`
      // treat `\` exactly like `/`, so `resolveWithinDist`'s containment check catches a
      // `..\..\secret.txt` escape there — but on Linux a backslash is just an ordinary
      // filename character, the traversal never happens, and the SPA fallback answers 200
      // (no leak, but not the 4xx a Windows-shaped attack path should get everywhere). This
      // rejects the raw byte and its percent-encoded form (case-insensitively) up front, so
      // the same request is a 400 on every OS instead of depending on the host's own path
      // semantics to decide it.
      if (req.path.includes('\\') || /%5c/i.test(req.path)) {
        res.status(400).setHeader('content-type', 'text/plain; charset=utf-8');
        res.end('Bad Request');
        return;
      }
      const fallback = join(distRoot, 'index.html');
      const requested = req.path === '/' ? distRoot : resolveWithinDist(distRoot, req.path);
      if (requested === null) {
        res.status(403).setHeader('content-type', 'text/plain; charset=utf-8');
        res.end('Forbidden');
        return;
      }
      const filePath = req.path === '/' ? fallback : requested;
      const resolved = existsSync(filePath) ? filePath : fallback;
      try {
        const body = await readFile(resolved);
        res.setHeader('content-type', MIME[extname(resolved)] ?? 'application/octet-stream');
        res.end(body);
      } catch (err) {
        next(err);
      }
      return;
    }

    if (mode === 'proxy' && options.benchDevServerUrl) {
      proxyToDevServer(options.benchDevServerUrl, req, res);
      return;
    }

    res.status(200).setHeader('content-type', 'text/html; charset=utf-8');
    res.end(notBuiltHtml());
  });

  return mode;
}
