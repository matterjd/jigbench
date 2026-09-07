/**
 * S17a's own copy of pure Claude-Desktop-config-merge logic — see `mcp-json.ts`'s module doc
 * for why this is a separate copy from `packages/cli/src/claude-desktop-config.ts` rather than
 * an import (the dependency direction only runs `cli` -> `server`).
 */
import { homedir } from 'node:os';
import path from 'node:path';

export interface ClaudeDesktopConfigPathOptions {
  platform?: NodeJS.Platform;
  homedir?: string;
  appData?: string;
}

/** Windows — `%APPDATA%\Claude\claude_desktop_config.json`; macOS — `~/Library/Application
 * Support/Claude/claude_desktop_config.json`. Anything else (or Windows with no `APPDATA`)
 * returns `undefined` — an honest "no known location", never a guess. */
export function claudeDesktopConfigPath(options: ClaudeDesktopConfigPathOptions = {}): string | undefined {
  const platform = options.platform ?? process.platform;
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
 * contains. Every other key passes through untouched — the entry always carries an explicit
 * `--repo` (Claude Desktop has no cwd for a per-project server). */
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

/** A human-readable before/after — returned in `POST /api/setup/desktop`'s response body. */
export function formatClaudeDesktopConfigDiff(existing: unknown, merged: Record<string, unknown>): string {
  const before = existing === undefined ? '(no claude_desktop_config.json yet)' : JSON.stringify(existing, null, 2);
  const after = JSON.stringify(merged, null, 2);
  return `--- claude_desktop_config.json (before)\n${before}\n\n+++ claude_desktop_config.json (after)\n${after}`;
}
