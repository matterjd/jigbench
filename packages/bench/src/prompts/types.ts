// packages/bench/src/prompts/types.ts — S12's own seam for the S11 Prompt model.
//
// S11 (branch `delegate/build-s11`, not yet on `main`) owns `packages/core/src/prompt.ts` and
// `packages/server/src/build/types.ts` — this worktree cannot import them without merging a
// branch it was told not to touch. These types are a byte-for-byte MIRROR of what was read there
// (see the worker report's quoted routes/types), kept deliberately small and dependency-free so
// the swap to `@jigbench/core`'s real export, once S11 merges, is type-only — delete this file,
// repoint the two imports, done. CONCERN: until then, a drift between this mirror and the real
// server type is possible and would only surface as a runtime shape mismatch, not a build error.

export const PROMPT_STATES = ['draft', 'ready', 'building', 'built', 'scrapped'] as const;
export type PromptState = (typeof PROMPT_STATES)[number];

export type PromptTargetKind = 'element' | 'sketch' | 'none';

export interface PromptTarget {
  kind: PromptTargetKind;
  path?: string;
  component?: string;
  file?: string;
  sketchId?: string;
}

export interface PromptContextComponent {
  name: string;
  selector?: string;
  file: string;
}

export interface PromptContextGauge {
  name: string;
  value: string | number;
  category?: string;
}

export interface PromptContextRoute {
  path: string;
  component?: string;
  file?: string;
}

export interface PromptContextEndpoint {
  method: string;
  path: string;
  file?: string;
}

export interface PromptContextDoc {
  provenance: string;
  text: string;
}

export interface PromptContext {
  components: PromptContextComponent[];
  files: string[];
  gauges: PromptContextGauge[];
  routes: PromptContextRoute[];
  endpoints: PromptContextEndpoint[];
  docs: PromptContextDoc[];
}

export interface PromptBuildRecord {
  id: string;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  filesTouched: string[];
  summary?: string;
  transcriptPath?: string;
}

export interface Prompt {
  jigFormat: number;
  id: string;
  slug: string;
  state: PromptState;
  requirement: string;
  acceptance: string[];
  target: PromptTarget;
  context: PromptContext;
  builds: PromptBuildRecord[];
  createdAt: string;
  updatedAt: string;
  scrappedFrom?: PromptState;
}

/** `packages/server/src/build/types.ts`'s `BuildStreamEvent`, mirrored. */
export type BuildStreamEvent =
  | { kind: 'init'; sessionId: string }
  | { kind: 'text'; text: string }
  | { kind: 'tool'; name: string; target: string }
  | { kind: 'tool_result'; ok: boolean }
  | { kind: 'result'; ok: boolean; sessionId?: string; summary?: string; numTurns?: number; costUsd?: number }
  | { kind: 'raw'; text: string };

export interface CreatePromptInput {
  requirement: string;
  acceptance?: string[];
  target?: PromptTarget;
}

export interface PromptEditInput {
  requirement?: string;
  acceptance?: string[];
}

export interface PolishResult {
  requirement: string;
  acceptance: string[];
}

/** `status.claude` from `/api/state`, mirrored (`ClaudeStatus` in build/types.ts). */
export type ClaudeStatus =
  | { state: 'idle' }
  | { state: 'building'; id: string; elapsed: number }
  | { state: 'built'; id: string; files: string[]; elapsed: number };

/** The two fields S11's `composedState()` adds to the `/api/state` payload alongside the plain
 * `@jigbench/core` `JigState` — `wiring.claude` (a `'installed'|'none'` field the core `Wiring`
 * schema doesn't carry) and `status.claude`. `@jigbench/core`'s own types can't express this
 * until S11 merges (see this file's header) — App.tsx reads them through `composedExtras()`
 * below rather than an inline cast at every call site. */
export interface ComposedStateExtras {
  wiring: { claude: 'installed' | 'none' };
  status: { claude: ClaudeStatus };
}

/** Safely narrows a `JigState | null` (or any object) to the S11 extras it carries at runtime
 * once the real server sends them — a type-level seam, not a validator; a server without S11
 * simply never has `status`/`wiring.claude`, and every read here is already optional-chained. */
export function composedExtras(state: unknown): Partial<ComposedStateExtras> {
  return (state ?? {}) as Partial<ComposedStateExtras>;
}
