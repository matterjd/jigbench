import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { JIG_FORMAT, jigPaths } from '@jigbench/core';
import { createJigServer, type JigServerHandle } from '@jigbench/server';

/**
 * Retest defect 22 (2026-09-06 evening): "pass and connected! did not see it reflected in
 * jig" — Claude Code showed `jig ✔ connected` but the bench's shop lane stayed "none
 * connected". Root cause: `.mcp.json` (written by `jigbench init` with no `--repo`) let the
 * spawned `jigbench mcp` process re-detect its own repo root from cwd — which, inside a
 * subfolder of a bigger repo with no `.git` of its own (`examples/ledger-angular` inside the
 * jigbench monorepo), used to walk right past that folder's own `.jig/` to the monorepo's
 * `.git`. The MCP process then wrote its shop heartbeat to the WRONG `.jig/cache/shop.json`
 * — one the bench, watching the right folder, never saw.
 *
 * This is the end-to-end proof that the fix holds across TWO SEPARATE PROCESSES sharing
 * nothing but a repo root path: `createJigServer` (the bench's own HTTP/WS server, in this
 * process) and a real spawned `jigbench mcp --repo <repoRoot>` child process (the built
 * binary — the same thing Claude Code actually launches from `.mcp.json`). If the heartbeat
 * ever lands in a different `.jig/` than the one `createJigServer` is reading,
 * `wiring.shop` never flips and this test times out.
 *
 * Only runs once `npm run build` has produced `dist/bin.js` — same convention as
 * `mcp.e2e.test.ts`.
 */
const here = dirname(fileURLToPath(import.meta.url));
const binPath = join(here, '..', '..', 'dist', 'bin.js');
const describeIfBuilt = existsSync(binPath) ? describe : describe.skip;

async function waitFor<T>(check: () => Promise<T | undefined>, timeoutMs: number, intervalMs = 100): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result !== undefined) return result;
    if (Date.now() >= deadline) throw new Error(`waitFor: timed out after ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

describeIfBuilt('repo-root alignment — bench (createJigServer) and a spawned jigbench mcp --repo child process', () => {
  it(
    'wiring.shop flips to wired and shop.client is set, within the freshness window, once the child process connects',
    async () => {
      // A NESTED repo root with no `.git` of its own — the exact `examples/ledger-angular`
      // shape: an outer `.git` two levels up, `.jig/` already established right at the
      // clamped folder (as `jigbench survey`/`init` would have left it).
      const monorepoRoot = await mkdtemp(join(tmpdir(), 'jig-align-monorepo-'));
      await mkdir(join(monorepoRoot, '.git'));
      const repoRoot = join(monorepoRoot, 'examples', 'ledger-angular');
      await mkdir(repoRoot, { recursive: true });

      const paths = jigPaths(repoRoot);
      await mkdir(paths.survey, { recursive: true });
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

      let handle: JigServerHandle | undefined;
      let client: Client | undefined;
      try {
        // The bench, watching the CORRECT (nested) repoRoot directly — never via cwd or
        // .git detection, exactly as the real bench command does with its own --repo flag.
        handle = await createJigServer({ repoRoot, port: 0, shopFreshnessTickMs: 200 });

        const beforeRes = await fetch(`${handle.url}/api/state`);
        const before = (await beforeRes.json()) as { wiring: { shop: string }; shop: unknown };
        expect(before.wiring.shop).toBe('none');
        expect(before.shop).toBeNull();

        // The spawned child process: NO `--repo` flag at all, cwd = repoRoot — exactly what
        // Claude Code actually does with the OLD (pre-fix) `.mcp.json` entry
        // (`{"command":"npx","args":["jigbench","mcp"]}`, no `--repo`): it cwds into the
        // directory holding `.mcp.json` and lets the process detect its own root. This is
        // the actual historical bug's trigger — repoRoot has no `.git` of its own, so a
        // `.git`-only walk-up (the pre-fix `findRepoRoot`) sails right past it to the
        // monorepo root above. A test that passed `--repo` explicitly here would never
        // exercise that walk-up at all — confirmed by running this exact test against the
        // pre-fix `findRepoRoot`: it still passed, because `--repo` always wins regardless
        // of the walk-up logic being tested.
        const transport = new StdioClientTransport({ command: 'node', args: [binPath, 'mcp'], cwd: repoRoot });
        client = new Client({ name: 'Claude Code', version: '2.1.259' });
        await client.connect(transport);

        const state = await waitFor(async () => {
          const res = await fetch(`${handle!.url}/api/state`);
          const body = (await res.json()) as { wiring: { shop: string }; shop: { client?: string; connectedAt?: string } | null };
          return body.wiring.shop === 'wired' ? body : undefined;
        }, 15_000);

        expect(state.wiring.shop).toBe('wired');
        expect(state.shop?.client).toBe('Claude Code 2.1.259');
        expect(typeof state.shop?.connectedAt).toBe('string');
      } finally {
        await client?.close();
        await handle?.close();
        await rm(monorepoRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    },
    30_000,
  );
});
