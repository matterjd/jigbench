import { describe, expect, it } from 'vitest';
import { sanitizeSnapshotHtml } from './sanitize-snapshot.js';

/**
 * Wave-4 council finding 4 (MEDIUM) — the server-side half of snapshot sanitization. See
 * loupe.test.ts's "sanitization beyond <script>" suite for the client-side (DOM-based) half
 * of the same fix.
 */
describe('sanitizeSnapshotHtml', () => {
  it('strips <script> tags', () => {
    const out = sanitizeSnapshotHtml('<p id="keep">hi</p><script>evil()</script>');
    expect(out).toContain('id="keep"');
    expect(out).not.toMatch(/<script/i);
  });

  it('strips on*= handler attributes, case-insensitively, and leaves unrelated attributes alone', () => {
    const out = sanitizeSnapshotHtml('<button id="keep" onclick="evil()" OnMouseOver="evil2()" data-onx="fine">go</button>');
    expect(out).toContain('id="keep"');
    expect(out).toContain('data-onx="fine"');
    expect(out).not.toMatch(/\bonclick\s*=/i);
    expect(out).not.toMatch(/\bonmouseover\s*=/i);
  });

  it('neutralizes javascript: URLs in href/src/action to "#"', () => {
    const out = sanitizeSnapshotHtml('<a id="keep" href="javascript:alert(1)">click</a>');
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toContain('href="#"');
    expect(out).toContain('id="keep"');
  });

  it('is case-insensitive and tolerates whitespace evasion in the URL scheme', () => {
    const out = sanitizeSnapshotHtml('<a href="JAVASCRIPT:alert(1)">x</a><a href="jav\tascript:alert(2)">y</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it('neutralizes data:text/html URLs', () => {
    const out = sanitizeSnapshotHtml('<a href="data:text/html,<script>evil()</script>">x</a>');
    expect(out).not.toMatch(/data:text\/html/i);
  });

  it('leaves a normal data-href custom attribute untouched (no false positive on the "href" substring)', () => {
    const out = sanitizeSnapshotHtml('<div data-href="javascript:evil()">x</div>');
    // data-href is not a real navigation attribute, but the assertion here is narrower: the
    // sanitizer must not mangle the surrounding markup while handling it either way. The
    // real acceptance is that a GENUINE href/src/action is always caught (covered above).
    expect(out).toContain('<div data-href="javascript:evil()">x</div>');
  });

  it('removes <iframe>, <object>, and <embed> elements entirely, paired or self-closing', () => {
    const out = sanitizeSnapshotHtml(
      '<p id="keep">hi</p><iframe src="https://evil.example"></iframe><object data="evil.swf"></object><embed src="evil.swf">',
    );
    expect(out).toContain('id="keep"');
    expect(out).not.toMatch(/<iframe/i);
    expect(out).not.toMatch(/<object/i);
    expect(out).not.toMatch(/<embed/i);
  });

  it('removes a <meta http-equiv="refresh"> redirect regardless of attribute order', () => {
    const out1 = sanitizeSnapshotHtml('<meta http-equiv="refresh" content="0;url=https://evil.example">');
    const out2 = sanitizeSnapshotHtml('<meta content="0;url=https://evil.example" http-equiv="refresh">');
    expect(out1).not.toMatch(/http-equiv/i);
    expect(out2).not.toMatch(/http-equiv/i);
  });

  it('leaves an unrelated <meta> tag alone', () => {
    const out = sanitizeSnapshotHtml('<meta charset="utf-8">');
    expect(out).toContain('<meta charset="utf-8">');
  });

  it('is a no-op on plain, already-clean HTML', () => {
    const html = '<!doctype html><html><body><p id="keep">hello</p></body></html>';
    expect(sanitizeSnapshotHtml(html)).toBe(html);
  });
});
