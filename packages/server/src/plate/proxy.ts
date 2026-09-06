import { createServer as createHttpServer, type IncomingMessage, type ServerResponse, type Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import httpProxy from 'http-proxy';
import type { PlateHost } from '../seams.js';
import { logger } from '../logger.js';
import { injectLoupeScript, rewriteHeaders, type PlateHeaderChange } from './rewrite.js';

/**
 * S3's `PlateHost` implementation (`docs/adr/002-proxy-injection-over-dev-server-plugin.md`):
 * a reverse proxy that listens on its OWN port, in front of the target app's dev server, so
 * the target's absolute URLs (`/main.js`, `/api/...`, `/ng-cli-ws`) resolve without any path
 * rewriting. The bench embeds this port as a cross-origin iframe.
 */

const LOUPE_ROUTE = '/__jig/loupe.js';
const DEFAULT_PORT = 4601;
const DEFAULT_HOST = '127.0.0.1';
const PROBE_TIMEOUT_MS = 2000;

export type PlateInterceptor = (
  req: IncomingMessage,
) => Response | undefined | Promise<Response | undefined>;

export interface PlateStatus {
  target: string | null;
  port: number;
  status: 'up' | 'down' | 'none';
  changes: PlateHeaderChange[];
}

export interface CreatePlateProxyOptions {
  /** The target app's dev server, e.g. `http://localhost:4200`. Undefined means "no target
   * set yet" — the plate says so in words rather than proxying or spinning. */
  target?: string;
  /** The bench's own origin (e.g. `http://localhost:4600`) — used for the CSP/X-Frame
   * rewrite and stamped onto the injected script tag so the loupe knows where to post. */
  benchOrigin: string;
  /** The plate's own listening port. Defaults to 4601. */
  port?: number;
  /** Interface to bind to. Defaults to loopback-only (`127.0.0.1`) — like the bench server,
   * the plate has no business being reachable from the LAN unless asked. Exposed here so
   * `--host` (the CLI's bench flag) can opt the plate into the same LAN exposure; nothing
   * sets it implicitly. */
  host?: string;
  /** Checked, in order, before every request is proxied. The first one to return a
   * `Response` answers the request directly and the target is never contacted — the seam S7
   * uses to answer `/api/*` from a fixture. Empty by default. */
  interceptors?: PlateInterceptor[];
}

export interface PlateProxyHandle extends PlateHost {
  readonly url: string;
  readonly port: number;
  /** The literal address the socket bound to (`httpServer.address().address`) — exposed so
   * tests can assert the loopback default without shelling out to `netstat` (mirrors
   * `JigServerHandle.boundAddress` in `http.ts`). */
  readonly boundAddress: string;
  /** Probes the current target (if any) and reports what the header/CSP rewrite would do —
   * and did, for the last successful probe. Never throws; an unreachable target is `'down'`,
   * not an error. */
  getStatus(): Promise<PlateStatus>;
  /** Registers one more interceptor after construction (S7). `createJigServer` needs a
   * `JigStore` before it can build the fixture interceptor, but the plate proxy is
   * constructed first (the CLI passes an already-running plate INTO `createJigServer`) — this
   * lets the caller add it once the store exists, rather than restructuring that ordering.
   * Optional so every pre-S7 `PlateProxyHandle` consumer/fake stays valid unchanged. */
  addInterceptor?(interceptor: PlateInterceptor): void;
  close(): Promise<void>;
}

let cachedLoupeScript: string | undefined;
function loupeScript(): string {
  if (cachedLoupeScript === undefined) {
    const file = fileURLToPath(new URL('./loupe.js', import.meta.url));
    cachedLoupeScript = readFileSync(file, 'utf8');
  }
  return cachedLoupeScript;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plainPage(title: string, bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>` +
    `<body style="font-family: system-ui, sans-serif; background:#0a0c0f; color:#e8e6e1; padding: 2rem; line-height: 1.5;">` +
    `<h1>${escapeHtml(title)}</h1>${bodyHtml}</body></html>`;
}

function noTargetPage(): string {
  return plainPage(
    'Jig plate — no target set',
    '<p>No target is set. Start <code>jigbench</code> with <code>--target &lt;url&gt;</code> pointing at your ' +
      "app's dev server, e.g. <code>--target http://localhost:4200</code>.</p>",
  );
}

function unreachablePage(target: string): string {
  return plainPage(
    'Jig plate — target unreachable',
    `<p>The app was not found at <code>${escapeHtml(target)}</code>.</p>` +
      '<p>Start it, then reload this page — the plate will pick it up. For the Ledger example: ' +
      '<code>cd examples/ledger-angular &amp;&amp; npx ng serve --port 4200</code> ' +
      '(and its API: <code>cd examples/ledger-api &amp;&amp; dotnet run</code>).</p>',
  );
}

async function sendFetchResponse(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const buf = Buffer.from(await response.arrayBuffer());
  headers['content-length'] = String(buf.byteLength);
  res.writeHead(response.status, headers);
  res.end(buf);
}

function decompress(buf: Buffer, encoding: string): Buffer | undefined {
  try {
    if (encoding === 'gzip') return gunzipSync(buf);
    if (encoding === 'br') return brotliDecompressSync(buf);
    if (encoding === 'deflate') return inflateSync(buf);
    return buf;
  } catch {
    return undefined;
  }
}

/** Creates and immediately starts the plate proxy. */
export function createPlateProxy(options: CreatePlateProxyOptions): PlateProxyHandle {
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? DEFAULT_HOST;
  const interceptors = options.interceptors ?? [];
  const benchOrigin = options.benchOrigin;
  let currentTarget = options.target;

  const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    secure: false,
    // We buffer and may rewrite every HTTP response ourselves (HTML injection, header
    // rewrite, content-length) — http-proxy must not also auto-pipe it.
    selfHandleResponse: true,
  });

  proxy.on('error', (err, _req, res) => {
    logger.warn('plate proxy error', String(err));
    if (res && 'writeHead' in res) {
      const serverRes = res as ServerResponse;
      if (!serverRes.headersSent) {
        serverRes.writeHead(502, { 'content-type': 'text/html; charset=utf-8' });
      }
      serverRes.end(unreachablePage(currentTarget ?? ''));
    } else if (res && 'destroy' in res) {
      (res as Duplex).destroy();
    }
  });

  proxy.on('proxyReq', (proxyReq) => {
    // We buffer and may rewrite the body (HTML injection), so ask for uncompressed bytes —
    // a dev server that ignores this is handled by the decompress() fallback below.
    proxyReq.setHeader('accept-encoding', 'identity');
  });

  proxy.on('proxyRes', (proxyRes, _req, res) => {
    const chunks: Buffer[] = [];
    proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
    proxyRes.on('end', () => {
      let body: Buffer<ArrayBufferLike> = Buffer.concat(chunks);
      const contentType = String(proxyRes.headers['content-type'] ?? '');
      const isHtml = contentType.includes('text/html');
      const encoding = String(proxyRes.headers['content-encoding'] ?? '').toLowerCase();

      const { headers, changes } = rewriteHeaders(proxyRes.headers, benchOrigin);
      lastChanges = changes;

      if (isHtml && encoding) {
        const decoded = decompress(body, encoding);
        if (decoded) {
          body = decoded;
          delete headers['content-encoding'];
        } else {
          logger.warn('plate: could not decompress an HTML response; passing it through unmodified', encoding);
        }
      }

      if (isHtml && (!encoding || headers['content-encoding'] === undefined)) {
        body = Buffer.from(injectLoupeScript(body.toString('utf8'), benchOrigin), 'utf8');
      }

      delete headers['transfer-encoding'];
      headers['content-length'] = String(body.byteLength);
      res.writeHead(proxyRes.statusCode ?? 200, headers);
      res.end(body);
    });
  });

  let lastChanges: PlateHeaderChange[] = [];

  const httpServer: HttpServer = createHttpServer((req, res) => {
    void handleRequest(req, res);
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    for (const interceptor of interceptors) {
      const result = await interceptor(req);
      if (result) {
        await sendFetchResponse(res, result);
        return;
      }
    }

    if (req.url === LOUPE_ROUTE) {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(loupeScript());
      return;
    }

    if (!currentTarget) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(noTargetPage());
      return;
    }

    proxy.web(req, res, { target: currentTarget });
  }

  const upgradedSockets = new Set<Duplex>();

  httpServer.on('upgrade', (req, socket, head) => {
    if (!currentTarget) {
      socket.destroy();
      return;
    }
    // Once upgraded, http-proxy pipes this socket directly to the target's socket —
    // node:http's own server no longer tracks it as an HTTP connection, so httpServer.close()
    // would otherwise hang forever waiting for a connection it doesn't know is still open.
    upgradedSockets.add(socket);
    socket.on('close', () => upgradedSockets.delete(socket));
    proxy.ws(req, socket, head, { target: currentTarget });
  });

  httpServer.listen(port, host);

  function actualPort(): number {
    const address = httpServer.address();
    return typeof address === 'object' && address ? address.port : port;
  }

  function actualBoundAddress(): string {
    const address = httpServer.address();
    return typeof address === 'object' && address ? address.address : host;
  }

  async function probe(target: string): Promise<{ up: boolean; changes: PlateHeaderChange[] }> {
    try {
      const res = await fetch(target, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      const { changes } = rewriteHeaders(headers, benchOrigin);
      return { up: true, changes };
    } catch {
      return { up: false, changes: [] };
    }
  }

  return {
    get url() {
      return `http://localhost:${actualPort()}/`;
    },
    get port() {
      return actualPort();
    },
    get boundAddress() {
      return actualBoundAddress();
    },
    async start(target: string): Promise<string> {
      currentTarget = target;
      return `http://localhost:${actualPort()}/`;
    },
    addInterceptor(interceptor: PlateInterceptor): void {
      interceptors.push(interceptor);
    },
    async getStatus(): Promise<PlateStatus> {
      if (!currentTarget) {
        return { target: null, port: actualPort(), status: 'none', changes: [] };
      }
      const { up, changes } = await probe(currentTarget);
      if (up) lastChanges = changes;
      return {
        target: currentTarget,
        port: actualPort(),
        status: up ? 'up' : 'down',
        changes: up ? changes : lastChanges,
      };
    },
    async close(): Promise<void> {
      for (const socket of upgradedSockets) socket.destroy();
      upgradedSockets.clear();
      proxy.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
