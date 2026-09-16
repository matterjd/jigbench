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
    expect(isSameOriginOrAbsent('', '[::1]:4600')).toBe(true);
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
  const GET_ROUTE = /\.get\(\s*['"](\/api[^'"]*)['"]/g;

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
    const routes = new Set<string>();
    for (const file of collectFiles(here)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(GET_ROUTE)) routes.add(family(match[1]));
    }
    expect(routes.size, 'no /api GET routes found — the scan is broken, not the document').toBeGreaterThan(5);

    const section = noOriginSection();
    const missing = [...routes].filter((route) => !section.includes(route)).sort();
    expect(missing, 'GET routes a foreign page can run that SECURITY.md does not name').toEqual([]);
  });
});
