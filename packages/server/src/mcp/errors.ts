import { ZodError } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { OrderConflictError, OrderNotFoundError } from '../orders/errors.js';

/**
 * S6 acceptance (EXECUTION-PLAN.md §4 S6): "illegal transitions return an MCP tool error
 * (isError) with the ladder rule in words, never a crash." Every tool handler in `tools.ts`
 * catches whatever it threw and runs it through `describeToolError` before wrapping it with
 * `toolErrorResult` — nothing in this file ever throws itself.
 */

export function toolErrorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** `OrderNotFoundError`/`OrderConflictError` already phrase their message as the ladder
 * rule in words (`orders/errors.ts`) — passed through verbatim. A `ZodError` (an agent's
 * `jig_draft` input failing `WorkOrderHumanSchema`) is flattened into one readable line per
 * bad field. Anything else falls back to the thrown value's own `message`, or its string
 * form when it isn't even an `Error` — this never throws, which is the whole point. */
export function describeToolError(err: unknown): string {
  if (err instanceof OrderNotFoundError || err instanceof OrderConflictError) return err.message;
  if (err instanceof ZodError) {
    const fields = err.issues.map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`);
    return `invalid input — ${fields.join('; ')}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
