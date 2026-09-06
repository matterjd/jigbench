import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { OrderConflictError, OrderNotFoundError } from '../orders/errors.js';
import { describeToolError, toolErrorResult } from './errors.js';

/**
 * S6 acceptance: "illegal transitions return an MCP tool error (isError) with the ladder
 * rule in words, never a crash." `describeToolError` turns whatever a tool handler caught
 * into that human-readable message; `toolErrorResult` wraps it into the `CallToolResult`
 * shape the SDK expects (isError: true, never a thrown protocol-level error).
 */

describe('toolErrorResult', () => {
  it('produces an isError CallToolResult carrying the message as text content', () => {
    const result = toolErrorResult('work order 0001 is drafted, not marked — cannot draft');
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'work order 0001 is drafted, not marked — cannot draft' }]);
  });
});

describe('describeToolError', () => {
  it('passes an OrderNotFoundError message through verbatim', () => {
    expect(describeToolError(new OrderNotFoundError('0042'))).toBe('no such work order: 0042');
  });

  it('passes an OrderConflictError message through verbatim (already phrased as the ladder rule)', () => {
    expect(describeToolError(new OrderConflictError('work order 0001 is drafted, not marked — cannot draft'))).toBe(
      'work order 0001 is drafted, not marked — cannot draft',
    );
  });

  it('formats a ZodError into a readable per-field message', () => {
    const schema = z.object({ what: z.string(), acceptance: z.array(z.string()) });
    const result = schema.safeParse({ what: 1, acceptance: 'nope' });
    expect(result.success).toBe(false);
    const message = describeToolError(result.error);
    expect(message).toContain('invalid input');
    expect(message).toContain('what');
    expect(message).toContain('acceptance');
  });

  it('falls back to a plain Error\'s own message', () => {
    expect(describeToolError(new Error('boom'))).toBe('boom');
  });

  it('never throws on a non-Error thrown value', () => {
    expect(describeToolError('a raw string throw')).toBe('a raw string throw');
    expect(describeToolError(undefined)).toBe('undefined');
  });
});
