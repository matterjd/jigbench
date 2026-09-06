import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readApplicationUrl } from './launch-settings.js';
import { fetchLiveOpenApi, surveyFromOpenApiLive } from './openapi-live.js';

const LEDGER_API_ROOT = fileURLToPath(new URL('../../../../examples/ledger-api', import.meta.url));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readApplicationUrl (examples/ledger-api/Properties/launchSettings.json)', () => {
  it('reads the http profile applicationUrl', async () => {
    expect(await readApplicationUrl(LEDGER_API_ROOT)).toBe('http://localhost:5210');
  });

  it('returns undefined when there is no launchSettings.json', async () => {
    expect(await readApplicationUrl('/no/such/dir')).toBeUndefined();
  });
});

describe('fetchLiveOpenApi', () => {
  it('tries /openapi/v1.json first and returns it on success', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('http://localhost:5210/openapi/v1.json');
      return { ok: true, json: async () => ({ paths: {}, components: {} }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLiveOpenApi('http://localhost:5210', 1500);
    expect(result?.url).toBe('http://localhost:5210/openapi/v1.json');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to /swagger/v1/swagger.json when the first URL 404s', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/openapi/v1.json')) return { ok: false, status: 404 } as Response;
      return { ok: true, json: async () => ({ paths: {}, components: {} }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLiveOpenApi('http://localhost:5210', 1500);
    expect(result?.url).toBe('http://localhost:5210/swagger/v1/swagger.json');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns undefined when both URLs fail (server not running)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const result = await fetchLiveOpenApi('http://localhost:5210', 1500);
    expect(result).toBeUndefined();
  });

  it('aborts and moves on within the timeout when a request hangs', async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const start = Date.now();
    const result = await fetchLiveOpenApi('http://localhost:5210', 50);
    expect(result).toBeUndefined();
    // Two attempts (openapi then swagger) at ~50ms each, plus overhead — nowhere near the
    // full 1500ms default, proving the short timeoutMs argument was actually honored.
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
