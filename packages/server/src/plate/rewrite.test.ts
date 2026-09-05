import { describe, expect, it } from 'vitest';
import { injectLoupeScript, rewriteHeaders } from './rewrite.js';

const BENCH_ORIGIN = 'http://localhost:4600';

describe('injectLoupeScript', () => {
  it('inserts the loupe script tag before </body>', () => {
    const html = '<html><head></head><body><p>hi</p></body></html>';
    const out = injectLoupeScript(html, BENCH_ORIGIN);
    expect(out).toBe(
      `<html><head></head><body><p>hi</p><script src="/__jig/loupe.js" data-jig-bench="${BENCH_ORIGIN}"></script></body></html>`,
    );
  });

  it('is case-insensitive about </BODY>', () => {
    const html = '<html><BODY><p>hi</p></BODY></html>';
    const out = injectLoupeScript(html, BENCH_ORIGIN);
    expect(out).toContain('<script src="/__jig/loupe.js"');
    expect(out.indexOf('<script')).toBeLessThan(out.indexOf('</BODY>'));
  });

  it('appends the script when there is no </body> at all', () => {
    const html = '<html><head></head></html>';
    const out = injectLoupeScript(html, BENCH_ORIGIN);
    expect(out).toBe(
      `<html><head></head></html><script src="/__jig/loupe.js" data-jig-bench="${BENCH_ORIGIN}"></script>`,
    );
  });
});

describe('rewriteHeaders', () => {
  it('removes X-Frame-Options and records the change', () => {
    const { headers, changes } = rewriteHeaders({ 'x-frame-options': 'DENY' }, BENCH_ORIGIN);
    expect(headers['x-frame-options']).toBeUndefined();
    expect(changes).toEqual([
      {
        header: 'x-frame-options',
        from: 'DENY',
        to: null,
        reason: expect.stringContaining('iframe'),
      },
    ]);
  });

  it("replaces a frame-ancestors 'none' with the bench origin", () => {
    const { headers, changes } = rewriteHeaders(
      { 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" },
      BENCH_ORIGIN,
    );
    expect(headers['content-security-policy']).toBe(`default-src 'self'; frame-ancestors ${BENCH_ORIGIN}`);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      header: 'content-security-policy',
      from: "frame-ancestors 'none'",
      to: `frame-ancestors ${BENCH_ORIGIN}`,
    });
  });

  it('appends the bench origin to an existing frame-ancestors list rather than replacing it', () => {
    const { headers } = rewriteHeaders(
      { 'content-security-policy': "frame-ancestors 'self' https://other.example" },
      BENCH_ORIGIN,
    );
    expect(headers['content-security-policy']).toBe(
      `frame-ancestors 'self' https://other.example ${BENCH_ORIGIN}`,
    );
  });

  it('does not duplicate the bench origin if frame-ancestors already includes it', () => {
    const { headers, changes } = rewriteHeaders(
      { 'content-security-policy': `frame-ancestors ${BENCH_ORIGIN}` },
      BENCH_ORIGIN,
    );
    expect(headers['content-security-policy']).toBe(`frame-ancestors ${BENCH_ORIGIN}`);
    expect(changes).toEqual([]);
  });

  it("appends 'self' to a script-src that lacks it", () => {
    const { headers, changes } = rewriteHeaders(
      { 'content-security-policy': "script-src 'unsafe-inline' https://cdn.example.com" },
      BENCH_ORIGIN,
    );
    expect(headers['content-security-policy']).toBe(
      "script-src 'unsafe-inline' https://cdn.example.com 'self'",
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ header: 'content-security-policy' });
  });

  it('leaves a script-src that already allows self untouched', () => {
    const { headers, changes } = rewriteHeaders(
      { 'content-security-policy': "script-src 'self' https://cdn.example.com" },
      BENCH_ORIGIN,
    );
    expect(headers['content-security-policy']).toBe("script-src 'self' https://cdn.example.com");
    expect(changes).toEqual([]);
  });

  it('handles both frame-ancestors and script-src changing in the same header', () => {
    const { headers, changes } = rewriteHeaders(
      { 'content-security-policy': "frame-ancestors 'none'; script-src 'unsafe-inline'" },
      BENCH_ORIGIN,
    );
    expect(headers['content-security-policy']).toBe(
      `frame-ancestors ${BENCH_ORIGIN}; script-src 'unsafe-inline' 'self'`,
    );
    expect(changes).toHaveLength(2);
  });

  it('leaves everything untouched when there is no CSP and no X-Frame-Options', () => {
    const { headers, changes } = rewriteHeaders({ 'content-type': 'text/html' }, BENCH_ORIGIN);
    expect(headers).toEqual({ 'content-type': 'text/html' });
    expect(changes).toEqual([]);
  });

  it('is case-insensitive matching header names and preserves other headers', () => {
    const { headers, changes } = rewriteHeaders(
      { 'X-Frame-Options': 'SAMEORIGIN', 'Content-Type': 'text/html; charset=utf-8' },
      BENCH_ORIGIN,
    );
    expect(headers['X-Frame-Options']).toBeUndefined();
    expect(headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(changes).toHaveLength(1);
  });

  it('joins array-valued headers with a comma', () => {
    const { headers } = rewriteHeaders({ 'set-cookie': ['a=1', 'b=2'] }, BENCH_ORIGIN);
    expect(headers['set-cookie']).toBe('a=1, b=2');
  });
});
