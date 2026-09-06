/** Pure logic for merging Jig's entry into a repo's `.mcp.json` — no I/O here, so it is
 * trivially testable. `commands/init.ts` does the actual file read/write and prints the
 * diff this module can describe. */

export const JIG_MCP_ENTRY = { command: 'npx', args: ['jigbench', 'mcp'] } as const;

export interface McpJsonMergeResult {
  merged: Record<string, unknown>;
  changed: boolean;
}

export interface MergeMcpJsonOptions {
  /** S6: "add --repo when init is run from outside the repo root"
   * (`repo-root.ts`'s `isOutsideRepoRoot` is the caller-side decision) — when given, the
   * entry's args carry `--repo <repoRoot>` so `npx jigbench mcp` still finds the right repo
   * even if whatever spawns it later doesn't cwd into the directory holding `.mcp.json`.
   * Omitted (the default): the plain `JIG_MCP_ENTRY`, unchanged from before S6. */
  repoRoot?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jigEntry(options: MergeMcpJsonOptions): { command: string; args: string[] } {
  if (!options.repoRoot) return { command: JIG_MCP_ENTRY.command, args: [...JIG_MCP_ENTRY.args] };
  return { command: 'npx', args: ['jigbench', 'mcp', '--repo', options.repoRoot] };
}

/** Merges the `jig` MCP server entry into whatever `.mcp.json` already contains. Every
 * other key — including other `mcpServers` entries — passes through untouched. */
export function mergeMcpJson(existing: unknown, options: MergeMcpJsonOptions = {}): McpJsonMergeResult {
  const base = isRecord(existing) ? existing : {};
  const existingServers = isRecord(base.mcpServers) ? base.mcpServers : {};
  const entry = jigEntry(options);
  const alreadyPresent = JSON.stringify(existingServers.jig) === JSON.stringify(entry);

  const merged: Record<string, unknown> = {
    ...base,
    mcpServers: { ...existingServers, jig: entry },
  };

  return { merged, changed: !alreadyPresent };
}

/** A human-readable before/after, printed to the terminal before the file is written —
 * "shows the diff first" per the init command's contract. */
export function formatMcpJsonDiff(existing: unknown, merged: Record<string, unknown>): string {
  const before = existing === undefined ? '(no .mcp.json yet)' : JSON.stringify(existing, null, 2);
  const after = JSON.stringify(merged, null, 2);
  return `--- .mcp.json (before)\n${before}\n\n+++ .mcp.json (after)\n${after}`;
}
