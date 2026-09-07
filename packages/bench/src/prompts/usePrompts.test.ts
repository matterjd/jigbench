import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { usePrompts } from './usePrompts.js';
import type { Prompt } from './types.js';

afterEach(() => cleanup());

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as unknown as Response;
}

const base: Prompt = {
  jigFormat: 1,
  id: '0003',
  slug: 'show-days-overdue',
  state: 'draft',
  requirement: '',
  acceptance: [],
  target: { kind: 'element', component: 'InvoiceListComponent' },
  context: { components: [], files: [], gauges: [], routes: [], endpoints: [], docs: [] },
  builds: [],
  createdAt: 'a',
  updatedAt: 'a',
};

describe('usePrompts', () => {
  it('starts loading, then becomes ready with the fetched list', async () => {
    const fetchImpl = (async () => jsonResponse(200, { prompts: [base] })) as unknown as typeof fetch;
    const { result } = renderHook(() => usePrompts({ fetchImpl }));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.prompts).toEqual([base]);
  });

  it('becomes "unavailable" (not an error, not a blank spinner forever) when the routes 404 — S11 not on main yet', async () => {
    const fetchImpl = (async () => jsonResponse(404, { error: 'not found' })) as unknown as typeof fetch;
    const { result } = renderHook(() => usePrompts({ fetchImpl }));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.prompts).toEqual([]);
  });

  it('create() posts the input, adds the returned prompt to the list, and selects it as hand', async () => {
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse(201, base);
      return jsonResponse(200, { prompts: [] });
    }) as unknown as typeof fetch;
    const { result } = renderHook(() => usePrompts({ fetchImpl }));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.create({ requirement: 'x', target: { kind: 'element', component: 'InvoiceListComponent' } });
    });

    expect(result.current.prompts).toEqual([base]);
    expect(result.current.hand?.id).toBe('0003');
  });

  it('build() optimistically marks the local prompt "building"', async () => {
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (String(url) === '/api/prompts' && method === 'GET') return jsonResponse(200, { prompts: [{ ...base, state: 'ready' }] });
      if (String(url).endsWith('/build')) return jsonResponse(202, { buildId: 'b1' });
      return jsonResponse(200, {});
    }) as unknown as typeof fetch;
    const { result } = renderHook(() => usePrompts({ fetchImpl }));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.build('0003');
    });

    expect(result.current.prompts.find((p) => p.id === '0003')?.state).toBe('building');
  });

  it('accumulates live buildEvent frames for the prompt currently building', async () => {
    const fetchImpl = (async () => jsonResponse(200, { prompts: [{ ...base, state: 'building' }] })) as unknown as typeof fetch;
    const { result, rerender } = renderHook(({ buildEvent }: { buildEvent: { id: string; event: unknown; elapsedMs: number } | null }) => usePrompts({ fetchImpl, buildEvent }), {
      initialProps: { buildEvent: null },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ buildEvent: { id: '0003', event: { kind: 'text', text: 'editing invoice-list.component.html' }, elapsedMs: 500 } });

    await waitFor(() => expect(result.current.buildStreams['0003']).toEqual([{ kind: 'text', text: 'editing invoice-list.component.html' }]));
  });

  it('refreshes from the server once claudeStatus reports this prompt built, clearing its live stream', async () => {
    let call = 0;
    const fetchImpl = (async () => {
      call++;
      if (call === 1) return jsonResponse(200, { prompts: [{ ...base, state: 'building' }] });
      return jsonResponse(200, { prompts: [{ ...base, state: 'built', builds: [{ id: 'b1', startedAt: 'a', filesTouched: ['x.ts'] }] }] });
    }) as unknown as typeof fetch;

    const { result, rerender } = renderHook(
      ({ buildEvent, claudeStatus }: { buildEvent: { id: string; event: unknown; elapsedMs: number } | null; claudeStatus: { state: string; id?: string } | undefined }) =>
        usePrompts({ fetchImpl, buildEvent, claudeStatus: claudeStatus as never }),
      { initialProps: { buildEvent: null, claudeStatus: undefined } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ buildEvent: { id: '0003', event: { kind: 'text', text: 'editing…' }, elapsedMs: 100 }, claudeStatus: undefined });
    await waitFor(() => expect(result.current.buildStreams['0003']?.length).toBe(1));

    rerender({ buildEvent: null, claudeStatus: { state: 'built', id: '0003' } });

    await waitFor(() => expect(result.current.prompts.find((p) => p.id === '0003')?.state).toBe('built'));
    expect(result.current.buildStreams['0003']).toBeUndefined();
  });
});
