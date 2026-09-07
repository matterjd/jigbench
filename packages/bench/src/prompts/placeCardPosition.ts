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
  const ch = Math.min(requestedCardHeight, H - 16);
  const r = selection;

  if (r.x + r.w + MARGIN + cw <= W - EDGE) {
    return { x: r.x + r.w + MARGIN, y: clamp(r.y, EDGE, H - ch - EDGE), where: 'beside' };
  }
  if (r.x - MARGIN - cw >= EDGE) {
    return { x: r.x - MARGIN - cw, y: clamp(r.y, EDGE, H - ch - EDGE), where: 'beside' };
  }
  if (r.y + r.h + MARGIN + ch <= H - EDGE) {
    return { x: clamp(r.x, EDGE, W - cw - EDGE), y: r.y + r.h + MARGIN, where: 'below' };
  }
  if (r.y - MARGIN - ch >= EDGE) {
    return { x: clamp(r.x, EDGE, W - cw - EDGE), y: r.y - MARGIN - ch, where: 'above' };
  }
  return { x: W - cw - EDGE, y: H - ch - EDGE, where: 'corner' };
}
