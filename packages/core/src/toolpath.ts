import { z } from 'zod';
import { JIG_FORMAT } from './jig-format.js';

// === S8 (EXECUTION-PLAN.md §4 row S8 / CHASSIS.md's toolpath scrubber): the recorded shape,
// pinned down here for the first time — S1 shipped a bare placeholder (`at` as a string, no
// consumer). `at` is the step's ms offset from the toolpath's start (or from the previous
// stop for a hand-rolled toolpath — the recorder always emits offsets from t=0), so replay
// can pace itself; `label` is optional prose a human or the recorder attaches to a stop
// ("open the invoice") for the scrubber's stop list. Nothing pre-existing depended on the old
// shape (grepped before this change), so this is a straight replacement, not a migration. ===
export const ToolpathStepSchema = z.object({
  kind: z.enum(['click', 'input', 'navigate']),
  /** A DOM path (`buildDomPath` in `plate/loupe.js`) for `click`/`input`; a same-origin URL
   * path for `navigate` — resolved the same way `jig:navigate` already resolves one. */
  path: z.string(),
  value: z.string().optional(),
  /** Milliseconds since the toolpath's first step — always >= 0, always increasing across a
   * recorded sequence (replay does not require it, but the recorder always emits it that
   * way). */
  at: z.number().nonnegative(),
  label: z.string().optional(),
});
export type ToolpathStep = z.infer<typeof ToolpathStepSchema>;

export const ToolpathSchema = z.object({
  jigFormat: z.literal(JIG_FORMAT),
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  /** The URL to load on the plate before replay starts. Optional — a toolpath recorded from
   * whatever screen the plate already happened to be on has none, and replay simply starts
   * from wherever the plate currently is. */
  startUrl: z.string().optional(),
  steps: z.array(ToolpathStepSchema),
  /** Law II: scrapped is a state, never a deletion — mirrors `FixtureSchema`'s pair exactly
   * (`packages/core/src/fixture.ts`). Absent/false = live. */
  scrapped: z.boolean().optional(),
  scrappedAt: z.string().optional(),
});
export type Toolpath = z.infer<typeof ToolpathSchema>;

/** The `GET /api/toolpaths` list item — everything the bench's recorder/replay bar renders
 * per row, without shipping every step over the wire just to list toolpaths (mirrors
 * `FixtureSummarySchema`). */
export const ToolpathSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  startUrl: z.string().optional(),
  stepCount: z.number().nonnegative(),
  scrapped: z.boolean().optional(),
  scrappedAt: z.string().optional(),
});
export type ToolpathSummary = z.infer<typeof ToolpathSummarySchema>;
// === end S8 block ===
