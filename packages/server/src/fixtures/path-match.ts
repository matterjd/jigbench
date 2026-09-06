/**
 * Path-template matching for the fixture proxy interceptor. `Fixture.responses` is keyed
 * `"${METHOD} ${templatedPath}"` (the path as surveyed, e.g. `"GET /api/invoices/{id}"`); an
 * incoming request carries a concrete path. F10: "path templates with {id} match numeric/uuid
 * segments; query strings ignored".
 */

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const NUMERIC_RE = /^[0-9]+$/;

export function stripQuery(path: string): string {
  const i = path.indexOf('?');
  return i === -1 ? path : path.slice(0, i);
}

function isTemplateSegment(segment: string): boolean {
  return segment.startsWith('{') && segment.endsWith('}');
}

function segmentMatches(templateSegment: string, actualSegment: string): boolean {
  if (isTemplateSegment(templateSegment)) {
    return NUMERIC_RE.test(actualSegment) || UUID_RE.test(actualSegment);
  }
  return templateSegment === actualSegment;
}

function segments(path: string): string[] {
  return stripQuery(path).split('/').filter((s) => s.length > 0);
}

/** True when `actualPath` (query stripped) matches `template` segment-for-segment, with a
 * `{param}` template segment matching a numeric or UUID actual segment. */
export function matchPath(template: string, actualPath: string): boolean {
  const t = segments(template);
  const a = segments(actualPath);
  if (t.length !== a.length) return false;
  return t.every((seg, i) => segmentMatches(seg, a[i] ?? ''));
}

/** Given a `Fixture.responses` key ending in a single trailing `{param}` segment (e.g.
 * `"GET /api/invoices/{id}"`), returns the sibling list key (`"GET /api/invoices"`) — the
 * collection this item's id should be looked up in. `undefined` when the key has no trailing
 * template segment (already a list key, or the template segment isn't last). */
export function parentListKey(key: string): string | undefined {
  const spaceIndex = key.indexOf(' ');
  if (spaceIndex === -1) return undefined;
  const method = key.slice(0, spaceIndex);
  const path = key.slice(spaceIndex + 1);
  const parts = path.split('/').filter((s) => s.length > 0);
  if (parts.length === 0 || !isTemplateSegment(parts[parts.length - 1] ?? '')) return undefined;
  const parentPath = '/' + parts.slice(0, -1).join('/');
  return `${method} ${parentPath}`;
}
