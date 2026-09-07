import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { createJigServer, type JigServerHandle } from '../http.js';
import { FakeOllamaDrafter } from '../orders/drafters/fake.js';
import { logger } from '../logger.js';

const here = dirname(fileURLToPath(import.meta.url));
const FAKE_CLAUDE = join(here, '..', 'build', '__fixtures__', 'fake-claude.mjs');

let handle: JigServerHandle | undefined;

afterEach(async () => {
  if (handle) {
    await handle.close();
    handle = undefined;
  }
  delete process.env.FAKE_CLAUDE_MODE;
  delete process.env.FAKE_CLAUDE_FILES;
  delete process.env.FAKE_CLAUDE_SLOW_MS;
});

async function freshServer(opts: { fakeClaude?: boolean } = { fakeClaude: true }): Promise<JigServerHandle> {
  const repoRoot = await mkdtemp(join(tmpdir(), 'jig-http-prompts-'));
  handle = await createJigServer({
    repoRoot,
    port: 0,
    openBrowser: false,
    benchDistDir: join(tmpdir(), 'jig-no-such-bench-dist'),
    drafters: { ollama: new FakeOllamaDrafter({ available: false }) },
    claude: opts.fakeClaude ? { command: process.execPath, commandArgsPrefix: [FAKE_CLAUDE] } : { command: 'jig-test-no-such-claude-binary' },
  });
  return handle;
}

