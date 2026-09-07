import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JigMcpContext } from './types.js';

/**
 * The `implement-work-order` prompt (EXECUTION-PLAN.md §4 S6). Covers the whole ADR-001
 * pull loop the agent drives itself: read the work order, claim it, implement test-first on
 * its own branch, run the app's tests, report done.
 *
 * Retest defect 23 (2026-09-06 evening): "I stopped here. everything stopped doing what we
 * were expecting" — the original text assumed an agent that already knew Jig's tongue (bare
 * tool names, no fallback, no repo-root context, no guard for an order that isn't ready
 * yet). Rewritten to be self-contained for an agent that has NEVER seen Jig before: every
 * tool named explicitly, a fallback if resource reads aren't supported, where the repo root
 * actually is, and an explicit stop condition instead of barreling ahead on a `marked` or
 * `drafted` order.
 */

function promptText(id: string): string {
  return [
    `This work order lives in a Jig-clamped repo. The repo root is the CLAMPED folder — the one \`jigbench mcp\` was started against (its own \`--repo\` flag, or the folder it detected) — implement inside that repo, never elsewhere.`,
    ``,
    `1. Read the work order. Try reading the resource jig://work-orders/${id} first (both faces: the human face — what/why/where/acceptance — and, once released, the shop face — files/patterns/tests/brief). If your client does not support resource reads, or that fails, call the tool jig_work_order with { id: "${id}" } instead — same content, as a tool fallback.`,
    `2. Check its state. If the state is not "released" (e.g. still "marked" or "drafted" — nobody has released it to the shop yet), STOP here and tell the user the order is not released yet instead of proceeding.`,
    `3. Call the tool jig_claim with { id: "${id}" } — takes it: released -> in-the-shop.`,
    `4. Implement the SHOP FACE on a branch in the app repo (the same clamped repo root above). Test-first: write the failing test the shop face names, then the code that makes it pass.`,
    `5. Run the app's own tests.`,
    `6. When green, call the tool jig_report with { id: "${id}", summary, files } — files is every path you touched. This moves the ladder to trial-fit.`,
  ].join('\n');
}

export function registerJigPrompts(mcpServer: McpServer, _ctx: JigMcpContext): void {
  mcpServer.registerPrompt(
    'implement-work-order',
    {
      title: 'Implement a work order',
      description: 'Read a work order, claim it, implement the shop face test-first, report it done.',
      argsSchema: { id: z.string() },
    },
    async ({ id }) => ({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: promptText(id) },
        },
      ],
    }),
  );
}
