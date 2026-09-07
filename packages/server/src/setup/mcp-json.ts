/**
 * S17a's own copy of pure `.mcp.json`-merge logic — deliberately NOT imported from
 * `packages/cli/src/mcp-json.ts`: `server` is a dependency OF `cli` (`jigbench`), never the
 * reverse, so this direction is the only one that compiles. The server-side entry always
 * carries an EXPLICIT `--repo` (there is no terminal cwd to omit it in favour of, the way
 * the CLI's own `init.ts` sometimes can) — this is intentionally the simpler of the two
 * variants. `setup/route.ts` is the only caller; `commands/init.ts`'s own copy is left as is
 * (out of this slice's file scope — see the worker report's disclosed scope note).
 */

export interface McpJsonMergeResult {
  merged: Record<string, unknown>;
  changed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

function jigEntry(repoRoot: string): { command: string; args: string[] } {
  return { command: 'npx', args: ['jigbench', 'mcp', '--repo', toPosix(repoRoot)] };
}

/** Merges the `jig` MCP server entry (with an explicit `--repo <repoRoot>`) into whatever
 * `.mcp.json` already contains. Every other key — including other `mcpServers` entries —
 * passes through untouched. */
export function mergeMcpJson(existing: unknown, repoRoot: string): McpJsonMergeResult {
  const base = isRecord(existing) ? existing : {};
  const existingServers = isRecord(base.mcpServers) ? base.mcpServers : {};
  const entry = jigEntry(repoRoot);
  const alreadyPresent = JSON.stringify(existingServers.jig) === JSON.stringify(entry);

  const merged: Record<string, unknown> = {
    ...base,
    mcpServers: { ...existingServers, jig: entry },
  };

  return { merged, changed: !alreadyPresent };
}

/** A human-readable before/after — `POST /api/setup/mcp` returns this in its response body so
 * the bench can show it before the human presses "apply". */
export function formatMcpJsonDiff(existing: unknown, merged: Record<string, unknown>): string {
  const before = existing === undefined ? '(no .mcp.json yet)' : JSON.stringify(existing, null, 2);
  const after = JSON.stringify(merged, null, 2);
  return `--- .mcp.json (before)\n${before}\n\n+++ .mcp.json (after)\n${after}`;
}
