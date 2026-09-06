import type { Component, Gauge } from '@jigbench/core';

/**
 * The bridge between the survey's components and the gauge set's `usages` map — "the Loupe
 * tab, extended with the gauges the picked component uses (resolve component → its styleUrls
 * → the gauges whose usages include those files)" and the Gauges panel's two-way lighting
 * ("clicking a gauge lights the components whose style files use it") — both S4 brief. Pure
 * and DOM-free so they're testable without a plate, an iframe, or a browser.
 */

/** Every gauge whose `usages` names at least one of `component`'s `styleUrls`. `undefined`
 * (nothing picked yet) returns an empty list rather than throwing. */
export function gaugesForComponent(component: Component | undefined, gauges: readonly Gauge[]): Gauge[] {
  if (!component) return [];
  const styleUrls = new Set(component.styleUrls);
  return gauges.filter((g) => (g.usages ?? []).some((usage) => styleUrls.has(usage.file)));
}

/** Every component `selector` whose `styleUrls` includes at least one of `gauge`'s usage
 * files — deduplicated, since two usage files can belong to the same component. */
export function selectorsForGauge(gauge: Gauge, components: readonly Component[]): string[] {
  const usageFiles = new Set((gauge.usages ?? []).map((u) => u.file));
  if (usageFiles.size === 0) return [];
  const selectors = new Set<string>();
  for (const component of components) {
    if (component.styleUrls.some((file) => usageFiles.has(file))) selectors.add(component.selector);
  }
  return [...selectors];
}
