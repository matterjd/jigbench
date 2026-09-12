// @vitest-environment jsdom
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { usePlateBridge } from './usePlateBridge.js';

afterEach(() => cleanup());

const PLATE_ORIGIN = 'http://localhost:4601';

function fireMessage(data: unknown, origin: string): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

describe('usePlateBridge', () => {
  it('starts in hand mode with no pick', () => {
    const ref = createRef<HTMLIFrameElement>();
    const { result } = renderHook(() => usePlateBridge(ref, PLATE_ORIGIN, []));
    expect(result.current.mode).toBe('hand');
    expect(result.current.lastPick).toBeNull();
    expect(result.current.events).toEqual([]);
  });

  it('records a jig:pick message from the plate origin', () => {
    const ref = createRef<HTMLIFrameElement>();
    const { result } = renderHook(() => usePlateBridge(ref, PLATE_ORIGIN, []));

    const pick = {
      type: 'jig:pick',
      path: 'app-invoice-list:nth-of-type(1)',
      tag: 'app-invoice-list',
      text: 'Invoices',
      component: 'InvoiceListComponent',
      file: 'src/app/invoices/invoice-list/invoice-list.ts',
      rect: { x: 0, y: 0, width: 10, height: 10 },
    };

    act(() => fireMessage(pick, PLATE_ORIGIN));

    expect(result.current.lastPick).toEqual(pick);
  });

  it('ignores messages from the wrong origin', () => {
    const ref = createRef<HTMLIFrameElement>();
    const { result } = renderHook(() => usePlateBridge(ref, PLATE_ORIGIN, []));

    act(() =>
      fireMessage(
        { type: 'jig:pick', path: 'x', tag: 'div', text: '', rect: { x: 0, y: 0, width: 0, height: 0 } },
        'http://evil.example',
      ),
    );

    expect(result.current.lastPick).toBeNull();
  });

  it('appends jig:event messages, capped at the last 200', () => {
    const ref = createRef<HTMLIFrameElement>();
    const { result } = renderHook(() => usePlateBridge(ref, PLATE_ORIGIN, []));

    act(() => fireMessage({ type: 'jig:event', kind: 'click', path: 'a' }, PLATE_ORIGIN));
    act(() => fireMessage({ type: 'jig:event', kind: 'input', path: 'b', value: 'x' }, PLATE_ORIGIN));

    expect(result.current.events).toHaveLength(2);
    expect(result.current.events[0]).toMatchObject({ kind: 'click', path: 'a' });
    expect(result.current.events[1]).toMatchObject({ kind: 'input', path: 'b', value: 'x' });
  });

  it('setMode posts jig:mode to the iframe and updates local mode', () => {
    const ref = createRef<HTMLIFrameElement>();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    (ref as { current: HTMLIFrameElement }).current = iframe;

    const posted: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: (msg: unknown) => posted.push(msg) },
    });

    const { result } = renderHook(() => usePlateBridge(ref, PLATE_ORIGIN, []));

    act(() => result.current.setMode('loupe'));

    expect(result.current.mode).toBe('loupe');
    expect(posted).toContainEqual({ type: 'jig:mode', mode: 'loupe' });

    document.body.removeChild(iframe);
  });

  // Wave-4 fix (TEST-RUN.md's first live test, defect 2): "Loupe grid and selection still
  // shows when switching to hand, does not disengage." `jig:mode hand` used to only tell the
  // PLATE to clear its hover outline — it never cleared `lastPick`, so the bench's own guide
  // lines/grid readout (PlateGuides, driven by `lastPick.rect`) and the Loupe tab's readout
  // kept showing the old pick forever. Switching to hand must now also post `jig:clear` (so
  // any painted highlight boxes on the plate go away too) and clear the bench's own selection.
  it('setMode("hand") clears the bench\'s lastPick and posts jig:clear, on top of jig:mode', () => {
    const ref = createRef<HTMLIFrameElement>();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    (ref as { current: HTMLIFrameElement }).current = iframe;

    const posted: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: (msg: unknown) => posted.push(msg) },
    });

    const { result } = renderHook(() => usePlateBridge(ref, PLATE_ORIGIN, []));

    const pick = {
      type: 'jig:pick',
      path: 'app-invoice-list:nth-of-type(1)',
      tag: 'app-invoice-list',
      text: 'Invoices',
      rect: { x: 0, y: 0, width: 10, height: 10 },
    };
    act(() => fireMessage(pick, PLATE_ORIGIN));
    expect(result.current.lastPick).toEqual(pick);

    act(() => result.current.setMode('loupe'));
    posted.length = 0; // only care about what setMode('hand') itself posts, below

    act(() => result.current.setMode('hand'));

    expect(result.current.lastPick).toBeNull();
    expect(posted).toContainEqual({ type: 'jig:mode', mode: 'hand' });
    expect(posted).toContainEqual({ type: 'jig:clear' });

    document.body.removeChild(iframe);
  });

  // Switching TO loupe (or staying in loupe) must never clear an existing pick — only the
  // hand-mode disengage does. A hover-driven re-pick while still in loupe mode is normal.
  it('setMode("loupe") does not clear lastPick or post jig:clear', () => {
    const ref = createRef<HTMLIFrameElement>();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    (ref as { current: HTMLIFrameElement }).current = iframe;

    const posted: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: (msg: unknown) => posted.push(msg) },
    });

    const { result } = renderHook(() => usePlateBridge(ref, PLATE_ORIGIN, []));
    const pick = { type: 'jig:pick', path: 'a', tag: 'div', text: '', rect: { x: 0, y: 0, width: 0, height: 0 } };
    act(() => fireMessage(pick, PLATE_ORIGIN));

    act(() => result.current.setMode('loupe'));

    expect(result.current.lastPick).toEqual(pick);
    expect(posted).not.toContainEqual({ type: 'jig:clear' });

    document.body.removeChild(iframe);
  });

  it('posts jig:survey to the iframe when selectors are provided', () => {
    const ref = createRef<HTMLIFrameElement>();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    (ref as { current: HTMLIFrameElement }).current = iframe;

    const posted: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: (msg: unknown) => posted.push(msg) },
    });

    const selectors = [{ selector: 'app-invoice-list', name: 'InvoiceListComponent', file: 'x.ts' }];
    renderHook(() => usePlateBridge(ref, PLATE_ORIGIN, selectors));

    expect(posted).toContainEqual({ type: 'jig:survey', selectors });

    document.body.removeChild(iframe);
  });

  it('highlight posts jig:highlight with selectors to the iframe', () => {
    const ref = createRef<HTMLIFrameElement>();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    (ref as { current: HTMLIFrameElement }).current = iframe;

    const posted: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: (msg: unknown) => posted.push(msg) },
    });

    const { result } = renderHook(() => usePlateBridge(ref, PLATE_ORIGIN, []));
    act(() => result.current.highlight(['app-invoice-list', '.lg-btn']));

    expect(posted).toContainEqual({ type: 'jig:highlight', selectors: ['app-invoice-list', '.lg-btn'] });

    document.body.removeChild(iframe);
  });

  it('clearHighlight posts jig:clear to the iframe', () => {
    const ref = createRef<HTMLIFrameElement>();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    (ref as { current: HTMLIFrameElement }).current = iframe;

    const posted: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: (msg: unknown) => posted.push(msg) },
    });

    const { result } = renderHook(() => usePlateBridge(ref, PLATE_ORIGIN, []));
    act(() => result.current.clearHighlight());

    expect(posted).toContainEqual({ type: 'jig:clear' });

    document.body.removeChild(iframe);
  });

  it('navigate posts jig:navigate with the path to the iframe', () => {
    const ref = createRef<HTMLIFrameElement>();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    (ref as { current: HTMLIFrameElement }).current = iframe;

    const posted: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: (msg: unknown) => posted.push(msg) },
    });

    const { result } = renderHook(() => usePlateBridge(ref, PLATE_ORIGIN, []));
    act(() => result.current.navigate('/invoices'));

    expect(posted).toContainEqual({ type: 'jig:navigate', path: '/invoices' });

    document.body.removeChild(iframe);
  });

  it('highlight/clearHighlight/navigate never post when the plate origin is not yet known', () => {
    const ref = createRef<HTMLIFrameElement>();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    (ref as { current: HTMLIFrameElement }).current = iframe;

    const posted: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: (msg: unknown) => posted.push(msg) },
    });

    const { result } = renderHook(() => usePlateBridge(ref, null, []));
    act(() => {
      result.current.highlight(['a']);
      result.current.clearHighlight();
      result.current.navigate('/x');
    });

    expect(posted).toEqual([]);

    document.body.removeChild(iframe);
  });

  // S8 — the toolpath replayer needs to post jig:click/jig:fill/jig:navigate/jig:highlight
  // directly rather than growing a bespoke bridge method per message shape.
  it('post() posts an arbitrary jig:* message to the iframe verbatim', () => {
    const ref = createRef<HTMLIFrameElement>();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    (ref as { current: HTMLIFrameElement }).current = iframe;

    const posted: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: (msg: unknown) => posted.push(msg) },
    });

    const { result } = renderHook(() => usePlateBridge(ref, PLATE_ORIGIN, []));
    act(() => result.current.post({ type: 'jig:click', path: '#target' }));

    expect(posted).toContainEqual({ type: 'jig:click', path: '#target' });

    document.body.removeChild(iframe);
  });

  it('post() never posts when the plate origin is not yet known', () => {
    const ref = createRef<HTMLIFrameElement>();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    (ref as { current: HTMLIFrameElement }).current = iframe;

    const posted: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: (msg: unknown) => posted.push(msg) },
    });

    const { result } = renderHook(() => usePlateBridge(ref, null, []));
    act(() => result.current.post({ type: 'jig:click', path: '#target' }));

    expect(posted).toEqual([]);

    document.body.removeChild(iframe);
  });

  it('never posts when the plate origin is not yet known', () => {
    const ref = createRef<HTMLIFrameElement>();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    (ref as { current: HTMLIFrameElement }).current = iframe;

    const posted: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: (msg: unknown) => posted.push(msg) },
    });

    const { result } = renderHook(() => usePlateBridge(ref, null, []));
    act(() => result.current.setMode('loupe'));

    expect(posted).toEqual([]);

    document.body.removeChild(iframe);
  });
});

