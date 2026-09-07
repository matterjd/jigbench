import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useFolderBrowser } from './useFolderBrowser.js';

afterEach(() => cleanup());

interface RecordedCall {
  url: string;
  method: string;
}

/** Routes on the URL: roots, then one listing per path — a bad path answers 400 with words. */
function fsStub(
  roots: Array<{ name: string; path: string }>,
  listings: Record<string, { parent: string | null; entries: Array<{ name: string; path: string }> }>,
): { fetchImpl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? 'GET' });
    const json = (status: number, body: unknown) =>
      ({ ok: status < 300, status, json: async () => body }) as unknown as Response;
    if (url === '/api/fs/roots') return json(200, { roots });
    if (url.startsWith('/api/fs/list?path=')) {
      const path = decodeURIComponent(url.slice('/api/fs/list?path='.length));
      const listing = listings[path];
      if (!listing) return json(400, { error: `no such path: ${path}` });
      return json(200, {
        path,
        parent: listing.parent,
        entries: listing.entries.map((e) => ({ ...e, hasGit: false, hasPackageJson: false, hasAngularJson: false, hasCsproj: false, hasDocs: false })),
      });
    }
    return json(404, { error: 'not found' });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const HOME = '/home/you';
const roots = [
  { name: '/', path: '/' },
  { name: '~', path: HOME },
];
const listings = {
  '/': { parent: null, entries: [{ name: 'home', path: '/home' }] },
  [HOME]: { parent: '/home', entries: [{ name: 'repo', path: `${HOME}/repo`, }, { name: 'notes', path: `${HOME}/notes` }] },
  '/home': { parent: '/', entries: [{ name: 'you', path: HOME }] },
  [`${HOME}/repo`]: { parent: HOME, entries: [] },
};

describe('useFolderBrowser', () => {
  it('reads the roots on mount and goes to the "~" root first — home is where repos live', async () => {
    const { fetchImpl, calls } = fsStub(roots, listings);
    const { result } = renderHook(() => useFolderBrowser({ fetchImpl }));
    expect(result.current.status).toBe('reading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.roots).toEqual(roots);
    expect(result.current.path).toBe(HOME);
    expect(result.current.parent).toBe('/home');
    expect(result.current.entries.map((e) => e.name)).toEqual(['repo', 'notes']);
    expect(calls.map((c) => c.url)).toEqual(['/api/fs/roots', `/api/fs/list?path=${encodeURIComponent(HOME)}`]);
  });

  it('falls back to the first root when no root is named "~" (Windows drive letters)', async () => {
    const drives = [
      { name: 'C:', path: 'C:\\' },
      { name: 'D:', path: 'D:\\' },
    ];
    const { fetchImpl } = fsStub(drives, { 'C:\\': { parent: null, entries: [] } });
    const { result } = renderHook(() => useFolderBrowser({ fetchImpl }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.path).toBe('C:\\');
    expect(result.current.parent).toBeNull();
  });

  it('goTo(path) reads that folder; up() goes to the parent; refresh() re-reads the current one', async () => {
    const { fetchImpl, calls } = fsStub(roots, listings);
    const { result } = renderHook(() => useFolderBrowser({ fetchImpl }));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.goTo(`${HOME}/repo`));
    await waitFor(() => expect(result.current.path).toBe(`${HOME}/repo`));
    expect(result.current.entries).toEqual([]);

    act(() => result.current.up());
    await waitFor(() => expect(result.current.path).toBe(HOME));

    const before = calls.length;
    act(() => result.current.refresh());
    await waitFor(() => expect(calls.length).toBe(before + 1));
    expect(calls[calls.length - 1].url).toBe(`/api/fs/list?path=${encodeURIComponent(HOME)}`);
    expect(result.current.path).toBe(HOME);
  });

  it('a failed listing keeps the previous listing and carries the server\'s words in message', async () => {
    const { fetchImpl } = fsStub(roots, listings);
    const { result } = renderHook(() => useFolderBrowser({ fetchImpl }));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.goTo('/nowhere'));
    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.message).toBe('no such path: /nowhere');
    expect(result.current.path).toBe(HOME);
    expect(result.current.entries.map((e) => e.name)).toEqual(['repo', 'notes']);
  });

  it('up() at a root (parent null) does nothing', async () => {
    const { fetchImpl, calls } = fsStub([{ name: '/', path: '/' }], { '/': { parent: null, entries: [] } });
    const { result } = renderHook(() => useFolderBrowser({ fetchImpl }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const before = calls.length;
    act(() => result.current.up());
    expect(calls.length).toBe(before);
  });

  it('becomes failed with the words when the roots themselves cannot be read', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 403, json: async () => ({ error: 'cross-origin request rejected' }) })) as unknown as typeof fetch;
    const { result } = renderHook(() => useFolderBrowser({ fetchImpl }));
    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.message).toBe('cross-origin request rejected');
    expect(result.current.roots).toEqual([]);
  });
});
