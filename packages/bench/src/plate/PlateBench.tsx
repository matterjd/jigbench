import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { Gauge, Survey } from '@jigbench/core';
import { Panel } from '../components/Panel.js';
import { PlateFrame } from './PlateFrame.js';
import { PlateRulers } from './PlateRulers.js';
import { PlateGuides } from './PlateGuides.js';
import { resolveGridPx } from './gridReadout.js';
import { usePlatePoll, type FetchLike } from './usePlatePoll.js';
import { usePlateBridge, type LoupeMode, type PlatePick, type SurveySelector } from './usePlateBridge.js';
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
}

export interface PlateBenchHandle {
  /** Posts `jig:highlight` with selectors — the Gauges panel and the command palette both
   * drive the plate through this rather than reaching into the bridge themselves. */
  highlight: (selectors: string[]) => void;
  clearHighlight: () => void;
  navigate: (path: string) => void;
  setMode: (mode: LoupeMode) => void;
}

/** S3's plate, extended by S4 with rulers (in the app's own CSS px) and guides (drawn from
 * the last pick's rect, snapped to the surveyed spacing gauges — CHASSIS.md). Composes
 * `PlateFrame` (the iframe, or an honest "no target"/"unreachable" message) and the
 * `usePlateBridge` postMessage wiring; the Loupe readout itself now lives in the Properties
 * column (`onPick`/`onModeChange` mirror the bridge's state up there). */
export const PlateBench = forwardRef<PlateBenchHandle, PlateBenchProps>(function PlateBench(
  { survey, gauges, fetchImpl, onPick, onModeChange },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
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

  useImperativeHandle(
    ref,
    () => ({
      highlight: bridge.highlight,
      clearHighlight: bridge.clearHighlight,
      navigate: bridge.navigate,
      setMode: bridge.setMode,
    }),
    [bridge],
  );

  useEffect(() => {
    onPick?.(bridge.lastPick);
  }, [bridge.lastPick, onPick]);

  useEffect(() => {
    onModeChange?.(bridge.mode);
  }, [bridge.mode, onModeChange]);

  return (
    <div className="jig-plate-bench">
      <Panel title="Plate" className="jig-plate-bench__frame">
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
