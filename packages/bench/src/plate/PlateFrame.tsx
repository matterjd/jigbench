import { forwardRef } from 'react';
import type { PlateApiStatus } from './usePlatePoll.js';
import './PlateFrame.css';

export interface PlateFrameProps {
  status: PlateApiStatus;
}

/** "Plate — where the app renders" (COMMISSION.md §3). Embeds the target app as a
 * cross-origin iframe pointed at the plate proxy's own port (ADR-002) — or, when there is no
 * target or it isn't answering, says so in words. Never a spinner (Law I.6): there is
 * nothing to wait for here that resolves itself. */
export const PlateFrame = forwardRef<HTMLIFrameElement, PlateFrameProps>(function PlateFrame(
  { status },
  ref,
) {
  if (status.status === 'none') {
    return (
      <div className="jig-plate-frame jig-plate-frame--empty">
        <p className="jig-plate-frame__tongue">Plate — where the app renders</p>
        <p>
          No target is set. Start <code>jigbench</code> with <code>--target &lt;url&gt;</code>, e.g.{' '}
          <code>--target http://localhost:4200</code>.
        </p>
      </div>
    );
  }

  if (status.status === 'down') {
    return (
      <div className="jig-plate-frame jig-plate-frame--empty">
        <p className="jig-plate-frame__tongue">Plate — where the app renders</p>
        <p>
          <code>{status.target}</code> is not answering yet. Start it — the plate will pick it up
          automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="jig-plate-frame">
      <iframe
        ref={ref}
        className="jig-plate-frame__iframe"
        title="plate — where the app renders"
        src={`http://localhost:${status.port}/`}
      />
    </div>
  );
});
