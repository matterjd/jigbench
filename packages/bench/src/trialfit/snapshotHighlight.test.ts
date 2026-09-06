// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { highlightInSnapshot, clearSnapshotHighlight } from './snapshotHighlight.js';

/**
 * S8 (trial-fit mirror, brief's explicit choice point): "on the left the scrubber
 * highlights the recorded stop's element in the snapshot via the same DOM path, using a
 * tiny inline script in the snapshot or by the bench drawing an overlay from recorded rects
 * — pick one and say so." PICKED: the bench draws the overlay itself, querying the LIVE
 * DOM of the snapshot document directly — the snapshot is served from the bench's own
 * origin (`GET /api/plate/snapshot/:id`), so `iframe.contentDocument` is same-origin and
 * readable/writable with no injected script needed inside the snapshot at all. This reads
 * the CURRENT element's rect at highlight time (via `getBoundingClientRect`), which is more
 * robust than a rect recorded once at capture time (a rect can shift with any CSS the
 * snapshot itself renders, e.g. its own responsive layout).
 */

function docWith(html: string): Document {
  return new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
}

describe('highlightInSnapshot', () => {
  it('draws one overlay box positioned at the matched element\'s rect', () => {
    const doc = docWith('<div id="a">a</div><div id="target">target</div>');
    const target = doc.getElementById('target')!;
    target.getBoundingClientRect = () => ({ x: 10, y: 20, width: 30, height: 40, top: 20, left: 10, right: 40, bottom: 60, toJSON: () => ({}) });

    highlightInSnapshot(doc, '#target');

    const box = doc.querySelector('[data-jig-snapshot-highlight]') as HTMLElement | null;
    expect(box).toBeTruthy();
    expect(box!.style.left).toBe('10px');
    expect(box!.style.top).toBe('20px');
    expect(box!.style.width).toBe('30px');
    expect(box!.style.height).toBe('40px');
  });

  it('replaces the previous highlight rather than stacking boxes', () => {
    const doc = docWith('<div id="a">a</div><div id="b">b</div>');
    for (const id of ['a', 'b']) {
      doc.getElementById(id)!.getBoundingClientRect = () => ({ x: 0, y: 0, width: 1, height: 1, top: 0, left: 0, right: 1, bottom: 1, toJSON: () => ({}) });
    }

    highlightInSnapshot(doc, '#a');
    highlightInSnapshot(doc, '#b');

    expect(doc.querySelectorAll('[data-jig-snapshot-highlight]')).toHaveLength(1);
  });

  it('does nothing (never throws) when the path resolves to nothing in this snapshot', () => {
    const doc = docWith('<p>hi</p>');
    expect(() => highlightInSnapshot(doc, '#does-not-exist')).not.toThrow();
    expect(doc.querySelectorAll('[data-jig-snapshot-highlight]')).toHaveLength(0);
  });

  it('does nothing (never throws) when the path is not valid CSS', () => {
    const doc = docWith('<p>hi</p>');
    expect(() => highlightInSnapshot(doc, ':::not-a-selector')).not.toThrow();
  });

  it('clearSnapshotHighlight removes the box', () => {
    const doc = docWith('<div id="target">t</div>');
    doc.getElementById('target')!.getBoundingClientRect = () => ({ x: 0, y: 0, width: 1, height: 1, top: 0, left: 0, right: 1, bottom: 1, toJSON: () => ({}) });
    highlightInSnapshot(doc, '#target');
    expect(doc.querySelectorAll('[data-jig-snapshot-highlight]')).toHaveLength(1);

    clearSnapshotHighlight(doc);
    expect(doc.querySelectorAll('[data-jig-snapshot-highlight]')).toHaveLength(0);
  });

  it('clearSnapshotHighlight never throws on a document with no highlight yet', () => {
    const doc = docWith('<p>hi</p>');
    expect(() => clearSnapshotHighlight(doc)).not.toThrow();
  });

  it('sources its colour from the BENCH document\'s live --storm token, not a hardcoded literal', () => {
    document.documentElement.style.setProperty('--storm', '#123456');
    try {
      const doc = docWith('<div id="target">t</div>');
      doc.getElementById('target')!.getBoundingClientRect = () =>
        ({ x: 0, y: 0, width: 1, height: 1, top: 0, left: 0, right: 1, bottom: 1, toJSON: () => ({}) }) as DOMRect;

      highlightInSnapshot(doc, '#target');

      const box = doc.querySelector('[data-jig-snapshot-highlight]') as HTMLElement;
      // jsdom's CSSOM normalizes the hex literal to rgb() when read back from style.border —
      // this still proves the LIVE value (0x12,0x34,0x56) was used, not any hardcoded default.
      expect(box.style.border).toContain('rgb(18, 52, 86)');
    } finally {
      document.documentElement.style.removeProperty('--storm');
    }
  });
});
