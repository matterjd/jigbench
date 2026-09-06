import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import './PropertiesColumn.css';

const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 240;
const MAX_WIDTH = 560;

export type PropertiesTab = 'loupe' | 'gauges' | 'survey' | 'fixture' | 'toolpath' | 'sketch';

export interface PropertiesColumnProps {
  loupe: ReactNode;
  gauges: ReactNode;
  survey: ReactNode;
  /** S7's `FixturePanel`, mounted by the integrator (CHASSIS.md's properties column gets a
   * fourth tab beside Loupe · Gauges · Survey). Optional — a column with no fixture content
   * simply renders the original three tabs, so every pre-existing caller/test is unaffected. */
  fixture?: ReactNode;
  /** S8's `ToolpathBar`, the same optional-prop pattern as `fixture` above — absent, no tab. */
  toolpath?: ReactNode;
  /** S9's `SketchProperties`, the same optional-prop pattern as `fixture`/`toolpath` above. */
  sketch?: ReactNode;
  /** Badge counts shown beside the Gauges/Survey tab labels — optional, since neither the
   * gauge set nor the survey is guaranteed to be loaded yet. */
  gaugesCount?: number;
  surveyCount?: number;
  /** Controlled active tab — e.g. clicking a gauge chip in the Loupe tab switches to Gauges.
   * Omit for the column to manage its own tab state (the common case). */
  activeTab?: PropertiesTab;
  onTabChange?: (tab: PropertiesTab) => void;
}

/** "Properties column" (CHASSIS.md) — Loupe · Gauges · Survey tabs, resizable by dragging its
 * left edge, with a `printed` affordance (design floor item 24: every resized surface gets one
 * affordance back to its default) that appears only once the width has actually moved. */
export function PropertiesColumn({
  loupe,
  gauges,
  survey,
  fixture,
  toolpath,
  sketch,
  gaugesCount,
  surveyCount,
  activeTab,
  onTabChange,
}: PropertiesColumnProps) {
  const [internalTab, setInternalTab] = useState<PropertiesTab>('loupe');
  const tab = activeTab ?? internalTab;
  const setTab = (next: PropertiesTab): void => {
    setInternalTab(next);
    onTabChange?.(next);
  };
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const onMouseMove = useCallback((event: MouseEvent) => {
    const drag = dragState.current;
    if (!drag) return;
    const delta = drag.startX - event.clientX; // dragging left (smaller clientX) widens the column
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, drag.startWidth + delta));
    setWidth(next);
  }, []);

  const onMouseUp = useCallback(() => {
    dragState.current = null;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }, [onMouseMove]);

  useEffect(() => () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }, [onMouseMove, onMouseUp]);

  function onHandleMouseDown(event: ReactMouseEvent): void {
    dragState.current = { startX: event.clientX, startWidth: width };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function resetWidth(): void {
    setWidth(DEFAULT_WIDTH);
  }

  const isPrinted = width === DEFAULT_WIDTH;

  return (
    <div className="jig-properties" style={{ width: `${width}px` }} aria-label="properties">
      <div
        className="jig-properties__handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="resize the properties column"
        onMouseDown={onHandleMouseDown}
      />
      <div className="jig-properties__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'loupe'}
          onClick={() => setTab('loupe')}
        >
          Loupe
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'gauges'}
          onClick={() => setTab('gauges')}
        >
          Gauges
          {gaugesCount !== undefined && <span className="jig-properties__count">{gaugesCount}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'survey'}
          onClick={() => setTab('survey')}
        >
          Survey
          {surveyCount !== undefined && <span className="jig-properties__count">{surveyCount}</span>}
        </button>
        {fixture !== undefined && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'fixture'}
            onClick={() => setTab('fixture')}
          >
            Fixture
          </button>
        )}
        {toolpath !== undefined && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'toolpath'}
            onClick={() => setTab('toolpath')}
          >
            Toolpath
          </button>
        )}
        {sketch !== undefined && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'sketch'}
            onClick={() => setTab('sketch')}
          >
            Sketch
          </button>
        )}
        {!isPrinted && (
          <button type="button" className="jig-properties__printed" onClick={resetWidth}>
            printed
          </button>
        )}
      </div>
      <div className="jig-properties__pane" role="tabpanel">
        {tab === 'loupe' && loupe}
        {tab === 'gauges' && gauges}
        {tab === 'survey' && survey}
        {tab === 'fixture' && fixture}
        {tab === 'toolpath' && toolpath}
        {tab === 'sketch' && sketch}
      </div>
    </div>
  );
}
