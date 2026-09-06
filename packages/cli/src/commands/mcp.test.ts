import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { jigPaths, JIG_FORMAT } from '@jigbench/core';
import { readShopHeartbeat, shopHeartbeatFile } from '@jigbench/server';
import { runMcpCommand } from './mcp.js';

/**
 * S6 replaces the S1 stub (which only logged "MCP arrives in S6" and exited 0) with the
 * real stdio MCP server. `stdin`/`stdout` are injectable so this drives a full JSON-RPC
 * round trip over in-process `PassThrough` streams — no child process, no dist build
 * required (that's what the CLI e2e test and `scripts/mcp-smoke.sh` are for).
 */

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: unknown;
  result?: { tools?: Array<{ name: string }>; [key: string]: unknown };
  error?: unknown;
}

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  // maxRetries/retryDelay: the same Windows ENOTEMPTY class tools.test.ts hit (CI run
  // 34039471247) — defense-in-depth net alongside the "deletes the shop heartbeat before
  // the returned promise resolves" test above, which fixes the actual race for this file.
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));
});

async function freshRepo(): Promise<string> {
  const repoRoot = await mkdtemp(join(tmpdir(), 'jig-cli-mcp-'));
  tempDirs.push(repoRoot);
  return repoRoot;
}

/** A minimal hand-rolled JSON-RPC-over-newlines client — just enough to drive `initialize`
 * -> `notifications/initialized` -> one more request, matching the wire format
 * `shared/stdio.js` actually uses (one JSON object per line, no Content-Length framing). */
function rig() {
  const toServer = new PassThrough();
  const fromServer = new PassThrough();
  const messages: JsonRpcMessage[] = [];
  let buffer = '';
  fromServer.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let idx: number;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.trim()) messages.push(JSON.parse(line));
    }
  });
  const send = (msg: JsonRpcMessage) => {
    toServer.write(JSON.stringify(msg) + '\n');
  };
  return { toServer, fromServer, messages, send };
}

async function handshake(send: (msg: JsonRpcMessage) => void, messages: JsonRpcMessage[]): Promise<void> {
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test-client', version: '1.0.0' } },
  });
  await vi.waitFor(() => expect(messages.some((m) => m.id === 1)).toBe(true));
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
}

describe('runMcpCommand (S6: the real stdio MCP server)', () => {
  it('completes the initialize handshake and lists all nine tools', async () => {
    const repoRoot = await freshRepo();
    const { toServer, fromServer, messages, send } = rig();

    const runPromise = runMcpCommand({ repo: repoRoot, stdin: toServer, stdout: fromServer });
    await handshake(send, messages);

    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    await vi.waitFor(() => expect(messages.some((m) => m.id === 2)).toBe(true));
    const toolsResponse = messages.find((m) => m.id === 2)!;
    const names = (toolsResponse.result!.tools ?? []).map((t) => t.name).sort();
    expect(names).toEqual(
      ['jig_claim', 'jig_docs', 'jig_draft', 'jig_fixture', 'jig_gauges', 'jig_report', 'jig_survey', 'jig_work_order', 'jig_work_orders'].sort(),
    );

    toServer.end();
    await runPromise;
  });

  it('writes nothing but JSON-RPC to the injected stdout — every line parses', async () => {
    const repoRoot = await freshRepo();
    const { toServer, fromServer, messages, send } = rig();

    const runPromise = runMcpCommand({ repo: repoRoot, stdin: toServer, stdout: fromServer });
    await handshake(send, messages);
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    await vi.waitFor(() => expect(messages.some((m) => m.id === 2)).toBe(true));

    // `messages` only ever populated from lines that survived JSON.parse in the rig's own
    // reader — if a stray non-JSON line had been written, `rig()`'s `JSON.parse` would have
    // thrown inside the 'data' handler already. Asserting we got here with the expected
    // messages IS the proof; belt-and-suspenders below re-parses every line explicitly.
    expect(messages.length).toBeGreaterThanOrEqual(2);

    toServer.end();
    await runPromise;
  });

  it('resolves once stdin ends (the launching agent closing the pipe means a clean exit)', async () => {
    const repoRoot = await freshRepo();
    const { toServer, fromServer, messages, send } = rig();

    const runPromise = runMcpCommand({ repo: repoRoot, stdin: toServer, stdout: fromServer });
    await handshake(send, messages);

    let resolved = false;
    runPromise.then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);

    toServer.end();
    await runPromise;
    expect(resolved).toBe(true);
  });

  it('deletes the shop heartbeat before the returned promise resolves — nothing left for a temp-dir cleanup to race', async () => {
    // server.ts's `onclose` used to be fire-and-forget relative to this promise: it called
    // `heartbeat.stop()` but never returned its promise, and this command's own `onclose`
    // wrapper resolved immediately without waiting for whatever `priorOnClose()` kicked off.
    // A "clean" `jigbench mcp` exit could therefore return while shop.json was still on disk
    // (or mid-delete) — exactly what turned into Windows' ENOTEMPTY when a vitest temp-dir
    // cleanup ran immediately after a client disconnect in the same process (tools.test.ts).
    const repoRoot = await freshRepo();
    const { toServer, fromServer, messages, send } = rig();

    const runPromise = runMcpCommand({ repo: repoRoot, stdin: toServer, stdout: fromServer });
    await handshake(send, messages);
    await vi.waitFor(async () => expect(await readShopHeartbeat(repoRoot)).not.toBeNull());

    toServer.end();
    await runPromise;

    expect(existsSync(shopHeartbeatFile(repoRoot))).toBe(false);
  });

  it('runs the survey when .jig/survey/survey.json is missing', async () => {
    const repoRoot = await freshRepo();
    const { toServer, fromServer, messages, send } = rig();

    const runPromise = runMcpCommand({ repo: repoRoot, stdin: toServer, stdout: fromServer });
    await handshake(send, messages);

    const surveyFile = join(jigPaths(repoRoot).survey, 'survey.json');
    await vi.waitFor(async () => {
      const raw = JSON.parse(await readFile(surveyFile, 'utf8'));
      expect(raw.jigFormat).toBe(JIG_FORMAT);
    });

    toServer.end();
    await runPromise;
  });

  it('does NOT re-run the survey when .jig/survey/survey.json already exists', async () => {
    const repoRoot = await freshRepo();
    const { mkdir, writeFile } = await import('node:fs/promises');
    const paths = jigPaths(repoRoot);
    await mkdir(paths.survey, { recursive: true });
    const surveyFile = join(paths.survey, 'survey.json');
    const marker = '2019-01-01T00:00:00.000Z'; // a generatedAt no fresh survey run would ever produce
    const preExisting = {
      jigFormat: JIG_FORMAT,
      stack: [],
      components: [],
      routes: [],
      endpoints: [],
      schemas: [],
      docs: [],
      generatedAt: marker,
      stub: true,
    };
    await writeFile(surveyFile, JSON.stringify(preExisting, null, 2), 'utf8');

    const { toServer, fromServer, messages, send } = rig();
    const runPromise = runMcpCommand({ repo: repoRoot, stdin: toServer, stdout: fromServer });
    await handshake(send, messages);
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    await vi.waitFor(() => expect(messages.some((m) => m.id === 2)).toBe(true));

    const onDisk = JSON.parse(await readFile(surveyFile, 'utf8'));
    expect(onDisk.generatedAt).toBe(marker); // untouched — never overwritten

    toServer.end();
    await runPromise;
  });
});
