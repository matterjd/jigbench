import { createServer } from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { attachPlateRoute } from './route.js';
import type { PlateProxyHandle, PlateStatus } from './proxy.js';

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (close) {
    await close();
    close = undefined;
  }
});

function fakePlate(status: PlateStatus): PlateProxyHandle {
  return {
    url: `http://localhost:${status.port}/`,
    port: status.port,
    start: async (target: string) => {
      void target;
      return `http://localhost:${status.port}/`;
    },
    getStatus: async () => status,
    close: async () => {},
  };
}

async function serve(app: express.Express): Promise<string> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const url = typeof address === 'object' && address ? `http://localhost:${address.port}` : '';
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return url;
}

describe('attachPlateRoute', () => {
  it('reports the plate proxy status at GET /api/plate', async () => {
    const app = express();
    attachPlateRoute(app, fakePlate({ target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] }));
    const url = await serve(app);

    const res = await fetch(`${url}/api/plate`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      target: 'http://localhost:4200',
      port: 4601,
      status: 'up',
      changes: [],
    });
  });

  it('reports status "none" honestly when nothing is configured', async () => {
    const app = express();
    attachPlateRoute(app, fakePlate({ target: null, port: 4601, status: 'none', changes: [] }));
    const url = await serve(app);

    const res = await fetch(`${url}/api/plate`);
    expect((await res.json()).status).toBe('none');
  });
});
