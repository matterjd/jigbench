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

/** One compact, already-parsed event out of `claude -p --output-format stream-json`'s NDJSON
 * stream — see `build/runner.ts`'s `parseStreamEvent` (server) for exactly which raw event
 * shapes map to which `kind` here. */
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
]);
export type BuildStreamEvent = z.infer<typeof BuildStreamEventSchema>;

/** `status.claude` on `/api/state` — Claude's one word on the status line (AMENDMENT-1 §4). */
export const ClaudeStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('idle') }),
  z.object({ state: z.literal('building'), id: z.string(), elapsed: z.number() }),
  z.object({ state: z.literal('built'), id: z.string(), files: z.array(z.string()), elapsed: z.number() }),
]);
export type ClaudeStatus = z.infer<typeof ClaudeStatusSchema>;

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
    default:
      return '';
  }
}
