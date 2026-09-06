import type { ReactNode } from 'react';
import './Chassis.css';

export interface ChassisProps {
  /** Hand · Loupe · Mark · Fixture · Toolpath · Sketch. */
  rail: ReactNode;
  /** The clamped app, in a hairline frame with rulers and guides. */
  plate: ReactNode;
  /** Loupe · Gauges · Survey tabs. */
  properties: ReactNode;
  /** Collapsed: the order in hand. Expanded: every work order (S5's spine). */
  tray: ReactNode;
  /** Logbook ribbon · SIM strip · shop lane. */
  bottomBar: ReactNode;
  /** Collapsed (~56px) by default; expanded (~40% of the viewport) when true — the toggle
   * itself lives in the tray's own content (S5), not here. */
  trayExpanded?: boolean;
}

/** The bench's CSS-grid arrangement — concept A · The Surface Plate, ruled 2026-09-05
 * (CHASSIS.md): rail | plate | properties across the top, the work-order tray as a bottom
 * drawer, and a bottom bar for the logbook ribbon, the SIM strip, and the shop lane. */
export function Chassis({ rail, plate, properties, tray, bottomBar, trayExpanded = false }: ChassisProps) {
  return (
    <div className="jig-chassis">
      <div className="jig-chassis__rail">{rail}</div>
      <div className="jig-chassis__plate">{plate}</div>
      <div className="jig-chassis__properties">{properties}</div>
      <div
        className={
          'jig-chassis__tray ' + (trayExpanded ? 'jig-chassis__tray--expanded' : 'jig-chassis__tray--collapsed')
        }
      >
        {tray}
      </div>
      <div className="jig-chassis__bottom-bar">{bottomBar}</div>
    </div>
  );
}
