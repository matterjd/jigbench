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

/**
 * Retest 0.2.0 defect #58 — "holding Ready does not make the draft ready", stopped at
 * `docs/TEST-RUN.md` step 15.
 *
 * The root cause is a FROZEN CALLBACK, not a pointer. Every test above hands the hook one
 * `vi.fn()` whose identity never changes, so none of them can see it: `start` was
 * `useCallback(..., [enabled])`, so the `onComplete` its 800 ms timer would call was captured at
 * the render where `enabled` last changed value. In the real card that render is the FIRST
 * KEYSTROKE — `App.tsx:208` lights the card at `'draft'` from the words alone, deliberately,
 * while `prompts.create()` is still in flight — so the captured callback is
 * `onReadyComplete={() => matchedPrompt && void prompts.ready(matchedPrompt.id)}`
 * (`App.tsx:316`) with `matchedPrompt === null`. The create resolves a moment later, `enabled`
 * never changes again, `useCallback` never recomputes, and the frozen no-op is what fires: the
 * ring fills, 800 ms pass, and NOTHING is sent. No POST, no cancel message, still a draft —
 * which is every symptom on the issue, including why scrap still worked (a different path) and
 * why no "let go early" message appeared (the hold completed; it did not cancel).
 *
 * The hold is still a real timer a human can interrupt (floor item 10, "irreversible = held with
 * deepening") — these tests pin that as hard as they pin the fix.
 */
