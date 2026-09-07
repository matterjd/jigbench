import type { Gauge, Survey } from '@jigbench/core';
import { gaugesForComponent } from '../gauges/resolveGaugeUsage.js';
import type { PlatePick } from '../plate/usePlateBridge.js';
import './InspectPane.css';

export interface InspectPaneProps {
  lastPick: PlatePick | null;
  survey?: Survey;
  gauges?: readonly Gauge[];
  /** Called with a gauge's name when its chip is clicked — the caller opens the Design system
   * tab and lights it (mirrors that panel's own click behaviour). */
  onGaugeSelect?: (gaugeName: string) => void;
}

/** "Inspect — what is selected" (AMENDMENT-1 §4). The right column's second tab: what the last
 * Point pick was — component, file, tag, text — the gauges it uses, and (when a survey is given)
 * its routes by exact component-name match. v0.1's Hand/Loupe toggle is gone from here: the mode
 * now lives entirely on the rail (Point vs Hand), not a second control inside this pane. Endpoints
 * and cross-file docs are not shown: the survey schema has no per-component correlation for
 * either yet (`Endpoint` carries no owning component; docs matching would need a live `/api/docs`
 * query per pick) — an honest gap, not a guessed line, left for a later survey slice. */
export function InspectPane({ lastPick, survey, gauges, onGaugeSelect }: InspectPaneProps) {
  if (!lastPick) {
    return (
      <p className="jig-inspect__empty">
        Nothing pointed at — <b>Point</b> at the plate and click, or pick a prompt.
      </p>
    );
  }

  const pickedComponent = survey
    ? survey.components.find((c) => c.file === lastPick.file || c.name === lastPick.component)
    : undefined;
  const usedGauges = gauges && pickedComponent ? gaugesForComponent(pickedComponent, gauges) : [];
  const routes = survey && lastPick.component ? survey.routes.filter((r) => r.component === lastPick.component) : [];

  return (
    <div className="jig-inspect">
      <dl className="jig-inspect__kv jig-inspect__block">
        <dt>Component</dt>
        <dd>{lastPick.component ?? lastPick.tag}</dd>
        <dt>File</dt>
        <dd>{lastPick.file ?? '—'}</dd>
        <dt>Tag</dt>
        <dd>{lastPick.tag}</dd>
        <dt>Text</dt>
        <dd>{lastPick.text || '—'}</dd>
      </dl>

      {survey && gauges && (
        <div className="jig-inspect__block">
          <p className="jig-inspect__title">gauges it uses</p>
          {usedGauges.length === 0 ? (
            <p className="jig-inspect__empty-inline">none of its own — inherits</p>
          ) : (
            <div className="jig-inspect__gauge-chips">
              {usedGauges.map((g) => (
                <button
                  key={g.name}
                  type="button"
                  className="jig-inspect__gauge-chip"
                  onClick={() => onGaugeSelect?.(g.name)}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {survey && (
        <dl className="jig-inspect__kv jig-inspect__block">
          <dt>routes</dt>
          <dd>{routes.length ? routes.map((r) => r.path).join(' · ') : '—'}</dd>
          <dt>endpoints</dt>
          <dd>— not yet correlated to a component by the survey</dd>
          <dt>docs</dt>
          <dd>— none matched</dd>
        </dl>
      )}
    </div>
  );
}
