import type { DocsIndex } from '@jigbench/core';
import type { JigStore } from '../store.js';
import type { OrdersService } from '../orders/service.js';
import type { FixtureStore } from '../fixtures/store.js';

/**
 * The shared context every tool/resource/prompt handler reads from — one instance per
 * `createJigMcpServer` call (one MCP process, one clamped repo). Nothing here owns I/O of
 * its own; it just points at the same `JigStore`/`OrdersService`/`FixtureStore` the CLI
 * constructed, so every mutation goes through the exact file paths the bench server also
 * uses (EXECUTION-PLAN.md §4 S6, deliverable 1's last line).
 */
export interface JigMcpContext {
  repoRoot: string;
  store: JigStore;
  orders: OrdersService;
  fixtures: FixtureStore;
  /** The S2b docs index, loaded fresh on every call (mirrors `orders/service.ts`'s own
   * `loadDocsIndex`) — resolves `undefined` when nothing has been clamped yet. Defaulted to
   * an always-`undefined` loader by `createJigMcpServer` when the caller omits `docs`. */
  loadDocsIndex: () => Promise<DocsIndex | undefined>;
  /** The best label for "who is on the other end of this connection" right now — the real
   * MCP `initialize` handshake's client name/version once available, falling back to the
   * `clientName` constructor option (or a last-resort default) before that. Used for the
   * shop heartbeat's `client` field and as the actor note on tool-driven ladder moves
   * (`jig_draft`/`jig_claim`). */
  clientLabel: () => string;
}
