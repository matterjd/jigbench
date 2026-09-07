import type { ReactNode } from 'react';
import './Chassis.css';

export interface ChassisProps {
  rail: ReactNode;
  /** The plate area — the app or the sketch sheet, its overlay, and the prompt card. Chassis
   * only gives it the region; PlateArea (App.tsx) owns everything inside it. */
  plate: ReactNode;
  /** Rendered under the plate, in its own auto-height row (0 when this is undefined) — the
   * Advanced switch's drawer (AMENDMENT-1 §4). Absent by default. */
  advancedDrawer?: ReactNode;
  column: ReactNode;
  statusLine: ReactNode;
}

/** The quiet bench's shell (concept D / AMENDMENT-1 §4): a rail, a centre column that stacks the
 * plate over an optional Advanced drawer, a fixed right column, and one status line spanning the
 * full width at the very bottom. Replaces v0.1's 5-slot Chassis (rail/plate/properties/tray/
 * bottomBar) — the tray and bottom bar are gone from the default view; their contents moved into
 * the Advanced drawer or the status line (docs/team/v0.2/CHASSIS.md §1). */
export function Chassis({ rail, plate, advancedDrawer, column, statusLine }: ChassisProps) {
  return (
    <div className="jig-chassis">
      <div className="jig-chassis__bench">
        <div className="jig-chassis__rail">{rail}</div>
        <div className="jig-chassis__centre">
          <div className="jig-chassis__plate">{plate}</div>
          <div className="jig-chassis__advanced-slot">{advancedDrawer}</div>
        </div>
        <div className="jig-chassis__column">{column}</div>
      </div>
      <div className="jig-chassis__status-line">{statusLine}</div>
    </div>
  );
}
