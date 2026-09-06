import { describe, expect, it } from 'vitest';
import { formatMcpJsonDiff, JIG_MCP_ENTRY, mergeMcpJson } from './mcp-json.js';

describe('mergeMcpJson', () => {
  it('creates a fresh file shape when nothing exists yet', () => {
    const { merged, changed } = mergeMcpJson(undefined);
    expect(changed).toBe(true);
    expect(merged).toEqual({ mcpServers: { jig: JIG_MCP_ENTRY } });
  });

  it('merges into an existing .mcp.json, preserving every other server entry', () => {
    const existing = {
      mcpServers: { other: { command: 'npx', args: ['other-tool'] } },
      someOtherTopLevelKey: true,
    };

    const { merged, changed } = mergeMcpJson(existing);

    expect(changed).toBe(true);
    expect(merged).toEqual({
      mcpServers: {
        other: { command: 'npx', args: ['other-tool'] },
        jig: JIG_MCP_ENTRY,
      },
      someOtherTopLevelKey: true,
    });
  });

  it('reports unchanged when the jig entry already matches exactly', () => {
    const existing = { mcpServers: { jig: JIG_MCP_ENTRY } };
    const { changed } = mergeMcpJson(existing);
    expect(changed).toBe(false);
  });

  it('never overwrites .mcp.json — it only ever adds/replaces the jig key', () => {
    const existing = { mcpServers: { jig: { command: 'something-stale' } } };
    const { merged, changed } = mergeMcpJson(existing);
    expect(changed).toBe(true);
    expect(merged.mcpServers).toEqual({ jig: JIG_MCP_ENTRY });
  });

  // S6: "add --repo when init is run from outside the repo root" — an explicit repoRoot
  // option adds `--repo <path>` to the entry's args; omitted (the default), the plain
  // JIG_MCP_ENTRY is unchanged from before S6.
  it('adds --repo <path> to args when a repoRoot is given', () => {
    const { merged, changed } = mergeMcpJson(undefined, { repoRoot: '/some/other/repo' });
    expect(changed).toBe(true);
    expect(merged).toEqual({ mcpServers: { jig: { command: 'npx', args: ['jigbench', 'mcp', '--repo', '/some/other/repo'] } } });
  });

  it('reports unchanged when the --repo entry already matches exactly', () => {
    const existing = { mcpServers: { jig: { command: 'npx', args: ['jigbench', 'mcp', '--repo', '/some/other/repo'] } } };
    const { changed } = mergeMcpJson(existing, { repoRoot: '/some/other/repo' });
    expect(changed).toBe(false);
  });
});

describe('formatMcpJsonDiff', () => {
  it('shows "no file yet" when there was nothing to merge into', () => {
    const { merged } = mergeMcpJson(undefined);
    const diff = formatMcpJsonDiff(undefined, merged);
    expect(diff).toContain('(no .mcp.json yet)');
    expect(diff).toContain('"jig"');
  });
});
