import { useEffect, useRef, useState } from 'react';
import type { Toolpath, ToolpathStep } from '@jigbench/core';

export type ReplaySpeed = 0.5 | 1 | 2;

export type PostFn = (message: Record<string, unknown>) => void;

export interface UseToolpathReplayResult {
  playing: boolean;
  /** Index into `toolpath.steps` of the stop currently landed on, or -1 before the first one
   * (or once stopped/reset). The scrubber highlights this stop's element on the plate(s). */
  currentStepIndex: number;
  speed: ReplaySpeed;
  setSpeed: (speed: ReplaySpeed) => void;
  /** Starts replaying `toolpath` on `post` — a `startUrl` (if any) is sent as `jig:navigate`
   * immediately; every step is then paced by its recorded `at` offset, divided by `speed`. */
  play: (toolpath: Toolpath, post: PostFn) => void;
  /** The "printed" affordance: cancels every pending step and returns to idle (Law: a
   * printed control returns a surface to its own rest state). */
  stop: () => void;
}

function messageFor(step: ToolpathStep): Record<string, unknown> {
  if (step.kind === 'navigate') return { type: 'jig:navigate', path: step.path };
  if (step.kind === 'click') return { type: 'jig:click', path: step.path };
  return { type: 'jig:fill', fields: [{ path: step.path, value: step.value }] };
}

/**
 * F11 / CHASSIS.md's toolpath scrubber: "replay a saved toolpath on the plate by posting the
 * steps back ... paced by the recorded offsets with a speed control (0.5x / 1x / 2x)". Pure
 * pacing/message logic only — `post` is supplied by the caller so the same hook can drive one
 * plate (the Toolpath tool's own recorder bar) or fan out to two at once (the trial-fit
 * mirror's scrubber, `packages/bench/src/trialfit/*`).
 */
export function useToolpathReplay(
  setTimeoutImpl: typeof setTimeout = setTimeout,
  clearTimeoutImpl: typeof clearTimeout = clearTimeout,
): UseToolpathReplayResult {
  const [playing, setPlaying] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  function clearTimers(): void {
    for (const timer of timersRef.current) clearTimeoutImpl(timer);
    timersRef.current = [];
  }

  function play(toolpath: Toolpath, post: PostFn): void {
    clearTimers();
    setCurrentStepIndex(-1);

    if (toolpath.startUrl) post({ type: 'jig:navigate', path: toolpath.startUrl });

    if (toolpath.steps.length === 0) {
      setPlaying(false);
      return;
    }

    setPlaying(true);
    toolpath.steps.forEach((step, index) => {
      const delay = step.at / speed;
      const timer = setTimeoutImpl(() => {
        setCurrentStepIndex(index);
        post(messageFor(step));
        if (index === toolpath.steps.length - 1) setPlaying(false);
      }, delay);
      timersRef.current.push(timer);
    });
  }

  function stop(): void {
    clearTimers();
    setPlaying(false);
    setCurrentStepIndex(-1);
  }

  useEffect(() => () => clearTimers(), []);

  return { playing, currentStepIndex, speed, setSpeed, play, stop };
}
