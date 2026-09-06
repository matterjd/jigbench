import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { GaugeCategorySchema, LadderStateSchema, WorkOrderHumanSchema, buildIndex, retrieve, type DocChunk } from '@jigbench/core';
import { ageString, firstLogAt, workOrderFilePath } from './format.js';
import { describeToolError, toolErrorResult } from './errors.js';
import type { JigMcpContext } from './types.js';

/**
 * The nine `jig_*` tools (EXECUTION-PLAN.md §4 S6). Every result carries `content` as JSON
 * text (so a client that only reads `content` still gets everything) plus `structuredContent`
 * with the identical payload (so a client that validates/reads structured output gets the
 * same data typed, not just stringified) — one `payload` object built once per call, never
 * two separate shapes to keep in sync. An illegal ladder move, an unknown id, or a schema
 * violation on `jig_draft`'s `human` argument all come back as `isError` results
 * (`errors.ts`), never a thrown protocol error — see `describeToolError`.
 */

function jsonResult(payload: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
}

/** Wraps a tool callback so anything it throws — a `ZodError` from re-validating an
 * argument, an `OrderConflictError`/`OrderNotFoundError` from the orders service, or any
 * other unexpected failure — comes back as an `isError` CallToolResult instead of rejecting
 * the RPC call itself. */
function safeTool(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  return fn().catch((err: unknown) => toolErrorResult(describeToolError(err)));
}

const SURVEY_SECTION = z.enum(['components', 'routes', 'endpoints', 'schemas', 'docs', 'summary']);

