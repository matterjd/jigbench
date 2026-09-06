// packages/bench/src/tools/toolState.ts — the bench's current tool (client state, not server state).
import { useSyncExternalStore } from 'react';
export type Tool = 'hand' | 'loupe' | 'mark' | 'fixture' | 'toolpath' | 'sketch';
let current: Tool = 'hand';
const listeners = new Set<() => void>();
export function setTool(t: Tool): void { if (t === current) return; current = t; listeners.forEach((l) => l()); }
export function getTool(): Tool { return current; }
function subscribe(l: () => void): () => void { listeners.add(l); return () => listeners.delete(l); }
export function useTool(): { tool: Tool; setTool: (t: Tool) => void } {
  const tool = useSyncExternalStore(subscribe, getTool, getTool);
  return { tool, setTool };
}
