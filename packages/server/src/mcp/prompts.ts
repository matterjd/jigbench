import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JigMcpContext } from './types.js';

/** The `implement-work-order` prompt (EXECUTION-PLAN.md §4 S6) — fleshed out in the
 * "resources + prompt" slice. A deliberate no-op until then, same reasoning as `tools.ts`. */
export function registerJigPrompts(_mcpServer: McpServer, _ctx: JigMcpContext): void {
  // Filled in by the "resources + prompt" slice.
}
