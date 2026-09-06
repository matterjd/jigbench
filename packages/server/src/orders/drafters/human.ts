/**
 * The always-available fallback in the drafter roster (`select-drafter.ts`'s last resort).
 * Re-exported from `seams.ts` rather than reimplemented: that is the one `HumanDrafter`
 * every other seam (S1's stub wiring included) already knows about, and orders/ should
 * never fork it into a second, subtly different implementation. Living under
 * `orders/drafters/` just puts it on the same shelf as `ollama.ts` and `shop.ts` so the
 * three drivers `select-drafter.ts` chooses between are found in one place.
 */
export { HumanDrafter } from '../../seams.js';
