import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { jigPaths } from '@jigbench/core';
import { FixtureStore, JigStore, OrdersService, createJigMcpServer, initJigTree, logger, runSurvey } from '@jigbench/server';
import { resolveRepoRoot } from '../repo-root.js';

// NEVER import '../human-output.js' from this file, or from anything it imports. `mcp`
// speaks JSON-RPC on stdout — nothing else may ever write there (`no-stdout.test.ts`
// enforces both halves of that rule: no console.log/process.stdout.write anywhere under
// packages/server/src or packages/cli/src except human-output.ts itself, and this file's
// own import graph never reaches it).

export interface McpCommandOptions {
  repo?: string;
  /** Test-only override hooks for the stdio transport's underlying streams — omitted (the
   * real CLI's every path) defaults to `process.stdin`/`process.stdout`. Injecting
   * `PassThrough` streams lets a test drive a full JSON-RPC round trip without spawning a
   * real child process. */
  stdin?: Readable;
  stdout?: Writable;
}

/**
 * `jigbench mcp` — the real stdio MCP server (S6; replaces S1's stub, which only logged
 * "MCP arrives in S6" and exited 0 without ever implementing MCP).
 *
 * Resolves the repo, ensures the `.jig/` skeleton exists, runs the survey ONLY if
 * `.jig/survey/survey.json` is missing (an existing survey — even a stub one written
 * earlier by `jigbench survey`/`jigbench` itself — is never silently re-run and
 * overwritten), then connects the MCP server to stdio. The returned promise resolves once
 * the transport closes — the agent that launched this process closing its end of the pipe
 * (or otherwise ending the connection) is a clean, expected shutdown, never a crash.
 */
export async function runMcpCommand(options: McpCommandOptions): Promise<void> {
  const repoRoot = resolveRepoRoot(options.repo);
  await initJigTree(repoRoot);

  const surveyFile = join(jigPaths(repoRoot).survey, 'survey.json');
  if (!existsSync(surveyFile)) {
    logger.info('no survey found yet — running one now', { repoRoot });
    await runSurvey(repoRoot);
  }

  const store = new JigStore(repoRoot);
  await store.init();
  const orders = new OrdersService({ store });
  const fixtures = new FixtureStore(repoRoot, store);
  await fixtures.init();

  const mcpServer = createJigMcpServer({ repoRoot, store, orders, fixtures });

  const stdin = options.stdin ?? process.stdin;
  const transport = new StdioServerTransport(stdin, options.stdout);
  await mcpServer.connect(transport);
  logger.info('jig mcp server connected over stdio', { repoRoot });

  // `StdioServerTransport` itself never listens for its stdin ending — by design, it leaves
  // "when is this connection over" to the caller. A real agent closing its end of the pipe
  // (or a test ending its injected stream) means exactly that, so wire it here rather than
  // hanging forever with nothing left reading stdin.
  stdin.once('end', () => {
    mcpServer.close().catch((err: unknown) => logger.warn('error while closing the mcp server', String(err)));
  });

  await new Promise<void>((resolve) => {
    const priorOnClose = mcpServer.server.onclose;
    mcpServer.server.onclose = () => {
      // `priorOnClose` (server.ts's handler) now returns the shop heartbeat's own stop()
      // promise — awaiting it here (rather than firing and forgetting, as before) means this
      // command's returned promise doesn't resolve until the heartbeat file is actually gone,
      // so nothing downstream (a test's temp-dir cleanup, an agent re-launching `jigbench mcp`
      // right after) can still see it or race its delete. `Promise.resolve` tolerates the
      // `void`-typed case too, when `priorOnClose` is undefined.
      Promise.resolve(priorOnClose?.()).finally(resolve);
    };
  });
  logger.info('jig mcp server closed', { repoRoot });
}
