import type { ReactNode } from 'react';
import './AppFrame.css';

export interface AppFrameProps {
  rail: ReactNode;
  plate: ReactNode;
  side: ReactNode;
  tray: ReactNode;
  logbook: ReactNode;
}

/** The chassis-neutral shell: five CSS-grid regions a later slice can rearrange once the
 * real bench chassis is chosen from the design concepts. */
export function AppFrame({ rail, plate, side, tray, logbook }: AppFrameProps) {
  return (
    <div className="jig-appframe">
      <div className="jig-appframe__rail">{rail}</div>
      <div className="jig-appframe__plate">{plate}</div>
      <div className="jig-appframe__side">{side}</div>
      <div className="jig-appframe__tray">{tray}</div>
      <div className="jig-appframe__logbook">{logbook}</div>
    </div>
  );
}