// #19 (the 0.2.0 review): on a runtime clamp the survey arrives before the plate iframe has
// loaded — the one `jig:survey` post went to a frame that was not there yet and was lost, so
// the loupe never had the selector table and every pick came back with no file (the prompt's
// Context read "nothing surveyed yet" although the survey found 7 components). The bench must
// post the survey again when the iframe loads, and answer the loupe's own `jig:ready`.
describe('the survey reaches a plate that loads after it arrived (#19)', () => {
  const SELECTORS = [{ selector: 'app-invoice-list', name: 'InvoiceListComponent', file: 'src/app/invoices/invoice-list.ts' }];

  function iframeWithCapture(): { ref: { current: HTMLIFrameElement }; posted: unknown[]; iframe: HTMLIFrameElement } {
    const ref = createRef<HTMLIFrameElement>() as { current: HTMLIFrameElement };
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    ref.current = iframe;
    const posted: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: (msg: unknown) => posted.push(msg) } });
    return { ref, posted, iframe };
  }

  it("re-posts jig:survey on the iframe's load event — the plate that loads after the survey still gets it", () => {
    const { ref, posted, iframe } = iframeWithCapture();
    renderHook(() => usePlateBridge(ref, PLATE_ORIGIN, SELECTORS));
    posted.length = 0; // the eager post, which a not-yet-loaded frame drops — not what this proves

    act(() => {
      iframe.dispatchEvent(new Event('load'));
    });

    expect(posted).toContainEqual({ type: 'jig:survey', selectors: SELECTORS });
    document.body.removeChild(iframe);
  });

  it('answers the loupe\'s jig:ready (from the plate origin only) with jig:survey', () => {
    const { ref, posted, iframe } = iframeWithCapture();
    renderHook(() => usePlateBridge(ref, PLATE_ORIGIN, SELECTORS));
    posted.length = 0;

    act(() => fireMessage({ type: 'jig:ready' }, 'http://evil.example'));
    expect(posted).toEqual([]);

    act(() => fireMessage({ type: 'jig:ready' }, PLATE_ORIGIN));
    expect(posted).toContainEqual({ type: 'jig:survey', selectors: SELECTORS });
    document.body.removeChild(iframe);
  });

  // #37 (S20, the test gaps): every case above renders ONCE, so the line that keeps the ref
  // current — `selectorsRef.current = selectors`, on every render — was unpinned: the ref is
  // seeded at the first render, and a hook that never re-rendered would pass all three tests with
  // the assignment deleted. Which is the whole shape of #19: the survey arrives while the plate is
  // still coming up, i.e. in a LATER render than the one the ref was created in.
  it('#37: a re-render with a new selector table is what gets posted, not the table the ref was created with', () => {
    const { ref, posted, iframe } = iframeWithCapture();
    const SECOND = [
      { selector: 'app-invoice-detail', name: 'InvoiceDetailComponent', file: 'src/app/invoices/invoice-detail.ts' },
      { selector: 'app-invoice-list', name: 'InvoiceListComponent', file: 'src/app/invoices/invoice-list.ts' },
    ];

    const { rerender } = renderHook(({ selectors }) => usePlateBridge(ref, PLATE_ORIGIN, selectors), {
      initialProps: { selectors: SELECTORS },
    });

    rerender({ selectors: SECOND });
    // The eager post on change carries the new table …
    expect(posted).toContainEqual({ type: 'jig:survey', selectors: SECOND });

    // … and so does the answer to a loupe that boots afterwards, which is the case #19 is about:
    // that post reads the table through the ref, not through the closure it was created in.
    posted.length = 0;
    act(() => fireMessage({ type: 'jig:ready' }, PLATE_ORIGIN));
    expect(posted).toEqual([{ type: 'jig:survey', selectors: SECOND }]);
    expect(posted).not.toContainEqual({ type: 'jig:survey', selectors: SELECTORS });

    // And the iframe's own load event, the third way the table is sent.
    posted.length = 0;
    act(() => {
      iframe.dispatchEvent(new Event('load'));
    });
    expect(posted).toEqual([{ type: 'jig:survey', selectors: SECOND }]);

    document.body.removeChild(iframe);
  });

  it('posts nothing on load or ready while there is no survey to send', () => {
    const { ref, posted, iframe } = iframeWithCapture();
    renderHook(() => usePlateBridge(ref, PLATE_ORIGIN, []));
    act(() => {
      iframe.dispatchEvent(new Event('load'));
    });
    act(() => fireMessage({ type: 'jig:ready' }, PLATE_ORIGIN));
    expect(posted).toEqual([]);
    document.body.removeChild(iframe);
  });
});
