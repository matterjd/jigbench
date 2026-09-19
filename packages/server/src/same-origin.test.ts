import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAllowedHost, isSameOriginOrAbsent } from './same-origin.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Every non-test source under packages/server/src — the same walk `no-stdout.test.ts` uses. */
function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

// #18 (the 0.2.0 review): the gate is Host-first. A page served from a domain the attacker
// later re-points at 127.0.0.1 reaches this process over a loopback socket with
// `Host: attacker.example:4600` — and a same-origin GET from it carries no Origin at all.

describe('isAllowedHost', () => {
  it('accepts the loopback names on any port, in any case', () => {
    for (const host of ['localhost:4600', '127.0.0.1:4600', '[::1]:4600', 'localhost', 'LOCALHOST:4600', '127.0.0.1:0', '[::1]']) {
      expect(isAllowedHost(host), host).toBe(true);
    }
  });

  it('refuses a DNS name — the rebinding case — and anything that only looks like loopback', () => {
    for (const host of [
      'attacker.example:4600',
      'localhost.attacker.example:4600',
      'localhost@attacker.example:4600',
      '127.0.0.1.attacker.example:4600',
      'attacker.example',
      'local host:4600',
      'localhost:4600/api',
      '',
      undefined,
    ]) {
      expect(isAllowedHost(host), String(host)).toBe(false);
    }
  });

  it('accepts the explicit --host value the bench was bound to (and still the loopback names)', () => {
    expect(isAllowedHost('192.168.1.5:4600', '192.168.1.5')).toBe(true);
    expect(isAllowedHost('desk.local:4600', 'desk.local')).toBe(true);
    expect(isAllowedHost('DESK.local:4600', 'desk.local')).toBe(true);
    expect(isAllowedHost('[fe80::1]:4600', 'fe80::1')).toBe(true);
    expect(isAllowedHost('localhost:4600', '192.168.1.5')).toBe(true);
    // Without that bind the same names are strangers.
    expect(isAllowedHost('192.168.1.5:4600')).toBe(false);
    expect(isAllowedHost('desk.local:4600')).toBe(false);
    // And the bind does not open the door to any other name.
    expect(isAllowedHost('attacker.example:4600', '192.168.1.5')).toBe(false);
    expect(isAllowedHost('attacker.example:4600', 'desk.local')).toBe(false);
  });

  it('a wildcard bind (0.0.0.0 / ::) accepts any IP-literal Host — an address cannot be rebound — and still no DNS name', () => {
    expect(isAllowedHost('192.168.1.5:4600', '0.0.0.0')).toBe(true);
    expect(isAllowedHost('[fe80::1]:4600', '::')).toBe(true);
    expect(isAllowedHost('10.0.0.7', '::')).toBe(true);
    expect(isAllowedHost('desk.local:4600', '0.0.0.0')).toBe(false);
    expect(isAllowedHost('attacker.example:4600', '::')).toBe(false);
  });
});

describe('isSameOriginOrAbsent', () => {
  it("the rebinding request — Origin and Host agree on the attacker's name — is refused, with or without an Origin", () => {
    expect(isSameOriginOrAbsent('http://attacker.example:4600', 'attacker.example:4600')).toBe(false);
    expect(isSameOriginOrAbsent(undefined, 'attacker.example:4600')).toBe(false);
  });

  it('an absent Origin on an allowed Host is a non-browser client (curl, an MCP client, the CLI) — allowed', () => {
    expect(isSameOriginOrAbsent(undefined, 'localhost:4600')).toBe(true);
    expect(isSameOriginOrAbsent(undefined, '127.0.0.1:4600')).toBe(true);
    // #81: this line used to pass `''` and expect `true` — an `Origin:` header PRESENT with an
    // empty value took the absent-Origin door, because the check was `!origin`. It is refused
    // now, and the case moved to its own test below; `undefined` is what absent means.
    expect(isSameOriginOrAbsent(undefined, '[::1]:4600')).toBe(true);
    expect(isSameOriginOrAbsent(undefined, '192.168.1.5:4600', '192.168.1.5')).toBe(true);
  });

  it('a present Origin must match the Host — name and port — exactly', () => {
    expect(isSameOriginOrAbsent('http://localhost:4600', 'localhost:4600')).toBe(true);
    expect(isSameOriginOrAbsent('http://LOCALHOST:4600', 'localhost:4600')).toBe(true);
    expect(isSameOriginOrAbsent('http://[::1]:4600', '[::1]:4600')).toBe(true);
    expect(isSameOriginOrAbsent('http://192.168.1.5:4600', '192.168.1.5:4600', '192.168.1.5')).toBe(true);
    expect(isSameOriginOrAbsent('http://127.0.0.1:4600', 'localhost:4600')).toBe(false); // a different name for the same place is still a different origin
    expect(isSameOriginOrAbsent('http://localhost:4601', 'localhost:4600')).toBe(false); // the plate's port is not the bench's
    expect(isSameOriginOrAbsent('http://evil.example', 'localhost:4600')).toBe(false);
    expect(isSameOriginOrAbsent('null', 'localhost:4600')).toBe(false);
    expect(isSameOriginOrAbsent('not a url', 'localhost:4600')).toBe(false);
  });

  it('a missing Host header is refused whatever the Origin', () => {
    expect(isSameOriginOrAbsent(undefined, undefined)).toBe(false);
    expect(isSameOriginOrAbsent('http://localhost:4600', undefined)).toBe(false);
  });
});

