import { useEffect, useState } from 'react';

export interface PlateHeaderChangeView {
  header: string;
  from: string | null;
  to: string | null;
  reason: string;
}

export interface PlateApiStatus {
  target: string | null;
  port: number;
  status: 'up' | 'down' | 'none';
  changes: PlateHeaderChangeView[];
}

const POLL_MS = 4000;
const NONE_STATUS: PlateApiStatus = { target: null, port: 0, status: 'none', changes: [] };

export type FetchLike = typeof fetch;

/** Polls `GET /api/plate` (S3) so the plate region can show an honest "no target" / "target
 * unreachable" message instead of an iframe that would just fail to load. A 404 (no plate
 * proxy configured at all — older `jigbench` builds, or `serve` started with no plate)
 * degrades to the same honest "none" state rather than an error. */
export function usePlatePoll(fetchImpl: FetchLike = fetch): PlateApiStatus {
  const [status, setStatus] = useState<PlateApiStatus>(NONE_STATUS);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const res = await fetchImpl('/api/plate');
        if (!res.ok) {
          if (!cancelled) setStatus(NONE_STATUS);
          return;
        }
        const data = (await res.json()) as PlateApiStatus;
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) {
          setStatus((prev) => (prev.status === 'none' ? prev : { ...prev, status: 'down' }));
        }
      }
    }

    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fetchImpl]);

  return status;
}
