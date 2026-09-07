import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
// #10: the same three functions `POST /api/setup/desktop` uses (packages/server/src/setup/).
import { claudeDesktopConfigPath, formatClaudeDesktopConfigDiff, mergeClaudeDesktopConfig } from '@jigbench/server';
import { resolveRepoRoot } from '../repo-root.js';

/**
 * `jigbench mcp install --claude-desktop [--yes]` (EXECUTION-PLAN.md §4 S6): a SEPARATE
 * command module from `mcp.ts` on purpose — this one is allowed to print to a human (it
 * never speaks stdio MCP itself), and `mcp.ts`'s own stdout-purity guard
 * (`no-stdout.test.ts`) checks that file's import graph specifically, so keeping this out of
 * it means that check never needs to special-case "except when it's the install subcommand".
 */

export interface McpInstallCommandOptions {
  repo?: string;
  /** Write the merged config; omitted (the default) only ever prints the diff. */
  yes?: boolean;
  /** Test-only override — bypasses the real `claudeDesktopConfigPath()` lookup entirely. */
  configPath?: string;
  /** Test-only override, forwarded to `claudeDesktopConfigPath()` when `configPath` isn't
   * given directly. */
  platform?: NodeJS.Platform;
}

export interface McpInstallCommandResult {
  message: string;
  wrote: boolean;
}

async function readExistingConfig(configPath: string): Promise<unknown> {
  if (!existsSync(configPath)) return undefined;
  try {
    return JSON.parse(await readFile(configPath, 'utf8'));
  } catch {
    // A corrupt file is treated as absent — the diff below then shows a fresh shape, and
    // writing proceeds the same as a first-ever install. Never crashes on bad JSON.
    return undefined;
  }
}

export async function runMcpInstallCommand(options: McpInstallCommandOptions): Promise<McpInstallCommandResult> {
  const repoRoot = resolveRepoRoot(options.repo);
  const configPath = options.configPath ?? claudeDesktopConfigPath({ platform: options.platform });

  if (!configPath || !existsSync(dirname(configPath))) {
    return {
      message: 'claude_desktop_config.json location not found — is Claude Desktop installed?',
      wrote: false,
    };
  }

  const existing = await readExistingConfig(configPath);
  const { merged, changed } = mergeClaudeDesktopConfig(existing, repoRoot);
  const diff = formatClaudeDesktopConfigDiff(existing, merged);

  if (!changed) {
    return { message: `${diff}\n\nAlready up to date — nothing to write.`, wrote: false };
  }
  if (!options.yes) {
    return { message: `${diff}\n\nRun again with --yes to write this.`, wrote: false };
  }

  await writeFile(configPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  return { message: `${diff}\n\nWrote ${configPath}.`, wrote: true };
}
