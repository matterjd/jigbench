import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Implementation } from '@modelcontextprotocol/sdk/types.js';
import type { DocsIndex } from '@jigbench/core';
import type { JigStore } from '../store.js';
import type { OrdersService } from '../orders/service.js';
import type { FixtureStore } from '../fixtures/store.js';
import { logger } from '../logger.js';
import { ShopHeartbeat } from './heartbeat.js';
import { registerJigTools } from './tools.js';
import { registerJigResources } from './resources.js';
import { registerJigPrompts } from './prompts.js';
import type { JigMcpContext } from './types.js';

/**
 * `jigbench mcp` — the MCP stdio server (EXECUTION-PLAN.md §4 S6, ADR-001: the agent pulls,
 * Jig never pushes). This builds the `McpServer` and wires every tool/resource/prompt plus
 * the shop heartbeat; the CLI (`packages/cli/src/commands/mcp.ts`) owns the actual stdio
 * transport (and, in tests, an in-memory one) — nothing here assumes any particular
 * transport, which is what makes it testable with `InMemoryTransport`.
 */

export interface CreateJigMcpServerOptions {
  repoRoot: string;
  store: JigStore;
  orders: OrdersService;
  fixtures: FixtureStore;
  /** S2b docs retrieval — loads the `.jig/survey/docs.json` index fresh on every call.
   * Omitted (the default) means "nothing clamped" for every caller that hasn't wired S2b
   * lookups in yet. */
  docs?: () => Promise<DocsIndex | undefined>;
  /** A fallback identity for the shop heartbeat and tool-driven log notes, used only until
   * (or unless) the real MCP `initialize` handshake supplies the connecting client's own
   * name/version — see `formatClientLabel`. */
  clientName?: string;
}

const SERVER_NAME = 'jig';
const SERVER_VERSION = '0.1.0';
const DEFAULT_CLIENT_LABEL = 'an MCP client';

/** Pure — `getClientVersion()`'s shape (or `undefined` before/without a handshake) plus the
 * configured fallback, in with one rule: prefer the real client's own name (+ version, when
 * given), fall back only when the SDK hasn't reported one at all. */
export function formatClientLabel(clientInfo: Implementation | undefined, fallback: string): string {
  if (!clientInfo?.name) return fallback;
  return clientInfo.version ? `${clientInfo.name} ${clientInfo.version}` : clientInfo.name;
}

export function createJigMcpServer(options: CreateJigMcpServerOptions): McpServer {
  const mcpServer = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const heartbeat = new ShopHeartbeat(options.repoRoot);
  const fallbackLabel = options.clientName ?? DEFAULT_CLIENT_LABEL;

  const ctx: JigMcpContext = {
    repoRoot: options.repoRoot,
    store: options.store,
    orders: options.orders,
    fixtures: options.fixtures,
    loadDocsIndex: options.docs ?? (async () => undefined),
    clientLabel: () => formatClientLabel(mcpServer.server.getClientVersion(), fallbackLabel),
  };

  registerJigTools(mcpServer, ctx);
  registerJigResources(mcpServer, ctx);
  registerJigPrompts(mcpServer, ctx);

  // The shop heartbeat (deliverable 1's last paragraph): started once the client's
  // `initialize`/`initialized` handshake has fully completed (so `clientLabel()` already
  // has real client info to report), stopped the moment the transport closes — whichever
  // side closed it, client or server. Fire-and-forget: neither hook's own type is async.
  mcpServer.server.oninitialized = () => {
    heartbeat.start(ctx.clientLabel()).catch((err) => logger.warn('shop heartbeat failed to start', String(err)));
  };
  mcpServer.server.onclose = () => {
    heartbeat.stop().catch((err) => logger.warn('shop heartbeat failed to stop cleanly', String(err)));
  };

  return mcpServer;
}
