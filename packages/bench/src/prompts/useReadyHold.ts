// packages/bench/src/prompts/useReadyHold.ts — the Ready button's held gesture, ported from
// concept-d-the-quiet-bench.html's Ready IIFE (:1209-1218).
//
// "Ready is the one held gesture" (concept D §"What it champions"): ~800ms read LIVE from
// --t-oath; release early = honestly cancelled in words, never silently ignored ("let go early —
// still a draft · 303 ms of 800"). Floor item 10 ("irreversible = held with deepening") requires
// this to be a real timer a human can interrupt, not a click.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent, PointerEvent } from 'react';

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

/** The slice of a real pointer event the hold needs: which pointer, and the element to take it
 * on. Both optional — the keyboard path has neither, and a hold with no pointer to capture
 * simply runs uncaptured. */
export type ReadyPointerEvent = Partial<Pick<PointerEvent, 'pointerId' | 'currentTarget'>>;
/** The slice of a real focus event the hold needs: the button, and where focus actually went. */
export type ReadyFocusEvent = Partial<Pick<FocusEvent, 'currentTarget' | 'relatedTarget'>>;

export interface UseReadyHoldResult {
  holding: boolean;
  handlers: {
    onPointerDown: (event: ReadyPointerEvent) => void;
    onPointerUp: (event: unknown) => void;
    onPointerCancel: (event: unknown) => void;
    onPointerLeave: (event: unknown) => void;
    onBlur: (event: ReadyFocusEvent) => void;
    onKeyDown: (event: { key: string; preventDefault: () => void }) => void;
    onKeyUp: (event: { key: string }) => void;
  };
}

interface HeldPointer {
  target: NonNullable<ReadyPointerEvent['currentTarget']>;
  pointerId: number;
}

/** #58: hold the pointer for the length of the gesture, so the ring growing under the cursor —
 * or a hand that drifts a few px — cannot end it. `setPointerCapture` retargets every later
 * pointer event to this element, which is also why `pointerup` still reaches us from anywhere.
 * Anything the browser refuses (a pointer already gone throws InvalidPointerId) leaves the hold
 * running uncaptured under the old rules rather than breaking it. */
function takePointer(event: ReadyPointerEvent | undefined): HeldPointer | null {
  const target = event?.currentTarget;
  const pointerId = event?.pointerId;
  if (!target || typeof pointerId !== 'number' || typeof target.setPointerCapture !== 'function') return null;
  try {
    target.setPointerCapture(pointerId);
    return { target, pointerId };
  } catch {
    return null;
  }
}

function givePointerBack(held: HeldPointer | null): void {
  if (!held || typeof held.target.releasePointerCapture !== 'function') return;
  try {
    held.target.releasePointerCapture(held.pointerId);
  } catch {
    // Already released — the browser let go first (the pointer ended, or the element left the
    // document). Nothing to undo.
  }
}

/** True only when focus moved to something INSIDE the button — the ring `<svg>` and the two
 * `<span>`s live in there. `relatedTarget` is null when focus went nowhere at all, which IS
 * focus leaving. */
function focusStayedInside(event: ReadyFocusEvent | undefined): boolean {
  const target = event?.currentTarget;
  const related = event?.relatedTarget;
  if (!target || !related || typeof target.contains !== 'function') return false;
  return target.contains(related as Node) === true;
}

export function useReadyHold(options: UseReadyHoldOptions): UseReadyHoldResult {
  const [holding, setHolding] = useState(false);
  const startedAtRef = useRef(0);
  const totalRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdingRef = useRef(false); // mirrors `holding` synchronously — state updates are async
  const pointerRef = useRef<HeldPointer | null>(null);

  // #58 — THE defect the 0.2.0 desk retest stopped on. `start` and `cancel` used to be
  // `useCallback`s over `[enabled]` and `[]`, so the callbacks their timer would eventually
  // call were the ones captured at the render where `enabled` last changed — in the real card,
  // the FIRST KEYSTROKE, while `POST /api/prompts` was still in flight and the card's
  // `onReadyComplete` was therefore a closure over a prompt that did not exist yet
  // (`App.tsx:208`, `:316`). The create answered a moment later, `enabled` never changed again,
  // `useCallback` never recomputed, and the 800 ms timer fired a frozen no-op: the ring filled
  // and nothing was sent. The hold must act on the card AS IT IS when the timer fires — during
  // a hold as well as before one — so every option is read through this ref at call time and
  // `start`/`cancel` hold no props at all.
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const start = useCallback((event?: ReadyPointerEvent) => {
    const o = latest.current;
    if (!o.enabled || holdingRef.current) return;
    holdingRef.current = true;
    setHolding(true);
    startedAtRef.current = (o.now ?? Date.now)();
    pointerRef.current = takePointer(event);
    o.onStart?.();
    const total = (o.oathMs ?? readOathMs)();
    totalRef.current = total;
    timerRef.current = (o.setTimeoutImpl ?? setTimeout)(() => {
      if (!holdingRef.current) return; // a cancel raced the timer — never complete a released hold
      holdingRef.current = false;
      setHolding(false);
      givePointerBack(pointerRef.current);
      pointerRef.current = null;
      latest.current.onComplete();
    }, total);
  }, []);

  const cancel = useCallback(() => {
    if (!holdingRef.current) return;
    const o = latest.current;
    holdingRef.current = false;
    setHolding(false);
    givePointerBack(pointerRef.current);
    pointerRef.current = null;
    if (timerRef.current !== null) {
      (o.clearTimeoutImpl ?? clearTimeout)(timerRef.current);
      timerRef.current = null;
    }
    const elapsed = (o.now ?? Date.now)() - startedAtRef.current;
    // The total this hold was actually measured against, not a fresh read — `--t-oath` must not
    // be able to change the sentence half way through.
    o.onCancel(elapsed, totalRef.current);
  }, []);

  return {
    holding,
    handlers: {
      onPointerDown: (event) => start(event),
      onPointerUp: () => cancel(),
      onPointerCancel: () => cancel(),
      onPointerLeave: () => {
        // With the pointer captured, the human has not let go — a box that moved out from under
        // the cursor is not a release. Uncaptured (the keyboard path, or a browser that refused),
        // leaving the button still cancels, exactly as it always did.
        if (pointerRef.current) return;
        cancel();
      },
      onBlur: (event) => {
        if (pointerRef.current) return; // the pointer is still down; focus moving is not a release
        if (focusStayedInside(event)) return; // the ring and the words are inside the button
        cancel();
      },
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
