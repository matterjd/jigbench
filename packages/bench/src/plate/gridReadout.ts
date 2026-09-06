import type { Gauge } from '@jigbench/core';

/** A picked element's box, in the plate's own CSS pixels — `usePlateBridge`'s `PlatePick.rect`. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GridPxResult {
  /** The grid unit, in px. */
  px: number;
  /** True when no surveyed space gauge was available and this is CHASSIS.md's documented
   * fallback ("fall back to 4px and say so"), not a value the survey actually measured. */
  fallbackUsed: boolean;
}

export type GridAxis = 'x' | 'y' | 'w' | 'h';

export interface GridReadout {
  /** "456×40 @ 184,220 · off the 4px grid by 2.0px (w)" — the concept's own worked line
   * (concept-a-the-surface-plate.md). */
  text: string;
  onGrid: boolean;
  /** The worst-deviating axis — the one the readout names. */
  axis: GridAxis;
  /** That axis's distance from the nearest grid multiple, in px. */
  deviation: number;
  gridPx: number;
  fallbackUsed: boolean;
}

/** Picks the grid unit to snap against: the smallest `space`-category gauge value the survey
 * found (every space gauge is supposed to be a multiple of the base unit, so the smallest one
 * *is* the base unit), or 4px with `fallbackUsed: true` when there are no space gauges to
 * read — CHASSIS.md's "fall back to 4px and say so." */
export function resolveGridPx(gauges: readonly Gauge[] | undefined): GridPxResult {
  const values = (gauges ?? [])
    .filter((g) => g.category === 'space')
    .map((g) => Number.parseFloat(String(g.$value)))
    .filter((v) => Number.isFinite(v) && v > 0);

  if (values.length === 0) return { px: 4, fallbackUsed: true };
  return { px: Math.min(...values), fallbackUsed: false };
}

/** The honest grid line: "the app's table header is 33.8px tall and Jig should say so rather
 * than round it away" (concept-a-the-surface-plate.md). Snaps each edge of `rect` to the
 * nearest multiple of `grid.px`, names whichever axis deviates most (ties keep the
 * first-listed axis — x, then y, then w, then h — so the readout is deterministic), and
 * reports "on the Npx grid" when every edge is within half a pixel of a multiple. */
export function computeGridReadout(rect: Rect, grid: GridPxResult): GridReadout {
  const gridPx = grid.px;
  const snap = (v: number): number => Math.round(v / gridPx) * gridPx;

  const deviations: Array<[GridAxis, number]> = [
    ['x', Math.abs(rect.x - snap(rect.x))],
    ['y', Math.abs(rect.y - snap(rect.y))],
    ['w', Math.abs(rect.width - snap(rect.width))],
    ['h', Math.abs(rect.height - snap(rect.height))],
  ];
  const worst = deviations.reduce((best, d) => (d[1] > best[1] ? d : best));
  const onGrid = worst[1] <= 0.5;

  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const suffix = onGrid
    ? `on the ${gridPx}px grid`
    : `off the ${gridPx}px grid by ${worst[1].toFixed(1)}px (${worst[0]})`;

  return {
    text: `${w}×${h} @ ${x},${y} · ${suffix}`,
    onGrid,
    axis: worst[0],
    deviation: worst[1],
    gridPx,
    fallbackUsed: grid.fallbackUsed,
  };
}
