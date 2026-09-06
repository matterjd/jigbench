import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { DocsIndexSchema, jigPaths, type DocsIndex } from '@jigbench/core';
import type { JigStore } from '../store.js';
import type { OrdersService } from '../orders/service.js';
import type { FixtureStore } from '../fixtures/store.js';
import { pathExists } from '../fs-util.js';
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

/** `JIG_HEARTBEAT_MS` — test-only override for the shop heartbeat's refresh interval
 * (`ShopHeartbeat`'s own default is `SHOP_HEARTBEAT_REFRESH_MS`, ~10s). Exists so
 * `scripts/stdout-guard.sh`'s red control (wave-4 council finding 1) can run the heartbeat
 * fast enough (e.g. `JIG_HEARTBEAT_MS=50`) to prove a stray write from its tick would be
 * caught by the guard within a short-lived process, without slowing down the real default.
 * Absent, empty, non-numeric, or non-positive all fall through to `ShopHeartbeat`'s own
 * default — this never widens what a malformed env value can do. */
export function heartbeatRefreshMsFromEnv(env: NodeJS.ProcessEnv = process.env): number | undefined {
  const raw = env.JIG_HEARTBEAT_MS;
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Pure — `getClientVersion()`'s shape (or `undefined` before/without a handshake) plus the
 * configured fallback, in with one rule: prefer the real client's own name (+ version, when
 * given), fall back only when the SDK hasn't reported one at all. */
export function formatClientLabel(clientInfo: Implementation | undefined, fallback: string): string {
  if (!clientInfo?.name) return fallback;
  return clientInfo.version ? `${clientInfo.name} ${clientInfo.version}` : clientInfo.name;
}

/** The default `docs` loader when a caller doesn't supply its own — reads
 * `.jig/survey/docs.json` fresh on every call, same shape as `orders/service.ts`'s own
 * private `loadDocsIndex` and `docs/route.ts`'s `loadDocsIndex` (each package boundary
 * keeps its own copy of this small read; there is no I/O-free place to share it from
 * without server importing core AND doing disk reads, which core deliberately never does). */
async function loadDocsIndexFromRepo(repoRoot: string): Promise<DocsIndex | undefined> {
  const file = join(jigPaths(repoRoot).survey, 'docs.json');
  if (!(await pathExists(file))) return undefined;
  try {
    return DocsIndexSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  } catch (err) {
    logger.warn('docs.json failed to parse; jig_docs will report an empty index', String(err));
    return undefined;
  }
}

export function createJigMcpServer(options: CreateJigMcpServerOptions): McpServer {
  const mcpServer = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const heartbeat = new ShopHeartbeat(options.repoRoot, heartbeatRefreshMsFromEnv());
  const fallbackLabel = options.clientName ?? DEFAULT_CLIENT_LABEL;

  const ctx: JigMcpContext = {
    repoRoot: options.repoRoot,
    store: options.store,
    orders: options.orders,
    fixtures: options.fixtures,
    loadDocsIndex: options.docs ?? (() => loadDocsIndexFromRepo(options.repoRoot)),
    clientLabel: () => formatClientLabel(mcpServer.server.getClientVersion(), fallbackLabel),
  };

  registerJigTools(mcpServer, ctx);
  registerJigResources(mcpServer, ctx);
  registerJigPrompts(mcpServer, ctx);

  // The shop heartbeat (deliverable 1's last paragraph): started once the client's
  // `initialize`/`initialized` handshake has fully completed (so `clientLabel()` already
  // has real client info to report), stopped the moment the transport closes — whichever
  // side closed it, client or server. Neither hook's own type is async (the SDK calls both
  // synchronously and never awaits a return value), so `start()` stays intentionally
  // fire-and-forget. `onclose` DOES return its settled promise, though — not because the SDK
  // awaits it (it doesn't), but so a caller that owns the transport lifecycle (`mcp.ts`'s
  // own onclose wrapper) can chain onto it and know the heartbeat file is actually gone
  // (`stop()`'s `rm()`) before treating the shutdown as complete. `.catch` means this promise
  // itself never rejects, so chaining onto it is always safe.
  mcpServer.server.oninitialized = () => {
    heartbeat.start(ctx.clientLabel()).catch((err) => logger.warn('shop heartbeat failed to start', String(err)));
  };
  mcpServer.server.onclose = () => heartbeat.stop().catch((err) => logger.warn('shop heartbeat failed to stop cleanly', String(err)));

  return mcpServer;
}
