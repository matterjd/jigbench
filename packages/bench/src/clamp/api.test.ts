import { describe, expect, it, vi } from 'vitest';
import {
  clamp,
  docsClamp,
  fsList,
  fsRoots,
  getSetup,
  setupDesktop,
  setupMcp,
  targetStart,
  targetStop,
  targetUrl,
  unclamp,
} from './api.js';

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

/** A fetch stub that answers every call with `status`/`body` and records what was asked. */
function stub(status: number, body: unknown): { fetchImpl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('clamp/api — the Clamp screen\'s fetch client over ../api/request.ts', () => {
  it('fsRoots GETs /api/fs/roots and hands back the roots', async () => {
    const { fetchImpl, calls } = stub(200, { roots: [{ name: '~', path: '/home/you' }] });
    const result = await fsRoots(fetchImpl);
    expect(calls).toEqual([{ url: '/api/fs/roots', method: 'GET', body: undefined }]);
    expect(result).toEqual({ ok: true, data: { roots: [{ name: '~', path: '/home/you' }] } });
  });

  it('fsList GETs /api/fs/list?path= with the path URL-encoded', async () => {
    const listing = { path: '/home/you/src', parent: '/home/you', entries: [] };
    const { fetchImpl, calls } = stub(200, listing);
    const result = await fsList('/home/you/src', fetchImpl);
    expect(calls[0]).toEqual({ url: '/api/fs/list?path=%2Fhome%2Fyou%2Fsrc', method: 'GET', body: undefined });
    expect(result).toEqual({ ok: true, data: listing });
  });

  it('fsList surfaces a 400 {error} as {ok:false, message: the server\'s words}', async () => {
    const { fetchImpl } = stub(400, { error: 'no such path: /nowhere' });
    const result = await fsList('/nowhere', fetchImpl);
    expect(result).toEqual({ ok: false, status: 400, message: 'no such path: /nowhere' });
  });

  it('clamp POSTs {repoRoot} to /api/clamp', async () => {
    const { fetchImpl, calls } = stub(200, { ok: true, repoRoot: '/home/you/repo', docsClamped: false, recent: [] });
    const result = await clamp('/home/you/repo', fetchImpl);
    expect(calls).toEqual([{ url: '/api/clamp', method: 'POST', body: { repoRoot: '/home/you/repo' } }]);
    expect(result.ok).toBe(true);
  });

  it('clamp surfaces the 400 words', async () => {
    const { fetchImpl } = stub(400, { error: 'not a directory: /home/you/notes.txt' });
    const result = await clamp('/home/you/notes.txt', fetchImpl);
    expect(result).toEqual({ ok: false, status: 400, message: 'not a directory: /home/you/notes.txt' });
  });

  it('unclamp POSTs /api/unclamp', async () => {
    const { fetchImpl, calls } = stub(200, { ok: true });
    await unclamp(fetchImpl);
    expect(calls[0]).toMatchObject({ url: '/api/unclamp', method: 'POST' });
  });

  it('targetStart POSTs the options to /api/target/start and returns the 202 body', async () => {
    const { fetchImpl, calls } = stub(202, { accepted: true, port: 4200 });
    const result = await targetStart({ script: 'start', port: 4200 }, fetchImpl);
    expect(calls).toEqual([{ url: '/api/target/start', method: 'POST', body: { script: 'start', port: 4200 } }]);
    expect(result).toEqual({ ok: true, data: { accepted: true, port: 4200 } });
  });

  it('targetStart with no options POSTs an empty object', async () => {
    const { fetchImpl, calls } = stub(202, { accepted: true, port: 4200 });
    await targetStart({}, fetchImpl);
    expect(calls[0].body).toEqual({});
  });

  it('targetStart surfaces the 400 words when no dev script was found', async () => {
    const { fetchImpl } = stub(400, { error: 'could not detect a dev script for this repo' });
    const result = await targetStart({}, fetchImpl);
    expect(result).toEqual({ ok: false, status: 400, message: 'could not detect a dev script for this repo' });
  });

  it('targetStop POSTs /api/target/stop', async () => {
    const { fetchImpl, calls } = stub(200, { ok: true });
    await targetStop(fetchImpl);
    expect(calls[0]).toMatchObject({ url: '/api/target/stop', method: 'POST' });
  });

  it('targetUrl POSTs {url} to /api/target/url', async () => {
    const { fetchImpl, calls } = stub(200, { ok: true });
    await targetUrl('http://localhost:4200', fetchImpl);
    expect(calls).toEqual([{ url: '/api/target/url', method: 'POST', body: { url: 'http://localhost:4200' } }]);
  });

  it('docsClamp POSTs {folder} to /api/docs/clamp and returns the counts', async () => {
    const body = { files: 3, chunks: 12, ignoredExtensions: ['.png'], file: '.jig/docs/index.json' };
    const { fetchImpl, calls } = stub(200, body);
    const result = await docsClamp('./docs', fetchImpl);
    expect(calls).toEqual([{ url: '/api/docs/clamp', method: 'POST', body: { folder: './docs' } }]);
    expect(result).toEqual({ ok: true, data: body });
  });

  it('setupMcp POSTs {apply} to /api/setup/mcp', async () => {
    const body = { diff: '+ "jig": {}', changed: true, wrote: false };
    const { fetchImpl, calls } = stub(200, body);
    const result = await setupMcp(false, fetchImpl);
    expect(calls).toEqual([{ url: '/api/setup/mcp', method: 'POST', body: { apply: false } }]);
    expect(result).toEqual({ ok: true, data: body });
    await setupMcp(true, fetchImpl);
    expect(calls[1].body).toEqual({ apply: true });
  });

  it('setupDesktop POSTs {apply} to /api/setup/desktop and surfaces a 404\'s words', async () => {
    const { fetchImpl, calls } = stub(404, { error: 'claude_desktop_config.json location not found — is Claude Desktop installed?' });
    const result = await setupDesktop(true, fetchImpl);
    expect(calls).toEqual([{ url: '/api/setup/desktop', method: 'POST', body: { apply: true } }]);
    expect(result).toEqual({
      ok: false,
      status: 404,
      message: 'claude_desktop_config.json location not found — is Claude Desktop installed?',
    });
  });

  it('getSetup GETs /api/setup and returns the checklist', async () => {
    const checklist = {
      survey: true,
      docs: false,
      target: { status: 'none' },
      mcp: { written: false, path: '/home/you/repo/.mcp.json' },
      desktop: { written: false },
      claude: 'installed',
    };
    const { fetchImpl, calls } = stub(200, checklist);
    const result = await getSetup(fetchImpl);
    expect(calls).toEqual([{ url: '/api/setup', method: 'GET', body: undefined }]);
    expect(result).toEqual({ ok: true, data: checklist });
  });

  it('every call degrades to ok:false (never a throw) when fetch itself fails', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    expect((await fsRoots(fetchImpl)).ok).toBe(false);
    expect((await getSetup(fetchImpl)).ok).toBe(false);
    expect((await clamp('/x', fetchImpl)).ok).toBe(false);
  });
});
