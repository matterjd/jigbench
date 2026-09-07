import { useEffect, useState } from 'react';
import type { JigState } from '@jigbench/core';

/** S11's build-stream frame — rides the same socket as the state broadcast, mirrored here as a
 * loosely-typed passthrough (the real `BuildStreamEvent` union lives in
 * `delegate/build-s11:packages/server/src/build/types.ts`, not on `main` yet — see
 * `packages/bench/src/prompts/types.ts` for the local seam). */
export interface BuildEventFrame {
  id: string;
  event: unknown;
  elapsedMs: number;
}

export interface UseJigStateResult {
  state: JigState | null;
  connected: boolean;
  /** The most recent `{type:'build', id, event, elapsedMs}` frame, or null before the first one
   * (or after a fresh connection resets it). Consumers (usePrompts.ts) diff on `id`+`event`
   * identity to know a new one arrived. */
  lastBuildEvent: BuildEventFrame | null;
}

interface StateMessage {
  type: 'state';
  state: JigState;
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

function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

const INITIAL_RETRY_MS = 500;
const MAX_RETRY_MS = 10_000;

/** Subscribes to the bench server's WebSocket state broadcast, reconnecting with backoff
 * whenever the connection drops — the server may restart while the bench stays open. */
export function useJigState(): UseJigStateResult {
  const [state, setState] = useState<JigState | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastBuildEvent, setLastBuildEvent] = useState<BuildEventFrame | null>(null);

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

  return { state, connected, lastBuildEvent };
}
