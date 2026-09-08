import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

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
  /** S8: posts an arbitrary `jig:*` message verbatim — the toolpath replayer sends
   * `jig:click`/`jig:fill`/`jig:navigate` at its own pace rather than growing a bespoke
   * bridge method per message shape the way `highlight`/`navigate` above do. */
  post: (message: Record<string, unknown>) => void;
}

const MAX_EVENTS = 200;

function isPick(data: unknown): data is PlatePick {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'jig:pick';
}

function isPlateEvent(data: unknown): data is PlateEvent {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'jig:event';
}

/** #19: the loupe posts `jig:ready` as soon as it boots — the bench answers with the survey. */
function isReady(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'jig:ready';
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

  const postToPlate = useCallback(
    (message: unknown) => {
      if (!plateOrigin) return;
      iframeRef.current?.contentWindow?.postMessage(message, plateOrigin);
    },
    [iframeRef, plateOrigin],
  );

  // #19 (the 0.2.0 review): on a runtime clamp the survey arrives before the plate iframe has
  // loaded — the state carries it while the plate is still coming up — and a post to a frame
  // that is not there yet is simply lost; the loupe never had the selector table, every pick
  // came back with no file, and the prompt's Context read "nothing surveyed yet". So the
  // latest table lives in a ref and is sent three ways: eagerly when it changes (as before),
  // again on the iframe's own `load` (every navigation of the frame fires it — a full reload
  // under HMR included), and in answer to the loupe's `jig:ready`, posted as soon as it boots.
  const selectorsRef = useRef<SurveySelector[]>(selectors);
  selectorsRef.current = selectors;
  const postSurvey = useCallback(() => {
    if (selectorsRef.current.length > 0) postToPlate({ type: 'jig:survey', selectors: selectorsRef.current });
  }, [postToPlate]);

  useEffect(() => {
    function onMessage(event: MessageEvent): void {
      if (!plateOrigin || event.origin !== plateOrigin) return;
      const data: unknown = event.data;
      if (isPick(data)) {
        setLastPick(data);
      } else if (isPlateEvent(data)) {
        setEvents((prev) => [...prev, data].slice(-MAX_EVENTS));
      } else if (isReady(data)) {
        postSurvey();
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [plateOrigin, postSurvey]);

  useEffect(() => {
    postSurvey();
  }, [selectors, postSurvey]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !plateOrigin) return;
    iframe.addEventListener('load', postSurvey);
    return () => iframe.removeEventListener('load', postSurvey);
  }, [iframeRef, plateOrigin, postSurvey]);

  const setMode = useCallback(
    (next: LoupeMode) => {
      setModeState(next);
      postToPlate({ type: 'jig:mode', mode: next });
      // Wave-4 fix (TEST-RUN.md's first live test, defect 2): "Loupe grid and selection
      // still shows when switching to hand, does not disengage." `jig:mode hand` alone only
      // clears the PLATE's own hover outline (loupe.js's `clearOutline`) — it never touches
      // the highlight boxes a prior jig:highlight painted, and it never touches the BENCH's
      // own `lastPick`, which is what PlateGuides (the guide lines + grid readout) and the
      // Loupe tab's readout keep drawing from. Disengaging to hand has to clear all three —
      // this is the one place every caller (the rail, Esc, the command palette, and the
      // Loupe tab's own Hand|Loupe toggle) already funnels through, so it is the one place
      // that needs to.
      if (next === 'hand') {
        setLastPick(null);
        postToPlate({ type: 'jig:clear' });
      }
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

  return { lastPick, events, mode, setMode, highlight, clearHighlight, navigate, post: postToPlate }; // S8: `post`
}
