import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import open from 'open';
import { MarkTargetSchema } from '@jigbench/core';
import { JigStore } from './store.js';
import { attachBenchServing, type BenchServeMode } from './bench-serve.js';
import { attachPlateRoute } from './plate/route.js';
import type { PlateProxyHandle } from './plate/proxy.js';
import { logger } from './logger.js';

export interface CreateJigServerOptions {
  repoRoot: string;
  port?: number;
  openBrowser?: boolean;
  /** Test/override hook — defaults to the sibling `packages/bench/dist`. */
  benchDistDir?: string;
  benchDevServerUrl?: string;
  /** S3's plate proxy, when the CLI has one running. Wires `GET /api/plate` and flips
   * `wiring.proxy` to `'wired'`. Absent (S1's default): neither happens. */
  plate?: PlateProxyHandle;
}

export interface JigServerHandle {
  url: string;
  port: number;
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

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, repoRoot: store.repoRoot });
  });

  app.get('/api/state', (_req, res) => {
    res.json(store.getState());
  });

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

  if (options.plate) attachPlateRoute(app, options.plate);

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
  const { repoRoot, port = 4600, openBrowser = false } = options;

  const store = new JigStore(repoRoot);
  await store.init();
  if (options.plate) store.setProxyWired(true);

  const wss = new WebSocketServer({ noServer: true });
  const { app, benchServeMode } = buildApp(store, wss, options);
  const httpServer: HttpServer = createHttpServer(app);

  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws') {
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

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  const address = httpServer.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const url = `http://localhost:${actualPort}`;

  logger.info('jig server listening', { url, repoRoot });

  if (openBrowser) {
    open(url).catch((err: unknown) => logger.warn('could not open the browser automatically', String(err)));
  }

  return {
    url,
    port: actualPort,
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
