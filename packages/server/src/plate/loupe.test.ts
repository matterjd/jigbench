import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

/**
 * loupe.js is a plain, dependency-free classic script (no build step, no exports — it is
 * served byte-for-byte to the browser, see proxy.ts's loupeScript()). To unit test its pure
 * logic we build a real DOM with `jsdom` directly (not vitest's global jsdom environment —
 * that runs this file's module graph itself inside a browser-like context, which is not what
 * we want here: we want ONE isolated page per test, with loupe.js executing inside it exactly
 * as a `<script data-jig-bench>` tag would), then exercise the small
 * `window.__jigLoupeInternal` hook it exposes for tests. Runtime behaviour (postMessage,
 * DOM listeners) is never routed through that hook — only pure helpers are.
 */

const SOURCE = readFileSync(fileURLToPath(new URL('./loupe.js', import.meta.url)), 'utf8');
const BENCH_ORIGIN = 'http://localhost:4600';

interface LoupeInternal {
  buildDomPath(el: Element): string;
  surveyedMatch(el: Element): { selector: string; name: string; file: string } | null;
  describeElement(el: Element): { tag: string; component?: string; file?: string };
  setSurveySelectors(next: Array<{ selector: string; name: string; file: string }>): void;
  setMode(next: 'hand' | 'loupe'): void;
  getMode(): 'hand' | 'loupe';
}

function loadLoupe(bodyHtml: string, beforeLoad?: (dom: JSDOM) => void): JSDOM {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    runScripts: 'dangerously',
    url: 'http://target.example/',
  });
  beforeLoad?.(dom);
  const script = dom.window.document.createElement('script');
  script.setAttribute('data-jig-bench', BENCH_ORIGIN);
  script.textContent = SOURCE;
  dom.window.document.body.appendChild(script);
  return dom;
}

function internalOf(dom: JSDOM): LoupeInternal {
  return (dom.window as unknown as { __jigLoupeInternal: LoupeInternal }).__jigLoupeInternal;
}

