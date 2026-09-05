import { createServer as createHttpServer, type IncomingMessage, type Server as HttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import open from 'open';
import { MarkTargetSchema } from '@jigbench/core';
import { JigStore } from './store.js';
import { attachBenchServing, type BenchServeMode } from './bench-serve.js';
import { createDocsRoute } from './docs/route.js';
import { logger } from './logger.js';

export interface CreateJigServerOptions {
  repoRoot: string;
  port?: number;
  /** Interface to bind to. Defaults to loopback-only — the bench is a local dev tool and
   * has no business being reachable from the LAN. */
  host?: string;
  openBrowser?: boolean;
  /** Test/override hook — defaults to the sibling `packages/bench/dist`. */
  benchDistDir?: string;
  benchDevServerUrl?: string;
}

/** True when `origin` is absent (a non-browser client — curl, an MCP client, the CLI itself
 * — never sends one) or matches `host` (the request's own `Host` header) exactly. Browsers
 * always send `Origin` on a cross-origin fetch/XHR and on same-origin state-changing
 * requests too, so comparing it against the request's own Host is a same-origin check that
 * needs no hardcoded port — it works whether the bench is on its configured port or, in
 * tests, an OS-assigned one. A request from any other page's Origin fails this regardless
 * of which interface the server is bound to. */
export function isSameOriginOrAbsent(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export interface JigServerHandle {
  url: string;
  port: number;
  /** The literal address the socket bound to (`httpServer.address().address`) — exposed so
   * tests can assert the loopback default without shelling out to `netstat`. */
  boundAddress: string;
  store: JigStore;
  benchServeMode: BenchServeMode;
  close(): Promise<void>;
}

function defaultBenchDistDir(): string {
  // packages/server/src/http.ts (or dist/http.js, same relative depth) -> packages/bench/dist
  return fileURLToPath(new URL('../../bench/dist', import.meta.url));
}

function broadcastState(wss: WebSocketServer, store: JigStore): void {
  const payload = JSON.stringify({ type: 'state', state: store.getState() });
  for (const client of wss.clients as Set<WebSocket>) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

function buildApp(
  store: JigStore,
  wss: WebSocketServer,
  options: CreateJigServerOptions,
): { app: Express; benchServeMode: BenchServeMode } {
  const app = express();
  app.use(express.json());

  // Same-origin gate on every mutating /api/* request. GET is exempt (it has no side
  // effect to forge); anything else — today just POST /api/marks, but the rule is written
  // for whatever comes next — must either carry no Origin (a non-browser client) or an
  // Origin that matches this request's own Host. No CORS headers are ever sent alongside
  // this: the bench is same-origin only, never a cross-origin API.
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    if (!isSameOriginOrAbsent(req.headers.origin, req.headers.host)) {
      res.status(403).json({ error: 'cross-origin request rejected' });
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, repoRoot: store.repoRoot });
  });

  app.get('/api/state', (_req, res) => {
    res.json(store.getState());
  });

  app.get('/api/docs', createDocsRoute(store.repoRoot)); // S2b — see docs/route.ts

  app.post('/api/marks', async (req, res, next) => {
    try {
      const target = MarkTargetSchema.parse(req.body?.target);
      const prompt = String(req.body?.prompt ?? '');
      if (!prompt.trim()) {
        res.status(400).json({ error: 'prompt is required' });
        return;
      }
      const created = await store.createMarkAndWorkOrder({ target, prompt });
      broadcastState(wss, store);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  const benchServeMode = attachBenchServing(app, {
    benchDistDir: options.benchDistDir ?? defaultBenchDistDir(),
    benchDevServerUrl: options.benchDevServerUrl,
  });

  // Keep API errors JSON — this is a local tool, not a public API, so the message itself is
  // fine to return; it is never a stack trace, never a secret.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('request failed', message);
    res.status(400).json({ error: message });
  });

  return { app, benchServeMode };
}

export async function createJigServer(options: CreateJigServerOptions): Promise<JigServerHandle> {
  const { repoRoot, port = 4600, host = '127.0.0.1', openBrowser = false } = options;

  const store = new JigStore(repoRoot);
  await store.init();

  const wss = new WebSocketServer({ noServer: true });
  const { app, benchServeMode } = buildApp(store, wss, options);
  const httpServer: HttpServer = createHttpServer(app);

  httpServer.on('upgrade', (req: IncomingMessage, socket, head) => {
    if (req.url !== '/ws') {
      socket.destroy();
      return;
    }
    if (!isSameOriginOrAbsent(req.headers.origin, req.headers.host)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    ws.send(JSON.stringify({ type: 'state', state: store.getState() }));
  });

  await new Promise<void>((resolve) => httpServer.listen(port, host, resolve));
  const address = httpServer.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const boundAddress = typeof address === 'object' && address ? address.address : host;
  const url = `http://localhost:${actualPort}`;

  logger.info('jig server listening', { url, repoRoot });

  if (openBrowser) {
    open(url).catch((err: unknown) => logger.warn('could not open the browser automatically', String(err)));
  }

  return {
    url,
    port: actualPort,
    boundAddress,
    store,
    benchServeMode,
    async close() {
      // wss was created with { noServer: true }, so close() alone won't drop connected
      // clients — terminate them explicitly or httpServer.close()'s callback never fires.
      for (const client of wss.clients as Set<WebSocket>) client.terminate();
      wss.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
