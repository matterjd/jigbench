import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { PromptStore } from '../prompts/store.js';
import { PromptService } from '../prompts/service.js';
import type { BuildRunnerLike, ClaudeStatus } from '../build/types.js';
import { registerPromptTools } from './prompt-tools.js';

/**
 * S11 — `jig_prompts`/`jig_prompt`/`jig_mark_built`, exercised through a real MCP `Client`
 * over the SDK's `InMemoryTransport` (same pattern `tools.test.ts` uses for the nine
 * work-order tools) — proves the actual wire contract, not just the handler functions.
 */

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));
});

const NEVER_RUNNER: BuildRunnerLike = {
  async isClaudeAvailable() {
    return false;
  },
  currentBuild() {
    return null;
  },
  async start() {
    throw new Error('not used in this suite');
  },
  cancel() {
    return false;
  },
  status(): ClaudeStatus {
    return { state: 'idle' };
  },
};

async function freshRig() {
  const repoRoot = await mkdtemp(join(tmpdir(), 'jig-mcp-prompts-'));
  tempDirs.push(repoRoot);
  const store = new PromptStore(repoRoot);
  await store.init();
  const promptService = new PromptService({
    store,
    survey: () => ({ jigFormat: 1, stack: [], components: [], routes: [], endpoints: [], schemas: [], docs: [], generatedAt: new Date().toISOString(), stub: true }),
    gauges: () => ({ jigFormat: 1, gauges: [], generatedAt: new Date().toISOString() }),
    runner: NEVER_RUNNER,
  });
  return { repoRoot, store, promptService };
}

async function connectedClient(promptService: PromptService, repoRoot: string) {
  const mcpServer = new McpServer({ name: 'jig-test', version: '0.0.0' });
  registerPromptTools(mcpServer, { repoRoot, promptService });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'Claude Code', version: '2.1.259' });
  await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe('tools/list', () => {
  it('names the three S11 prompt tools', async () => {
    const rig = await freshRig();
    const client = await connectedClient(rig.promptService, rig.repoRoot);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['jig_mark_built', 'jig_prompt', 'jig_prompts']);
    await client.close();
  });
});

describe('jig_prompts', () => {
  it('lists every prompt, optionally filtered by state', async () => {
    const rig = await freshRig();
    await rig.promptService.create({ requirement: 'a draft' });
    const readyOne = await rig.promptService.create({ requirement: 'a ready one' });
    await rig.promptService.ready(readyOne.id);

    const client = await connectedClient(rig.promptService, rig.repoRoot);

    const all = await client.callTool({ name: 'jig_prompts', arguments: {} });
    expect((all.structuredContent as { prompts: unknown[] }).prompts).toHaveLength(2);

    const ready = await client.callTool({ name: 'jig_prompts', arguments: { state: 'ready' } });
    const readyPrompts = (ready.structuredContent as { prompts: Array<{ id: string }> }).prompts;
    expect(readyPrompts).toHaveLength(1);
    expect(readyPrompts[0]!.id).toBe(readyOne.id);

    await client.close();
  });
});

describe('jig_prompt', () => {
  it('returns the full prompt plus its file path', async () => {
    const rig = await freshRig();
    const created = await rig.promptService.create({ requirement: 'show days overdue', acceptance: ['a badge shows'] });

    const client = await connectedClient(rig.promptService, rig.repoRoot);
    const result = await client.callTool({ name: 'jig_prompt', arguments: { id: created.id } });
    expect(result.isError).toBeFalsy();
    const payload = result.structuredContent as { id: string; requirement: string; file: string };
    expect(payload.id).toBe(created.id);
    expect(payload.requirement).toBe('show days overdue');
    expect(payload.file).toContain(`${created.id}-${created.slug}.md`);

    await client.close();
  });

  it('is an isError result for an unknown id', async () => {
    const rig = await freshRig();
    const client = await connectedClient(rig.promptService, rig.repoRoot);
    const result = await client.callTool({ name: 'jig_prompt', arguments: { id: '9999' } });
    expect(result.isError).toBe(true);
    await client.close();
  });
});

describe('jig_mark_built', () => {
  it('moves a ready prompt to built with the reported files/summary', async () => {
    const rig = await freshRig();
    const created = await rig.promptService.create({ requirement: 'x' });
    await rig.promptService.ready(created.id);

    const client = await connectedClient(rig.promptService, rig.repoRoot);
    const result = await client.callTool({ name: 'jig_mark_built', arguments: { id: created.id, summary: 'agent did it', files: ['a.ts'] } });
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { state: string }).state).toBe('built');

    expect(rig.store.get(created.id)?.state).toBe('built');
    expect(rig.store.get(created.id)?.builds[0]?.summary).toBe('agent did it');

    await client.close();
  });

  it('is an isError result (not a crash) when the prompt is in the wrong state', async () => {
    const rig = await freshRig();
    const created = await rig.promptService.create({ requirement: 'x' }); // still draft
    const client = await connectedClient(rig.promptService, rig.repoRoot);
    const result = await client.callTool({ name: 'jig_mark_built', arguments: { id: created.id, summary: 's' } });
    expect(result.isError).toBe(true);
    await client.close();
  });
});

describe('registerPromptTools with no promptService override', () => {
  it('builds its own PromptStore/PromptService from repoRoot alone', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-mcp-prompts-standalone-'));
    tempDirs.push(repoRoot);

    const mcpServer = new McpServer({ name: 'jig-test', version: '0.0.0' });
    registerPromptTools(mcpServer, { repoRoot });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'Claude Code', version: '2.1.259' });
    await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.callTool({ name: 'jig_prompts', arguments: {} });
    expect((result.structuredContent as { prompts: unknown[] }).prompts).toEqual([]);

    await client.close();
  });
});

// #24 ("remaining ENOENT windows"): `registerPromptTools` starts the default store eagerly and
// unawaited. Its init can fail for real (the repo gone under it, an unwritable `.jig/`) — that
// must reach the first tool call as a readable tool error, never the process as an unhandled
// rejection at registration time.
describe('the default prompt store starts eagerly, unawaited (#24)', () => {
  it('a failed init is never an unhandled rejection — the first tool call reports it readably instead', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-mcp-prompts-badroot-'));
    tempDirs.push(dir);
    const file = join(dir, 'a-file');
    await writeFile(file, 'not a directory', 'utf8');
    const repoRoot = join(file, 'repo'); // mkdir -p under a regular file fails on every OS

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const mcpServer = new McpServer({ name: 'jig-test', version: '0.0.0' });
      registerPromptTools(mcpServer, { repoRoot }); // no promptService: the default store starts here
      await new Promise((resolve) => setTimeout(resolve, 100)); // let the init fail and any rejection surface
      expect(unhandled).toEqual([]);

      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'Claude Code', version: '2.1.259' });
      await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
      const result = await client.callTool({ name: 'jig_prompts', arguments: {} });
      expect(result.isError).toBe(true);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
