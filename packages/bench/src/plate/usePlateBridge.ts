import { useCallback, useEffect, useState, type RefObject } from 'react';

/**
 * The bench half of the postMessage contract with the loupe (`packages/server/src/plate/
 * loupe.js`). Every message is checked against the plate's own origin before being trusted —
 * the plate is a cross-origin iframe by design (ADR-002), so this is a real security
 * boundary, not a formality.
 */

export interface PlatePick {
  type: 'jig:pick';
  path: string;
  tag: string;
  text: string;
  component?: string;
  componentClass?: string;
  file?: string;
  rect: { x: number; y: number; width: number; height: number };
}

export interface PlateEvent {
  type: 'jig:event';
  kind: 'click' | 'input';
  path: string;
  value?: string;
}

export interface SurveySelector {
  selector: string;
  name: string;
  file: string;
}

export type LoupeMode = 'hand' | 'loupe';

export interface UsePlateBridgeResult {
  lastPick: PlatePick | null;
  events: PlateEvent[];
  mode: LoupeMode;
  setMode: (mode: LoupeMode) => void;
  /** Posts `jig:highlight` — the Gauges panel's two-way lighting (S4) and the command
   * palette's "light this gauge/component" action both go through this. */
  highlight: (selectors: string[]) => void;
  /** Posts `jig:clear` — the `printed` affordance that unlights everything. */
  clearHighlight: () => void;
  /** Posts `jig:navigate` — the command palette's "routes" items. */
  navigate: (path: string) => void;
}

const MAX_EVENTS = 200;

function isPick(data: unknown): data is PlatePick {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'jig:pick';
}

function isPlateEvent(data: unknown): data is PlateEvent {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'jig:event';
}

/** Listens for the loupe's postMessage traffic (origin-checked against `plateOrigin`) and
 * exposes the last pick plus a capped event log; `setMode` and the survey-selector push post
 * back to the plate iframe via `iframeRef`. `plateOrigin` is null until `/api/plate` reports
 * a real port (S3's `usePlatePoll`) — nothing is ever posted before then. */
export function usePlateBridge(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  plateOrigin: string | null,
  selectors: SurveySelector[],
): UsePlateBridgeResult {
  const [lastPick, setLastPick] = useState<PlatePick | null>(null);
  const [events, setEvents] = useState<PlateEvent[]>([]);
  const [mode, setModeState] = useState<LoupeMode>('hand');

  useEffect(() => {
    function onMessage(event: MessageEvent): void {
      if (!plateOrigin || event.origin !== plateOrigin) return;
      const data: unknown = event.data;
      if (isPick(data)) {
        setLastPick(data);
      } else if (isPlateEvent(data)) {
        setEvents((prev) => [...prev, data].slice(-MAX_EVENTS));
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [plateOrigin]);

  const postToPlate = useCallback(
    (message: unknown) => {
      if (!plateOrigin) return;
      iframeRef.current?.contentWindow?.postMessage(message, plateOrigin);
    },
    [iframeRef, plateOrigin],
  );

  useEffect(() => {
    if (selectors.length > 0) postToPlate({ type: 'jig:survey', selectors });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectors, plateOrigin]);

  const setMode = useCallback(
    (next: LoupeMode) => {
      setModeState(next);
      postToPlate({ type: 'jig:mode', mode: next });
    },
    [postToPlate],
  );

  const highlight = useCallback(
    (selectors: string[]) => postToPlate({ type: 'jig:highlight', selectors }),
    [postToPlate],
  );

  const clearHighlight = useCallback(() => postToPlate({ type: 'jig:clear' }), [postToPlate]);

  const navigate = useCallback(
    (path: string) => postToPlate({ type: 'jig:navigate', path }),
    [postToPlate],
  );

  return { lastPick, events, mode, setMode, highlight, clearHighlight, navigate };
}
