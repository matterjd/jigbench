import { join } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { PromptStateSchema, jigPaths, stubSurvey, type Prompt } from '@jigbench/core';
import { describeToolError, toolErrorResult } from './errors.js';
import { PromptStore } from '../prompts/store.js';
import { logger } from '../logger.js';
import { PromptService } from '../prompts/service.js';
import type { BuildRunnerLike, ClaudeStatus } from '../build/types.js';

/**
 * S11 MCP aliases (AMENDMENT-1 §5 row S11: "MCP tools renamed (`jig_prompts`, `jig_prompt`,
 * `jig_mark_built`) with the old names kept as aliases over the migrated data"). Registered
 * from `mcp/server.ts` by a single call (`registerPromptTools(mcpServer, { repoRoot })`) —
 * the old `jig_work_orders`/`jig_work_order` tools in `tools.ts` need NO change at all to
 * keep working: `PromptStore`'s migration (S11) only ever WRITES `.jig/prompts/`, it never
 * touches or removes `.jig/work-orders/`, so those tools keep reading exactly the files they
 * always did.
 *
 * Deliberately self-sufficient — this module builds its OWN `PromptStore`/`PromptService`
 * from `repoRoot` rather than sharing `mcp/server.ts`'s `JigStore`/`OrdersService` (which
 * would mean editing `CreateJigMcpServerOptions`, `JigMcpContext`, and every call site that
 * builds one — all inside the locked `mcp/*` surface two other workers are editing this
 * slice). The `mcp` command is already its OWN process, separate from `jigbench serve`'s
 * (`packages/cli/src/commands/mcp.ts` constructs its own `JigStore` for exactly this reason)
 * — a second `PromptStore` instance here, reading/writing the same `.jig/prompts/` files, is
 * the same shape that relationship already has.
 *
 * None of the three tools below ever call `PromptService.ready()`/`polish()`/`build()` (which
 * are the only methods that touch survey/gauges/the build runner) — the trivial fallbacks
 * passed to its constructor are never exercised, only present because the type asks for them.
 */

export interface JigPromptMcpContext {
  repoRoot: string;
  /** Test-only override — inject an already-constructed `PromptService` (e.g. one sharing a
   * temp-dir `PromptStore` a test already set up) instead of having this module build its own
   * from `repoRoot`. `mcp/server.ts`'s real registration call never sets this. */
  promptService?: PromptService;
}

const UNUSED_RUNNER: BuildRunnerLike = {
  async isClaudeAvailable() {
    return false;
  },
  currentBuild() {
    return null;
  },
  async start() {
    throw new Error('jig_prompts/jig_prompt/jig_mark_built never start a build');
  },
  cancel() {
    return false;
  },
  status(): ClaudeStatus {
    return { state: 'idle' };
  },
};

async function defaultPromptService(repoRoot: string): Promise<PromptService> {
  const store = new PromptStore(repoRoot);
  await store.init();
  return new PromptService({
    store,
    survey: () => stubSurvey(),
    gauges: () => ({ jigFormat: 1, gauges: [], generatedAt: new Date().toISOString() }),
    runner: UNUSED_RUNNER,
  });
}

function jsonResult(payload: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
}

function safeTool(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  return fn().catch((err: unknown) => toolErrorResult(describeToolError(err)));
}

function promptFilePath(repoRoot: string, prompt: Pick<Prompt, 'id' | 'slug'>): string {
  return join(jigPaths(repoRoot).prompts, `${prompt.id}-${prompt.slug}.md`);
}

function promptSummary(repoRoot: string, prompt: Prompt) {
  return {
    id: prompt.id,
    slug: prompt.slug,
    state: prompt.state,
    requirement: prompt.requirement,
    acceptance: prompt.acceptance,
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt,
    file: promptFilePath(repoRoot, prompt),
  };
}

export function registerPromptTools(mcpServer: McpServer, ctx: JigPromptMcpContext): void {
  const servicePromise: Promise<PromptService> = ctx.promptService ? Promise.resolve(ctx.promptService) : defaultPromptService(ctx.repoRoot);
  // #24: the default store starts here, eagerly and unawaited, so a failed init (the repo gone
  // from under it, an unwritable `.jig/`) has nothing awaiting it yet. Every tool below awaits
  // `servicePromise` inside `safeTool` and reports the failure readably; this handler is only
  // so the rejection is never a process-level unhandled one in between — logged, once.
  servicePromise.catch((err: unknown) =>
    logger.warn('prompt tools: the prompt store failed to initialise; every prompt tool call will report it', String(err)),
  );

  mcpServer.registerTool(
    'jig_prompts',
    {
      title: 'List prompts',
      description: 'List every prompt (id, slug, state, requirement, acceptance, timestamps, file path). Optionally filter to one state (draft, ready, building, built, scrapped).',
      inputSchema: { state: PromptStateSchema.optional() },
    },
    async ({ state }) =>
      safeTool(async () => {
        const prompts = await servicePromise;
        const list = prompts.list(state).map((p) => promptSummary(ctx.repoRoot, p));
        return jsonResult({ prompts: list });
      }),
  );

  mcpServer.registerTool(
    'jig_prompt',
    {
      title: 'Read one prompt',
      description: 'The full prompt (requirement, acceptance, target, context, build history) and its markdown file path.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) =>
      safeTool(async () => {
        const prompts = await servicePromise;
        const prompt = prompts.get(id);
        if (!prompt) return toolErrorResult(`no such prompt: ${id}`);
        return jsonResult({ ...prompt, file: promptFilePath(ctx.repoRoot, prompt) });
      }),
  );

  mcpServer.registerTool(
    'jig_mark_built',
    {
      title: 'Report a prompt built',
      description:
        'For a prompt in "ready" or "building" (this Jig\'s own Build runner is not involved), an external agent reports it done: a summary and the files it touched. Moves the prompt to "built".',
      inputSchema: { id: z.string(), summary: z.string(), files: z.array(z.string()).optional() },
    },
    async ({ id, summary, files }) =>
      safeTool(async () => {
        const prompts = await servicePromise;
        const updated = await prompts.markBuiltExternally(id, { summary, files: files ?? [] });
        return jsonResult({ id: updated.id, state: updated.state });
      }),
  );
}