describe('loupe.js', () => {
  it('logs exactly one debug-level "ready" line and nothing else on load', () => {
    const calls: unknown[][] = [];
    const logCalls: unknown[][] = [];
    loadLoupe('<p>hi</p>', (d) => {
      d.window.console.debug = (...args: unknown[]) => calls.push(args);
      d.window.console.log = (...args: unknown[]) => logCalls.push(args);
    });

    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.[0])).toContain('[jig] loupe ready');
    expect(logCalls).toHaveLength(0);
  });

  it('builds a stable tag:nth-of-type DOM path', () => {
    const dom = loadLoupe('<div id="root"><ul><li>a</li><li id="target">b</li><li>c</li></ul></div>');
    const el = dom.window.document.getElementById('target')!;
    const path = internalOf(dom).buildDomPath(el);
    expect(path).toMatch(/li:nth-of-type\(2\)$/);
    expect(dom.window.document.querySelector(path)).toBe(el);
  });

  it('matches the nearest ancestor against a surveyed selector by tag name', () => {
    const dom = loadLoupe(
      '<app-invoice-list><table><tr><td id="cell">1</td></tr></table></app-invoice-list>',
    );
    internalOf(dom).setSurveySelectors([
      { selector: 'app-invoice-list', name: 'InvoiceListComponent', file: 'src/app/invoices/invoice-list/invoice-list.ts' },
    ]);
    const cell = dom.window.document.getElementById('cell')!;
    const match = internalOf(dom).surveyedMatch(cell);
    expect(match).toEqual({
      selector: 'app-invoice-list',
      name: 'InvoiceListComponent',
      file: 'src/app/invoices/invoice-list/invoice-list.ts',
    });
  });

  it('returns null when nothing surveyed matches', () => {
    const dom = loadLoupe('<div id="cell">x</div>');
    internalOf(dom).setSurveySelectors([{ selector: 'app-invoice-list', name: 'x', file: 'x.ts' }]);
    expect(internalOf(dom).surveyedMatch(dom.window.document.getElementById('cell')!)).toBeNull();
  });

  it('describeElement prefers Angular dev-mode resolution over the survey fallback', () => {
    const dom = loadLoupe('<app-invoice-list id="host"><span id="inner">hi</span></app-invoice-list>');
    internalOf(dom).setSurveySelectors([
      { selector: 'app-invoice-list', name: 'SurveyName', file: 'survey/file.ts' },
    ]);
    (dom.window as unknown as { ng: unknown }).ng = {
      getComponent: () => null,
      getOwningComponent: (el: Element) =>
        el.closest('app-invoice-list') ? { constructor: { name: 'InvoiceListComponent' } } : null,
    };
    const described = internalOf(dom).describeElement(dom.window.document.getElementById('inner')!);
    expect(described.component).toBe('InvoiceListComponent');
    expect(described.file).toBe('survey/file.ts');
  });

  it('falls back to the survey name when Angular dev-mode globals are absent', () => {
    const dom = loadLoupe('<app-invoice-list id="host"><span id="inner">hi</span></app-invoice-list>');
    internalOf(dom).setSurveySelectors([
      { selector: 'app-invoice-list', name: 'InvoiceListComponent', file: 'survey/file.ts' },
    ]);
    const described = internalOf(dom).describeElement(dom.window.document.getElementById('inner')!);
    expect(described.component).toBe('InvoiceListComponent');
    expect(described.file).toBe('survey/file.ts');
  });

  it('defaults to hand mode and switches on jig:mode messages', () => {
    const dom = loadLoupe('<p>hi</p>');
    expect(internalOf(dom).getMode()).toBe('hand');
    dom.window.dispatchEvent(
      new dom.window.MessageEvent('message', { data: { type: 'jig:mode', mode: 'loupe' }, origin: BENCH_ORIGIN }),
    );
    expect(internalOf(dom).getMode()).toBe('loupe');
  });

  it('never modifies the target elements themselves — the overlay is a sibling node', () => {
    const dom = loadLoupe('<div id="target" class="untouched">hi</div>');
    const target = dom.window.document.getElementById('target')!;
    const before = target.outerHTML;
    internalOf(dom).setMode('loupe');
    target.dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true }));
    expect(target.outerHTML).toBe(before);
  });

  describe('click interception (S3 CONCERNS 2 — a loupe click must not reach the app\'s own handler)', () => {
    /** Stands in for Angular's [routerLink]: a bubble-phase click listener the target owns
     * itself, exactly like the imperative navigation a router directive attaches — it runs
     * from JS inside the listener, not through the browser's default action, so
     * preventDefault() alone (with no stopPropagation()) would never stop it. */
    function attachOwnClickListener(target: Element): { fired: boolean } {
      const state = { fired: false };
      target.addEventListener('click', () => {
        state.fired = true;
      });
      return state;
    }

    it('loupe mode: the capture-phase intercept stops the target\'s own click listener from ever running, and still posts jig:pick', () => {
      const dom = loadLoupe('<a id="target" href="/invoices/1">row</a>');
      const target = dom.window.document.getElementById('target')!;
      const own = attachOwnClickListener(target);
      internalOf(dom).setMode('loupe');

      const posted: unknown[] = [];
      dom.window.postMessage = ((message: unknown) => posted.push(message)) as typeof dom.window.postMessage;

      target.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(own.fired).toBe(false);
      expect(posted).toHaveLength(1);
      expect(posted[0]).toMatchObject({ type: 'jig:pick', tag: 'a' });
    });

    it('hand mode: nothing is intercepted — the target\'s own click listener fires normally and a jig:event is posted', () => {
      const dom = loadLoupe('<a id="target" href="/invoices/1">row</a>');
      const target = dom.window.document.getElementById('target')!;
      const own = attachOwnClickListener(target);
      expect(internalOf(dom).getMode()).toBe('hand'); // default — never switched

      const posted: unknown[] = [];
      dom.window.postMessage = ((message: unknown) => posted.push(message)) as typeof dom.window.postMessage;

      target.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(own.fired).toBe(true);
      expect(posted).toHaveLength(1);
      expect(posted[0]).toMatchObject({ type: 'jig:event', kind: 'click' });
    });

    it('loupe mode: pointerdown/mousedown/auxclick are also stopped before reaching the target', () => {
      const dom = loadLoupe('<button id="target">go</button>');
      const target = dom.window.document.getElementById('target')!;
      const seen: string[] = [];
      for (const type of ['pointerdown', 'mousedown', 'auxclick']) {
        target.addEventListener(type, () => seen.push(type));
      }
      internalOf(dom).setMode('loupe');

      target.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      target.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      target.dispatchEvent(new dom.window.MouseEvent('auxclick', { bubbles: true, cancelable: true }));

      expect(seen).toEqual([]);
    });
  });
});
