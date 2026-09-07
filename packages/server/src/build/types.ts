/**
 * The shapes shared between `build/runner.ts` (the real `claude -p` process wrapper) and
 * `prompts/service.ts` (the orchestrator that calls it) — split into their own module, same
 * reasoning as `mcp/types.ts`, so `service.ts` can depend on the SHAPE without importing the
 * concrete `BuildRunner` class (and so a test can inject a fake one that satisfies
 * `BuildRunnerLike` without spawning a real process).
 */

// S17b (#7): `BuildStreamEvent` and `ClaudeStatus` moved to `@jigbench/core` (build.ts) so the
// bench can import the real shapes instead of mirroring them — re-exported here so every
// existing server import of `./build/types.js` keeps working unchanged.
export type { BuildStreamEvent, ClaudeStatus } from '@jigbench/core';
import type { BuildStreamEvent, ClaudeStatus } from '@jigbench/core';

export interface BuildOutcome {
  /** `null` only when the process could not be spawned at all (see `ClaudeNotInstalledError`
   * upstream) or was killed by a signal rather than exiting — `cancelled` disambiguates the
   * killed-by-us case. */
  exitCode: number | null;
  filesTouched: string[];
  summary?: string;
  sessionId?: string;
  transcriptPath: string;
  cancelled: boolean;
}

export interface StartBuildInput {
  promptId: string;
  buildId: string;
  repoRoot: string;
  /** `promptBodyForClaude(prompt)` — piped to the child's stdin, never passed as a CLI
   * argument (arbitrary length, arbitrary quoting — stdin sidesteps both). */
  promptText: string;
  /** Called for every parsed stream event, with the elapsed wall-clock ms since `start()` was
   * called — `prompts/service.ts` forwards both straight onto the bench WS. */
  onEvent: (event: BuildStreamEvent, elapsedMs: number) => void;
}

/** The subset of `BuildRunner` that `PromptService` actually calls — widened to an interface
 * (same trick as `orders/service.ts`'s `OllamaLike`) so a unit test can inject a deterministic
 * fake instead of a real child-process runner. */
export interface BuildRunnerLike {
  isClaudeAvailable(): Promise<boolean>;
  currentBuild(): { promptId: string; buildId: string } | null;
  start(input: StartBuildInput): Promise<BuildOutcome>;
  /** Kills the running build's child process by PID (never by name) if `promptId` matches
   * the one currently running. Returns `false` (a no-op) when nothing matching is running. */
  cancel(promptId: string): boolean;
  status(): ClaudeStatus;
}
