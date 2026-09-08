import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { createPlateProxy, type PlateProxyHandle } from './proxy.js';

const BENCH_ORIGIN = 'http://localhost:4600';

let fakeUpstream: HttpServer | undefined;
let wss: WebSocketServer | undefined;
let plate: PlateProxyHandle | undefined;

afterEach(async () => {
  if (plate) {
    await plate.close();
    plate = undefined;
  }
  if (wss) {
    for (const client of wss.clients) client.terminate();
    wss.close();
    wss = undefined;
  }
  if (fakeUpstream) {
    await new Promise<void>((resolve) => fakeUpstream!.close(() => resolve()));
    fakeUpstream = undefined;
  }
});

async function listen(server: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (typeof address !== 'object' || !address) throw new Error('no address');
  return address.port;
}

describe('createPlateProxy — WebSocket pass-through (HMR / ng-cli-ws)', () => {
  it('proxies an upgrade request through to the target and relays messages both ways', async () => {
    fakeUpstream = createHttpServer();
    const port = await listen(fakeUpstream);
    wss = new WebSocketServer({ server: fakeUpstream, path: '/ng-cli-ws' });

    wss.on('connection', (ws) => {
      ws.on('message', (data) => ws.send(`echo:${data.toString()}`));
      ws.send('hello-from-upstream');
    });

    plate = createPlateProxy({ benchOrigin: BENCH_ORIGIN, target: `http://localhost:${port}`, port: 0 });
    // Binding to an explicit host (the loopback-default fix) routes through Node's
    // dns.lookup internally, even for an IP literal — unlike the old implicit "any
    // interface" bind, `httpServer.address()` is not synchronously populated the instant
    // `createPlateProxy` returns. `getStatus()` is already async for an unrelated reason
    // (it probes the target), so awaiting it once here — same as every other test in this
    // file's sibling `proxy.test.ts` already does before reading `plate.url`/`plate.port`
    // — guarantees the plate's own bind has completed before we open a client socket to it.
    await plate.getStatus();

    const client = new WebSocket(`${plate.url.replace('http', 'ws')}ng-cli-ws`);
    const messages: string[] = [];

    // Attach the message listener BEFORE awaiting 'open' — the upstream sends its greeting
    // as soon as it sees the connection, which can land before a listener registered only
    // after 'open' resolves would ever be attached.
    const done = new Promise<void>((resolve, reject) => {
      client.on('message', (data) => {
        messages.push(data.toString());
        if (messages.length === 1) {
          client.send('ping');
        } else if (messages.length === 2) {
          resolve();
        }
      });
      client.on('error', reject);
      setTimeout(() => reject(new Error('timed out waiting for ws messages')), 8000);
    });

    await new Promise<void>((resolve, reject) => {
      client.on('open', resolve);
      client.on('error', reject);
    });

    await done;

    expect(messages).toEqual(['hello-from-upstream', 'echo:ping']);
    client.close();
  }, 10000);

  // #35: the upgrade handler is the plate's other door — HMR sockets are how a rebound page
  // would reach the dev server's live-reload channel — and it gated nothing either. The bench
  // destroys a refused upgrade socket rather than answering it (`http.ts`, #18); so does this.
  it('refuses an upgrade whose Host does not name the plate, and the target never sees it', async () => {
    let upstreamConnections = 0;
    fakeUpstream = createHttpServer();
    const port = await listen(fakeUpstream);
    wss = new WebSocketServer({ server: fakeUpstream, path: '/ng-cli-ws' });
    wss.on('connection', () => {
      upstreamConnections += 1;
    });

    plate = createPlateProxy({ benchOrigin: BENCH_ORIGIN, target: `http://localhost:${port}`, port: 0 });
    await plate.getStatus();

    const client = new WebSocket(`ws://127.0.0.1:${plate.port}/ng-cli-ws`, {
      headers: { host: `attacker.example:${plate.port}` },
    });

    const outcome = await new Promise<'open' | 'refused'>((resolve, reject) => {
      client.on('open', () => resolve('open'));
      client.on('error', () => resolve('refused'));
      client.on('close', () => resolve('refused'));
      setTimeout(() => reject(new Error('timed out waiting for the upgrade to be refused')), 8000);
    });

    expect(outcome).toBe('refused');
    expect(upstreamConnections).toBe(0);
    client.terminate();
  }, 10000);
});
