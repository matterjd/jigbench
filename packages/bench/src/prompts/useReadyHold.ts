// packages/bench/src/prompts/useReadyHold.ts — the Ready button's held gesture, ported from
// concept-d-the-quiet-bench.html's Ready IIFE (:1209-1218).
//
// "Ready is the one held gesture" (concept D §"What it champions"): ~800ms read LIVE from
// --t-oath; release early = honestly cancelled in words, never silently ignored ("let go early —
// still a draft · 303 ms of 800"). Floor item 10 ("irreversible = held with deepening") requires
// this to be a real timer a human can interrupt, not a click.
import { useCallback, useRef, useState } from 'react';

/** Reads `--t-oath` off `document.documentElement` at the moment the hold starts — "the hold IS
 * the safety, not a decoration" (tokens.css), so it must be read live, not baked into a constant.
 * Falls back to 800ms (the token's own documented default) when the property is absent (jsdom
 * without the real stylesheet applied, or an older token file). */
export function readOathMs(): number {
  if (typeof document === 'undefined') return 800;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--t-oath');
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 800;
}

export interface UseReadyHoldOptions {
  /** False when the draft has no words yet, or it's already ready/building/built — the hold
   * does nothing while disabled (matches the concept's `if (btn.disabled || !ember || holding)
   * return`). */
  enabled: boolean;
  /** Fires once, when the hold survives the full oath duration. */
  onComplete: () => void;
  /** Fires once per cancelled hold, with the elapsed ms and the total oath ms — the card renders
   * "let go early — still a draft · <elapsed> ms of <total>" from these two numbers. */
  onCancel: (elapsedMs: number, oathMs: number) => void;
  /** Fires once when a hold starts (the card renders "hold — the ring fills..."). */
  onStart?: () => void;
  oathMs?: () => number;
  now?: () => number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

export interface UseReadyHoldResult {
  holding: boolean;
  handlers: {
    onPointerDown: (event: { pointerId?: number }) => void;
    onPointerUp: (event: unknown) => void;
    onPointerCancel: (event: unknown) => void;
    onPointerLeave: (event: unknown) => void;
    onBlur: (event: unknown) => void;
    onKeyDown: (event: { key: string; preventDefault: () => void }) => void;
    onKeyUp: (event: { key: string }) => void;
  };
}

export function useReadyHold(options: UseReadyHoldOptions): UseReadyHoldResult {
  const {
    enabled,
    onComplete,
    onCancel,
    onStart,
    oathMs = readOathMs,
    now = Date.now,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
  } = options;

  const [holding, setHolding] = useState(false);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdingRef = useRef(false); // mirrors `holding` synchronously — state updates are async

  const start = useCallback(() => {
    if (!enabled || holdingRef.current) return;
    holdingRef.current = true;
    setHolding(true);
    startedAtRef.current = now();
    onStart?.();
    const total = oathMs();
    timerRef.current = setTimeoutImpl(() => {
      if (!holdingRef.current) return; // a cancel raced the timer — never complete a released hold
      holdingRef.current = false;
      setHolding(false);
      onComplete();
    }, total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const cancel = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setHolding(false);
    if (timerRef.current !== null) {
      clearTimeoutImpl(timerRef.current);
      timerRef.current = null;
    }
    const elapsed = now() - startedAtRef.current;
    onCancel(elapsed, oathMs());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    holding,
    handlers: {
      onPointerDown: () => start(),
      onPointerUp: () => cancel(),
      onPointerCancel: () => cancel(),
      onPointerLeave: () => cancel(),
      onBlur: () => cancel(),
      onKeyDown: (event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          start();
        }
      },
      onKeyUp: (event) => {
        if (event.key === ' ' || event.key === 'Enter') cancel();
      },
    },
  };
}
