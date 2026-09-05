/**
 * Pure functions the plate proxy uses to inject the loupe script and to report/soften the
 * target's own security headers. Kept dependency-free and side-effect-free so they can be
 * unit tested directly against known inputs — the proxy (`proxy.ts`) wires them to real
 * HTTP traffic.
 *
 * ADR-002 / EXECUTION-PLAN §6 risk 1: never blanket-strip the target's security headers.
 * Every change made here is reported back, never silent.
 */

export interface PlateHeaderChange {
  header: string;
  from: string | null;
  to: string | null;
  reason: string;
}

const LOUPE_SCRIPT_TAG = (benchOrigin: string): string =>
  `<script src="/__jig/loupe.js" data-jig-bench="${benchOrigin}"></script>`;

/** Inserts the loupe `<script>` tag just before `</body>` (case-insensitive), or appends it
 * to the end of the document if no closing body tag is present at all. */
export function injectLoupeScript(html: string, benchOrigin: string): string {
  const tag = LOUPE_SCRIPT_TAG(benchOrigin);
  const match = /<\/body>/i.exec(html);
  if (!match) return html + tag;
  return html.slice(0, match.index) + tag + html.slice(match.index);
}

function findHeaderKey(headers: Record<string, string>, lowerName: string): string | undefined {
  return Object.keys(headers).find((key) => key.toLowerCase() === lowerName);
}

interface CspDirective {
  name: string;
  tokens: string[];
}

function parseCsp(value: string): CspDirective[] {
  return value
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const tokens = part.split(/\s+/);
      const name = tokens.shift() ?? '';
      return { name: name.toLowerCase(), tokens };
    });
}

function renderDirective(directive: CspDirective): string {
  return [directive.name, ...directive.tokens].join(' ');
}

function renderCsp(directives: CspDirective[]): string {
  return directives.map(renderDirective).join('; ');
}

/** Rewrites a single `content-security-policy` value so the bench can embed the plate and
 * the injected loupe script can load, touching only the two directives that would otherwise
 * block us — everything else in the policy is left exactly as the target sent it. */
function rewriteCsp(value: string, benchOrigin: string, changes: PlateHeaderChange[]): string {
  const directives = parseCsp(value);

  for (const directive of directives) {
    if (directive.name === 'frame-ancestors' && !directive.tokens.includes(benchOrigin)) {
      const from = renderDirective(directive);
      if (directive.tokens.length === 1 && directive.tokens[0] === "'none'") {
        directive.tokens = [benchOrigin];
      } else {
        directive.tokens = [...directive.tokens, benchOrigin];
      }
      changes.push({
        header: 'content-security-policy',
        from,
        to: renderDirective(directive),
        reason: `frame-ancestors would block the plate loading inside the bench iframe (${benchOrigin})`,
      });
    }

    if (
      directive.name === 'script-src' &&
      !directive.tokens.includes("'self'") &&
      !directive.tokens.includes('*')
    ) {
      const from = renderDirective(directive);
      directive.tokens = [...directive.tokens, "'self'"];
      changes.push({
        header: 'content-security-policy',
        from,
        to: renderDirective(directive),
        reason: 'script-src would block the injected loupe script (served same-origin by the plate proxy)',
      });
    }
  }

  return renderCsp(directives);
}

/**
 * Applies the plate's header policy to one response's headers: removes `X-Frame-Options`
 * outright (it cannot be softened — any value blocks framing) and rewrites
 * `content-security-policy`'s `frame-ancestors`/`script-src` directives only as far as
 * needed. Every other header, and every other directive, passes through untouched. Returns
 * the new header set plus a list of exactly what changed, so a caller can report it (`GET
 * /api/plate`) rather than silently rewrite the target's security posture.
 */
export function rewriteHeaders(
  headers: Record<string, string | string[] | undefined>,
  benchOrigin: string,
): { headers: Record<string, string>; changes: PlateHeaderChange[] } {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[key] = Array.isArray(value) ? value.join(', ') : value;
  }

  const changes: PlateHeaderChange[] = [];

  const xfoKey = findHeaderKey(out, 'x-frame-options');
  if (xfoKey) {
    changes.push({
      header: 'x-frame-options',
      from: out[xfoKey] ?? null,
      to: null,
      reason: 'x-frame-options blocks the plate from loading inside the bench iframe',
    });
    delete out[xfoKey];
  }

  const cspKey = findHeaderKey(out, 'content-security-policy');
  if (cspKey) {
    const original = out[cspKey] ?? '';
    const rewritten = rewriteCsp(original, benchOrigin, changes);
    if (rewritten !== original) out[cspKey] = rewritten;
  }

  return { headers: out, changes };
}
