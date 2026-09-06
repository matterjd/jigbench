import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JigMcpContext } from './types.js';

/**
 * The `implement-work-order` prompt (EXECUTION-PLAN.md §4 S6). One message, terse, in Jig's
 * tongue (docs/design/COMMISSION.md §3: the shop = connected agents; the ladder; the shop
 * face) — covers the whole ADR-001 pull loop the agent drives itself: read the resource,
 * claim, implement test-first on its own branch, run the app's tests, report done.
 */

function promptText(id: string): string {
  return [
    `Read jig://work-orders/${id} — the work order. Both faces: the human face (what/why/where/acceptance) and, once released, the shop face (files/patterns/tests/brief).`,
    `Call jig_claim with { id: "${id}" } — takes it: released -> in-the-shop.`,
    'Implement the SHOP FACE on a branch in the app repo. Test-first: the failing test the shop face names, then the code that passes it.',
    "Run the app's own tests.",
    `When green, call jig_report with { id: "${id}", summary, files } — files is every path touched. Moves the ladder to trial-fit.`,
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
