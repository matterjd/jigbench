import { describe, expect, it } from 'vitest';
import { placeCardPosition } from './placeCardPosition.js';

// Ported from concept-d-the-quiet-bench.html's placeCard() (:1133-1144): beside (right, then
// left), then below, then above, and only then the plate's corner. All coordinates here are
// PLATE-LOCAL (the same frame rectIn() produces in the concept) — the DOM offset from plate to
// the card's actual positioned ancestor is a separate, presentation-only concern applied by the
// caller (usePromptCardPlacement), not part of this pure function.
describe('placeCardPosition', () => {
  const CARD_W = 340;

  it('anchors beside, to the right, when there is room — selection near the left edge', () => {
    const result = placeCardPosition({ x: 40, y: 100, w: 200, h: 60 }, 1044, 872, CARD_W, 400);
    expect(result.where).toBe('beside');
    expect(result.x).toBe(40 + 200 + 12); // r.x + r.w + 12
    expect(result.y).toBe(100); // clamp(r.y, 8, H-ch-8) — 100 is within bounds
  });

  it('falls back to beside-left when there is no room on the right but there is on the left', () => {
    // Plate 1044 wide; selection right edge near the plate's right edge, leaving < 352px (12+340) on the right.
    const result = placeCardPosition({ x: 750, y: 100, w: 260, h: 60 }, 1044, 872, CARD_W, 400);
    expect(result.where).toBe('beside');
    expect(result.x).toBe(750 - 12 - CARD_W); // r.x - 12 - cw
  });

  it('falls back to below when neither side has room but there is room underneath', () => {
    // A selection spanning nearly the full plate width — no room left or right — with room below.
    const result = placeCardPosition({ x: 8, y: 40, w: 1028, h: 60 }, 1044, 872, CARD_W, 400);
    expect(result.where).toBe('below');
    expect(result.x).toBeGreaterThanOrEqual(8);
    expect(result.y).toBe(40 + 60 + 12); // r.y + r.h + 12
  });

  it('falls back to above when there is no room left, right, or below', () => {
    // Full-width selection near the bottom of a short plate: no room on any side but above.
    const result = placeCardPosition({ x: 8, y: 700, w: 1028, h: 150 }, 1044, 872, CARD_W, 400);
    expect(result.where).toBe('above');
    expect(result.y).toBe(700 - 12 - 400); // r.y - 12 - ch
  });

  it('sits over the plate\'s corner when the selection leaves no room on any side (e.g. the whole app or the sketch sheet)', () => {
    const result = placeCardPosition({ x: 0, y: 0, w: 1044, h: 872 }, 1044, 872, CARD_W, 400);
    expect(result.where).toBe('corner');
    expect(result.x).toBe(1044 - CARD_W - 8);
    expect(result.y).toBe(872 - 400 - 8);
  });

  it('clamps the card height to the plate height minus 16px, matching the concept\'s ch = min(card.offsetHeight, H - 16)', () => {
    // Ask for a card taller than the plate allows (720 - 16 = 704 max) at 1280x720, so
    // ch = 704 and the valid y range collapses to clamp(16, 8, 720-704-8=8) = 8.
    const result = placeCardPosition({ x: 40, y: 16, w: 200, h: 60 }, 1280, 720, CARD_W, 900);
    expect(result.where).toBe('beside');
    expect(result.y).toBe(8);
  });

  it('reproduces the floor pass\'s own worked example: a near-bottom-right button placement is "beside", fully inside the plate (1280×720)', () => {
    // FLOOR-PASS-D: "a near-bottom-right button ('Save invoice') → beside, fully inside plate and viewport".
    const result = placeCardPosition({ x: 640, y: 560, w: 140, h: 32 }, 884, 692, CARD_W, 364);
    expect(result.where).toBe('beside');
    expect(result.x + CARD_W).toBeLessThanOrEqual(884 - 8);
    expect(result.y).toBeGreaterThanOrEqual(8);
    expect(result.y + Math.min(364, 692 - 16)).toBeLessThanOrEqual(692 - 8);
  });

  it('reproduces the floor pass\'s own worked example: a selection larger than the room around it (the whole sketch sheet) sits over the corner', () => {
    // FLOOR-PASS-D: "the whole Sketch sheet (deliberately larger than the room around it) → corner".
    const result = placeCardPosition({ x: 0, y: 0, w: 819, h: 558 }, 884, 692, CARD_W, 400);
    expect(result.where).toBe('corner');
  });
});
