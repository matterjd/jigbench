// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { useToolpathRecorder } from './useToolpathRecorder.js';
import type { PlateEvent } from '../plate/usePlateBridge.js';

afterEach(() => cleanup());

/**
 * S8: the recorder collects `jig:event` messages (already flowing through PlateBench's new
 * `onEvent` seam) with timestamps and the DOM path, while `record()` is active — "the bench
 * collects jig:event messages from the plate with timestamps and the current path" (brief).
 */

describe('useToolpathRecorder', () => {
  it('starts idle, recording nothing', () => {
    const { result } = renderHook(() => useToolpathRecorder(null));
    expect(result.current.recording).toBe(false);
    expect(result.current.steps).toEqual([]);
  });

  it('ignores events while not recording', () => {
    let event: PlateEvent | null = { type: 'jig:event', kind: 'click', path: 'a' };
    const { result, rerender } = renderHook(({ e }) => useToolpathRecorder(e), { initialProps: { e: event } });
    rerender({ e: event });
    expect(result.current.steps).toEqual([]);
  });

  it('start() clears prior steps and begins collecting; stop() ends it', () => {
    let now = 1000;
    let event: PlateEvent | null = null;
    const { result, rerender } = renderHook(({ e }) => useToolpathRecorder(e, () => now), { initialProps: { e: event } });

    act(() => result.current.start());
    expect(result.current.recording).toBe(true);

    event = { type: 'jig:event', kind: 'click', path: 'app-invoice-list:nth-of-type(1)' };
    now = 1340;
    rerender({ e: event });
    expect(result.current.steps).toEqual([{ kind: 'click', path: 'app-invoice-list:nth-of-type(1)', at: 340 }]);

    act(() => result.current.stop());
    expect(result.current.recording).toBe(false);

    // Recording stopped — a further event is not collected.
    event = { type: 'jig:event', kind: 'click', path: 'ignored' };
    now = 5000;
    rerender({ e: event });
    expect(result.current.steps).toHaveLength(1);
  });

  it('records offsets relative to the moment start() was called, not epoch time', () => {
    let now = 50_000;
    let event: PlateEvent | null = null;
    const { result, rerender } = renderHook(({ e }) => useToolpathRecorder(e, () => now), { initialProps: { e: event } });

    act(() => result.current.start());
    now = 50_800;
    event = { type: 'jig:event', kind: 'click', path: 'a' };
    rerender({ e: event });

    expect(result.current.steps[0]?.at).toBe(800);
  });

  it('records an input event with its value', () => {
    let now = 0;
    let event: PlateEvent | null = null;
    const { result, rerender } = renderHook(({ e }) => useToolpathRecorder(e, () => now), { initialProps: { e: event } });

    act(() => result.current.start());
    now = 1800;
    event = { type: 'jig:event', kind: 'input', path: 'input:nth-of-type(1)', value: 'INV-1042' };
    rerender({ e: event });

    expect(result.current.steps).toEqual([{ kind: 'input', path: 'input:nth-of-type(1)', value: 'INV-1042', at: 1800 }]);
  });

  it('never double-counts the same event object seen again on a re-render', () => {
    let now = 0;
    const event: PlateEvent = { type: 'jig:event', kind: 'click', path: 'a' };
    const { result, rerender } = renderHook(({ e }) => useToolpathRecorder(e, () => now), { initialProps: { e: null as PlateEvent | null } });

    act(() => result.current.start());
    now = 100;
    rerender({ e: event });
    rerender({ e: event }); // same object, e.g. an unrelated parent re-render
    expect(result.current.steps).toHaveLength(1);
  });

  it('reset() clears steps without touching the recording flag', () => {
    let now = 0;
    let event: PlateEvent | null = null;
    const { result, rerender } = renderHook(({ e }) => useToolpathRecorder(e, () => now), { initialProps: { e: event } });

    act(() => result.current.start());
    event = { type: 'jig:event', kind: 'click', path: 'a' };
    rerender({ e: event });
    expect(result.current.steps).toHaveLength(1);

    act(() => result.current.reset());
    expect(result.current.steps).toEqual([]);
    expect(result.current.recording).toBe(true);
  });
});
