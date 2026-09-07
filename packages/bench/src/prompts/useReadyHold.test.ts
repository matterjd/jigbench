import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useReadyHold } from './useReadyHold.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Ported from concept-d-the-quiet-bench.html's Ready IIFE (:1209-1218): "irreversible = held with
// deepening" — press ~800ms (read live from --t-oath); a filling ring; release early = honestly
// cancelled, in words, with the elapsed/oath ms. Floor pass item 10 reproduced this live: a
// 300ms hold → "still a draft · 302 ms of 800"; a 950ms hold → ready.
describe('useReadyHold', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('holding through the full oath duration calls onComplete, not onCancel', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() =>
      useReadyHold({ enabled: true, onComplete, onCancel, oathMs: () => 800 }),
    );

    act(() => result.current.handlers.onPointerDown({ pointerId: 1 } as unknown as React.PointerEvent));
    expect(result.current.holding).toBe(true);
    act(() => vi.advanceTimersByTime(800));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(result.current.holding).toBe(false);
  });

  it('releasing before the oath duration cancels honestly with the elapsed and total ms — never completes', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() =>
      useReadyHold({ enabled: true, onComplete, onCancel, oathMs: () => 800, now: () => Date.now() }),
    );

    act(() => result.current.handlers.onPointerDown({ pointerId: 1 } as unknown as React.PointerEvent));
    act(() => vi.advanceTimersByTime(300));
    act(() => result.current.handlers.onPointerUp({} as unknown as React.PointerEvent));

    expect(onComplete).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    const [elapsedMs, totalMs] = onCancel.mock.calls[0] as [number, number];
    expect(elapsedMs).toBeGreaterThanOrEqual(295); // fake timers: exact to the ms
    expect(elapsedMs).toBeLessThan(800);
    expect(totalMs).toBe(800);
    expect(result.current.holding).toBe(false);

    // Advancing time further must NOT retroactively complete a cancelled hold.
    act(() => vi.advanceTimersByTime(1000));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('pointercancel and pointerleave also cancel the hold', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const { result: r1 } = renderHook(() => useReadyHold({ enabled: true, onComplete, onCancel, oathMs: () => 800 }));
    act(() => r1.current.handlers.onPointerDown({ pointerId: 1 } as unknown as React.PointerEvent));
    act(() => r1.current.handlers.onPointerCancel({} as unknown as React.PointerEvent));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does nothing when not enabled (an empty draft, or already ready)', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() => useReadyHold({ enabled: false, onComplete, onCancel, oathMs: () => 800 }));
    act(() => result.current.handlers.onPointerDown({ pointerId: 1 } as unknown as React.PointerEvent));
    expect(result.current.holding).toBe(false);
    act(() => vi.advanceTimersByTime(1000));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('space/enter keydown starts the hold; keyup cancels it, matching the concept\'s keyboard path', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() => useReadyHold({ enabled: true, onComplete, onCancel, oathMs: () => 800 }));

    act(() =>
      result.current.handlers.onKeyDown({
        key: 'Enter',
        preventDefault: () => {},
      } as unknown as React.KeyboardEvent),
    );
    expect(result.current.holding).toBe(true);
    act(() => vi.advanceTimersByTime(800));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('a second pointerdown while already holding does not restart the timer or double-fire', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() => useReadyHold({ enabled: true, onComplete, onCancel, oathMs: () => 800 }));
    act(() => result.current.handlers.onPointerDown({ pointerId: 1 } as unknown as React.PointerEvent));
    act(() => vi.advanceTimersByTime(400));
    act(() => result.current.handlers.onPointerDown({ pointerId: 2 } as unknown as React.PointerEvent)); // ignored — already holding
    act(() => vi.advanceTimersByTime(400)); // total 800ms since the FIRST down
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
