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
