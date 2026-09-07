// packages/bench/src/chassis/advancedState.ts — the Advanced switch's state (client only).
//
// Concept D / AMENDMENT-1 §4: "Advanced (one toggle...): rulers/guides, the SIM strip, Fixtures,
// Toolpath, the mirror, MCP status, the spine." Off by default, persisted per session (so a
// reload during the same browser session keeps the choice, but a fresh tab starts quiet again —
// sessionStorage, not localStorage). Module-level external store, same shape as tools/toolState.ts.
import { useSyncExternalStore } from 'react';

export const ADVANCED_SESSION_KEY = 'jig-advanced';

function readInitial(): boolean {
  try {
    return sessionStorage.getItem(ADVANCED_SESSION_KEY) === 'true';
  } catch {
    return false; // sessionStorage can throw (private mode, disabled storage) — quiet by default.
  }
}

let current = readInitial();
const listeners = new Set<() => void>();

export function setAdvanced(next: boolean): void {
  if (next === current) return;
  current = next;
  try {
    sessionStorage.setItem(ADVANCED_SESSION_KEY, String(next));
  } catch {
    // storage unavailable — the toggle still works for this render, just not persisted.
  }
  listeners.forEach((l) => l());
}

export function getAdvanced(): boolean {
  return current;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAdvanced(): { advanced: boolean; setAdvanced: (next: boolean) => void } {
  const advanced = useSyncExternalStore(subscribe, getAdvanced, getAdvanced);
  return { advanced, setAdvanced };
}
