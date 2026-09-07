// packages/bench/src/prompts/api.ts — a thin fetch client against S11's /api/prompts* routes.
//
// S11 (branch delegate/build-s11) is not merged to main, so these routes do not exist on the
// server this worktree runs against. Every call here degrades to `{ ok: false }` on ANY failure
// — a non-2xx status, a network error, or a malformed body — rather than throwing. The caller
// (usePrompts.ts) turns a run of `ok:false` results into one honest sentence in the Prompts tab
// ("the bench is ahead of its server — prompts arrive with S11"), never a blank pane or a
// spinner (the FixturePanel honest-chip pattern, applied to a whole tab).
import type {
  CreatePromptInput,
  PolishResult,
  Prompt,
  PromptEditInput,
} from './types.js';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status?: number; message: string };

async function request<T>(url: string, fetchImpl: typeof fetch, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetchImpl(url, init);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    if (!res.ok) {
      const message =
        body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
          ? (body as { error: string }).error
          : `${url} answered ${res.status}`;
      return { ok: false, status: res.status, message };
    }
    return { ok: true, data: body as T };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'could not reach the bench server' };
  }
}

export function listPrompts(fetchImpl: typeof fetch = fetch): Promise<ApiResult<Prompt[]>> {
  return request<{ prompts: Prompt[] }>('/api/prompts', fetchImpl).then((res) =>
    res.ok ? { ok: true, data: res.data.prompts } : res,
  );
}

export function createPrompt(input: CreatePromptInput, fetchImpl: typeof fetch = fetch): Promise<ApiResult<Prompt>> {
  return request<Prompt>('/api/prompts', fetchImpl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function getPrompt(id: string, fetchImpl: typeof fetch = fetch): Promise<ApiResult<Prompt>> {
  return request<Prompt>(`/api/prompts/${id}`, fetchImpl);
}

export function patchPrompt(
  id: string,
  input: PromptEditInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult<Prompt>> {
  return request<Prompt>(`/api/prompts/${id}`, fetchImpl, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function readyPrompt(id: string, fetchImpl: typeof fetch = fetch): Promise<ApiResult<Prompt>> {
  return request<Prompt>(`/api/prompts/${id}/ready`, fetchImpl, { method: 'POST' });
}

export function polishPrompt(id: string, fetchImpl: typeof fetch = fetch): Promise<ApiResult<PolishResult>> {
  return request<PolishResult>(`/api/prompts/${id}/polish`, fetchImpl, { method: 'POST' });
}

export function buildPrompt(id: string, fetchImpl: typeof fetch = fetch): Promise<ApiResult<{ buildId: string }>> {
  return request<{ buildId: string }>(`/api/prompts/${id}/build`, fetchImpl, { method: 'POST' });
}

export function cancelBuild(id: string, fetchImpl: typeof fetch = fetch): Promise<ApiResult<{ accepted: true; id: string }>> {
  return request(`/api/prompts/${id}/cancel`, fetchImpl, { method: 'POST' });
}

export function scrapPrompt(id: string, fetchImpl: typeof fetch = fetch): Promise<ApiResult<Prompt>> {
  return request<Prompt>(`/api/prompts/${id}/scrap`, fetchImpl, { method: 'POST' });
}

export function restorePrompt(id: string, fetchImpl: typeof fetch = fetch): Promise<ApiResult<Prompt>> {
  return request<Prompt>(`/api/prompts/${id}/restore`, fetchImpl, { method: 'POST' });
}

export async function getTranscript(
  promptId: string,
  buildId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult<string>> {
  try {
    const res = await fetchImpl(`/api/prompts/${promptId}/builds/${buildId}/transcript`);
    if (!res.ok) return { ok: false, status: res.status, message: `transcript answered ${res.status}` };
    return { ok: true, data: await res.text() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'could not reach the bench server' };
  }
}
