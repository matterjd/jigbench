// packages/bench/src/tools/toolState.ts — the bench's current tool (client state, not server state).
//
// S12 (concept D · The Quiet Bench, AMENDMENT-1 A3): the rail carries exactly three tools.
// v0.1's Loupe and Mark fold into Point (Point's hover is the old loupe hover; Point's click
// opens the prompt card, replacing the old mark-a-pin flow). v0.1's Fixture and Toolpath are
// no longer rail tools at all — in D both are Advanced-drawer panels reached directly, not
// gated behind a tool selection (docs/team/v0.2/CHASSIS.md §2). Point is the default, matching
// the built spec's own initial state (`data-tool="point"`, Point's `aria-pressed="true"` at rest).
import { useSyncExternalStore } from 'react';
export type Tool = 'point' | 'sketch' | 'hand';
let current: Tool = 'point';
const listeners = new Set<() => void>();
export function setTool(t: Tool): void { if (t === current) return; current = t; listeners.forEach((l) => l()); }
export function getTool(): Tool { return current; }
function subscribe(l: () => void): () => void { listeners.add(l); return () => listeners.delete(l); }
export function useTool(): { tool: Tool; setTool: (t: Tool) => void } {
  const tool = useSyncExternalStore(subscribe, getTool, getTool);
  return { tool, setTool };
}
