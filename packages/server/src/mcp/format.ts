import { join } from 'node:path';
import { jigPaths, type LogEntry, type WorkOrder } from '@jigbench/core';

/** Pure presentation helpers for the MCP tools — no I/O, deliberately separate from
 * `tools.ts` so they're each independently unit-testable. */

/** A short, human-relative age string for `jig_work_orders`'s `age` column. Never throws
 * on a bad timestamp (reports "unknown" instead) and never goes negative for a
 * future/clock-skewed one (reports "just now" instead). */
export function ageString(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'unknown';
  const deltaMs = Math.max(0, now - then);
  const sec = Math.floor(deltaMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

/** A work order's log is append-only chronological (`orders/service.ts` only ever appends),
 * so its first entry's `at` is the order's own creation time — there is no separate
 * `createdAt` field on `WorkOrder` itself. `undefined` for the (should-never-happen) empty
 * log, rather than throwing. */
export function firstLogAt(order: Pick<WorkOrder, 'log'>): string | undefined {
  return (order.log as LogEntry[])[0]?.at;
}

/** The on-disk path of a work order's markdown file — the same naming `store.ts`'s
 * `writeWorkOrder`/`createMarkAndWorkOrder` already use (`<id>-<slug>.md` under
 * `.jig/work-orders/`), reconstructed here so tools can report it without `JigStore`
 * needing to expose a path-for-id lookup of its own. */
export function workOrderFilePath(repoRoot: string, order: Pick<WorkOrder, 'id' | 'slug'>): string {
  return join(jigPaths(repoRoot).workOrders, `${order.id}-${order.slug}.md`);
}
