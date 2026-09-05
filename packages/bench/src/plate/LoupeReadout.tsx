import { Panel } from '../components/Panel.js';
import type { LoupeMode, PlatePick } from './usePlateBridge.js';
import './LoupeReadout.css';

export interface LoupeReadoutProps {
  lastPick: PlatePick | null;
  mode: LoupeMode;
  onModeChange: (mode: LoupeMode) => void;
}

/** "Loupe — point at anything and see what it is" (COMMISSION.md §3). Shows the last thing
 * the loupe picked on the plate: component, file, tag, text — and the hand/loupe mode
 * toggle that tells the loupe which behaviour to run. */
export function LoupeReadout({ lastPick, mode, onModeChange }: LoupeReadoutProps) {
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
      ) : (
        <p className="jig-loupe-readout__empty">
          Point at anything on the plate — the loupe: point at anything and see what it is.
        </p>
      )}
    </Panel>
  );
}
