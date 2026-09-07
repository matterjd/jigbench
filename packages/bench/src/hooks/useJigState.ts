import { useEffect, useState } from 'react';
import type { BenchState } from '@jigbench/core';

/** S11's build-stream frame — rides the same socket as the state broadcast. `event` stays
 * loosely typed at this seam (a frame is whatever the server sent); usePrompts.ts narrows it to
 * core's `BuildStreamEvent` where it accumulates the stream. */
export interface BuildEventFrame {
  id: string;
  event: unknown;
  elapsedMs: number;
}

/** S17a's `{type:'target-log', line}` frame — one line of the target app's own stdout/stderr,
 * streamed while "Start the app" runs its dev script. `seq` counts frames so two identical
 * lines in a row are still two frames to a consumer diffing on identity. */
export interface TargetLogFrame {
  line: string;
  seq: number;
}

export interface UseJigStateResult {
  /** `/api/state`'s shape — the plain `JigState` plus the Bench host's `bench`/`target`/
   * `recent`/`status` (core's `BenchState`; every extra is optional because a server booted
   * with `--repo` through the older path never sends them). */
  state: BenchState | null;
  connected: boolean;
  /** The most recent `{type:'build', id, event, elapsedMs}` frame, or null before the first one
   * (or after a fresh connection resets it). Consumers (usePrompts.ts) diff on `id`+`event`
   * identity to know a new one arrived. */
  lastBuildEvent: BuildEventFrame | null;
  /** The most recent `{type:'target-log', line}` frame (S17a), or null before the first one. */
  lastTargetLog: TargetLogFrame | null;
}

interface StateMessage {
  type: 'state';
  state: BenchState;
}

interface TargetLogMessage {
  type: 'target-log';
  line: string;
}

interface BuildMessage {
  type: 'build';
  id: string;
  event: unknown;
  elapsedMs: number;
}

function isStateMessage(value: unknown): value is StateMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'state' &&
    'state' in value
  );
}

function isBuildMessage(value: unknown): value is BuildMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'build' &&
    'id' in value &&
    'event' in value
  );
}

function isTargetLogMessage(value: unknown): value is TargetLogMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'target-log' &&
    typeof (value as { line?: unknown }).line === 'string'
  );
}

function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

const INITIAL_RETRY_MS = 500;
const MAX_RETRY_MS = 10_000;

/** Subscribes to the bench server's WebSocket state broadcast, reconnecting with backoff
 * whenever the connection drops — the server may restart while the bench stays open. */
export function useJigState(): UseJigStateResult {
  const [state, setState] = useState<BenchState | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastBuildEvent, setLastBuildEvent] = useState<BuildEventFrame | null>(null);
  const [lastTargetLog, setLastTargetLog] = useState<TargetLogFrame | null>(null);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = INITIAL_RETRY_MS;

    function connect(): void {
      if (cancelled) return;
      socket = new WebSocket(wsUrl());

      socket.onopen = () => {
        retryDelay = INITIAL_RETRY_MS;
        setConnected(true);
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const parsed: unknown = JSON.parse(event.data);
          if (isStateMessage(parsed)) setState(parsed.state);
          else if (isBuildMessage(parsed))
            setLastBuildEvent({ id: parsed.id, event: parsed.event, elapsedMs: parsed.elapsedMs });
          else if (isTargetLogMessage(parsed)) setLastTargetLog((prev) => ({ line: parsed.line, seq: (prev?.seq ?? 0) + 1 }));
        } catch {
          // Malformed frame — ignore it rather than crash the bench over one bad message.
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
      };

      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  return { state, connected, lastBuildEvent, lastTargetLog };
}
