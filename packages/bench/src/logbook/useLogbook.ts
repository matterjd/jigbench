// packages/bench/src/logbook/useLogbook.ts — the logbook's source (issue #9): the record of
// everything that happened on the bench THIS SESSION, held in memory and bounded to the last
// 500 rows. Nothing leaves the machine and nothing is written anywhere — this is the drawer's
// working memory, not `.jig/logbook.jsonl`. Two WS seams feed it besides `add`:
//   - useJigState's `lastBuildEvent` (a `{type:'build'}` frame) → a Claude row, identity-diffed
//     the way usePrompts.ts does it (the hook hands back the same object until the next frame);
//   - useJigState's `lastTargetLog` (a `{type:'target-log'}` frame) → an app row, diffed on
//     `seq` (two identical lines in a row are still two frames).
import { useCallback, useRef, useState } from 'react';
import { buildStreamLine } from '@jigbench/core';
import type { BuildStreamEvent, LogEntry } from '@jigbench/core';

/** The logbook keeps this many rows; the oldest falls off the shelf first. */
export const LOGBOOK_LIMIT = 500;

/** useJigState's `lastBuildEvent` shape — diffed by object identity. */
export interface LogbookBuildFrame {
  id: string;
  event: unknown;
  elapsedMs: number;
}

/** useJigState's `lastTargetLog` shape — diffed by `seq`. */
export interface LogbookTargetLogFrame {
  line: string;
  seq: number;
}

export interface UseLogbookResult {
  /** Oldest first; the drawer reverses for display. */
  entries: LogEntry[];
  /** Stable (useCallback) — safe in an effect dep list. */
  add: (actor: string, event: string, ref: string, note?: string) => void;
  /** Pass `lastBuildEvent` on every render (or in an effect); only a NEW frame object lands. */
  noteBuildFrame: (frame: LogbookBuildFrame | null) => void;
  /** Pass `lastTargetLog` on every render (or in an effect); only a new `seq` lands. */
  noteTargetLog: (frame: LogbookTargetLogFrame | null) => void;
}

/** mm:ss of an elapsed span — the same rounding the status line uses while building, so a
 * Claude row's note and the line above it agree about the same moment. */
export function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function isBuildStreamEvent(event: unknown): event is BuildStreamEvent {
  return typeof event === 'object' && event !== null && typeof (event as { kind?: unknown }).kind === 'string';
}

/** One build frame, in words: core's `buildStreamLine` for a real stream event (a string
 * `kind`); the raw JSON for anything else the socket handed over — a frame is whatever the
 * server sent, and the logbook records rather than rejects. */
export function buildFrameLine(event: unknown): string {
  if (isBuildStreamEvent(event)) return buildStreamLine(event);
  return JSON.stringify(event) ?? String(event);
}

export function useLogbook(): UseLogbookResult {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const lastBuildFrameRef = useRef<LogbookBuildFrame | null>(null);
  const lastTargetSeqRef = useRef<number | null>(null);

  const add = useCallback((actor: string, event: string, ref: string, note?: string) => {
    const at = new Date().toISOString();
    const entry: LogEntry = note === undefined ? { at, actor, event, ref } : { at, actor, event, ref, note };
    setEntries((prev) => {
      const next = [...prev, entry];
      return next.length > LOGBOOK_LIMIT ? next.slice(next.length - LOGBOOK_LIMIT) : next;
    });
  }, []);

  const noteBuildFrame = useCallback(
    (frame: LogbookBuildFrame | null) => {
      if (!frame || frame === lastBuildFrameRef.current) return;
      lastBuildFrameRef.current = frame;
      add('Claude', buildFrameLine(frame.event), frame.id, mmss(frame.elapsedMs));
    },
    [add],
  );

  const noteTargetLog = useCallback(
    (frame: LogbookTargetLogFrame | null) => {
      if (!frame || frame.seq === lastTargetSeqRef.current) return;
      lastTargetSeqRef.current = frame.seq;
      add('app', frame.line, 'the app');
    },
    [add],
  );

  return { entries, add, noteBuildFrame, noteTargetLog };
}
