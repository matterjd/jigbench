import { computeGridReadout, type GridPxResult, type Rect } from './gridReadout.js';
import './PlateGuides.css';

export interface PlateGuidesProps {
  /** The last pick's rect (plate CSS px), or null when nothing is pinned/hovered. */
  rect: Rect | null;
  grid: GridPxResult;
}

/** Guide lines at a picked element's edges, extended toward the rulers, plus the honest grid
 * readout CHASSIS.md asks for: "456×40 @ 184,220 · off the 4px grid by 2.0px (w)". Storm
 * hairlines only — never a fill (design floor item 26). */
export function PlateGuides({ rect, grid }: PlateGuidesProps) {
  if (!rect) return null;

  const readout = computeGridReadout(rect, grid);

  return (
    <div className="jig-plate-guides">
      <div className="jig-plate-guides__line jig-plate-guides__line--v" style={{ left: rect.x }} />
      <div className="jig-plate-guides__line jig-plate-guides__line--v" style={{ left: rect.x + rect.width }} />
      <div className="jig-plate-guides__line jig-plate-guides__line--h" style={{ top: rect.y }} />
      <div className="jig-plate-guides__line jig-plate-guides__line--h" style={{ top: rect.y + rect.height }} />
      <div
        className="jig-plate-guides__readout"
        role="status"
        style={{ left: rect.x, top: Math.max(0, rect.y - 20) }}
      >
        {readout.text}
      </div>
      {grid.fallbackUsed && (
        <p className="jig-plate-guides__fallback-note">
          fallback grid — no space gauges surveyed, snapping to 4px
        </p>
      )}
    </div>
  );
}
