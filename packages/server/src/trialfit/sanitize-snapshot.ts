/**
 * Server-side sanitization of a trial-fit snapshot's HTML (wave-4 council finding 4,
 * MEDIUM). `packages/server/src/plate/loupe.js`'s own `captureSnapshot()` already sanitizes
 * client-side, inside the TARGET page, before the HTML ever leaves it — but that page's own
 * DOM is exactly the thing that may already carry attacker-controlled markup (unsanitized
 * user content the target app itself rendered), so a single sanitization point is a single
 * point of failure. This runs AGAIN, server-side, on save (`trialfit/route.ts`'s
 * `POST /api/plate/snapshot`) before the HTML is ever persisted.
 *
 * Regex-based, not a full HTML parser — this file has no runtime dependency (jsdom is a
 * server devDependency, tests-only, never shipped) — deliberately conservative throughout:
 * when in doubt, strip. Removes: `<script>`, `<iframe>`/`<object>`/`<embed>` elements (both
 * paired and self-closing forms), `<meta http-equiv="refresh">` redirects, every `on*=`
 * handler attribute; neutralizes `javascript:`/`data:text/html` URLs in `href`/`src`/`action`
 * to `"#"`.
 */

const SCRIPT_TAG = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const EMBED_PAIRED = /<(iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const EMBED_SELF = /<(iframe|object|embed)\b[^>]*\/?>/gi;
const META_REFRESH = /<meta\b(?=[^>]*http-equiv\s*=\s*["']?refresh["']?)[^>]*>/gi;
const ON_ATTR = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+)/gi;
// Group 1: the character immediately before the attribute name (whitespace, a quote, '>', or
// start-of-string) — this stands in for a word-boundary check without needing one, so
// `data-href="javascript:..."` is left alone (its "href" is preceded by a hyphen, not this
// set) while a real `href=`/`src=`/`action=` attribute is always matched.
const URL_ATTR = /(^|[\s"'>])(href|src|action)\s*=\s*("([^"]*)"|'([^']*)')/gi;

function isDangerousUrl(value: string): boolean {
  const normalized = value.replace(/\s+/g, '').toLowerCase();
  return normalized.startsWith('javascript:') || normalized.startsWith('data:text/html');
}

export function sanitizeSnapshotHtml(html: string): string {
  let out = html;
  out = out.replace(SCRIPT_TAG, '');
  out = out.replace(EMBED_PAIRED, '');
  out = out.replace(EMBED_SELF, '');
  out = out.replace(META_REFRESH, '');
  out = out.replace(ON_ATTR, '');
  out = out.replace(URL_ATTR, (match: string, lead: string, attr: string, _full: string, dq: string | undefined, sq: string | undefined) => {
    const value = dq !== undefined ? dq : sq !== undefined ? sq : '';
    if (!isDangerousUrl(value)) return match;
    return `${lead}${attr}="#"`;
  });
  return out;
}
