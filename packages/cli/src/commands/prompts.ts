import { PromptStore } from '@jigbench/server';
import type { Prompt } from '@jigbench/core';
import { resolveRepoRoot } from '../repo-root.js';

/** `jigbench prompts` (S11 brief: "list"). Read-only — lists what's under `.jig/prompts/`,
 * including whatever `PromptStore.init()`'s one-time work-order migration just produced. */

export interface PromptsCommandOptions {
  repo?: string;
}

export interface PromptsCommandResult {
  message: string;
  prompts: Prompt[];
}

function formatLine(prompt: Prompt): string {
  const requirementLine = prompt.requirement.split('\n')[0] ?? '';
  const short = requirementLine.length > 60 ? `${requirementLine.slice(0, 57)}...` : requirementLine;
  return `${prompt.id}  ${prompt.state.padEnd(8)}  ${short}`;
}

export async function runPromptsCommand(options: PromptsCommandOptions): Promise<PromptsCommandResult> {
  const repoRoot = resolveRepoRoot(options.repo);
  const store = new PromptStore(repoRoot);
  await store.init();

  const prompts = store.list();
  const message =
    prompts.length === 0
      ? 'No prompts yet — .jig/prompts/ is empty.'
      : prompts.map(formatLine).join('\n');

  return { message, prompts };
}
