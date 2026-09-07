import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const binPath = join(here, '..', 'dist', 'bin.js');

// A real subprocess test against the BUILT binary — the one thing the unit tests (which
// call command handlers directly, bypassing commander's own argv parsing) cannot catch.
// It found a real bug once: `--repo` declared on both the root command and every
// subcommand made commander route the parsed value to the root's opts only, so every
// subcommand silently ignored its own `--repo` flag and fell back to cwd detection. Unit
// tests all stayed green throughout because they never went through bin.ts at all.
//
// Only runs once `npm run build --workspace=jigbench` has produced dist/bin.js — like
// scripts/stdout-guard.sh, this is a post-build check, not a pre-build one.
const describeIfBuilt = existsSync(binPath) ? describe : describe.skip;

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  result?: { tools?: Array<{ name: string }> };
}

describeIfBuilt('bin.js (built) — mcp honors --repo and speaks stdio MCP for real', () => {
  it(
    'mcp --repo <path> handshakes, lists tools, honors --repo (not cwd), and exits cleanly when stdin ends',
    async () => {
      const target = await mkdtemp(join(tmpdir(), 'jig-bin-mcp-'));
      try {
        const child = spawn('node', [binPath, 'mcp', '--repo', target]);

        const messages: JsonRpcMessage[] = [];
        let buffer = '';
        child.stdout.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf8');
          let idx: number;
          while ((idx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);
            if (line.trim()) messages.push(JSON.parse(line));
          }
        });
        const stderrChunks: Buffer[] = [];
        child.stderr.on('data', (d: Buffer) => stderrChunks.push(d));

        const send = (msg: Record<string, unknown>) => child.stdin.write(`${JSON.stringify(msg)}\n`);

        send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'bin-integration-test', version: '1.0.0' } },
        });
        await vi.waitFor(() => expect(messages.some((m) => m.id === 1)).toBe(true), { timeout: 10_000 });

        send({ jsonrpc: '2.0', method: 'notifications/initialized' });
        send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
        await vi.waitFor(() => expect(messages.some((m) => m.id === 2)).toBe(true), { timeout: 10_000 });

        const toolsResponse = messages.find((m) => m.id === 2)!;
        expect((toolsResponse.result!.tools ?? []).map((t) => t.name).sort()).toEqual(
          // S11: registerPromptTools adds three more names — see mcp/tools.test.ts's own fix.
          ['jig_claim', 'jig_docs', 'jig_draft', 'jig_fixture', 'jig_gauges', 'jig_mark_built', 'jig_prompt', 'jig_prompts', 'jig_report', 'jig_survey', 'jig_work_order', 'jig_work_orders'].sort(),
        );

        const exitCodePromise = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
        child.stdin.end();
        const exitCode = await exitCodePromise;
        expect(exitCode).toBe(0);

        const stderrText = Buffer.concat(stderrChunks).toString('utf8');
        // The logger JSON-encodes its meta object, so a Windows path's backslashes come out
        // doubled in the log line — escape the same way before matching.
        expect(stderrText).toContain(target.replace(/\\/g, '\\\\')); // proves --repo was honored
        // Would fail if the repo option leaked back to the process's actual cwd instead.
        expect(stderrText).not.toContain(process.cwd().replace(/\\/g, '\\\\'));
      } finally {
        await rm(target, { recursive: true, force: true });
      }
    },
    20_000,
  );
});