describe('REST — /api/prompts', () => {
  it('POST creates a draft prompt; GET lists it; GET :id reads it', async () => {
    const { url } = await freshServer();
    const created = await fetch(`${url}/api/prompts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requirement: 'Add a comment line to README.md' }),
    });
    expect(created.status).toBe(201);
    const prompt = await created.json();
    expect(prompt.state).toBe('draft');
    expect(prompt.id).toBe('0001');

    const listed = await (await fetch(`${url}/api/prompts`)).json();
    expect(listed.prompts).toHaveLength(1);
    expect(listed.prompts[0].id).toBe('0001');

    const single = await fetch(`${url}/api/prompts/0001`);
    expect(single.status).toBe(200);
    expect((await single.json()).id).toBe('0001');
  });

  it('GET /api/prompts/:id 404s for an unknown id', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/prompts/9999`);
    expect(res.status).toBe(404);
  });

  it('GET /api/prompts?state=ready filters by state', async () => {
    const { url } = await freshServer();
    await fetch(`${url}/api/prompts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requirement: 'a' }) });
    const readyRes = await fetch(`${url}/api/prompts?state=ready`);
    expect(readyRes.status).toBe(200);
    expect((await readyRes.json()).prompts).toEqual([]);
  });

  it('GET /api/prompts?state=bogus is a 400', async () => {
    const { url } = await freshServer();
    const res = await fetch(`${url}/api/prompts?state=bogus`);
    expect(res.status).toBe(400);
  });

  it('PATCH edits the requirement/acceptance while draft', async () => {
    const { url } = await freshServer();
    const created = await (await fetch(`${url}/api/prompts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requirement: 'v1' }) })).json();
    const patched = await fetch(`${url}/api/prompts/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requirement: 'v2', acceptance: ['a'] }),
    });
    expect(patched.status).toBe(200);
    const body = await patched.json();
    expect(body.requirement).toBe('v2');
    expect(body.acceptance).toEqual(['a']);
  });

  it('POST /ready moves draft -> ready', async () => {
    const { url } = await freshServer();
    const created = await (await fetch(`${url}/api/prompts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requirement: 'v1' }) })).json();
    const ready = await fetch(`${url}/api/prompts/${created.id}/ready`, { method: 'POST' });
    expect(ready.status).toBe(200);
    expect((await ready.json()).state).toBe('ready');
  });

  it('POST /ready on an already-ready prompt is a 409', async () => {
    const { url } = await freshServer();
    const created = await (await fetch(`${url}/api/prompts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requirement: 'v1' }) })).json();
    await fetch(`${url}/api/prompts/${created.id}/ready`, { method: 'POST' });
    const again = await fetch(`${url}/api/prompts/${created.id}/ready`, { method: 'POST' });
    expect(again.status).toBe(409);
  });

  it('POST /polish is a 404-style honest error when no model is reachable', async () => {
    const { url } = await freshServer();
    const created = await (await fetch(`${url}/api/prompts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requirement: 'v1' }) })).json();
    const res = await fetch(`${url}/api/prompts/${created.id}/polish`, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('POST /build 202s, streams build events over WS, and lands built with FILES: parsed', async () => {
    process.env.FAKE_CLAUDE_FILES = 'README.md';
    const { url } = await freshServer();
    const created = await (await fetch(`${url}/api/prompts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requirement: 'v1' }) })).json();
    await fetch(`${url}/api/prompts/${created.id}/ready`, { method: 'POST' });

    const wsUrl = url.replace('http://', 'ws://') + '/ws';
    const ws = new WebSocket(wsUrl);
    const buildMessages: any[] = [];
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'build') buildMessages.push(msg);
    });

    const buildRes = await fetch(`${url}/api/prompts/${created.id}/build`, { method: 'POST' });
    expect(buildRes.status).toBe(202);
    const { buildId } = await buildRes.json();
    expect(typeof buildId).toBe('string');

    // Poll until the build lands (no fixed sleep — this is a real child process).
    let finalPrompt: any;
    for (let i = 0; i < 100; i++) {
      finalPrompt = await (await fetch(`${url}/api/prompts/${created.id}`)).json();
      if (finalPrompt.state === 'built') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(finalPrompt.state).toBe('built');
    expect(finalPrompt.builds).toHaveLength(1);
    expect(finalPrompt.builds[0].filesTouched).toEqual(['README.md']);
    expect(finalPrompt.builds[0].exitCode).toBe(0);

    expect(buildMessages.length).toBeGreaterThan(0);
    expect(buildMessages.every((m) => m.id === created.id)).toBe(true);
    expect(buildMessages.every((m) => typeof m.elapsedMs === 'number')).toBe(true);
    expect(buildMessages.some((m) => m.event.kind === 'init')).toBe(true);

    ws.close();
  }, 15_000);

  it('a second POST /build while one is running is a 409 naming the running id', async () => {
    process.env.FAKE_CLAUDE_SLOW_MS = '5000';
    process.env.FAKE_CLAUDE_MODE = 'slow';
    const { url, store } = await freshServer();
    const a = await (await fetch(`${url}/api/prompts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requirement: 'a' }) })).json();
    await fetch(`${url}/api/prompts/${a.id}/ready`, { method: 'POST' });
    const b = await (await fetch(`${url}/api/prompts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requirement: 'b' }) })).json();
    await fetch(`${url}/api/prompts/${b.id}/ready`, { method: 'POST' });

    const first = await fetch(`${url}/api/prompts/${a.id}/build`, { method: 'POST' });
    expect(first.status).toBe(202);
    const second = await fetch(`${url}/api/prompts/${b.id}/build`, { method: 'POST' });
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.runningId).toEqual({ promptId: a.id, buildId: (await first.json()).buildId });

    // cancel to let the process exit cleanly before the server closes
    await fetch(`${url}/api/prompts/${a.id}/cancel`, { method: 'POST' });
    void store;
  }, 15_000);

  it('POST /build answers 503 with the plain not-installed message when claude is not on PATH', async () => {
    const { url } = await freshServer({ fakeClaude: false });
    const created = await (await fetch(`${url}/api/prompts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requirement: 'v1' }) })).json();
    await fetch(`${url}/api/prompts/${created.id}/ready`, { method: 'POST' });
    const res = await fetch(`${url}/api/prompts/${created.id}/build`, { method: 'POST' });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('Claude Code is not installed on this machine — install it or use the MCP door');
  });

  it('scrap/restore round-trips a prompt through the ladder', async () => {
    const { url } = await freshServer();
    const created = await (await fetch(`${url}/api/prompts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requirement: 'v1' }) })).json();
    const scrapped = await (await fetch(`${url}/api/prompts/${created.id}/scrap`, { method: 'POST' })).json();
    expect(scrapped.state).toBe('scrapped');
    const restored = await (await fetch(`${url}/api/prompts/${created.id}/restore`, { method: 'POST' })).json();
    expect(restored.state).toBe('draft');
  });

  it('GET .../builds/:buildId/transcript returns the NDJSON transcript once a build finished', async () => {
    process.env.FAKE_CLAUDE_FILES = 'README.md';
    const { url } = await freshServer();
    const created = await (await fetch(`${url}/api/prompts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requirement: 'v1' }) })).json();
    await fetch(`${url}/api/prompts/${created.id}/ready`, { method: 'POST' });
    const { buildId } = await (await fetch(`${url}/api/prompts/${created.id}/build`, { method: 'POST' })).json();

    let finalPrompt: any;
    for (let i = 0; i < 100; i++) {
      finalPrompt = await (await fetch(`${url}/api/prompts/${created.id}`)).json();
      if (finalPrompt.state === 'built') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(finalPrompt.state).toBe('built');

    const transcriptRes = await fetch(`${url}/api/prompts/${created.id}/builds/${buildId}/transcript`);
    expect(transcriptRes.status).toBe(200);
    const text = await transcriptRes.text();
    const lines = text.trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => JSON.parse(l).type === 'result')).toBe(true);
  }, 15_000);

  it('/api/state carries wiring.claude "installed" and status.claude idle/building/built', async () => {
    process.env.FAKE_CLAUDE_FILES = 'x.ts';
    const { url } = await freshServer();
    const idleState = await (await fetch(`${url}/api/state`)).json();
    expect(idleState.wiring.claude).toBe('installed');
    expect(idleState.status.claude).toEqual({ state: 'idle' });

    const created = await (await fetch(`${url}/api/prompts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requirement: 'v1' }) })).json();
    await fetch(`${url}/api/prompts/${created.id}/ready`, { method: 'POST' });
    await fetch(`${url}/api/prompts/${created.id}/build`, { method: 'POST' });

    let builtState: any;
    for (let i = 0; i < 100; i++) {
      builtState = await (await fetch(`${url}/api/state`)).json();
      if (builtState.status.claude.state === 'built') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(builtState.status.claude.state).toBe('built');
    expect(builtState.status.claude.files).toEqual(['x.ts']);
  }, 15_000);

  // CI run 34148382041: a work order the S11 migration can't parse used to disappear with
  // only a server-log WARN to show for it — no caller of `/api/state` (the bench included)
  // had any way to know a work order had been silently dropped. `migration.skipped` is how
  // that stops being silent.
  it('/api/state carries migration.skipped when a work order fails to migrate', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-http-prompts-migration-'));
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(join(repoRoot, '.jig', 'work-orders'), { recursive: true });
    await writeFile(join(repoRoot, '.jig', 'work-orders', '0009-broken.md'), 'not a valid work order', 'utf8');

    // Deliberately-malformed fixture, expected to log the "S11 migration ... failed to
    // migrate" WARN — that line is the CI-run-34148382041 regression signal elsewhere, so it's
    // suppressed here; `migration.skipped` on the fetched state below is the real assertion.
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    handle = await createJigServer({
      repoRoot,
      port: 0,
      openBrowser: false,
      benchDistDir: join(tmpdir(), 'jig-no-such-bench-dist'),
      drafters: { ollama: new FakeOllamaDrafter({ available: false }) },
      claude: { command: 'jig-test-no-such-claude-binary' },
    });
    warnSpy.mockRestore();

    const state = await (await fetch(`${handle.url}/api/state`)).json();
    expect(state.migration.skipped).toEqual([
      { entry: '0009-broken.md', error: expect.stringContaining('parseWorkOrder') },
    ]);
  });
});
