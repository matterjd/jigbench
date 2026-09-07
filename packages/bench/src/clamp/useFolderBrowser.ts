import { useCallback, useEffect, useRef, useState } from 'react';
import { fsList, fsRoots, type FsEntry, type FsRoot } from './api.js';

/**
 * The Clamp screen's folder browser state (AMENDMENT-1 §7, A6: "pick the repo folder in Jig's
 * own folder browser — a page cannot receive a real path from the OS picker"). On mount it reads
 * the roots and goes to `~` when there is one (home is where repos live), else the first root.
 *
 * A failed read keeps the previous listing in place and carries the server's own words in
 * `message` — the browser never blanks out under you because one path was bad.
 */
export type FolderBrowserStatus = 'idle' | 'reading' | 'ready' | 'failed';

export interface UseFolderBrowserOptions {
  fetchImpl?: typeof fetch;
}

export interface FolderBrowser {
  roots: FsRoot[];
  /** The folder whose listing `entries` shows — `null` before the first read lands. */
  path: string | null;
  parent: string | null;
  entries: FsEntry[];
  status: FolderBrowserStatus;
  /** The server's words when `status` is `'failed'`; empty otherwise. */
  message: string;
  /** The folder being read while `status` is `'reading'` — what the "reading … " sentence names. */
  pending: string | null;
  goTo(path: string): void;
  up(): void;
  refresh(): void;
}

export function useFolderBrowser(options: UseFolderBrowserOptions = {}): FolderBrowser {
  const fetchImpl = options.fetchImpl ?? fetch;
  const [roots, setRoots] = useState<FsRoot[]>([]);
  const [path, setPath] = useState<string | null>(null);
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [status, setStatus] = useState<FolderBrowserStatus>('idle');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  // A read that lands after a newer one was asked for is stale — ignore it rather than let
  // two clicks in quick succession settle on the wrong folder.
  const readSeq = useRef(0);
  const mounted = useRef(true);

  const goTo = useCallback(
    (target: string) => {
      const seq = ++readSeq.current;
      setStatus('reading');
      setPending(target);
      setMessage('');
      void fsList(target, fetchImpl).then((result) => {
        if (!mounted.current || seq !== readSeq.current) return;
        setPending(null);
        if (result.ok) {
          setPath(result.data.path);
          setParent(result.data.parent);
          setEntries(result.data.entries);
          setStatus('ready');
          setMessage('');
        } else {
          setStatus('failed');
          setMessage(result.message);
        }
      });
    },
    [fetchImpl],
  );

  const up = useCallback(() => {
    if (parent !== null) goTo(parent);
  }, [parent, goTo]);

  const refresh = useCallback(() => {
    if (path !== null) goTo(path);
  }, [path, goTo]);

  useEffect(() => {
    mounted.current = true;
    setStatus('reading');
    void fsRoots(fetchImpl).then((result) => {
      if (!mounted.current) return;
      if (!result.ok) {
        setStatus('failed');
        setMessage(result.message);
        return;
      }
      setRoots(result.data.roots);
      const first = result.data.roots.find((r) => r.name === '~') ?? result.data.roots[0];
      if (first) goTo(first.path);
      else {
        setStatus('failed');
        setMessage('no folders to browse — paste a path instead');
      }
    });
    return () => {
      mounted.current = false;
    };
  }, [fetchImpl, goTo]);

  return { roots, path, parent, entries, status, message, pending, goTo, up, refresh };
}
