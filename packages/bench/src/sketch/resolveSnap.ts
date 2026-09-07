// packages/bench/src/sketch/resolveSnap.ts — Sketch's real alignment snapping, ported verbatim
// from concept-d-the-quiet-bench.html's snapTo() (:1280-1287).
//
// "Snapping with alignment lines that say their coordinates" (concept D, "What to steal"): grid
// snapping (snap4) happens in the CALLER before this runs; this function then nudges the already
// grid-snapped candidate onto the nearest edge or centre of another element — or the sheet's own
// centre — within a 6px threshold on each axis independently, drawing one storm line per axis
// that holds. Pure and DOM-free so it's testable without jsdom's (zero-size) layout engine.

export interface SnapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SnapLine = { axis: 'v'; at: number } | { axis: 'h'; at: number };

export interface SnapResult {
  x: number;
  y: number;
  lines: SnapLine[];
}

const THRESHOLD = 6;

interface AxisMatch {
  d: number;
  c: number;
}

/** One axis of the algorithm: try the dragged rect's near edge, centre, and far edge (`offsets`)
 * against every candidate coordinate, keeping only the single closest match under `THRESHOLD`. */
function bestMatch(pos: number, size: number, candidates: number[]): AxisMatch | null {
  let best: AxisMatch | null = null;
  for (const offset of [0, size / 2, size]) {
    for (const c of candidates) {
      const d = c - (pos + offset);
      if (Math.abs(d) < THRESHOLD && (best === null || Math.abs(d) < Math.abs(best.d))) {
        best = { d, c };
      }
    }
  }
  return best;
}

/**
 * @param dragged The dragged element's candidate rect, already grid-snapped by the caller.
 * @param others Every OTHER element on the sheet (never the dragged one itself).
 * @param sheetSize The sheet's own client size — its centre is always a candidate, and the
 *   final position is clamped inside it.
 */
export function resolveSnap(dragged: SnapRect, others: readonly SnapRect[], sheetSize: { w: number; h: number }): SnapResult {
  const cx: number[] = [sheetSize.w / 2];
  const cy: number[] = [sheetSize.h / 2];
  for (const o of others) {
    const left = o.x;
    const top = o.y;
    const right = o.x + o.w;
    const bottom = o.y + o.h;
    cx.push(left, right, (left + right) / 2);
    cy.push(top, bottom, (top + bottom) / 2);
  }

  const lines: SnapLine[] = [];
  let x = dragged.x;
  let y = dragged.y;

  const bx = bestMatch(dragged.x, dragged.w, cx);
  if (bx) {
    x += bx.d;
    lines.push({ axis: 'v', at: bx.c });
  }
  const by = bestMatch(dragged.y, dragged.h, cy);
  if (by) {
    y += by.d;
    lines.push({ axis: 'h', at: by.c });
  }

  return {
    x: Math.max(0, Math.min(sheetSize.w - dragged.w, x)),
    y: Math.max(0, Math.min(sheetSize.h - dragged.h, y)),
    lines,
  };
}
