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

  // S7: F10 wants GET /api/plate to show "fixture: <name>|null" once a fixture can be
  // loaded. With no getter supplied (every pre-S7 call site, and both tests above), the
  // field is omitted entirely rather than sent as a literal null — this is what keeps the
  // two tests above passing unchanged (an omitted key satisfies their exact `toEqual`).
  it('has no "fixture" key at all when no getActiveFixture is supplied', async () => {
    const app = express();
    attachPlateRoute(app, fakePlate({ target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] }));
    const url = await serve(app);

    const res = await fetch(`${url}/api/plate`);
    expect(Object.keys(await res.json())).not.toContain('fixture');
  });

  it('reports the active fixture\'s name when a getActiveFixture getter is supplied', async () => {
    const app = express();
    attachPlateRoute(
      app,
      fakePlate({ target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] }),
      () => 'overdue-heavy',
    );
    const url = await serve(app);

    const res = await fetch(`${url}/api/plate`);
    expect((await res.json()).fixture).toBe('overdue-heavy');
  });

  it('omits the "fixture" key when the getter reports none loaded (never a literal null)', async () => {
    const app = express();
    attachPlateRoute(
      app,
      fakePlate({ target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] }),
      () => null,
    );
    const url = await serve(app);

    const res = await fetch(`${url}/api/plate`);
    expect(Object.keys(await res.json())).not.toContain('fixture');
  });
});
