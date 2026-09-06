import { useEffect, useRef, useState } from 'react';
import type { ToolpathStep } from '@jigbench/core';
import type { PlateEvent } from '../plate/usePlateBridge.js';

export interface UseToolpathRecorderResult {
  recording: boolean;
  steps: ToolpathStep[];
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * F11 / CHASSIS.md's Toolpath tool: "the bench collects `jig:event` messages from the plate
 * with timestamps and the current path" while `record()` is active. `event` is PlateBench's
 * new `onEvent` seam's latest value (a plain prop, not a subscription — the caller re-renders
 * this hook whenever a new one arrives, exactly like `usePlateBridge`'s own `lastPick`
 * pattern). Only `click`/`input` kinds become steps; `navigate` steps are not recordable this
 * way (a same-origin navigation cannot be observed by the bench across the cross-origin
 * iframe boundary) — a toolpath's `startUrl` covers "where replay begins" instead.
 */
export function useToolpathRecorder(event: PlateEvent | null, now: () => number = Date.now): UseToolpathRecorderResult {
  const [recording, setRecording] = useState(false);
  const [steps, setSteps] = useState<ToolpathStep[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const lastSeenRef = useRef<PlateEvent | null>(null);

  function start(): void {
    startedAtRef.current = now();
    lastSeenRef.current = null;
    setSteps([]);
    setRecording(true);
  }

  function stop(): void {
    setRecording(false);
  }

  function reset(): void {
    setSteps([]);
  }

  useEffect(() => {
    if (!recording || !event || event === lastSeenRef.current) return;
    lastSeenRef.current = event;
    if (event.kind !== 'click' && event.kind !== 'input') return;

    const at = startedAtRef.current === null ? 0 : now() - startedAtRef.current;
    const step: ToolpathStep = { kind: event.kind, path: event.path, at, ...(event.value !== undefined ? { value: event.value } : {}) };
    setSteps((prev) => [...prev, step]);
    // `now` is intentionally excluded — tests pass a mutable closure over a plain variable,
    // not a stable function identity, and re-running this effect only on `event`/`recording`
    // changing is exactly the "one new event at a time" contract this hook has.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, recording]);

  return { recording, steps, start, stop, reset };
}