// #81 item 5, the lead's repair: SECURITY.md's "a page on another site can still make Jig run a
// `GET`" section presents its list as complete, and the review found it was not — `/api/plate`
// (which names the target URL, its port, the rewritten headers and the mirror, and probes the
// clamped app on every call) and `/api/plate/snapshot/:id` were missing. A prose list cannot
// notice a route added later, so the list is checked against the routes themselves: every
// `GET` under `/api` that either server mounts must be named in that section. The check
// enumerates the ALLOWED set (each route must appear) rather than a denylist of known-missing
// names, which is the shape that catches the next one too.
describe('SECURITY.md names every /api GET a foreign page can cause to run', () => {
  const REPO_ROOT = join(here, '..', '..', '..');

  /** A GET whose path spells `/api` itself, however it is quoted. #103 (#96): backticks too —
   * the old pattern accepted `'` and `"` only, so a template-literal path was invisible to it
   * for no reason anyone chose. A path with a `${}` in it will now be enumerated LITERALLY and
   * red this check until SECURITY.md names it, which is the right way round: a route whose path
   * a reader cannot see spelled out is exactly the one worth being made to write down. */
  const GET_ROUTE = /\.get\(\s*['"`](\/api[^'"`]*)['"`]/g;

  /** #103 (#96): a GET whose `/api` is at the MOUNT rather than in the string —
   * `router.get('/leak', …)` beside `app.use('/api', router)`. The verifier for #96 ran that
   * control and the suite stayed green: a new, unnamed, foreign-reachable GET with the gate
   * satisfied. Nothing in the tree is registered that way today (every one of them spells the
   * full `/api` literal), so this was latent rather than a live hole — and a latent hole in a
   * check whose whole job is to catch the NEXT route is the one worth closing.
   *
   * The receiver is captured, not ignored, so a relative path is only ever composed with the
   * prefix its own router was mounted under — never with every prefix in the repo. */
  const ROUTER_GET = /([\w$]+)\s*\.get\(\s*['"`](\/[^'"`]*)['"`]/g;

  /** `app.use('<prefix>', <router>)` — a prefix mount whose handler is a NAMED router. An
   * inline `(req, res, next) => …` (which is what both servers mount their Host gate as) has no
   * name to match a `.get` against and is deliberately not matched. */
  const ROUTER_MOUNT = /\.use\(\s*['"`](\/[^'"`]*)['"`]\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g;

  /** `/api/prompts/:id/builds/:buildId/transcript` is named in the section as `/api/prompts`
   * plus "a build's transcript" — the family is the unit a reader can act on, so the check asks
   * for the path up to its first parameter. */
  function family(route: string): string {
    const kept: string[] = [];
    for (const segment of route.split('/')) {
      if (segment.startsWith(':')) break;
      kept.push(segment);
    }
    return kept.join('/');
  }

  function noOriginSection(): string {
    const doc = readFileSync(join(REPO_ROOT, 'SECURITY.md'), 'utf8');
    const start = doc.indexOf('- **A page on another site can still make Jig run a `GET`.');
    expect(start, 'the no-Origin GET section is missing from SECURITY.md').toBeGreaterThan(-1);
    const end = doc.indexOf('\n- **', start + 1);
    return doc.slice(start, end === -1 ? undefined : end);
  }

  it('every GET route in packages/server is named there', () => {
    const sources = collectFiles(here).map((file) => readFileSync(file, 'utf8'));

    // #103 (#96): which `/api` prefix each named router is mounted under. Collected across
    // every file first, because a router is routinely built in one file and mounted in another
    // (`bench/host.ts` mounts what `fixtures/`, `plate/`, `prompts/` and `sketch/` attach).
    const mountedUnder = new Map<string, Set<string>>();
    for (const source of sources) {
      for (const [, prefix, router] of source.matchAll(ROUTER_MOUNT)) {
        if (!prefix.startsWith('/api')) continue;
        const prefixes = mountedUnder.get(router) ?? new Set<string>();
        prefixes.add(prefix.replace(/\/+$/, ''));
        mountedUnder.set(router, prefixes);
      }
    }

    const routes = new Set<string>();
    for (const source of sources) {
      for (const match of source.matchAll(GET_ROUTE)) routes.add(family(match[1]));
      for (const [, receiver, path] of source.matchAll(ROUTER_GET)) {
        if (path.startsWith('/api')) continue; // already counted by GET_ROUTE, whatever it hung off
        for (const prefix of mountedUnder.get(receiver) ?? []) routes.add(family(`${prefix}${path}`));
      }
    }
    expect(routes.size, 'no /api GET routes found — the scan is broken, not the document').toBeGreaterThan(5);

    const section = noOriginSection();
    const missing = [...routes].filter((route) => !section.includes(route)).sort();
    expect(missing, 'GET routes a foreign page can run that SECURITY.md does not name').toEqual([]);
  });
});

// #81 item 8 (a #65 suggestion the S20 review carried): three narrowings of the Origin half.
// None of them is a rebinding case — #18 covers that — and none is reachable from an ordinary
// browser talking to an ordinary bench. Each is a shape the gate ACCEPTED because the rule was
// written a little wider than the thing it is guarding.
describe('#81: the Origin half says what it means', () => {
  it('requires the http: scheme — this bench is never served over https', () => {
    // `originMatchesHost` accepted `https:` alongside `http:`, with a 443 default port to make
    // it work. Nothing in Jig serves https: `createBench`'s own `benchOrigin` is
    // `http://localhost:<port>`, the plate proxy is http, and the CLI prints http. An https
    // Origin on an allowed Host therefore cannot be this bench's own page — it is some other
    // origin that happens to share the name.
    expect(isSameOriginOrAbsent('https://localhost:4600', 'localhost:4600')).toBe(false);
    expect(isSameOriginOrAbsent('https://localhost', 'localhost')).toBe(false);
    expect(isSameOriginOrAbsent('https://127.0.0.1:4600', '127.0.0.1:4600')).toBe(false);
    expect(isSameOriginOrAbsent('https://192.168.1.5:4600', '192.168.1.5:4600', '192.168.1.5')).toBe(false);
    // ...and the http spelling of each is untouched.
    expect(isSameOriginOrAbsent('http://localhost:4600', 'localhost:4600')).toBe(true);
    expect(isSameOriginOrAbsent('http://192.168.1.5:4600', '192.168.1.5:4600', '192.168.1.5')).toBe(true);
  });

  it('refuses an Origin header that is PRESENT and empty — that is not a client with no Origin', () => {
    // The allowance is for a request that carries no Origin at all: curl, an MCP client, the
    // CLI. A header sent with an empty value is a different thing, and it took the same door,
    // because the check was `!origin`. Absent now means absent.
    expect(isSameOriginOrAbsent('', 'localhost:4600')).toBe(false);
    expect(isSameOriginOrAbsent('   ', 'localhost:4600')).toBe(false);
    expect(isSameOriginOrAbsent(undefined, 'localhost:4600')).toBe(true); // still allowed
  });

  it('pins `Origin: null` — the opaque origin a sandboxed iframe or a data: URL sends', () => {
    // A browser sends the literal string `null` as the Origin for a sandboxed iframe, a
    // `data:` URL, or a redirect that crosses origins. It is not a missing Origin and it must
    // never be read as one.
    expect(isSameOriginOrAbsent('null', 'localhost:4600')).toBe(false);
    expect(isSameOriginOrAbsent('null', '127.0.0.1:4600')).toBe(false);
    expect(isSameOriginOrAbsent('null', '192.168.1.5:4600', '192.168.1.5')).toBe(false);
  });
});
