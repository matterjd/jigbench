// packages/bench/src/prompts/placeCardPosition.ts — the prompt card's anchoring algorithm,
// ported verbatim from concept-d-the-quiet-bench.html's placeCard() (:1133-1144).
//
// "the prompt card is anchored, and it never covers the selection" (AMENDMENT-1 §4). Placement
// tries beside (right, then left), then below, then above, and only then the plate's corner —
// and in the corner case the caller says so in words (PromptCard.tsx). Pure and DOM-free: every
// input is a plain rect/number so this is unit-testable without a browser, jsdom's own layout
// engine (which computes zero-size boxes), or a ResizeObserver.

export interface PlateLocalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CardPlacementSide = 'beside' | 'below' | 'above' | 'corner';

export interface CardPlacement {
  /** Plate-local x/y for the card's top-left corner (NOT yet translated into whatever ancestor
   * element the card is actually positioned against — see usePromptCardPlacement.ts). */
  x: number;
  y: number;
  where: CardPlacementSide;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const MARGIN = 12; // gap between the selection and the card
const EDGE = 8; // minimum gap between the card and the plate's own edge

/**
 * #69: whatever this is handed, the answer is a position INSIDE the plate — that is the only
 * promise this function makes, and it was not keeping it. Every `clamp(v, EDGE, W - cw - EDGE)`
 * inverts once the plate is narrower than the card (`Math.min` runs first, so the answer becomes
 * the LARGER of two numbers, both of them outside), and the corner fallback had no clamp at all.
 * A plate that was never measured is 0 wide, and `0 - 340 - 8` is where the card went: 348px left
 * of the plate's own left edge, which on the bench is under the rail.
 */
function insidePlate(x: number, y: number, where: CardPlacementSide, W: number, H: number, cw: number, ch: number): CardPlacement {
  return {
    x: Math.max(EDGE, Math.min(x, W - cw - EDGE)),
    y: Math.max(EDGE, Math.min(y, H - ch - EDGE)),
    where,
  };
}

/**
 * @param selection The selected element's rect, in plate-local coordinates (as `rectIn(el)`
 *   produces in the concept — origin at the plate's own top-left, not the viewport's).
 * @param plateWidth `plate.clientWidth`
 * @param plateHeight `plate.clientHeight`
 * @param cardWidth Fixed at 340 in the built spec (`.card { width: 340px }`).
 * @param requestedCardHeight The card's natural height (`card.offsetHeight` in the concept) —
 *   clamped internally to `plateHeight - 16`, exactly matching `ch = Math.min(card.offsetHeight,
 *   H - 16)` in the source.
 */
export function placeCardPosition(
  selection: PlateLocalRect,
  plateWidth: number,
  plateHeight: number,
  cardWidth: number,
  requestedCardHeight: number,
): CardPlacement {
  const W = plateWidth;
  const H = plateHeight;
  const cw = cardWidth;
  // never negative: a plate shorter than 16px would otherwise make every branch guard below
  // read as though the card had negative height, and `above` would win for anything at all.
  const ch = Math.max(0, Math.min(requestedCardHeight, H - 16));
  const r = selection;

  if (r.x + r.w + MARGIN + cw <= W - EDGE) {
    return insidePlate(r.x + r.w + MARGIN, clamp(r.y, EDGE, H - ch - EDGE), 'beside', W, H, cw, ch);
  }
  if (r.x - MARGIN - cw >= EDGE) {
    return insidePlate(r.x - MARGIN - cw, clamp(r.y, EDGE, H - ch - EDGE), 'beside', W, H, cw, ch);
  }
  if (r.y + r.h + MARGIN + ch <= H - EDGE) {
    return insidePlate(clamp(r.x, EDGE, W - cw - EDGE), r.y + r.h + MARGIN, 'below', W, H, cw, ch);
  }
  if (r.y - MARGIN - ch >= EDGE) {
    return insidePlate(clamp(r.x, EDGE, W - cw - EDGE), r.y - MARGIN - ch, 'above', W, H, cw, ch);
  }
  return insidePlate(W - cw - EDGE, H - ch - EDGE, 'corner', W, H, cw, ch);
}
