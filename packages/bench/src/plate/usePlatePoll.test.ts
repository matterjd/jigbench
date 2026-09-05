// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePlatePoll, type PlateApiStatus } from './usePlatePoll.js';

afterEach(() => {
  vi.useRealTimers();
});

function fakeFetch(result: unknown, ok = true): typeof fetch {
  return (() => Promise.resolve({ ok, json: () => Promise.resolve(result) } as Response)) as unknown as typeof fetch;
}

describe('usePlatePoll', () => {
  it('starts at "none" before the first response arrives', () => {
    const { result } = renderHook(() => usePlatePoll(fakeFetch({}, false)));
    expect(result.current.status).toBe('none');
  });

  it('reports whatever /api/plate returns', async () => {
    const up: PlateApiStatus = { target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] };
    const { result } = renderHook(() => usePlatePoll(fakeFetch(up)));
    await waitFor(() => expect(result.current.status).toBe('up'));
    expect(result.current).toEqual(up);
  });

  it('degrades to "none" on a non-OK response (e.g. no plate configured)', async () => {
    const { result } = renderHook(() => usePlatePoll(fakeFetch({}, false)));
    await waitFor(() => expect(result.current.status).toBe('none'));
  });

  it('degrades to "down" on a network failure, once a target was known', async () => {
    let calls = 0;
    const up: PlateApiStatus = { target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] };
    const flakyFetch = (() => {
      calls++;
      if (calls === 1) return Promise.resolve({ ok: true, json: () => Promise.resolve(up) } as Response);
      return Promise.reject(new Error('network down'));
    }) as unknown as typeof fetch;

    vi.useFakeTimers();
    const { result } = renderHook(() => usePlatePoll(flakyFetch));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe('up');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    expect(result.current.status).toBe('down');
  });
});
