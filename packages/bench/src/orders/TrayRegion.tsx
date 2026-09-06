/**
 * PLACEHOLDER — owned by S5 (work orders). S4 creates this file only because CHASSIS.md's
 * tray region has to mount something, and the brief names this exact placeholder line so
 * S5's real component (the tray drawer: collapsed = the order in hand, expanded = every work
 * order by ladder state — CHASSIS.md) can overwrite it without S4 having guessed at its shape.
 */
export function TrayRegion() {
  return <p className="jig-tray-region-placeholder">tray — work orders · arrives with S5</p>;
}
