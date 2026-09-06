import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type RefObject } from 'react';
import type { Gauge, Survey } from '@jigbench/core';
import { Chip } from '../components/Chip.js';
import { Panel } from '../components/Panel.js';
import { PlateFrame } from './PlateFrame.js';
import { PlateRulers } from './PlateRulers.js';
import { PlateGuides } from './PlateGuides.js';
import { resolveGridPx } from './gridReadout.js';
import { usePlatePoll, type FetchLike } from './usePlatePoll.js';
import { usePlateBridge, type LoupeMode, type PlateEvent, type PlatePick, type SurveySelector } from './usePlateBridge.js';
import './PlateBench.css';

export interface PlateBenchProps {
  survey?: Survey;
  /** The survey's gauge set — used only to resolve the rulers/guides' grid unit (the
   * smallest `space`-category gauge; 4px when there is none). */
  gauges?: readonly Gauge[];
  /** Override point for tests — defaults to the global `fetch`. */
  fetchImpl?: FetchLike;
  /** Mirrors the bridge's last pick up to the chassis — the Properties column's Loupe/Gauges
   * tabs need it and live outside this component (CHASSIS.md moved the Loupe readout there). */
  onPick?: (pick: PlatePick | null) => void;
  /** Mirrors the bridge's mode up to the chassis (the rail reads it to know what to show as
   * active, and to decide whether to re-post `jig:mode` on its own tool changes). */
  onModeChange?: (mode: LoupeMode) => void;
  /** External iframe ref (integrator seam — TrayRegion posts its own `jig:highlight` for the
   * order-in-hand's mark path, alongside App's `plateRef.current?.highlight()` calls, so it
   * needs the same iframe element). Falls back to an internally-created ref when omitted —
   * every existing caller (and test) that never heard of this prop is unaffected. */
  iframeRef?: RefObject<HTMLIFrameElement | null>;
  /** Mirrors the bridge's resolved plate origin up to the chassis, the same way onPick/
   * onModeChange do — TrayRegion needs it (alongside `iframeRef`) to post directly rather
   * than through this component's imperative handle. */
  onPlateOriginChange?: (origin: string | null) => void;
  /** S8: mirrors the bridge's raw `jig:event` stream up — the toolpath recorder needs every
   * click/input with its DOM path, the same pattern `onPick`/`onModeChange` already use. */
  onEvent?: (event: PlateEvent) => void;
}

export interface PlateBenchHandle {
  /** Posts `jig:highlight` with selectors — the Gauges panel and the command palette both
   * drive the plate through this rather than reaching into the bridge themselves. */
  highlight: (selectors: string[]) => void;
  clearHighlight: () => void;
  navigate: (path: string) => void;
  setMode: (mode: LoupeMode) => void;
  /** S8: posts an arbitrary `jig:*` message — the toolpath replayer's own seam. */
  post: (message: Record<string, unknown>) => void;
}

/** S3's plate, extended by S4 with rulers (in the app's own CSS px) and guides (drawn from
 * the last pick's rect, snapped to the surveyed spacing gauges — CHASSIS.md). Composes
 * `PlateFrame` (the iframe, or an honest "no target"/"unreachable" message) and the
 * `usePlateBridge` postMessage wiring; the Loupe readout itself now lives in the Properties
 * column (`onPick`/`onModeChange` mirror the bridge's state up there). */
export const PlateBench = forwardRef<PlateBenchHandle, PlateBenchProps>(function PlateBench(
  { survey, gauges, fetchImpl, onPick, onModeChange, iframeRef: externalIframeRef, onPlateOriginChange, onEvent },
  ref,
) {
  const internalIframeRef = useRef<HTMLIFrameElement>(null);
  const iframeRef = externalIframeRef ?? internalIframeRef;
  const status = usePlatePoll(fetchImpl);
  const plateOrigin = status.status === 'up' ? `http://localhost:${status.port}` : null;

  const selectors: SurveySelector[] = useMemo(
    () => (survey?.components ?? []).map((component) => ({
      selector: component.selector,
      name: component.name,
      file: component.file,
    })),
    [survey],
  );

  const bridge = usePlateBridge(iframeRef, plateOrigin, selectors);
  const grid = useMemo(() => resolveGridPx(gauges), [gauges]);

  // Integration seam 3: S7's FixturePanel dispatches this DOM event on load/unload
  // (`fixtures/FixturePanel.tsx`'s `dispatchFixtureLoaded`) — the plate frame listens for it
  // directly rather than re-polling `GET /api/plate` (which already carries `fixture` too,
  // but only every 4s via usePlatePoll; the event is instant and the panel already owns the
  // load/unload lifecycle, so this is the one source of truth, not a second poller).
  const [fixtureName, setFixtureName] = useState<string | null>(null);
  useEffect(() => {
    function onFixtureLoaded(event: Event): void {
      const detail = (event as CustomEvent<{ name: string | null }>).detail;
      setFixtureName(detail?.name ?? null);
    }
    window.addEventListener('jig:fixture-loaded', onFixtureLoaded);
    return () => window.removeEventListener('jig:fixture-loaded', onFixtureLoaded);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      highlight: bridge.highlight,
      clearHighlight: bridge.clearHighlight,
      navigate: bridge.navigate,
      setMode: bridge.setMode,
      post: bridge.post, // S8
    }),
    [bridge],
  );

  useEffect(() => {
    onPick?.(bridge.lastPick);
  }, [bridge.lastPick, onPick]);

  // S8: the toolpath recorder's own seam — mirrors the last jig:event up, same pattern as
  // onPick/onModeChange above.
  const lastEvent = bridge.events.length > 0 ? bridge.events[bridge.events.length - 1] : undefined;
  useEffect(() => {
    if (lastEvent) onEvent?.(lastEvent as PlateEvent);
  }, [lastEvent, onEvent]);

  useEffect(() => {
    onModeChange?.(bridge.mode);
  }, [bridge.mode, onModeChange]);

  useEffect(() => {
    onPlateOriginChange?.(plateOrigin);
  }, [plateOrigin, onPlateOriginChange]);

  return (
    <div className="jig-plate-bench">
      <Panel title="Plate" className="jig-plate-bench__frame">
        {fixtureName && (
          <div className="jig-plate-bench__fixture-chip">
            <Chip tone="storm" glyph="●">
              fixture · {fixtureName} · loaded — the plate answers from it
            </Chip>
          </div>
        )}
        <div className="jig-plate-bench__surface">
          <PlateRulers cursor={null} />
          <div className="jig-plate-bench__viewport">
            <PlateFrame ref={iframeRef} status={status} />
            <PlateGuides rect={bridge.lastPick?.rect ?? null} grid={grid} />
          </div>
        </div>
      </Panel>
    </div>
  );
});