describe('useReadyHold — retest #58: the hold acts on the card as it is NOW', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  interface HoldProps {
    enabled: boolean;
    onComplete: () => void;
    onCancel: (elapsedMs: number, oathMs: number) => void;
  }

  function renderHold(initialProps: HoldProps) {
    return renderHook((props: HoldProps) => useReadyHold({ ...props, oathMs: () => 800 }), { initialProps });
  }

  /** A button stub with the pointer-capture surface a real one has; jsdom implements none of it. */
  function fakeButton() {
    const captured = new Set<number>();
    const child = { tag: 'span-inside-the-button' };
    return {
      captured,
      child,
      setPointerCapture: vi.fn((id: number) => captured.add(id)),
      releasePointerCapture: vi.fn((id: number) => captured.delete(id)),
      contains: vi.fn((other: unknown) => other === child),
    };
  }

  it('a completed hold calls the callback the card has NOW, not the one captured when Ready first lit', () => {
    const whenReadyFirstLit = vi.fn(); // App's `matchedPrompt === null` closure — a silent no-op
    const onceTheCreateResolved = vi.fn(); // the same closure, now holding a real prompt id
    const onCancel = vi.fn();

    const { result, rerender } = renderHold({ enabled: false, onComplete: whenReadyFirstLit, onCancel });
    rerender({ enabled: true, onComplete: whenReadyFirstLit, onCancel }); // the keystroke lights Ready
    rerender({ enabled: true, onComplete: onceTheCreateResolved, onCancel }); // POST /api/prompts answers

    act(() => result.current.handlers.onPointerDown({ pointerId: 1 } as never));
    act(() => vi.advanceTimersByTime(800));

    expect(onceTheCreateResolved).toHaveBeenCalledTimes(1);
    expect(whenReadyFirstLit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('a callback that changes DURING the hold is the one that fires — a create can answer mid-press', () => {
    const stale = vi.fn();
    const live = vi.fn();
    const onCancel = vi.fn();
    const { result, rerender } = renderHold({ enabled: true, onComplete: stale, onCancel });

    act(() => result.current.handlers.onPointerDown({ pointerId: 1 } as never));
    act(() => vi.advanceTimersByTime(400));
    rerender({ enabled: true, onComplete: live, onCancel }); // the card re-rendered mid-hold
    act(() => vi.advanceTimersByTime(400));

    expect(live).toHaveBeenCalledTimes(1);
    expect(stale).not.toHaveBeenCalled();
  });

  it('a cancelled hold reports through the card as it is now too — `cancel` was frozen at the FIRST render', () => {
    const onComplete = vi.fn();
    const stale = vi.fn();
    const live = vi.fn();
    const { result, rerender } = renderHold({ enabled: true, onComplete, onCancel: stale });
    rerender({ enabled: true, onComplete, onCancel: live });

    act(() => result.current.handlers.onPointerDown({ pointerId: 1 } as never));
    act(() => vi.advanceTimersByTime(300));
    act(() => result.current.handlers.onPointerUp({} as never));

    expect(live).toHaveBeenCalledTimes(1);
    expect(stale).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('takes the pointer for the length of the hold, and gives it back when the hold ends', () => {
    const onComplete = vi.fn();
    const button = fakeButton();
    const { result } = renderHold({ enabled: true, onComplete, onCancel: vi.fn() });

    act(() => result.current.handlers.onPointerDown({ pointerId: 7, currentTarget: button } as never));
    expect(button.setPointerCapture).toHaveBeenCalledWith(7);
    expect(button.captured.has(7)).toBe(true);

    act(() => vi.advanceTimersByTime(800));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(button.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(button.captured.has(7)).toBe(false);
  });

  it('the pointer wandering off the button mid-hold does NOT cancel it while the pointer is captured', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const button = fakeButton();
    const { result } = renderHold({ enabled: true, onComplete, onCancel });

    act(() => result.current.handlers.onPointerDown({ pointerId: 7, currentTarget: button } as never));
    act(() => result.current.handlers.onPointerLeave({} as never)); // the ring grew under the pointer
    act(() => vi.advanceTimersByTime(800));

    expect(onCancel).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('with no pointer to capture, pointerleave still cancels — the old safety is not traded away', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHold({ enabled: true, onComplete, onCancel });

    act(() => result.current.handlers.onPointerDown({} as never)); // no pointerId, no target
    act(() => result.current.handlers.onPointerLeave({} as never));
    act(() => vi.advanceTimersByTime(800));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('releasing the pointer anywhere still cancels an unfinished hold — capture is not a trap', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const button = fakeButton();
    const { result } = renderHold({ enabled: true, onComplete, onCancel });

    act(() => result.current.handlers.onPointerDown({ pointerId: 7, currentTarget: button } as never));
    act(() => vi.advanceTimersByTime(300));
    act(() => result.current.handlers.onPointerUp({} as never));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    expect(button.releasePointerCapture).toHaveBeenCalledWith(7); // and the pointer goes back
  });

  it('blur does not cancel while the pointer is still down — the human has not let go', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const button = fakeButton();
    const { result } = renderHold({ enabled: true, onComplete, onCancel });

    act(() => result.current.handlers.onPointerDown({ pointerId: 7, currentTarget: button } as never));
    act(() => result.current.handlers.onBlur({ currentTarget: button, relatedTarget: null } as never));
    act(() => vi.advanceTimersByTime(800));

    expect(onCancel).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('blur does not cancel when focus only moved INSIDE the button (the ring and the words are in there)', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const button = fakeButton();
    const { result } = renderHold({ enabled: true, onComplete, onCancel });

    act(() => result.current.handlers.onKeyDown({ key: ' ', preventDefault: () => {} } as never)); // no capture
    act(() => result.current.handlers.onBlur({ currentTarget: button, relatedTarget: button.child } as never));
    act(() => vi.advanceTimersByTime(800));

    expect(onCancel).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('blur DOES cancel a keyboard hold when focus really leaves the button', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const button = fakeButton();
    const { result } = renderHold({ enabled: true, onComplete, onCancel });

    act(() => result.current.handlers.onKeyDown({ key: ' ', preventDefault: () => {} } as never));
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.handlers.onBlur({ currentTarget: button, relatedTarget: { elsewhere: true } } as never));
    act(() => vi.advanceTimersByTime(800));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('a browser that refuses the capture is not a broken hold — it simply runs uncaptured', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const button = fakeButton();
    button.setPointerCapture.mockImplementation(() => {
      throw new Error('InvalidPointerId'); // what a pointer already gone throws
    });
    const { result } = renderHold({ enabled: true, onComplete, onCancel });

    act(() => result.current.handlers.onPointerDown({ pointerId: 7, currentTarget: button } as never));
    act(() => vi.advanceTimersByTime(800));

    expect(onComplete).toHaveBeenCalledTimes(1);
    act(() => result.current.handlers.onPointerLeave({} as never)); // uncaptured: the old rule applies
    expect(onCancel).not.toHaveBeenCalled(); // ...but the hold is already done, so nothing to cancel
  });
});
