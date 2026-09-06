/** Pure logic for the `jigbench mcp install --claude-desktop` entry — no I/O here (same
 * split as `mcp-json.ts`/`commands/init.ts`): `commands/mcp-install.ts` does the actual file
 * read/write and prints the diff this module can describe.
 *
 * Unlike `.mcp.json`'s entry (which may omit `--repo` when Claude Code will cwd into the
 * directory holding `.mcp.json` itself), Claude Desktop has no cwd for a per-project server
 * — its entry ALWAYS carries `--repo <repoRootAbs>`, never optionally.
 */
import { homedir } from 'node:os';
import path from 'node:path';

export interface ClaudeDesktopConfigPathOptions {
  /** Override for testing — defaults to `process.platform`. */
  platform?: NodeJS.Platform;
  /** Override for testing — defaults to `os.homedir()`. */
  homedir?: string;
  /** Override for testing — defaults to `process.env.APPDATA` (Windows only). */
  appData?: string;
}

/** Locates `claude_desktop_config.json` for the current platform:
 * Windows — `%APPDATA%\Claude\claude_desktop_config.json`;
 * macOS — `~/Library/Application Support/Claude/claude_desktop_config.json`.
 * Any other platform (or Windows with no `APPDATA` in the environment, which should never
 * happen but is handled rather than crashing) returns `undefined` — an honest "no known
 * location", never a guess. */
export function claudeDesktopConfigPath(options: ClaudeDesktopConfigPathOptions = {}): string | undefined {
  const platform = options.platform ?? process.platform;
  // `path.win32`/`path.posix` explicitly, not the bare (host-OS-bound) `path` import — this
  // computes a WINDOWS-shaped or MACOS-shaped path based on `platform`, regardless of which
  // OS the CLI itself happens to be running on right now. That matters here specifically
  // because `platform` is an explicit branch selector for testability; the real CLI only
  // ever calls this with the actual `process.platform` it's running under, where the two
  // would agree anyway.
  if (platform === 'win32') {
    const appData = 'appData' in options ? options.appData : process.env.APPDATA;
    if (!appData) return undefined;
    return path.win32.join(appData, 'Claude', 'claude_desktop_config.json');
  }
  if (platform === 'darwin') {
    const home = options.homedir ?? homedir();
    return path.posix.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  return undefined;
}

export interface ClaudeDesktopMergeResult {
  merged: Record<string, unknown>;
  changed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Merges the `jig` MCP server entry into whatever `claude_desktop_config.json` already
 * contains. Every other key — including other `mcpServers` entries — passes through
 * untouched, the same "never overwrite the rest of the file" contract `mergeMcpJson` has. */
export function mergeClaudeDesktopConfig(existing: unknown, repoRootAbs: string): ClaudeDesktopMergeResult {
  const base = isRecord(existing) ? existing : {};
  const existingServers = isRecord(base.mcpServers) ? base.mcpServers : {};
  const entry = { command: 'npx', args: ['jigbench', 'mcp', '--repo', repoRootAbs] };
  const alreadyPresent = JSON.stringify(existingServers.jig) === JSON.stringify(entry);

  const merged: Record<string, unknown> = {
    ...base,
    mcpServers: { ...existingServers, jig: entry },
  };

  return { merged, changed: !alreadyPresent };
}

/** A human-readable before/after — "print the unified diff first" per the install command's
 * contract, before anything is ever written. */
export function formatClaudeDesktopConfigDiff(existing: unknown, merged: Record<string, unknown>): string {
  const before = existing === undefined ? '(no claude_desktop_config.json yet)' : JSON.stringify(existing, null, 2);
  const after = JSON.stringify(merged, null, 2);
  return `--- claude_desktop_config.json (before)\n${before}\n\n+++ claude_desktop_config.json (after)\n${after}`;
}
