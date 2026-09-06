import type { Gauge, Survey } from '@jigbench/core';
import { Panel } from '../components/Panel.js';
import { gaugesForComponent } from '../gauges/resolveGaugeUsage.js';
import type { LoupeMode, PlatePick } from './usePlateBridge.js';
import './LoupeReadout.css';

export interface LoupeReadoutProps {
  lastPick: PlatePick | null;
  mode: LoupeMode;
  onModeChange: (mode: LoupeMode) => void;
  /** S4 extension — resolves the picked component (by file, falling back to name) so its
   * gauges can be listed below the pick. Both optional: an older caller with no survey/gauges
   * yet just gets the plain pick readout, unchanged. */
  survey?: Survey;
  gauges?: readonly Gauge[];
  /** Called with a gauge's name when its chip is clicked — the caller opens the Gauges tab
   * and lights it (mirrors the Gauges panel's own click behaviour). */
  onGaugeSelect?: (gaugeName: string) => void;
}

/** "Loupe — point at anything and see what it is" (COMMISSION.md §3). Shows the last thing
 * the loupe picked on the plate: component, file, tag, text — the hand/loupe mode toggle —
 * and, when a survey and gauge set are given (S4), the gauges the picked component uses. */
export function LoupeReadout({ lastPick, mode, onModeChange, survey, gauges, onGaugeSelect }: LoupeReadoutProps) {
  const pickedComponent =
    lastPick && survey
      ? survey.components.find((c) => c.file === lastPick.file || c.name === lastPick.component)
      : undefined;
  const usedGauges = gauges && pickedComponent ? gaugesForComponent(pickedComponent, gauges) : [];

  return (
    <Panel title="Loupe" className="jig-loupe-readout">
      <div className="jig-loupe-readout__toggle" role="group" aria-label="loupe mode">
        <button type="button" aria-pressed={mode === 'hand'} onClick={() => onModeChange('hand')}>
          Hand
        </button>
        <button type="button" aria-pressed={mode === 'loupe'} onClick={() => onModeChange('loupe')}>
          Loupe
        </button>
      </div>

      {lastPick ? (
        <>
          <dl className="jig-loupe-readout__pick">
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
            <div className="jig-loupe-readout__gauges">
              <p className="jig-loupe-readout__gauges-title">gauges it uses</p>
              {usedGauges.length === 0 ? (
                <p className="jig-loupe-readout__gauges-empty">
                  no gauges on this element itself — its children may carry them
                </p>
              ) : (
                <div className="jig-loupe-readout__gauge-chips">
                  {usedGauges.map((g) => (
                    <button
                      key={g.name}
                      type="button"
                      className="jig-loupe-readout__gauge-chip"
                      onClick={() => onGaugeSelect?.(g.name)}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="jig-loupe-readout__empty">
          Point at anything on the plate — the loupe: point at anything and see what it is.
        </p>
      )}
    </Panel>
  );
}