export function registerJigTools(mcpServer: McpServer, ctx: JigMcpContext): void {
  mcpServer.registerTool(
    'jig_survey',
    {
      title: 'Survey the clamped app',
      description:
        'Read the clamped repo\'s survey — components, routes, endpoints, data schemas, or the clamped docs. Defaults to a "summary": counts, the detected stack, and which adapters ran.',
      inputSchema: { section: SURVEY_SECTION.optional() },
    },
    async ({ section }) =>
      safeTool(async () => {
        const survey = ctx.store.getState().survey;
        switch (section ?? 'summary') {
          case 'components':
            return jsonResult({ components: survey.components });
          case 'routes':
            return jsonResult({ routes: survey.routes });
          case 'endpoints':
            return jsonResult({ endpoints: survey.endpoints });
          case 'schemas':
            return jsonResult({ schemas: survey.schemas });
          case 'docs': {
            const docs = await ctx.loadDocsIndex();
            return jsonResult({ root: docs?.root ?? null, clampedAt: docs?.clampedAt ?? null, files: docs?.files ?? [] });
          }
          default:
            return jsonResult({
              stack: survey.stack,
              counts: {
                components: survey.components.length,
                routes: survey.routes.length,
                endpoints: survey.endpoints.length,
                schemas: survey.schemas.length,
              },
              appRoots: (survey.adapters ?? []).map((a) => ({ adapter: a.adapter, appRoot: a.appRoot ?? null, stub: a.stub })),
              stub: survey.stub ?? false,
            });
        }
      }),
  );

  mcpServer.registerTool(
    'jig_gauges',
    {
      title: 'List design gauges (tokens)',
      description: 'The survey\'s design tokens (colour, type, space, radius, shadow, motion, z) with where each is used. Optionally filter to one category.',
      inputSchema: { category: GaugeCategorySchema.optional() },
    },
    async ({ category }) =>
      safeTool(async () => {
        const gauges = ctx.store.getState().gauges.gauges;
        const filtered = category ? gauges.filter((g) => g.category === category) : gauges;
        return jsonResult({ gauges: filtered });
      }),
  );

  mcpServer.registerTool(
    'jig_work_orders',
    {
      title: 'List work orders',
      description: 'List every work order (id, slug, ladder state, what, age, who drafted it, and its file path). Optionally filter to one ladder state.',
      inputSchema: { state: LadderStateSchema.optional() },
    },
    async ({ state }) =>
      safeTool(async () => {
        const orders = ctx.store.getState().workOrders;
        const filtered = state ? orders.filter((o) => o.state === state) : orders;
        const workOrders = filtered.map((o) => {
          const at = firstLogAt(o);
          return {
            id: o.id,
            slug: o.slug,
            state: o.state,
            what: o.human.what,
            draftedBy: o.draftedBy,
            age: at ? ageString(at) : 'unknown',
            file: workOrderFilePath(ctx.repoRoot, o),
          };
        });
        return jsonResult({ workOrders });
      }),
  );

  mcpServer.registerTool(
    'jig_work_order',
    {
      title: 'Read one work order',
      description: 'Both faces (human + shop) of one work order, its markdown file path, and the marks it came from.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) =>
      safeTool(async () => {
        const order = ctx.store.getWorkOrder(id);
        if (!order) return toolErrorResult(`no such work order: ${id}`);
        const marks = order.marks.map((markId) => ctx.store.getMark(markId)).filter((m) => m !== undefined);
        return jsonResult({
          id: order.id,
          slug: order.slug,
          state: order.state,
          draftedBy: order.draftedBy,
          human: order.human,
          shop: order.shop ?? null,
          file: workOrderFilePath(ctx.repoRoot, order),
          marks,
        });
      }),
  );

  mcpServer.registerTool(
    'jig_fixture',
    {
      title: 'List or read fixtures',
      description: 'Every fixture (or one, by id) generated from the survey\'s data shapes. When a fixture is LOADED on the plate, the bench answers /api/* requests and fills forms from it.',
      inputSchema: { id: z.string().optional() },
    },
    async ({ id }) =>
      safeTool(async () => {
        const hint = 'When a fixture is loaded on the plate, the bench serves /api/* responses and fills forms from it — see the bench UI to load one.';
        if (id) {
          const fixture = ctx.fixtures.get(id);
          if (!fixture) return toolErrorResult(`no fixture with id "${id}"`);
          return jsonResult({ fixture, hint });
        }
        const active = ctx.fixtures.getActive();
        return jsonResult({ fixtures: ctx.fixtures.list(), active: active?.id ?? null, hint });
      }),
  );

  mcpServer.registerTool(
    'jig_docs',
    {
      title: 'Search clamped docs',
      description: 'Rank the clamped documentation (jigbench clamp --docs) against a query and return the best-matching chunks with file/line provenance.',
      inputSchema: { q: z.string(), k: z.number().int().positive().optional() },
    },
    async ({ q, k }) =>
      safeTool(async () => {
        const index = await ctx.loadDocsIndex();
        if (!index || index.chunks.length === 0) return jsonResult({ query: q, results: [] });
        const ranked = retrieve(buildIndex(index.chunks), q, k ?? 5);
        const results = ranked.map(({ chunk, score }: { chunk: DocChunk; score: number }) => ({
          file: chunk.file,
          headingPath: chunk.headingPath,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          text: chunk.text,
          score,
          provenance: `${chunk.file}${chunk.headingPath.length > 0 ? ` > ${chunk.headingPath.join(' > ')}` : ''} (lines ${chunk.startLine}-${chunk.endLine})`,
        }));
        return jsonResult({ query: q, results });
      }),
  );

  mcpServer.registerTool(
    'jig_draft',
    {
      title: 'Submit a drafted work order',
      description:
        'For a work order in "marked" (fresh, or queued for the shop drafter), submit the completed human face — what, why, where, acceptance, and an optional fixture name. Moves the ladder to "drafted", badged draftedBy: shop.',
      inputSchema: { id: z.string(), human: WorkOrderHumanSchema },
    },
    async ({ id, human }) =>
      safeTool(async () => {
        const updated = await ctx.orders.draftByAgent(id, human, ctx.clientLabel());
        return jsonResult({ id: updated.id, state: updated.state, draftedBy: updated.draftedBy });
      }),
  );

  mcpServer.registerTool(
    'jig_claim',
    {
      title: 'Claim a released work order',
      description: 'Claim a "released" work order for the shop — moves the ladder to "in-the-shop", badged with this connection\'s client name.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) =>
      safeTool(async () => {
        const updated = await ctx.orders.claim(id, ctx.clientLabel());
        return jsonResult({ id: updated.id, state: updated.state });
      }),
  );

  mcpServer.registerTool(
    'jig_report',
    {
      title: 'Report a claimed work order done',
      description: 'Report a claimed ("in-the-shop") work order done, with a summary and the files touched. Moves the ladder to "trial-fit".',
      inputSchema: { id: z.string(), summary: z.string(), files: z.array(z.string()).optional() },
    },
    async ({ id, summary, files }) =>
      safeTool(async () => {
        const updated = await ctx.orders.reportDone(id, { summary, files });
        return jsonResult({ id: updated.id, state: updated.state });
      }),
  );
}
