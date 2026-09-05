import { useMemo, useRef } from 'react';
import type { Survey } from '@jigbench/core';
import { Panel } from '../components/Panel.js';
import { PlateFrame } from './PlateFrame.js';
import { LoupeReadout } from './LoupeReadout.js';
import { usePlatePoll, type FetchLike } from './usePlatePoll.js';
import { usePlateBridge, type SurveySelector } from './usePlateBridge.js';
import './PlateBench.css';

export interface PlateBenchProps {
  survey?: Survey;
  /** Override point for tests — defaults to the global `fetch`. */
  fetchImpl?: FetchLike;
}

/** S3's plate: the bench's own frame that shows the clamped app and reads what the loupe
 * picks. Composes `PlateFrame` (the iframe, or an honest "no target"/"unreachable" message),
 * `LoupeReadout` (the last pick + hand/loupe toggle), and the `usePlateBridge` postMessage
 * wiring between them — one mount point for `App.tsx`. */
export function PlateBench({ survey, fetchImpl }: PlateBenchProps) {
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

  return (
    <div className="jig-plate-bench">
      <Panel title="Plate" className="jig-plate-bench__frame">
        <PlateFrame ref={iframeRef} status={status} />
      </Panel>
      <LoupeReadout lastPick={bridge.lastPick} mode={bridge.mode} onModeChange={bridge.setMode} />
    </div>
  );
}
