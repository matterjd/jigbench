const HIGHLIGHT_ATTR = 'data-jig-snapshot-highlight';

/** The snapshot document has no stylesheet of its own (it's a frozen standalone page, not a
 * bench surface) — a bare `var(--storm)` written into it would resolve to nothing. Reading
 * the CURRENT computed value from the BENCH's own document (where `tokens.css` is loaded)
 * and writing that resolved value into the snapshot keeps the colour sourced from the token
 * file rather than hand-rolled here (design floor item 7) — the exact same necessity
 * `loupe.js` documents for its own required hardcoded copy, except this one is read live
 * instead of copied, so it can never drift from the token file's real value. */
function readStormColor(): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue('--storm').trim();
}

/**
 * The trial-fit mirror's "before" (snapshot) side: since the snapshot is served from the
 * BENCH's own origin (`GET /api/plate/snapshot/:id`), the iframe showing it is same-origin —
 * `contentDocument` is a real, readable/writable Document, so the scrubber can highlight the
 * current stop's element there directly, exactly the way `loupe.js` highlights the live
 * plate, with no script injected into the snapshot itself. Reads the element's CURRENT rect
 * (`getBoundingClientRect`) rather than a rect recorded once at capture time, so the
 * highlight stays correct even if the snapshot's own layout reflows.
 */
export function highlightInSnapshot(doc: Document, path: string, color: string = readStormColor()): void {
  clearSnapshotHighlight(doc);
  let el: Element | null;
  try {
    el = doc.querySelector(path);
  } catch {
    return; // not every recorded path is valid CSS in every document — never throw
  }
  if (!el) return;

  const rect = el.getBoundingClientRect();
  const box = doc.createElement('div');
  box.setAttribute(HIGHLIGHT_ATTR, '');
  box.style.position = 'fixed';
  box.style.pointerEvents = 'none';
  box.style.zIndex = '2147483646';
  box.style.boxSizing = 'border-box';
  box.style.border = `1px solid ${color}`;
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.top}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
  doc.body?.appendChild(box);
}

export function clearSnapshotHighlight(doc: Document): void {
  for (const box of Array.from(doc.querySelectorAll(`[${HIGHLIGHT_ATTR}]`))) {
    box.parentNode?.removeChild(box);
  }
}
