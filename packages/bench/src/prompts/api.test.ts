import { describe, expect, it } from 'vitest';
import { buildPrompt, createPrompt, listPrompts, polishPrompt, readyPrompt, scrapPrompt } from './api.js';
import type { Prompt } from './types.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const samplePrompt: Prompt = {
  jigFormat: 1,
  id: '0003',
  slug: 'show-days-overdue',
  state: 'draft',
  requirement: 'show days overdue',
  acceptance: [],
  target: { kind: 'element', component: 'InvoiceListComponent' },
  context: { components: [], files: [], gauges: [], routes: [], endpoints: [], docs: [] },
  builds: [],
  createdAt: 'a',
  updatedAt: 'a',
};

describe('prompts/api — the S11 fetch client, degrading honestly when the routes do not exist yet', () => {
  it('listPrompts returns the list on 200', async () => {
    const fetchImpl = (async () => jsonResponse(200, { prompts: [samplePrompt] })) as unknown as typeof fetch;
    const result = await listPrompts(fetchImpl);
    expect(result).toEqual({ ok: true, data: [samplePrompt] });
  });

  it('listPrompts degrades to ok:false when GET /api/prompts 404s (main has no S11 yet)', async () => {
    const fetchImpl = (async () => jsonResponse(404, { error: 'not found' })) as unknown as typeof fetch;
    const result = await listPrompts(fetchImpl);
    expect(result.ok).toBe(false);
  });

  it('listPrompts degrades to ok:false on a network error (fetch throws)', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const result = await listPrompts(fetchImpl);
    expect(result.ok).toBe(false);
  });

  it('createPrompt POSTs the requirement/acceptance/target and returns the created Prompt', async () => {
    const calls: unknown[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return jsonResponse(201, samplePrompt);
    }) as unknown as typeof fetch;

    const result = await createPrompt({ requirement: 'show days overdue', target: { kind: 'element', component: 'InvoiceListComponent' } }, fetchImpl);

    expect(result).toEqual({ ok: true, data: samplePrompt });
    expect(calls).toEqual([
      {
        url: '/api/prompts',
        method: 'POST',
        body: { requirement: 'show days overdue', target: { kind: 'element', component: 'InvoiceListComponent' } },
      },
    ]);
  });

  it('buildPrompt returns ok:false with the conflict message on 409 (a build is already running)', async () => {
    const fetchImpl = (async () => jsonResponse(409, { error: 'a build is already running for prompt 0002' })) as unknown as typeof fetch;
    const result = await buildPrompt('0003', fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/already running/);
  });

  it('readyPrompt POSTs to /api/prompts/:id/ready', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return jsonResponse(200, { ...samplePrompt, state: 'ready' });
    }) as unknown as typeof fetch;
    const result = await readyPrompt('0003', fetchImpl);
    expect(calls).toEqual(['/api/prompts/0003/ready']);
    expect(result.ok).toBe(true);
  });

  it('polishPrompt returns ok:false (not the throw path) when no local model is reachable (404 PolishUnavailableError)', async () => {
    const fetchImpl = (async () => jsonResponse(404, { error: 'no local model is reachable on this desk' })) as unknown as typeof fetch;
    const result = await polishPrompt('0003', fetchImpl);
    expect(result.ok).toBe(false);
  });

  it('scrapPrompt POSTs to /api/prompts/:id/scrap', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return jsonResponse(200, { ...samplePrompt, state: 'scrapped' });
    }) as unknown as typeof fetch;
    await scrapPrompt('0003', fetchImpl);
    expect(calls).toEqual(['/api/prompts/0003/scrap']);
  });
});
