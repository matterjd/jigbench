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

  describe('S4 extension: jig:highlight by selector + jig:navigate', () => {
    it('jig:highlight with paths still highlights by DOM path (unchanged behaviour)', () => {
      const dom = loadLoupe('<ul><li id="a">a</li><li id="b">b</li></ul>');
      const a = dom.window.document.getElementById('a')!;
      const path = internalOf(dom).buildDomPath(a);

      dom.window.dispatchEvent(
        new dom.window.MessageEvent('message', { data: { type: 'jig:highlight', paths: [path] }, origin: BENCH_ORIGIN }),
      );

      const boxes = dom.window.document.querySelectorAll('[data-jig-loupe-highlight]');
      expect(boxes).toHaveLength(1);
    });

    it('jig:highlight with selectors outlines every matching element', () => {
      const dom = loadLoupe(
        '<div class="lg-btn">one</div><div class="lg-btn">two</div><div class="other">three</div>',
      );

      dom.window.dispatchEvent(
        new dom.window.MessageEvent('message', {
          data: { type: 'jig:highlight', selectors: ['.lg-btn'] },
          origin: BENCH_ORIGIN,
        }),
      );

      const boxes = dom.window.document.querySelectorAll('[data-jig-loupe-highlight]');
      expect(boxes).toHaveLength(2);
    });

    it('jig:highlight with multiple selectors unions every match across all of them', () => {
      const dom = loadLoupe('<div class="a">1</div><div class="b">2</div><div class="c">3</div>');

      dom.window.dispatchEvent(
        new dom.window.MessageEvent('message', {
          data: { type: 'jig:highlight', selectors: ['.a', '.b'] },
          origin: BENCH_ORIGIN,
        }),
      );

      expect(dom.window.document.querySelectorAll('[data-jig-loupe-highlight]')).toHaveLength(2);
    });

    it('an invalid selector is skipped rather than throwing from the message handler', () => {
      const dom = loadLoupe('<div class="ok">1</div>');
      expect(() =>
        dom.window.dispatchEvent(
          new dom.window.MessageEvent('message', {
            data: { type: 'jig:highlight', selectors: [':::not-a-selector', '.ok'] },
            origin: BENCH_ORIGIN,
          }),
        ),
      ).not.toThrow();
      expect(dom.window.document.querySelectorAll('[data-jig-loupe-highlight]')).toHaveLength(1);
    });

    it('jig:clear removes selector-painted highlights too', () => {
      const dom = loadLoupe('<div class="lg-btn">one</div>');
      dom.window.dispatchEvent(
        new dom.window.MessageEvent('message', {
          data: { type: 'jig:highlight', selectors: ['.lg-btn'] },
          origin: BENCH_ORIGIN,
        }),
      );
      expect(dom.window.document.querySelectorAll('[data-jig-loupe-highlight]')).toHaveLength(1);

      dom.window.dispatchEvent(
        new dom.window.MessageEvent('message', { data: { type: 'jig:clear' }, origin: BENCH_ORIGIN }),
      );
      expect(dom.window.document.querySelectorAll('[data-jig-loupe-highlight]')).toHaveLength(0);
    });

    // jsdom's Location.prototype.assign is neither writable nor configurable, so it cannot be
    // spied on directly (a real browser's is a normal method — this is a jsdom-only limit).
    // The resolution logic (same-origin check + absolute-URL building) is exposed on the same
    // `__jigLoupeInternal` test hook the file's other pure helpers use, exactly for this
    // reason: `navigateSameOrigin` itself is exercised below only for "does it throw."
    it('resolveNavigateUrl resolves a same-origin relative path to an absolute URL', () => {
      const dom = loadLoupe('<p>hi</p>');
      expect((internalOf(dom) as unknown as { resolveNavigateUrl(p: string): string | null }).resolveNavigateUrl('/invoices')).toBe(
        'http://target.example/invoices',
      );
    });

    it('resolveNavigateUrl refuses a cross-origin absolute URL', () => {
      const dom = loadLoupe('<p>hi</p>');
      expect(
        (internalOf(dom) as unknown as { resolveNavigateUrl(p: string): string | null }).resolveNavigateUrl(
          'http://evil.example/steal',
        ),
      ).toBeNull();
    });

    it('resolveNavigateUrl returns null for a malformed path rather than throwing', () => {
      const dom = loadLoupe('<p>hi</p>');
      expect(() =>
        (internalOf(dom) as unknown as { resolveNavigateUrl(p: string): string | null }).resolveNavigateUrl('http://'),
      ).not.toThrow();
    });

    it('jig:navigate with a same-origin path never throws from the message handler', () => {
      const dom = loadLoupe('<p>hi</p>');
      expect(() =>
        dom.window.dispatchEvent(
          new dom.window.MessageEvent('message', { data: { type: 'jig:navigate', path: '/invoices' }, origin: BENCH_ORIGIN }),
        ),
      ).not.toThrow();
    });

    it('jig:navigate with a cross-origin path never throws and never navigates', () => {
      const dom = loadLoupe('<p>hi</p>');
      const before = dom.window.location.href;
      expect(() =>
        dom.window.dispatchEvent(
          new dom.window.MessageEvent('message', {
            data: { type: 'jig:navigate', path: 'http://evil.example/steal' },
            origin: BENCH_ORIGIN,
          }),
        ),
      ).not.toThrow();
      expect(dom.window.location.href).toBe(before);
    });
  });

  // --- S7: jig:fill / jig:fill-probe (F10 — "the loupe fills forms by dispatching the input
  // events Angular honours") -----------------------------------------------------------------
  describe('jig:fill / jig:fill-probe (S7)', () => {
    function postMessages(dom: JSDOM): unknown[] {
      const posted: unknown[] = [];
      dom.window.postMessage = ((message: unknown) => posted.push(message)) as typeof dom.window.postMessage;
      return posted;
    }

    function send(dom: JSDOM, data: unknown): void {
      dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data, origin: BENCH_ORIGIN }));
    }

    /** The native-setter + dispatchEvent fill deliberately fires REAL bubbling input/change
     * events (that's the whole point — Angular/React must see them) — which the loupe's own
     * pre-existing hand-mode listeners (above, untouched by this block) also observe and
     * report as `jig:event`. So `posted` legitimately carries those interleaved with the
     * `jig:filled` reply; these tests pick the reply out rather than asserting the array is
     * ONLY that one message. */
    function filledMessage(posted: unknown[]): unknown {
      return posted.find((m) => (m as { type?: string }).type === 'jig:filled');
    }

    it('jig:fill-probe with no formPath reports the page\'s first form\'s field names', () => {
      const dom = loadLoupe(
        '<form id="f1"><input name="customerId"><textarea name="notes"></textarea></form>',
      );
      const posted = postMessages(dom);
      send(dom, { type: 'jig:fill-probe' });
      expect(posted).toHaveLength(1);
      const message = posted[0] as { type: string; names: string[] };
      expect(message.type).toBe('jig:fill-fields');
      expect(message.names.sort()).toEqual(['customerId', 'notes']);
    });

    it('jig:fill-probe scoped to a formPath resolves the NEAREST ancestor form of that element', () => {
      const dom = loadLoupe(
        '<form><input name="wrong"></form>' +
          '<form id="target"><span id="anchor">pick me</span><input name="right"></form>',
      );
      const posted = postMessages(dom);
      send(dom, { type: 'jig:fill-probe', formPath: '#anchor' });
      const message = posted[0] as { type: string; names: string[] };
      expect(message.names).toEqual(['right']);
    });

    it('jig:fill-probe reports null formPath and no names when no form exists at all', () => {
      const dom = loadLoupe('<div>no forms here</div>');
      const posted = postMessages(dom);
      send(dom, { type: 'jig:fill-probe' });
      expect(posted[0]).toMatchObject({ type: 'jig:fill-fields', formPath: null, names: [] });
    });

    it('sets an input value through the native setter and dispatches input+change (Angular/React both listen for these)', () => {
      const dom = loadLoupe('<form><input name="customerId"></form>');
      const input = dom.window.document.querySelector('input') as HTMLInputElement;
      const seenEvents: string[] = [];
      input.addEventListener('input', () => seenEvents.push('input'));
      input.addEventListener('change', () => seenEvents.push('change'));

      const posted = postMessages(dom);
      send(dom, { type: 'jig:fill', fields: [{ name: 'customerId', value: 'cust-42' }] });

      expect(input.value).toBe('cust-42');
      expect(seenEvents).toEqual(['input', 'change']);
      expect(filledMessage(posted)).toEqual({ type: 'jig:filled', filled: ['customerId'], missing: [] });
    });

    it('fills a textarea the same way', () => {
      const dom = loadLoupe('<form><textarea name="notes"></textarea></form>');
      const textarea = dom.window.document.querySelector('textarea') as HTMLTextAreaElement;
      const posted = postMessages(dom);
      send(dom, { type: 'jig:fill', fields: [{ name: 'notes', value: 'net 30' }] });
      expect(textarea.value).toBe('net 30');
      expect(filledMessage(posted)).toEqual({ type: 'jig:filled', filled: ['notes'], missing: [] });
    });

    it('selects a <select> option by value via selectedIndex', () => {
      const dom = loadLoupe(
        '<form><select name="status"><option value="draft">Draft</option><option value="sent">Sent</option></select></form>',
      );
      const select = dom.window.document.querySelector('select') as HTMLSelectElement;
      const posted = postMessages(dom);
      send(dom, { type: 'jig:fill', fields: [{ name: 'status', value: 'sent' }] });
      expect(select.selectedIndex).toBe(1);
      expect(select.value).toBe('sent');
      expect(filledMessage(posted)).toEqual({ type: 'jig:filled', filled: ['status'], missing: [] });
    });

    it('checks a checkbox via .click() rather than setting .checked directly', () => {
      const dom = loadLoupe('<form><input type="checkbox" name="active"></form>');
      const checkbox = dom.window.document.querySelector('input') as HTMLInputElement;
      let clicked = false;
      checkbox.addEventListener('click', () => { clicked = true; });
      const posted = postMessages(dom);
      send(dom, { type: 'jig:fill', fields: [{ name: 'active', value: true }] });
      expect(checkbox.checked).toBe(true);
      expect(clicked).toBe(true);
      expect(filledMessage(posted)).toEqual({ type: 'jig:filled', filled: ['active'], missing: [] });
    });

    it('a field with no matching element is reported as missing, not thrown', () => {
      const dom = loadLoupe('<form><input name="customerId"></form>');
      const posted = postMessages(dom);
      expect(() =>
        send(dom, { type: 'jig:fill', fields: [{ name: 'doesNotExist', value: 'x' }] }),
      ).not.toThrow();
      // no element matched, so no real DOM event fires — this one IS the only message posted.
      expect(posted).toEqual([{ type: 'jig:filled', filled: [], missing: ['doesNotExist'] }]);
    });

    it('finds a field by selector when no name is given, and by DOM path as a last resort', () => {
      const dom = loadLoupe('<form><input class="only-child" id="q"></form>');
      const posted = postMessages(dom);
      send(dom, { type: 'jig:fill', fields: [{ selector: '#q', value: 'by-selector' }] });
      expect((dom.window.document.getElementById('q') as HTMLInputElement).value).toBe('by-selector');
      expect(filledMessage(posted)).toEqual({ type: 'jig:filled', filled: ['#q'], missing: [] });
    });
  });

  // --- S8: jig:click / jig:snapshot (toolpath replay + the trial-fit mirror's "before" frame) ---
  describe('jig:click (S8 — toolpath replay dispatches a real click and replies)', () => {
    function postMessages(dom: JSDOM): unknown[] {
      const posted: unknown[] = [];
      dom.window.postMessage = ((message: unknown) => posted.push(message)) as typeof dom.window.postMessage;
      return posted;
    }

    function send(dom: JSDOM, data: unknown): void {
      dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data, origin: BENCH_ORIGIN }));
    }

    it('dispatches a real click on the element at the given DOM path and replies jig:clicked {path, ok: true}', () => {
      const dom = loadLoupe('<button id="target">go</button>');
      const target = dom.window.document.getElementById('target')!;
      let clicked = false;
      target.addEventListener('click', () => {
        clicked = true;
      });
      const path = internalOf(dom).buildDomPath(target);
      const posted = postMessages(dom);

      send(dom, { type: 'jig:click', path });

      expect(clicked).toBe(true);
      expect(posted).toContainEqual({ type: 'jig:clicked', path, ok: true });
    });

    it('replies jig:clicked {ok: false} for a path that resolves to nothing, without throwing', () => {
      const dom = loadLoupe('<p>hi</p>');
      const posted = postMessages(dom);
      expect(() => send(dom, { type: 'jig:click', path: '#does-not-exist' })).not.toThrow();
      expect(posted).toContainEqual({ type: 'jig:clicked', path: '#does-not-exist', ok: false });
    });

    it('a click dispatched via jig:click still triggers Angular routerLink-style navigation (unlike a loupe-mode pick)', () => {
      const dom = loadLoupe('<a id="target" href="/invoices/1">row</a>');
      const target = dom.window.document.getElementById('target')!;
      let ownFired = false;
      target.addEventListener('click', () => {
        ownFired = true;
      });
      // hand mode (the default) — jig:click must behave like a genuine user click, never the
      // loupe-mode interception that stops an app's own handler from running.
      send(dom, { type: 'jig:click', path: '#target' });
      expect(ownFired).toBe(true);
    });
  });

  describe('jig:snapshot (S8 — the trial-fit mirror\'s "before" frame)', () => {
    function postMessages(dom: JSDOM): unknown[] {
      const posted: unknown[] = [];
      dom.window.postMessage = ((message: unknown) => posted.push(message)) as typeof dom.window.postMessage;
      return posted;
    }

    function send(dom: JSDOM, data: unknown): void {
      dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data, origin: BENCH_ORIGIN }));
    }

    it('replies jig:snapshotted with the full document HTML, scripts stripped', () => {
      const dom = loadLoupe('<p id="keep">hello</p><script>window.evil = true;</script>');
      const posted = postMessages(dom);
      send(dom, { type: 'jig:snapshot' });
      const reply = posted.find((m) => (m as { type?: string }).type === 'jig:snapshotted') as { html: string } | undefined;
      expect(reply).toBeDefined();
      expect(reply!.html).toContain('id="keep"');
      // The loupe's own injected <script data-jig-bench> tag lives in this same document —
      // proving zero <script> tags survive is a stronger assertion than just checking for
      // the one inline script this test added.
      expect(reply!.html).not.toMatch(/<script/i);
    });

    it('adds a <base href> pointing at the page\'s own URL, so relative asset/link URLs resolve when served standalone', () => {
      const dom = loadLoupe('<p>hi</p>');
      const posted = postMessages(dom);
      send(dom, { type: 'jig:snapshot' });
      const reply = posted.find((m) => (m as { type?: string }).type === 'jig:snapshotted') as { html: string };
      expect(reply.html).toContain('<base href="http://target.example/"');
    });

    it('never modifies the live document — the snapshot is a clone', () => {
      const dom = loadLoupe('<p id="keep">hello</p>');
      const before = dom.window.document.documentElement.outerHTML;
      send(dom, { type: 'jig:snapshot' });
      expect(dom.window.document.documentElement.outerHTML).toBe(before);
    });
  });

  describe('integration seam 5: one shared jig:* message table', () => {
    it('an unknown jig:* message type is ignored by BOTH message dispatchers without throwing', () => {
      const dom = loadLoupe('<p>hi</p>');
      expect(() =>
        dom.window.dispatchEvent(
          new dom.window.MessageEvent('message', { data: { type: 'jig:not-a-real-message' }, origin: BENCH_ORIGIN }),
        ),
      ).not.toThrow();
      // Silently ignored, not just non-throwing: no highlight/overlay/fill side effect fired.
      expect(dom.window.document.querySelectorAll('[data-jig-loupe-highlight]')).toHaveLength(0);
    });

    it('a message with no type at all is ignored without throwing (both dispatchers guard on typeof data.type)', () => {
      const dom = loadLoupe('<p>hi</p>');
      expect(() =>
        dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { oops: true }, origin: BENCH_ORIGIN })),
      ).not.toThrow();
      expect(() =>
        dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: null, origin: BENCH_ORIGIN })),
      ).not.toThrow();
    });

    it('the file header documents every jig:* message this script sends or receives', () => {
      const header = SOURCE.slice(0, SOURCE.indexOf('(function'));
      // Inbound (bench -> plate)
      for (const type of [
        'jig:mode',
        'jig:highlight',
        'jig:clear',
        'jig:survey',
        'jig:navigate',
        'jig:fill',
        'jig:fill-probe',
        'jig:click',
        'jig:snapshot',
      ]) {
        expect(header).toContain(type);
      }
      // Outbound (plate -> bench)
      for (const type of ['jig:pick', 'jig:event', 'jig:filled', 'jig:fill-fields', 'jig:clicked', 'jig:snapshotted']) {
        expect(header).toContain(type);
      }
    });
  });
});
