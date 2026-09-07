import { describe, expect, it } from 'vitest';
import { formatMcpJsonDiff, mergeMcpJson } from './mcp-json.js';

/**
 * S17a's own copy of the CLI's `mcp-json.ts` merge logic — see `setup/route.ts`'s module doc
 * for why this lives here rather than server importing from `jigbench` (the CLI depends on
 * `@jigbench/server`, never the other way). The server-side entry ALWAYS carries an explicit
 * `--repo` (the server has no cwd-based "current repo" the way a terminal command does), so
 * there is no `isOutsideRepoRoot`-style optionality to replicate here.
 */

describe('mergeMcpJson (server-side)', () => {
  it('adds the jig entry with an explicit --repo when nothing existed before', () => {
    const { merged, changed } = mergeMcpJson(undefined, '/repo');
    expect(changed).toBe(true);
    expect(merged).toEqual({ mcpServers: { jig: { command: 'npx', args: ['jigbench', 'mcp', '--repo', '/repo'] } } });
  });

  it('reports changed:false when the exact same entry already exists', () => {
    const existing = { mcpServers: { jig: { command: 'npx', args: ['jigbench', 'mcp', '--repo', '/repo'] } } };
    const { changed } = mergeMcpJson(existing, '/repo');
    expect(changed).toBe(false);
  });

  it('reports changed:true when the repo path differs from what is on disk', () => {
    const existing = { mcpServers: { jig: { command: 'npx', args: ['jigbench', 'mcp', '--repo', '/other'] } } };
    const { merged, changed } = mergeMcpJson(existing, '/repo');
    expect(changed).toBe(true);
    expect((merged.mcpServers as Record<string, unknown>).jig).toEqual({
      command: 'npx',
      args: ['jigbench', 'mcp', '--repo', '/repo'],
    });
  });

  it('preserves every other key, including unrelated mcpServers entries', () => {
    const existing = { someOtherKey: 42, mcpServers: { other: { command: 'x', args: [] } } };
    const { merged } = mergeMcpJson(existing, '/repo');
    expect(merged.someOtherKey).toBe(42);
    expect((merged.mcpServers as Record<string, unknown>).other).toEqual({ command: 'x', args: [] });
  });

  it('normalises a Windows-style repo path to forward slashes', () => {
    const { merged } = mergeMcpJson(undefined, 'C:\\Users\\matte\\app');
    expect((merged.mcpServers as Record<string, { args: string[] }>).jig.args).toEqual([
      'jigbench',
      'mcp',
      '--repo',
      'C:/Users/matte/app',
    ]);
  });
});

describe('formatMcpJsonDiff', () => {
  it('shows "(no .mcp.json yet)" for a first-ever install', () => {
    const { merged } = mergeMcpJson(undefined, '/repo');
    const diff = formatMcpJsonDiff(undefined, merged);
    expect(diff).toContain('(no .mcp.json yet)');
    expect(diff).toContain('"jig"');
  });
});
