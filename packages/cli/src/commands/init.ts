import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { initJigTree } from '@jigbench/server';
import { resolveRepoRoot } from '../repo-root.js';
import { formatMcpJsonDiff, mergeMcpJson } from '../mcp-json.js';
import { ensureGitignoreEntry } from '../gitignore.js';
import { printHuman } from '../human-output.js';

export interface InitCommandOptions {
  repo?: string;
}

export interface InitCommandResult {
  message: string;
}

async function readJsonIfPresent(path: string): Promise<unknown> {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return undefined;
  }
}

/** `jigbench init`: writes the `.jig/` skeleton, merges the `jig` entry into `.mcp.json`
 * (printing the diff before writing — never overwrites the rest of the file), and appends
 * `.jig/cache/` to `.gitignore` if it is not already covered. */
export async function runInitCommand(options: InitCommandOptions): Promise<InitCommandResult> {
  const repoRoot = resolveRepoRoot(options.repo);
  const { createdDirs } = await initJigTree(repoRoot);

  const mcpJsonPath = join(repoRoot, '.mcp.json');
  const existingMcpJson = await readJsonIfPresent(mcpJsonPath);
  const { merged, changed: mcpChanged } = mergeMcpJson(existingMcpJson);
  if (mcpChanged) {
    printHuman(formatMcpJsonDiff(existingMcpJson, merged));
    await writeFile(mcpJsonPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  }

  const gitignorePath = join(repoRoot, '.gitignore');
  const existingGitignore = existsSync(gitignorePath) ? await readFile(gitignorePath, 'utf8') : undefined;
  const { updated, changed: gitignoreChanged } = ensureGitignoreEntry(existingGitignore, '.jig/cache/');
  if (gitignoreChanged) {
    await writeFile(gitignorePath, updated, 'utf8');
  }

  const lines = [
    `Clamped: ${repoRoot}`,
    createdDirs.length > 0
      ? `Created: ${createdDirs.join(', ')}`
      : 'The .jig/ tree already existed — nothing to create.',
    mcpChanged ? '.mcp.json: added the "jig" MCP server entry.' : '.mcp.json: already up to date.',
    gitignoreChanged
      ? '.gitignore: appended .jig/cache/.'
      : '.gitignore: .jig/cache/ was already covered.',
  ];

  return { message: lines.join('\n') };
}
