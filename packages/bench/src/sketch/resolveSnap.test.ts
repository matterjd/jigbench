import { describe, expect, it } from 'vitest';
import { resolveSnap, type SnapRect } from './resolveSnap.js';

// Ported from concept-d-the-quiet-bench.html's snapTo() (:1280-1287): grid snapping happens
// BEFORE this function runs (the caller applies snap4 to the raw pointer delta); resolveSnap
// then nudges the already-grid-snapped candidate onto the nearest edge or centre of another
// element (or the sheet's own centre) within a 6px threshold on each axis independently, and
// clamps the final position inside the sheet. The floor pass's own worked example: a 132x36
// element dragged near another element's edges snaps to "x 32 and y 128" with exactly two lines.
describe('resolveSnap', () => {
  const sheetSize = { w: 979, h: 558 };
  // A seeded neighbour whose left edge is at x=32 and whose top edge is at y=128 — the concept's
  // own SK_SEED list element (`{ x: 32, y: 128, w: 420, h: 200 }`).
  const list: SnapRect = { x: 32, y: 128, w: 420, h: 200 };

  it('snaps onto a neighbour\'s left edge and top edge when already exactly on them, reporting both as held lines', () => {
    const result = resolveSnap({ x: 32, y: 128, w: 132, h: 36 }, [list], sheetSize);
    expect(result.x).toBe(32);
    expect(result.y).toBe(128);
    expect(result.lines).toEqual(
      expect.arrayContaining([
        { axis: 'v', at: 32 },
        { axis: 'h', at: 128 },
      ]),
    );
    expect(result.lines.length).toBe(2);
  });

  it('nudges a near-miss (within the 6px threshold) exactly onto the edge', () => {
    // 34 is 2px off list's left edge (32) — well within TH=6.
    const result = resolveSnap({ x: 34, y: 128, w: 132, h: 36 }, [list], sheetSize);
    expect(result.x).toBe(32);
    expect(result.lines.some((l) => l.axis === 'v' && l.at === 32)).toBe(true);
  });

  it('does not snap when nothing is within the threshold on that axis — returns the candidate unchanged (clamped)', () => {
    const result = resolveSnap({ x: 200, y: 300, w: 132, h: 36 }, [list], sheetSize);
    expect(result.x).toBe(200);
    expect(result.y).toBe(300);
    expect(result.lines).toEqual([]);
  });

  it('also snaps to a neighbour\'s right edge and its horizontal/vertical centre', () => {
    // list right edge = 32 + 420 = 452; list vertical centre = 128 + 100 = 228.
    const dragged: SnapRect = { x: 452 - 132, y: 228 - 18, w: 132, h: 36 }; // right-aligned, vertically centred on list
    const result = resolveSnap(dragged, [list], sheetSize);
    expect(result.x + dragged.w).toBe(452); // right edge aligned
    expect(result.y + dragged.h / 2).toBe(228); // vertical centre aligned
  });

  it('snaps to the sheet\'s own centre when no neighbour is closer', () => {
    const centreX = sheetSize.w / 2;
    const dragged: SnapRect = { x: centreX - 132 / 2 + 3, y: 20, w: 132, h: 36 }; // 3px off sheet centre
    const result = resolveSnap(dragged, [], sheetSize);
    expect(result.x + dragged.w / 2).toBe(centreX);
    expect(result.lines.some((l) => l.axis === 'v' && l.at === centreX)).toBe(true);
  });

  it('picks the CLOSEST candidate on each axis when more than one is within threshold', () => {
    // Both rects are wide/tall so only their LEFT edge is a plausible candidate at this x — their
    // own right edge and centre sit far outside the 6px threshold, isolating the comparison.
    const nearer: SnapRect = { x: 28, y: 500, w: 400, h: 10 }; // left edge 28 — 2px from candidate x=30
    const farther: SnapRect = { x: 34, y: 700, w: 400, h: 10 }; // left edge 34 — 4px from candidate x=30
    const result = resolveSnap({ x: 30, y: 300, w: 20, h: 20 }, [nearer, farther], sheetSize);
    expect(result.x).toBe(28); // the nearer of the two candidates (2px away) wins over the farther (4px away)
  });

  it('clamps the final position inside the sheet bounds even after snapping', () => {
    const edgeNeighbour: SnapRect = { x: -3, y: 0, w: 10, h: 10 }; // an edge at x=-3, just off-sheet
    const result = resolveSnap({ x: -3, y: 0, w: 20, h: 20 }, [edgeNeighbour], sheetSize);
    expect(result.x).toBeGreaterThanOrEqual(0);
  });

  it('excludes the dragged element itself from the neighbour set (callers pass `others`, never the element being moved)', () => {
    // No assertion beyond the type contract: `others` never includes the dragged rect itself —
    // documented here so a future caller doesn't accidentally pass the full element list.
    const result = resolveSnap({ x: 200, y: 200, w: 50, h: 50 }, [], sheetSize);
    expect(result.lines).toEqual([]);
  });
});
