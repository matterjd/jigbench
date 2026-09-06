import { afterEach, describe, expect, it } from 'vitest';
import { TrialFitMirror } from './mirror.js';
import type { PlateProxyHandle } from '../plate/proxy.js';

/**
 * S8 (CHASSIS.md's trial-fit mode / F11): a second `PlateProxyHandle` for the mirror's right
 * ("after") plate, pointed at the same target the primary plate already clamps. Uses the
 * same polling pattern `plate/proxy.test.ts`'s `readyPlate()` does — `createPlateProxy`'s
 * bind is not synchronously reflected in `.port` the instant it returns.
 */

const BENCH_ORIGIN = 'http://localhost:4600';

let mirror: TrialFitMirror | undefined;

afterEach(async () => {
  if (mirror) {
    await mirror.close();
    mirror = undefined;
  }
});

async function readyHandle(handle: PlateProxyHandle): Promise<PlateProxyHandle> {
  for (let attempt = 0; attempt < 50 && handle.port === 0; attempt++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  return handle;
}

describe('TrialFitMirror — not started', () => {
  it('reports no status before start() is ever called', async () => {
    mirror = new TrialFitMirror(BENCH_ORIGIN);
    expect(await mirror.getStatus()).toBeNull();
  });
});

describe('TrialFitMirror — start', () => {
  it('starts a second plate proxy bound to 127.0.0.1 on the requested port', async () => {
    mirror = new TrialFitMirror(BENCH_ORIGIN);
    const handle = await readyHandle(await mirror.start('http://localhost:1', 0));
    expect(handle.boundAddress).toBe('127.0.0.1');
    expect(handle.port).toBeGreaterThan(0);
  });

  it('getStatus reports the port and reachability once started', async () => {
    mirror = new TrialFitMirror(BENCH_ORIGIN);
    await readyHandle(await mirror.start('http://localhost:1', 0));
    const status = await mirror.getStatus();
    expect(status?.port).toBeGreaterThan(0);
    expect(status?.status).toBe('down'); // localhost:1 never answers
  });

  it('is idempotent: calling start() again while already running repoints the SAME proxy rather than opening a new one', async () => {
    mirror = new TrialFitMirror(BENCH_ORIGIN);
    const first = await readyHandle(await mirror.start('http://localhost:1', 0));
    const firstPort = first.port;

    const second = await mirror.start('http://localhost:2', firstPort);
    expect(second.port).toBe(firstPort);
    expect(second).toBe(first);
  });

  it('close() tears the proxy down and getStatus() goes back to null', async () => {
    mirror = new TrialFitMirror(BENCH_ORIGIN);
    await readyHandle(await mirror.start('http://localhost:1', 0));
    await mirror.close();
    expect(await mirror.getStatus()).toBeNull();
  });

  it('the mirror actually proxies HTTP requests once pointed at a real upstream', async () => {
    const { createServer } = await import('node:http');
    const upstream = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('hello from upstream');
    });
    await new Promise<void>((resolve) => upstream.listen(0, resolve));
    const address = upstream.address();
    const upstreamPort = typeof address === 'object' && address ? address.port : 0;

    try {
      mirror = new TrialFitMirror(BENCH_ORIGIN);
      const handle = await readyHandle(await mirror.start(`http://127.0.0.1:${upstreamPort}`, 0));
      const res = await fetch(`http://127.0.0.1:${handle.port}/`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('hello from upstream');
    } finally {
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });
});
