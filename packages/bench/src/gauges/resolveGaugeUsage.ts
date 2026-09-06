import type { Component, Gauge } from '@jigbench/core';

/**
 * The bridge between the survey's components and the gauge set's `usages` map — "the Loupe
 * tab, extended with the gauges the picked component uses (resolve component → its styleUrls
 * → the gauges whose usages include those files)" and the Gauges panel's two-way lighting
 * ("clicking a gauge lights the components whose style files use it") — both S4 brief. Pure
 * and DOM-free so they're testable without a plate, an iframe, or a browser.
 *
 * `Component.styleUrls` is read VERBATIM from the `@Component({ styleUrls: [...] })` decorator
 * (adapter-angular's `components.ts`) — Angular's own convention, a path relative to the
 * component file's OWN directory ("./invoice-list.scss" beside invoice-list.ts), never
 * repo-relative. A `Gauge.usages[].file`, by contrast, IS repo-relative. Confirmed live
 * against a real `jigbench survey` of examples/ledger-angular during S4's browser check —
 * comparing the two directly (as an earlier version of this file did) matches nothing on any
 * real survey; `resolveStyleUrl` below is what makes the comparison honest.
 */

/** Joins a component's own repo-relative `file` with one of its (component-directory-relative)
 * `styleUrls` entries into a repo-relative path comparable to a gauge usage's `file`. Pure
 * POSIX-style joining (the survey's paths always use forward slashes) — handles `./`, bare
 * names, and `../` segments the same way a real module resolver would. */
function resolveStyleUrl(componentFile: string, styleUrl: string): string {
  const dirParts = componentFile.split('/').slice(0, -1);
  const stack = [...dirParts];
  for (const part of styleUrl.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

function resolvedStyleUrls(component: Component): string[] {
  return component.styleUrls.map((url) => resolveStyleUrl(component.file, url));
}

/** Every gauge whose `usages` names at least one of `component`'s (resolved) `styleUrls`.
 * `undefined` (nothing picked yet) returns an empty list rather than throwing. */
export function gaugesForComponent(component: Component | undefined, gauges: readonly Gauge[]): Gauge[] {
  if (!component) return [];
  const styleUrls = new Set(resolvedStyleUrls(component));
  return gauges.filter((g) => (g.usages ?? []).some((usage) => styleUrls.has(usage.file)));
}

/** Every component `selector` whose (resolved) `styleUrls` includes at least one of `gauge`'s
 * usage files — deduplicated, since two usage files can belong to the same component. */
export function selectorsForGauge(gauge: Gauge, components: readonly Component[]): string[] {
  const usageFiles = new Set((gauge.usages ?? []).map((u) => u.file));
  if (usageFiles.size === 0) return [];
  const selectors = new Set<string>();
  for (const component of components) {
    if (resolvedStyleUrls(component).some((file) => usageFiles.has(file))) selectors.add(component.selector);
  }
  return [...selectors];
}
