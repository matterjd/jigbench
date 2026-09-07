import { z } from 'zod';
import { JigStateSchema } from './jig-state.js';
import { ClaudeStatusSchema } from './build.js';

/**
 * S17a/S17b (AMENDMENT-1 §7, A6): the shapes the Bench host adds around the plain `JigState`
 * on `GET /api/state` and every WS `state` broadcast — which repo is clamped (or none), what
 * the target app's dev server is doing, and the recent benches the Clamp screen lists.
 *
 * Same reasoning as `jig-state.ts`: `bench` may only import core, and these are exactly the
 * fields the Clamp screen (S17b) renders. `server`'s `target/runner.ts` and `bench/recent.ts`
 * import their types from here so the wire shape has one definition.
 */

/** `target` on `/api/state` — `none → starting → up{url,pid} | down{exitCode}`. */
export const TargetStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('none') }),
  z.object({ status: z.literal('starting') }),
  z.object({ status: z.literal('up'), url: z.string(), pid: z.number().optional() }),
  z.object({ status: z.literal('down'), exitCode: z.number().nullable() }),
]);
export type TargetState = z.infer<typeof TargetStateSchema>;

/** One row of `~/.jig/recent.json` — a repo clamped before, most recent first. */
export const RecentBenchEntrySchema = z.object({
  repoRoot: z.string(),
  clampedAt: z.string(),
  lastUsedTargetUrl: z.string().optional(),
  docsFolder: z.string().optional(),
});
export type RecentBenchEntry = z.infer<typeof RecentBenchEntrySchema>;

/** The dev script `target/detect.ts` (server) resolved for a freshly clamped repo — what
 * "Start the app" would run, said up front on the Clamp screen. `null` when nothing could be
 * detected (the screen then asks for a URL instead). */
export const DetectedTargetSummarySchema = z.object({
  script: z.string().optional(),
  port: z.number(),
  source: z.enum(['survey', 'package.json', 'angular.json']),
});
export type DetectedTargetSummary = z.infer<typeof DetectedTargetSummarySchema>;

/**
 * Everything `/api/state` can carry. `bench` is `null` when the host has nothing clamped (the
 * Clamp screen's cue), an object once it does, and ABSENT on a server that was booted with
 * `--repo` through the pre-S17a path (every field below is optional for that reason — the
 * bench reads them defensively and an older server simply never sends them).
 */
export const BenchStateSchema = JigStateSchema.extend({
  bench: z.object({ repoRoot: z.string() }).nullable().optional(),
  target: TargetStateSchema.optional(),
  recent: z.array(RecentBenchEntrySchema).optional(),
  status: z.object({ claude: ClaudeStatusSchema }).optional(),
});
export type BenchState = z.infer<typeof BenchStateSchema> & {
  /** `wiring.claude` — whether the `claude` executable was found on PATH (S11). Layered on
   * the core `Wiring` here rather than in `WiringSchema` because every pre-S11 wiring literal
   * across the codebase omits it. */
  wiring: z.infer<typeof JigStateSchema>['wiring'] & { claude?: 'installed' | 'none' };
};

/** The empty-host shape: `bench: null`, every wiring field `'none'`. What `GET /api/state`
 * answers before any `POST /api/clamp` — a `JigState` in name only, since there is no survey
 * or gauge set to read; the fields are honest empties so a reader never has to special-case
 * "no bench yet" at every access. */
export function isClampScreenState(state: BenchState | null | undefined): boolean {
  return state !== null && state !== undefined && state.bench === null;
}
