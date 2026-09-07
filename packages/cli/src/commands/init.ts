import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ensureGitignoreEntry, formatMcpJsonDiff, initJigTree, mergeMcpJson } from '@jigbench/server';
import { resolveRepoRoot } from '../repo-root.js';
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
  // Retest defect 22 (2026-09-06 evening): this USED to omit `--repo` whenever cwd already
  // equaled repoRoot, relying on whatever spawns `npx jigbench mcp` later (Claude Code) to
  // cwd into the directory holding this very `.mcp.json` and re-detect the same root on its
  // own. That re-detection breaks the instant this directory has no `.git` of its own — a
  // subfolder of a bigger repo, e.g. `examples/ledger-angular` inside the jigbench monorepo —
  // because the later process walks past it to the outer `.git` (or, before repo-root.ts's
  // own fix, ignored a `.jig/` it should have preferred). `--repo <clamped path>` is now
  // ALWAYS baked into the entry so the served root never depends on cwd-based re-detection
  // at all — the same unconditional guarantee `claude-desktop-config.ts` already gives its
  // entry, for the same reason (no cwd to rely on there either).
  // #10: the same `mergeMcpJson` `POST /api/setup/mcp` uses (packages/server/src/setup/) —
  // one definition of the entry, whichever door wrote it.
  const { merged, changed: mcpChanged } = mergeMcpJson(existingMcpJson, repoRoot);
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
