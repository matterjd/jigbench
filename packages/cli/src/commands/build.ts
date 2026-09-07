import {
  BuildRunner,
  PromptService,
  PromptStore,
  initJigTree,
  logger,
  type BuildStreamEvent,
} from '@jigbench/server';
import { resolveRepoRoot } from '../repo-root.js';

/**
 * `jigbench build <id>` (S11 brief: "headless: runs the runner, prints the event stream to
 * stderr, exit code = Claude's"). Never touches stdout — every line goes through `logger`
 * (stderr), same discipline `commands/mcp.ts` documents for its own reasons. `survey`/
 * `gauges` are trivial fallbacks: `PromptService.build()` never reads either (only
 * `ready()`/`polish()` do, and this command never calls them — it operates on an already-
 * `ready` prompt), mirroring the same reasoning `mcp/prompt-tools.ts` documents.
 */

export interface BuildCommandOptions {
  repo?: string;
  id: string;
  /** Test-only override — same shape as `CreateJigServerOptions.claude` (packages/server/src/
   * http.ts). The real `bin.ts` entry point never sets this. */
  claude?: { command?: string; commandArgsPrefix?: string[] };
}

export interface BuildCommandResult {
  exitCode: number;
}

function formatEvent(event: BuildStreamEvent): string {
  switch (event.kind) {
    case 'init':
      return `session ${event.sessionId} started`;
    case 'text':
      return event.text;
    case 'tool':
      return `-> ${event.name}${event.target ? `: ${event.target}` : ''}`;
    case 'tool_result':
      return event.ok ? '<- ok' : '<- failed';
    case 'result':
      return [
        `result: ${event.ok ? 'success' : 'failure'}`,
        event.numTurns !== undefined ? `${event.numTurns} turns` : undefined,
        event.costUsd !== undefined ? `$${event.costUsd.toFixed(4)}` : undefined,
      ]
        .filter(Boolean)
        .join(' — ');
    case 'raw':
      return event.text;
  }
}

export async function runBuildCommand(options: BuildCommandOptions): Promise<BuildCommandResult> {
  const repoRoot = resolveRepoRoot(options.repo);
  await initJigTree(repoRoot);

  const store = new PromptStore(repoRoot);
  await store.init();

  const runner = new BuildRunner({ repoRoot, ...options.claude });
  const service = new PromptService({
    store,
    survey: () => ({ jigFormat: 1, stack: [], components: [], routes: [], endpoints: [], schemas: [], docs: [], generatedAt: new Date().toISOString(), stub: true }),
    gauges: () => ({ jigFormat: 1, gauges: [], generatedAt: new Date().toISOString() }),
    runner,
    onBuildEvent: (_id, event, elapsedMs) => {
      logger.info(`[${(elapsedMs / 1000).toFixed(1)}s] ${formatEvent(event)}`);
    },
  });

  try {
    const { buildId } = await service.build(options.id);
    logger.info(`build ${buildId} started for prompt ${options.id}`);
  } catch (err) {
    logger.error('jigbench build failed to start', err instanceof Error ? err.message : String(err));
    return { exitCode: 1 };
  }

  await service.close(); // waits for the background build to actually land

  const finalPrompt = service.get(options.id);
  const lastBuild = finalPrompt?.builds[finalPrompt.builds.length - 1];
  logger.info(`prompt ${options.id} is now ${finalPrompt?.state ?? 'unknown'}`);
  return { exitCode: lastBuild?.exitCode ?? 1 };
}
