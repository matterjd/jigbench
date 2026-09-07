/**
 * The bench's one fetch wrapper. Every API client in the bench (prompts, the Clamp screen's
 * fs/clamp/target/setup calls) goes through this so failure has ONE shape: a non-2xx status,
 * a network error, or a malformed body all come back as `{ ok: false, message }` with the
 * server's own `error` words when it sent any — never a throw, never a blank pane. The
 * caller decides what honest sentence to show.
 */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status?: number; message: string };

export async function request<T>(url: string, fetchImpl: typeof fetch, init?: RequestInit): Promise<ApiResult<T>> {
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

/** A JSON POST — the shape every mutating bench call takes. */
export function postJson<T>(url: string, body: unknown, fetchImpl: typeof fetch): Promise<ApiResult<T>> {
  return request<T>(url, fetchImpl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}
