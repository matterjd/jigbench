import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { JIG_FORMAT, jigPaths } from '@jigbench/core';

// This file lives in src/commands/ — one level deeper than bin.integration.test.ts (src/) —
// so it takes one more '..' to reach dist/bin.js.
const here = dirname(fileURLToPath(import.meta.url));
const binPath = join(here, '..', '..', 'dist', 'bin.js');

// Only runs once `npm run build --workspace=jigbench` (and its dependencies) has produced
// dist/bin.js — same post-build-only convention as bin.integration.test.ts and
// scripts/stdout-guard.sh. This is the "MCP e2e" the S6 brief names explicitly: the real
// SDK Client + StdioClientTransport, spawning the built binary as a real child process —
// the closest thing to what an actual agent (Claude Code, Claude Desktop) does.
const describeIfBuilt = existsSync(binPath) ? describe : describe.skip;

const ALL_TOOL_NAMES = ['jig_claim', 'jig_docs', 'jig_draft', 'jig_fixture', 'jig_gauges', 'jig_report', 'jig_survey', 'jig_work_order', 'jig_work_orders'].sort();

function workOrderMarkdown(fields: { id: string; slug: string; state: string; draftedBy: string; what: string; where: string; shop?: boolean }): string {
  const lines = [
    '---',
    `jigFormat: ${JIG_FORMAT}`,
    `id: "${fields.id}"`,
    `slug: ${fields.slug}`,
    `state: ${fields.state}`,
    `draftedBy: ${fields.draftedBy}`,
    'marks: []',
    '---',
    '',
    '## What',
    '',
    fields.what,
    '',
    '## Why',
    '',
    '',
    '## Where',
    '',
    fields.where,
    '',
    '## Acceptance',
    '',
    '## Fixture',
    '',
    '_none_',
  ];
  if (fields.shop) {
    lines.push(
      '',
      '## Shop brief',
      '',
      'Flag any invoice row whose due date has passed.',
      '',
      '### Files',
      '',
      '- src/app/invoice-list/invoice-list.component.ts',
      '',
      '### Patterns',
      '',
      '### Tests',
      '',
    );
  }
  lines.push('');
  return lines.join('\n');
}

describeIfBuilt('MCP e2e — real SDK Client + StdioClientTransport spawning the built binary', () => {
  it(
    'tools/list, jig_draft, jig_claim + jig_report, a resource read, and prompts/get all work end to end (stdout carried JSON-RPC only — the transport would break otherwise)',
    async () => {
      const repoRoot = await mkdtemp(join(tmpdir(), 'jig-mcp-e2e-'));
      const paths = jigPaths(repoRoot);
      try {
        await mkdir(paths.survey, { recursive: true });
        await mkdir(paths.workOrders, { recursive: true });
        await mkdir(paths.cache, { recursive: true });

        const survey = {
          jigFormat: JIG_FORMAT,
          stack: ['angular'],
          components: [],
          routes: [],
          endpoints: [],
          schemas: [],
          docs: [],
          generatedAt: new Date().toISOString(),
        };
        await writeFile(join(paths.survey, 'survey.json'), JSON.stringify(survey, null, 2), 'utf8');

        // Order 0001: marked — for jig_draft. Order 0002: pre-seeded released (with a shop
        // face already filled, the way `OrdersService.release` would leave it) — MCP has no
        // "release" tool (that's a human/bench-only ladder move), so claim/report need a
        // released order handed to them directly rather than chained off jig_draft's output.
        await writeFile(
          join(paths.workOrders, '0001-flag-overdue-rows.md'),
          workOrderMarkdown({ id: '0001', slug: 'flag-overdue-rows', state: 'marked', draftedBy: 'person', what: 'flag overdue rows', where: 'InvoiceListComponent' }),
          'utf8',
        );
        await writeFile(
          join(paths.workOrders, '0002-second-order.md'),
          workOrderMarkdown({ id: '0002', slug: 'second-order', state: 'released', draftedBy: 'person', what: 'second order', where: 'InvoiceListComponent', shop: true }),
          'utf8',
        );

        const transport = new StdioClientTransport({ command: 'node', args: [binPath, 'mcp', '--repo', repoRoot] });
        const client = new Client({ name: 'jig-e2e-test', version: '1.0.0' });
        await client.connect(transport);

        try {
          // --- tools/list -----------------------------------------------------------------
          const { tools } = await client.listTools();
          expect(tools.map((t) => t.name).sort()).toEqual(ALL_TOOL_NAMES);

          // --- jig_draft: 0001 marked -> drafted, draftedBy: shop --------------------------
          const draftResult = await client.callTool({
            name: 'jig_draft',
            arguments: {
              id: '0001',
              human: { what: 'flag overdue rows', why: 'nobody notices overdue invoices', where: 'InvoiceListComponent', acceptance: ['an overdue row is styled red'] },
            },
          });
          expect(draftResult.isError).toBeFalsy();
          const afterDraft = await readFile(join(paths.workOrders, '0001-flag-overdue-rows.md'), 'utf8');
          expect(afterDraft).toContain('state: drafted');
          expect(afterDraft).toContain('draftedBy: shop');

          // --- jig_claim then jig_report: 0002 released -> in-the-shop -> trial-fit -------
          const claimResult = await client.callTool({ name: 'jig_claim', arguments: { id: '0002' } });
          expect(claimResult.isError).toBeFalsy();
          const reportResult = await client.callTool({
            name: 'jig_report',
            arguments: { id: '0002', summary: 'renamed the Total column', files: ['src/app/invoice-list/invoice-list.component.html'] },
          });
          expect(reportResult.isError).toBeFalsy();
          const afterReport = await readFile(join(paths.workOrders, '0002-second-order.md'), 'utf8');
          expect(afterReport).toContain('state: trial-fit');
          expect(afterReport).toContain('## Trial fit');
          expect(afterReport).toContain('renamed the Total column');

          // --- resources/read jig://work-orders/0001 ---------------------------------------
          const resource = await client.readResource({ uri: 'jig://work-orders/0001' });
          expect(String(resource.contents[0]?.mimeType)).toBe('text/markdown');
          expect(String(resource.contents[0]?.text)).toContain('flag overdue rows');

          // --- prompts/get implement-work-order --------------------------------------------
          const prompt = await client.getPrompt({ name: 'implement-work-order', arguments: { id: '0001' } });
          const promptText = prompt.messages.map((m) => (m.content.type === 'text' ? m.content.text : '')).join('\n');
          expect(promptText).toContain('jig://work-orders/0001');
          expect(promptText).toContain('jig_report');
        } finally {
          await client.close();
        }
      } finally {
        // maxRetries/retryDelay: this spawns a real child process whose own shop-heartbeat
        // rm() can still be landing after client.close() returns — the same Windows
        // ENOTEMPTY class tools.test.ts hit in-process (CI run 34039471247).
        await rm(repoRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    },
    30_000,
  );
});
