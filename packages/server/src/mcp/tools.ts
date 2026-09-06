import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JigMcpContext } from './types.js';

/** The nine `jig_*` tools (EXECUTION-PLAN.md §4 S6) — fleshed out in the "tools" slice.
 * Left as a deliberate no-op here so `createJigMcpServer`'s own wiring (identity, the shop
 * heartbeat) has something real to connect to and test before any tool exists. */
export function registerJigTools(_mcpServer: McpServer, _ctx: JigMcpContext): void {
  // Filled in by the next slice.
}
