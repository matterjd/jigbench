/**
 * PLACEHOLDER — owned by S5 (work orders) / S6 (MCP). S4 creates this file only because
 * CHASSIS.md's bottom bar has to mount something beside the SIM strip and the Logbook, and
 * the brief names this exact placeholder line so S5's real component (the shop lane: the
 * connected agent, which released orders it holds — CHASSIS.md) can overwrite it without S4
 * having guessed at its shape.
 */
export function ShopLane() {
  return <p className="jig-shop-lane-placeholder">the shop — connected agents · arrives with S5</p>;
}
