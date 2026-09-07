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

// Shared across the React fiber-walking and Vue describe blocks below (S16 "priority order"
// cross-checks reuse this same named function component).
function ReactFn(): void {
  /* a plain function component */
}
ReactFn.displayName = 'InvoiceRow';

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

  // S16 (AMENDMENT-1 §6/A5, generic runtime component naming): React 19 dropped Fiber's
  // _debugSource, but the DOM node -> fiber bridge itself (a `__reactFiber$<key>` own
  // property React assigns on every host DOM node it manages) is unchanged, and each fiber
  // still carries `.type` (the component function/class, or a plain string for a host tag
  // like 'div') and `.return` (the parent fiber) — so walking `.return` until a
  // non-host `.type` with a name still works without ever touching _debugSource. These tests
  // hand-build a minimal fiber chain (jsdom has no real React runtime) to prove the resolver
  // reads exactly that shape.
  describe('describeElement — React fiber walking (S16)', () => {
    it('resolves the nearest named function-component ancestor by walking fiber.return, skipping host tags', () => {
      const dom = loadLoupe('<div id="host"><span id="inner">hi</span></div>');
      const inner = dom.window.document.getElementById('inner')!;
      const rootFiber = { type: ReactFn, return: null };
      const hostFiber = { type: 'div', return: rootFiber };
      const leafFiber = { type: 'span', return: hostFiber };
      (inner as unknown as Record<string, unknown>)['__reactFiber$abc123'] = leafFiber;

      const described = internalOf(dom).describeElement(inner);
      expect(described.component).toBe('InvoiceRow');
      expect((described as { framework?: string }).framework).toBe('react');
    });

    it('uses fiber.type.name when no displayName is set', () => {
      function PlainNamed() {
        /* no displayName */
      }
      const dom = loadLoupe('<div id="inner">hi</div>');
      const inner = dom.window.document.getElementById('inner')!;
      (inner as unknown as Record<string, unknown>)['__reactFiber$xyz'] = {
        type: PlainNamed,
        return: null,
      };

      const described = internalOf(dom).describeElement(inner);
      expect(described.component).toBe('PlainNamed');
      expect((described as { framework?: string }).framework).toBe('react');
    });

    it('Angular dev-mode globals still win over a React fiber when both are somehow present (priority order)', () => {
      const dom = loadLoupe('<div id="inner">hi</div>');
      const inner = dom.window.document.getElementById('inner')!;
      (inner as unknown as Record<string, unknown>)['__reactFiber$abc'] = { type: ReactFn, return: null };
      (dom.window as unknown as { ng: unknown }).ng = {
        getComponent: () => ({ constructor: { name: 'WinningAngular' } }),
      };

      const described = internalOf(dom).describeElement(inner);
      expect(described.component).toBe('WinningAngular');
      expect((described as { framework?: string }).framework).toBe('angular');
    });

    it('falls back to the survey name (framework null) when no fiber key and no named ancestor exist', () => {
      const dom = loadLoupe('<app-invoice-list id="host"><span id="inner">hi</span></app-invoice-list>');
      internalOf(dom).setSurveySelectors([
        { selector: 'app-invoice-list', name: 'SurveyOnly', file: 'survey/file.ts' },
      ]);
      const described = internalOf(dom).describeElement(dom.window.document.getElementById('inner')!);
      expect(described.component).toBe('SurveyOnly');
      expect((described as { framework?: string }).framework).toBeNull();
    });
  });

  // S16: Vue 3 attaches `__vueParentComponent` directly to a DOM node in development.
  describe('describeElement — Vue (S16)', () => {
    it('resolves the component name from __vueParentComponent.type.name', () => {
      const dom = loadLoupe('<div id="inner">hi</div>');
      const inner = dom.window.document.getElementById('inner')!;
      (inner as unknown as Record<string, unknown>).__vueParentComponent = {
        type: { name: 'InvoiceCard' },
      };

      const described = internalOf(dom).describeElement(inner);
      expect(described.component).toBe('InvoiceCard');
      expect((described as { framework?: string }).framework).toBe('vue');
    });

    it('falls back to __name when .name is absent (an unnamed <script setup> SFC)', () => {
      const dom = loadLoupe('<div id="inner">hi</div>');
      const inner = dom.window.document.getElementById('inner')!;
      (inner as unknown as Record<string, unknown>).__vueParentComponent = {
        type: { __name: 'InvoiceCard' },
      };

      const described = internalOf(dom).describeElement(inner);
      expect(described.component).toBe('InvoiceCard');
      expect((described as { framework?: string }).framework).toBe('vue');
    });

    it('React fiber wins over Vue when both are somehow present (priority order)', () => {
      const dom = loadLoupe('<div id="inner">hi</div>');
      const inner = dom.window.document.getElementById('inner')!;
      (inner as unknown as Record<string, unknown>)['__reactFiber$abc'] = { type: ReactFn, return: null };
      (inner as unknown as Record<string, unknown>).__vueParentComponent = { type: { name: 'LosingVue' } };

      const described = internalOf(dom).describeElement(inner);
      expect(described.component).toBe('InvoiceRow');
      expect((described as { framework?: string }).framework).toBe('react');
    });
  });

  it('jig:pick carries the resolved framework alongside component/file', () => {
    const dom = loadLoupe('<div id="target">hi</div>');
    const target = dom.window.document.getElementById('target')!;
    (target as unknown as Record<string, unknown>).__vueParentComponent = { type: { name: 'Widget' } };
    internalOf(dom).setMode('loupe');

    const posted: unknown[] = [];
    dom.window.postMessage = ((message: unknown) => posted.push(message)) as typeof dom.window.postMessage;
    target.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ type: 'jig:pick', component: 'Widget', framework: 'vue' });
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

    // Matter's retest-18, live-driving the fix: Ledger's real "New invoice" form has two
    // `<input type="date">` fields (Issued/Due). The fixture's `Invoice`/`InvoiceFormValue`
    // schema types `issuedOn`/`dueOn` as plain TS `string` (no `Date` type, no date format
    // annotation) — jsf/faker have no date-shape hint to go on for those, so the generated
    // value is an ARBITRARY string, not `YYYY-MM-DD`. A browser's native `<input type="date">`
    // value setter SILENTLY REJECTS a malformed date string (the DOM leaves `.value` at `""`)
    // — before this fix, `setFieldValue` returned `true` unconditionally the moment it called
    // the setter and dispatched events, so the loupe reported these fields "filled" while the
    // form visibly never changed. This is exactly the brief's "verify Angular's FormControl
    // actually updates" instruction: read the value back, and report a rejected value as
    // missing rather than a false "filled".
    it('a value the input silently rejects (e.g. a non-date string on type="date") is reported as MISSING, not filled', () => {
      const dom = loadLoupe('<form><input type="date" name="issuedOn"></form>');
      const input = dom.window.document.querySelector('input') as HTMLInputElement;
      const posted = postMessages(dom);
      send(dom, { type: 'jig:fill', fields: [{ name: 'issuedOn', value: 'not-a-date' }] });

      expect(input.value).toBe(''); // jsdom mirrors real browsers: an invalid date string never applies
      expect(filledMessage(posted)).toEqual({ type: 'jig:filled', filled: [], missing: ['issuedOn'] });
    });

    it('a well-formed YYYY-MM-DD value on type="date" is reported as filled', () => {
      const dom = loadLoupe('<form><input type="date" name="issuedOn"></form>');
      const input = dom.window.document.querySelector('input') as HTMLInputElement;
      const posted = postMessages(dom);
      send(dom, { type: 'jig:fill', fields: [{ name: 'issuedOn', value: '2026-09-01' }] });

      expect(input.value).toBe('2026-09-01');
      expect(filledMessage(posted)).toEqual({ type: 'jig:filled', filled: ['issuedOn'], missing: [] });
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

    // Matter's retest-18: Ledger's real Angular "New invoice" form (reactive forms,
    // `[formGroup]` + `formControlName="..."`, never `[name]`) has ZERO `[name]` attributes at
    // all — `formControlName="customerId"` renders as the DOM attribute `formcontrolname`
    // (HTML lowercases attribute names). Before this fix, `fieldNamesOf`/`findFieldElement`
    // only ever looked at `[name]`, so the probe always reported an empty field list on a real
    // Angular reactive form — "fill the form" had nothing to fill, silently.
    describe('Angular reactive forms — formcontrolname (no [name] attribute at all)', () => {
      const REACTIVE_FORM =
        '<form>' +
        '<select formcontrolname="customerId"><option value="">pick</option></select>' +
        '<input type="date" formcontrolname="issuedOn">' +
        '<textarea formcontrolname="notes"></textarea>' +
        '</form>';

      it('jig:fill-probe reports formcontrolname fields when there is no [name] at all', () => {
        const dom = loadLoupe(REACTIVE_FORM);
        const posted = postMessages(dom);
        send(dom, { type: 'jig:fill-probe' });
        const message = posted[0] as { type: string; names: string[] };
        expect(message.names.sort()).toEqual(['customerId', 'issuedOn', 'notes']);
      });

      it('jig:fill fills a [formcontrolname] input by matching field.name against it', () => {
        const dom = loadLoupe(REACTIVE_FORM);
        const input = dom.window.document.querySelector('[formcontrolname="issuedOn"]') as HTMLInputElement;
        const seenEvents: string[] = [];
        input.addEventListener('input', () => seenEvents.push('input'));
        input.addEventListener('change', () => seenEvents.push('change'));

        const posted = postMessages(dom);
        send(dom, { type: 'jig:fill', fields: [{ name: 'issuedOn', value: '2026-09-01' }] });

        expect(input.value).toBe('2026-09-01');
        expect(seenEvents).toEqual(['input', 'change']);
        expect(filledMessage(posted)).toEqual({ type: 'jig:filled', filled: ['issuedOn'], missing: [] });
      });

      it('jig:fill fills a [formcontrolname] textarea by matching field.name against it', () => {
        const dom = loadLoupe(REACTIVE_FORM);
        const textarea = dom.window.document.querySelector('[formcontrolname="notes"]') as HTMLTextAreaElement;
        const posted = postMessages(dom);
        send(dom, { type: 'jig:fill', fields: [{ name: 'notes', value: 'net 30' }] });
        expect(textarea.value).toBe('net 30');
        expect(filledMessage(posted)).toEqual({ type: 'jig:filled', filled: ['notes'], missing: [] });
      });

      it('a plain [name] still wins first when both [name] and [formcontrolname] happen to exist', () => {
        const dom = loadLoupe('<form><input name="dueOn" formcontrolname="differentControl"></form>');
        const input = dom.window.document.querySelector('input') as HTMLInputElement;
        const posted = postMessages(dom);
        send(dom, { type: 'jig:fill', fields: [{ name: 'dueOn', value: '2026-09-30' }] });
        expect(input.value).toBe('2026-09-30');
        expect(filledMessage(posted)).toEqual({ type: 'jig:filled', filled: ['dueOn'], missing: [] });
      });
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

    // Wave-4 council finding 4 (MEDIUM): stripping <script> alone leaves on*= handler
    // attributes, javascript:/data:text/html URLs, <iframe>/<object>/<embed>, and a
    // <meta http-equiv="refresh"> redirect all live in the standalone snapshot HTML — every
    // one of those still executes attacker-controlled behaviour once served from
    // GET /api/plate/snapshot/:id, with no <script> tag involved at all.
    describe('sanitization beyond <script> (wave-4 council finding 4)', () => {
      it('strips on*= handler attributes from every element', () => {
        const dom = loadLoupe('<button id="keep" onclick="evil()" data-onx="fine">go</button>');
        const posted = postMessages(dom);
        send(dom, { type: 'jig:snapshot' });
        const reply = posted.find((m) => (m as { type?: string }).type === 'jig:snapshotted') as { html: string };
        expect(reply.html).toContain('id="keep"');
        expect(reply.html).not.toMatch(/\bonclick\s*=/i);
        // a custom data-* attribute that merely CONTAINS "on" must survive untouched.
        expect(reply.html).toContain('data-onx="fine"');
      });

      it('neutralizes javascript: URLs in href/src/action', () => {
        const dom = loadLoupe('<a id="keep" href="javascript:alert(1)">click</a><form action="JAVASCRIPT:evil()"></form>');
        const posted = postMessages(dom);
        send(dom, { type: 'jig:snapshot' });
        const reply = posted.find((m) => (m as { type?: string }).type === 'jig:snapshotted') as { html: string };
        expect(reply.html).not.toMatch(/javascript:/i);
        expect(reply.html).toContain('id="keep"');
      });

      it('neutralizes data:text/html URLs', () => {
        const dom = loadLoupe('<a id="keep" href="data:text/html,<script>evil()</script>">click</a>');
        const posted = postMessages(dom);
        send(dom, { type: 'jig:snapshot' });
        const reply = posted.find((m) => (m as { type?: string }).type === 'jig:snapshotted') as { html: string };
        expect(reply.html).not.toMatch(/data:text\/html/i);
      });

      it('removes <iframe>, <object>, and <embed> elements entirely', () => {
        const dom = loadLoupe(
          '<p id="keep">hi</p><iframe id="bad-frame" src="https://evil.example"></iframe><object id="bad-object" data="evil.swf"></object><embed id="bad-embed" src="evil.swf">',
        );
        const posted = postMessages(dom);
        send(dom, { type: 'jig:snapshot' });
        const reply = posted.find((m) => (m as { type?: string }).type === 'jig:snapshotted') as { html: string };
        expect(reply.html).toContain('id="keep"');
        expect(reply.html).not.toMatch(/<iframe/i);
        expect(reply.html).not.toMatch(/<object/i);
        expect(reply.html).not.toMatch(/<embed/i);
      });

      it('removes a <meta http-equiv="refresh"> redirect', () => {
        const dom = loadLoupe('<p id="keep">hi</p>', (d) => {
          const meta = d.window.document.createElement('meta');
          meta.setAttribute('http-equiv', 'refresh');
          meta.setAttribute('content', '0;url=https://evil.example');
          d.window.document.head.appendChild(meta);
        });
        const posted = postMessages(dom);
        send(dom, { type: 'jig:snapshot' });
        const reply = posted.find((m) => (m as { type?: string }).type === 'jig:snapshotted') as { html: string };
        expect(reply.html).toContain('id="keep"');
        expect(reply.html).not.toMatch(/http-equiv/i);
      });
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

    it('a message with no type at all is ignored without throwing (every dispatcher guards on typeof data.type)', () => {
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

  // Finding 1 (wave-3 council, security blocker): every message dispatcher above (S7's fill
  // block and S8's click/snapshot block included) must ignore any `jig:*` message whose
  // event.origin isn't the bench origin the script was configured with (data-jig-bench) — a
  // foreign iframe embedding the same target could otherwise drive navigation, fill arbitrary
  // form fields, dispatch clicks, or exfiltrate a page snapshot.
  describe('bench-origin enforcement (finding 1)', () => {
    const FOREIGN_ORIGIN = 'http://evil.example';

    function sendFrom(dom: JSDOM, origin: string, data: unknown): void {
      dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data, origin }));
    }

    it('ignores jig:fill from a non-bench origin — the field is left untouched', () => {
      const dom = loadLoupe('<form><input name="customerId"></form>');
      const input = dom.window.document.querySelector('input') as HTMLInputElement;
      sendFrom(dom, FOREIGN_ORIGIN, { type: 'jig:fill', fields: [{ name: 'customerId', value: 'evil-value' }] });
      expect(input.value).toBe('');
    });

    it('fills the field when the SAME message comes from the bench origin (control)', () => {
      const dom = loadLoupe('<form><input name="customerId"></form>');
      const input = dom.window.document.querySelector('input') as HTMLInputElement;
      sendFrom(dom, BENCH_ORIGIN, { type: 'jig:fill', fields: [{ name: 'customerId', value: 'good-value' }] });
      expect(input.value).toBe('good-value');
    });

    it('ignores jig:fill-probe from a non-bench origin — no reply is posted', () => {
      const dom = loadLoupe('<form><input name="customerId"></form>');
      const posted: unknown[] = [];
      dom.window.postMessage = ((message: unknown) => posted.push(message)) as typeof dom.window.postMessage;
      sendFrom(dom, FOREIGN_ORIGIN, { type: 'jig:fill-probe' });
      expect(posted).toHaveLength(0);
    });

    // jsdom never actually mutates location.pathname on navigation (per the comment above,
    // "Not implemented: navigation to another Document" — a jsdom limitation, not a loupe
    // bug), so pathname is not a usable signal either way. jsdom instead reports the attempt
    // through its virtualConsole as a jsdomError — that IS a reliable "did navigateSameOrigin
    // actually call location.assign" signal, and is what these two tests key off.
    it('ignores jig:navigate from a non-bench origin — navigateSameOrigin is never reached', () => {
      const dom = loadLoupe('<p>hi</p>');
      let navigationAttempts = 0;
      dom.virtualConsole.on('jsdomError', (e: Error) => {
        if (/navigation/i.test(e.message)) navigationAttempts++;
      });
      sendFrom(dom, FOREIGN_ORIGIN, { type: 'jig:navigate', path: '/invoices' });
      expect(navigationAttempts).toBe(0);
    });

    it('attempts navigation for the SAME jig:navigate message from the bench origin (control)', () => {
      const dom = loadLoupe('<p>hi</p>');
      let navigationAttempts = 0;
      dom.virtualConsole.on('jsdomError', (e: Error) => {
        if (/navigation/i.test(e.message)) navigationAttempts++;
      });
      sendFrom(dom, BENCH_ORIGIN, { type: 'jig:navigate', path: '/invoices' });
      expect(navigationAttempts).toBe(1);
    });

    it('ignores jig:highlight from a non-bench origin — no highlight box is drawn', () => {
      const dom = loadLoupe('<div id="target">x</div>');
      sendFrom(dom, FOREIGN_ORIGIN, { type: 'jig:highlight', paths: ['#target'] });
      expect(dom.window.document.querySelectorAll('[data-jig-loupe-highlight]')).toHaveLength(0);
    });

    it('ignores jig:mode from a non-bench origin — mode stays hand', () => {
      const dom = loadLoupe('<p>hi</p>');
      sendFrom(dom, FOREIGN_ORIGIN, { type: 'jig:mode', mode: 'loupe' });
      expect(internalOf(dom).getMode()).toBe('hand');
    });

    it('logs a foreign-origin rejection once at debug level, not per message', () => {
      const calls: unknown[][] = [];
      const dom = loadLoupe('<p>hi</p>', (d) => {
        d.window.console.debug = (...args: unknown[]) => calls.push(args);
      });
      sendFrom(dom, FOREIGN_ORIGIN, { type: 'jig:mode', mode: 'loupe' });
      sendFrom(dom, FOREIGN_ORIGIN, { type: 'jig:navigate', path: '/x' });
      sendFrom(dom, FOREIGN_ORIGIN, { type: 'jig:fill', fields: [] });
      // one "ready" line already logs at load; foreign-origin rejection should add exactly one more.
      expect(calls).toHaveLength(2);
    });

    // S8 (merge/s8 wave-3): jig:click/jig:snapshot are a third, separate dispatcher — the
    // origin gate must cover it too, not just the two dispatchers finding 1 originally named.
    it('ignores jig:click from a non-bench origin — the element is never clicked', () => {
      const dom = loadLoupe('<button id="target">go</button>');
      const target = dom.window.document.getElementById('target')!;
      let clicked = false;
      target.addEventListener('click', () => {
        clicked = true;
      });
      sendFrom(dom, FOREIGN_ORIGIN, { type: 'jig:click', path: '#target' });
      expect(clicked).toBe(false);
    });

    it('dispatches the SAME jig:click message from the bench origin (control)', () => {
      const dom = loadLoupe('<button id="target">go</button>');
      const target = dom.window.document.getElementById('target')!;
      let clicked = false;
      target.addEventListener('click', () => {
        clicked = true;
      });
      sendFrom(dom, BENCH_ORIGIN, { type: 'jig:click', path: '#target' });
      expect(clicked).toBe(true);
    });

    it('ignores jig:snapshot from a non-bench origin — no jig:snapshotted reply is posted', () => {
      const dom = loadLoupe('<p>hi</p>');
      const posted: unknown[] = [];
      dom.window.postMessage = ((message: unknown) => posted.push(message)) as typeof dom.window.postMessage;
      sendFrom(dom, FOREIGN_ORIGIN, { type: 'jig:snapshot' });
      expect(posted).toHaveLength(0);
    });
  });
});
