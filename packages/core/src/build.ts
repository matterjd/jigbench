import { z } from 'zod';

/**
 * S11's build stream and Claude status, as the bench needs to render them (S17b, issue #7).
 *
 * These shapes are produced by `packages/server/src/build/runner.ts` (the real `claude -p`
 * process wrapper) and ridden over the bench WebSocket as `{type:'build', id, event,
 * elapsedMs}` frames and `/api/state`'s `status.claude`. They live HERE, not in `server`, for
 * the same reason `JigState` does (jig-state.ts): `bench` may import core only — never
 * `server` — and it still has to know these shapes to draw the status line, the stream ribbon
 * and the logbook. `server`'s own `build/types.ts` re-exports them from here so the two can
 * never drift the way the S12-era local mirror could.
 */

/**
 * #81 item 7: why a build has no diff information — the three reasons
 * `build/git-diff.ts`'s `gitStatusSnapshot` can answer `null`, which the caller used to read as
 * one indistinguishable "no diff" and tell nobody about at all.
 *
 *   - `git-timed-out` — a `git` invocation outlived its budget and was killed (#37's timeout).
 *     A credential helper waiting on a prompt, a dead network drive under the working tree, an
 *     `index.lock` someone else holds.
 *   - `git-not-found` — no `git` on PATH.
 *   - `not-a-git-repo` — `git` ran and said this folder is not inside a working tree.
 *
 * They read differently on purpose: the first is a machine that needs looking at, the second is
 * a machine that needs git, and the third is normal.
 */
export const BuildNoticeCodeSchema = z.enum(['git-timed-out', 'git-not-found', 'not-a-git-repo']);
export type BuildNoticeCode = z.infer<typeof BuildNoticeCodeSchema>;

/** One compact, already-parsed event out of `claude -p --output-format stream-json`'s NDJSON
 * stream — plus (#81) `notice`, which the runner emits about the build itself. See
 * `build/runner.ts`'s `parseStreamEvent` (server) for exactly which raw event shapes map to
 * which `kind` here. */
export const BuildStreamEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('init'), sessionId: z.string() }),
  z.object({ kind: z.literal('text'), text: z.string() }),
  z.object({ kind: z.literal('tool'), name: z.string(), target: z.string() }),
  z.object({ kind: z.literal('tool_result'), ok: z.boolean() }),
  z.object({
    kind: z.literal('result'),
    ok: z.boolean(),
    sessionId: z.string().optional(),
    summary: z.string().optional(),
    numTurns: z.number().optional(),
    costUsd: z.number().optional(),
  }),
  z.object({ kind: z.literal('raw'), text: z.string() }),
  // #81 item 7: the build saying something about ITSELF rather than relaying something Claude
  // said. A `notice` carries a code, never a sentence — the words live in `buildStreamLine`
  // below, so the card, the ribbon, the status line and the logbook cannot word it differently.
  z.object({ kind: z.literal('notice'), code: BuildNoticeCodeSchema }),
]);
export type BuildStreamEvent = z.infer<typeof BuildStreamEventSchema>;

/** `status.claude` on `/api/state` — Claude's one word on the status line (AMENDMENT-1 §4). */
export const ClaudeStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('idle') }),
  z.object({ state: z.literal('building'), id: z.string(), elapsed: z.number() }),
  z.object({ state: z.literal('built'), id: z.string(), files: z.array(z.string()), elapsed: z.number() }),
]);
export type ClaudeStatus = z.infer<typeof ClaudeStatusSchema>;

/**
 * #81 item 7: the three reasons a before/after diff is unavailable, in three sentences that a
 * reader can tell apart. Each says what happened AND what it costs, because the cost is the same
 * in all three and the cause is not: the build still ran, and the files it reports are whatever
 * Claude named itself on a `FILES:` line.
 *
 * Before this the git snapshot simply answered `null`, the runner read that as "no diff
 * information", and nothing reached the stream or the logbook at all — a build whose `git` was
 * wedged for fifteen seconds looked exactly like a build in a folder that is not a repo.
 */
export function buildNoticeLine(code: BuildNoticeCode): string {
  switch (code) {
    case 'git-timed-out':
      return 'git ran out of time and was stopped — no before/after diff for this build; the files listed are the ones Claude named itself';
    case 'git-not-found':
      return 'git is not on PATH — no before/after diff for this build; the files listed are the ones Claude named itself';
    case 'not-a-git-repo':
      return 'this folder is not a git working tree — no before/after diff for this build; the files listed are the ones Claude named itself';
    default:
      return '';
  }
}

/** One line of the stream, in words — shared by the prompt card, the Prompts tab's ribbon,
 * the status line's "latest step" and the logbook's Claude rows, so all four say the same
 * thing about the same event. */
export function buildStreamLine(event: BuildStreamEvent): string {
  switch (event.kind) {
    case 'init':
      return `starting claude -p · session ${event.sessionId}`;
    case 'text':
      return event.text;
    case 'tool':
      return `${event.name} · ${event.target}`;
    case 'tool_result':
      return event.ok ? 'tool ok' : 'tool failed';
    case 'result':
      return event.summary ?? (event.ok ? 'done' : 'failed');
    case 'raw':
      return event.text;
    case 'notice':
      return buildNoticeLine(event.code);
    default:
      return '';
  }
}
