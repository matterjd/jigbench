import { describe, expect, it } from 'vitest';
import { isAllowedHost, isSameOriginOrAbsent } from './same-origin.js';

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
