/**
 * The bench's Host + Origin gate (#18 — the 0.2.0 review: DNS rebinding).
 *
 * Until #18 this compared `Origin` to the request's own `Host` and stopped there. That is a
 * same-origin check and nothing more: a page served from a domain the attacker later
 * re-points at 127.0.0.1 sends `Host: attacker.example:4600` and, on a POST,
 * `Origin: http://attacker.example:4600` — they agree, so it passed — and a same-origin GET
 * from that page carries no Origin at all, which the absent-Origin allowance waved through.
 * The socket is loopback either way; nothing about the request is the bench's own page.
 *
 * The Host header is the one thing the browser fills in from the URL the attacker's page
 * used, so the gate is Host-first now:
 *   1. `Host` must name THIS bench — `localhost`, `127.0.0.1` or `[::1]` on any port (what a
 *      local user actually types), or the exact `--host` value the operator bound to. Anything
 *      else — any DNS name in particular — is refused before Origin is even read.
 *   2. With an allowed Host, an absent Origin is still a non-browser client (curl, an MCP
 *      client, the CLI itself — none send one) and passes; a present Origin must match the
 *      Host, name and port.
 * A wildcard bind (`--host 0.0.0.0` / `::`) never appears in a Host header itself, so for
 * that deliberate LAN exposure any IP-LITERAL Host is accepted as well — a name can be
 * rebound, an address cannot; reach a wildcard-bound bench by its IP, not by machine name.
 *
 * ## What this gate does NOT stop — #81 item 5
 *
 * Rule 2's absent-Origin allowance is a real, deliberate hole, and it is worth naming here
 * rather than leaving to be discovered. A browser sends NO `Origin` on a request it does not
 * treat as a fetch: an `<img src>`, a `<script src>`, a `<link>`, an `<iframe>`, a plain
 * navigation. A page on `https://evil.example` pointing one of those at
 * `http://localhost:4600/api/state` sends `Host: localhost:4600` — the bench's own name,
 * because that is the URL it used — and no Origin. Both rules pass. **The request runs.**
 *
 * That is not DNS rebinding (rule 1 is what refuses a name the attacker controls, and it does)
 * and it is not fixable by tightening this function: `curl`, an MCP client and the CLI itself
 * send no Origin either, and a local bench that refused them would be a bench no local tool
 * could talk to.
 *
 * What the foreign page gets for it is nothing it can read. The browser hands the response to
 * the tag that asked, not to the page's script, and the one API that WOULD hand over the body —
 * `fetch`/`XHR` — sends an Origin, which a foreign page loses on here, on every method. Writes
 * are out of reach twice over: every state-changing route is POST/PUT/DELETE, and the only
 * cross-origin issue a page can make without JavaScript is an HTML `<form>`, which cannot send
 * `Content-Type: application/json` — the only body type either gate's server parses. So the cost
 * is the WORK a GET does, not the data it answers with. `SECURITY.md` says the same thing at
 * more length, names every GET this reaches (`/api/plate` and `/api/plate/snapshot/:id`
 * included — the first one probes your clamped app), and is the copy a reader finds first; the
 * two move together, in substance rather than word for word.
 *
 * Extracted from `http.ts` (S17a) so `fs/route.ts` and `bench/host.ts` apply the exact same
 * check without an import cycle back into `http.ts`.
 */

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
const WILDCARD_BINDS = new Set(['0.0.0.0', '[::]']);

/** The 403 body every gate sends for a refused Host — in words, the same everywhere. */
export const HOST_REFUSED_MESSAGE =
  'request refused: the Host header does not name this bench — it answers to localhost, 127.0.0.1, [::1], or the --host it was started with';

interface ParsedHost {
  hostname: string;
  port: number | undefined;
}

/** `hostname` (lower-cased; IPv6 kept in its bracketed form) and `port` from a Host header.
 * `undefined` for anything that is not a plain `host[:port]` — a userinfo `@`, a path, a
 * space, an unbracketed IPv6 — so a Host that would need interpreting is a Host that is
 * refused. */
function parseHostHeader(value: string | undefined): ParsedHost | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9._-]+)(?::(\d{1,5}))?$/.exec(value.trim());
  if (!match) return undefined;
  return { hostname: match[1].toLowerCase(), port: match[2] === undefined ? undefined : Number(match[2]) };
}

/** A `--host` value as it would appear in a Host header's hostname position: lower-cased, an
 * unbracketed IPv6 address bracketed; `undefined` when none was given. */
function normalizeBoundHost(boundHost: string | undefined): string | undefined {
  if (typeof boundHost !== 'string') return undefined;
  const trimmed = boundHost.trim().toLowerCase();
  if (trimmed.length === 0) return undefined;
  return trimmed.includes(':') && !trimmed.startsWith('[') ? `[${trimmed}]` : trimmed;
}

function isIpLiteral(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || /^\[[0-9a-f:.]+\]$/.test(hostname);
}

/** #18: does this Host header name the bench itself? `boundHost` is the `--host` value the
 * server was started with, when any — see the module doc for the whole rule. */
export function isAllowedHost(host: string | undefined, boundHost?: string): boolean {
  const parsed = parseHostHeader(host);
  if (!parsed) return false;
  if (LOOPBACK_HOSTNAMES.has(parsed.hostname)) return true;
  const bound = normalizeBoundHost(boundHost);
  if (bound === undefined) return false;
  if (WILDCARD_BINDS.has(bound)) return isIpLiteral(parsed.hostname);
  return parsed.hostname === bound;
}

function originMatchesHost(origin: string, host: ParsedHost): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const originPort = url.port === '' ? (url.protocol === 'https:' ? 443 : 80) : Number(url.port);
  return url.hostname.toLowerCase() === host.hostname && originPort === (host.port ?? 80);
}

/** True when `host` names this bench (`isAllowedHost`) AND `origin` is either absent (a
 * non-browser client — curl, an MCP client, the CLI itself — never sends one) or matches that
 * Host exactly, name and port. Browsers always send `Origin` on a cross-origin fetch/XHR and
 * on same-origin state-changing requests, so this needs no hardcoded port — it works whether
 * the bench is on its configured port or, in tests, an OS-assigned one.
 *
 * #81: "absent" also covers a browser's `<img>`, `<script>` and navigation requests, which is
 * why a foreign page can still make a GET RUN here — see "What this gate does NOT stop" above
 * for what that does and does not cost. */
export function isSameOriginOrAbsent(origin: string | undefined, host: string | undefined, boundHost?: string): boolean {
  if (!isAllowedHost(host, boundHost)) return false;
  if (!origin) return true;
  const parsed = parseHostHeader(host);
  return parsed !== undefined && originMatchesHost(origin, parsed);
}
