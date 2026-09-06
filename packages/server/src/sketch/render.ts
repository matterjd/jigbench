import { resolveGauge, type Gauge, type GaugeSet, type Sketch, type SketchElement, type SketchLink } from '@jigbench/core';

// === S9: GET /api/sketches/:id/html — a static, standalone rendering of a sketch using the
// survey's gauge VALUES as CSS custom properties, so a sketch can be opened on the plate
// like an app screen (and later a work order can point at one of its elements). This is
// server-GENERATED markup built entirely from the sketch's own structured data (never raw
// HTML accepted from a client the way `trialfit/snapshot.ts`'s captured DOM is) — the only
// user-supplied strings that ever reach the output are `content`/`label`/`placeholder`, and
// every one of them is escaped below. ===

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A gauge's `name` arrives either as an actual CSS custom property (`--ledger-color-accent`)
 * or an SCSS variable (`$ledger-color-paper`) — this page has no relationship to the target
 * app's own stylesheet, so either shape is normalized into one custom property this page
 * declares and references itself. */
function cssVarName(gaugeName: string): string {
  return `--${gaugeName.replace(/^[-$]+/, '')}`;
}

function rootVarsBlock(sketch: Sketch, gaugeSet: GaugeSet): string {
  const resolved: Record<string, Gauge> = resolveGauge(sketch, gaugeSet);
  return Object.entries(resolved)
    .map(([name, gauge]) => `    ${cssVarName(name)}: ${gauge.$value};`)
    .join('\n');
}

function styleFor(element: SketchElement): string {
  const parts = [`left: ${element.x}px`, `top: ${element.y}px`, `width: ${element.w}px`, `height: ${element.h}px`];
  const gauges = element.gauges ?? {};
  if (gauges.fill) parts.push(`background: var(${cssVarName(gauges.fill)})`);
  if (gauges.radius) parts.push(`border-radius: var(${cssVarName(gauges.radius)})`);
  if (gauges.shadow) parts.push(`box-shadow: var(${cssVarName(gauges.shadow)})`);
  if (gauges.type) parts.push(`font-family: var(${cssVarName(gauges.type)})`);
  return parts.join('; ');
}

function innerHtmlFor(element: SketchElement): string {
  switch (element.kind) {
    case 'text':
      return escapeHtml(element.content);
    case 'button':
      return escapeHtml(element.label ?? 'button');
    case 'image':
      return escapeHtml(element.label ?? 'image');
    case 'list':
      return Array.from({ length: element.rows }, () => '<div class="jig-sketch-row"></div>').join('');
    case 'input':
    case 'box':
      return '';
  }
}

/** Renders one element. An element that is the `fromElementId` of a link is a hotspot — it
 * becomes an `<a>` so the sheet is genuinely clickable-through, carrying `href` (a surveyed
 * route) or `data-jig-sketch-link` (another sketch's id, for the bench to wire in-app). */
function renderElement(element: SketchElement, link: SketchLink | undefined): string {
  const classes = `jig-sketch-el jig-sketch-el--${element.kind}`;
  const style = styleFor(element);

  if (link) {
    const href = link.toRoute ?? `#sketch-${link.toSketchId}`;
    const sketchLinkAttr = link.toSketchId ? ` data-jig-sketch-link="${escapeHtml(link.toSketchId)}"` : '';
    return `<a class="${classes}" style="${style}" href="${escapeHtml(href)}"${sketchLinkAttr} data-jig-hotspot="true">${innerHtmlFor(element)}</a>`;
  }

  if (element.kind === 'input') {
    const placeholder = escapeHtml(element.placeholder ?? element.label ?? '');
    return `<div class="${classes}" style="${style}"><input type="text" placeholder="${placeholder}" readonly /></div>`;
  }

  return `<div class="${classes}" style="${style}">${innerHtmlFor(element)}</div>`;
}

/** Renders `sketch` as a standalone HTML document: the survey's gauge values become `:root`
 * CSS custom properties, every element is positioned absolutely at its snapped x/y/w/h, and
 * every hotspot becomes a real `<a>`. */
export function renderSketchHtml(sketch: Sketch, gaugeSet: GaugeSet): string {
  const linksByElement = new Map(sketch.links.map((link) => [link.fromElementId, link]));
  const elementsHtml = sketch.elements
    .map((element) => renderElement(element, linksByElement.get(element.id)))
    .join('\n    ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(sketch.name)} — sketch</title>
<style>
  :root {
${rootVarsBlock(sketch, gaugeSet)}
  }
  html, body { margin: 0; padding: 0; background: #fff; font-family: sans-serif; }
  .jig-sketch-sheet { position: relative; width: ${sketch.size.w}px; height: ${sketch.size.h}px; overflow: hidden; }
  .jig-sketch-el { position: absolute; box-sizing: border-box; text-decoration: none; color: inherit; }
  .jig-sketch-el--text { white-space: pre-wrap; }
  .jig-sketch-el--button, .jig-sketch-el--input { display: flex; align-items: center; justify-content: center; }
  .jig-sketch-el--image { display: flex; align-items: center; justify-content: center; border: 1px dashed #999; color: #999; }
  .jig-sketch-row { height: 20%; border-bottom: 1px solid #ddd; box-sizing: border-box; }
</style>
</head>
<body>
  <div class="jig-sketch-sheet" data-jig-sketch-id="${escapeHtml(sketch.id)}">
    ${elementsHtml}
  </div>
</body>
</html>
`;
}
// === end S9 block ===
