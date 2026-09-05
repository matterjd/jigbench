import { logger } from '@jigbench/server';
import { resolveRepoRoot } from '../repo-root.js';

// NEVER import '../human-output.js' from this file, or from anything it imports. `mcp`
// speaks JSON-RPC on stdout starting in S6; in S1 it speaks nothing at all on stdout, on
// purpose, so the guard (scripts/stdout-guard.sh) has something real to prove.

export interface McpCommandOptions {
  repo?: string;
}

/** `jigbench mcp`. S1 doesn't implement the MCP server yet (that's S6) — it starts, writes
 * nothing to stdout, logs why to stderr, and exits 0. This is the exact surface
 * `scripts/stdout-guard.sh` protects. */
export async function runMcpCommand(options: McpCommandOptions): Promise<void> {
  const repoRoot = resolveRepoRoot(options.repo);
  logger.info('MCP arrives in S6', { repoRoot });
  process.exitCode = 0;
}
