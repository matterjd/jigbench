import { readFile } from 'node:fs/promises';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { workOrderFilePath } from './format.js';
import type { JigMcpContext } from './types.js';

/**
 * The `jig://` resources (EXECUTION-PLAN.md §4 S6): `jig://work-orders/{id}` is a resource
 * TEMPLATE (one markdown file per order, enumerable via `resources/templates/list`, and
 * listed individually in `resources/list` via its own `list` callback); `jig://work-orders`
 * is a fixed index (a markdown table); `jig://survey` and `jig://gauges` are fixed,
 * application/json. Every read is a plain disk/store read — no mutation happens through a
 * resource, only through the tools.
 */

function firstVariable(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export function registerJigResources(mcpServer: McpServer, ctx: JigMcpContext): void {
  const workOrderTemplate = new ResourceTemplate('jig://work-orders/{id}', {
    list: async () => ({
      resources: ctx.store.getState().workOrders.map((order) => ({
        uri: `jig://work-orders/${order.id}`,
        name: `${order.id} ${order.slug}`,
        mimeType: 'text/markdown',
      })),
    }),
  });

  mcpServer.registerResource(
    'jig-work-order',
    workOrderTemplate,
    { title: 'Work order', description: 'A work order\'s markdown file — both faces, frontmatter state.', mimeType: 'text/markdown' },
    async (uri, variables): Promise<ReadResourceResult> => {
      const id = firstVariable(variables.id);
      const order = ctx.store.getWorkOrder(id);
      if (!order) throw new Error(`no such work order: ${id}`);
      const text = await readFile(workOrderFilePath(ctx.repoRoot, order), 'utf8');
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] };
    },
  );

  mcpServer.registerResource(
    'jig-work-orders-index',
    'jig://work-orders',
    { title: 'Work orders index', description: 'Every work order, one row each.', mimeType: 'text/markdown' },
    async (uri): Promise<ReadResourceResult> => {
      const orders = ctx.store.getState().workOrders;
      const rows = orders.map((o) => `| ${o.id} | ${o.slug} | ${o.state} | ${o.human.what} | ${o.draftedBy} |`);
      const text = ['| id | slug | state | what | draftedBy |', '|---|---|---|---|---|', ...rows].join('\n');
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] };
    },
  );

  mcpServer.registerResource(
    'jig-survey',
    'jig://survey',
    { title: 'Survey', description: 'The clamped app\'s merged survey.', mimeType: 'application/json' },
    async (uri): Promise<ReadResourceResult> => {
      const survey = ctx.store.getState().survey;
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(survey, null, 2) }] };
    },
  );

  mcpServer.registerResource(
    'jig-gauges',
    'jig://gauges',
    { title: 'Gauges', description: 'The survey\'s design tokens.', mimeType: 'application/json' },
    async (uri): Promise<ReadResourceResult> => {
      const gauges = ctx.store.getState().gauges;
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(gauges, null, 2) }] };
    },
  );
}
