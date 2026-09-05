import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInitCommand } from './init.js';

describe('runInitCommand', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the .jig/ skeleton, creates .mcp.json, and appends .gitignore on a fresh repo', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-init-cmd-'));
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { message } = await runInitCommand({ repo: repoRoot });

    expect(message).toContain('Created:');
    expect(message).toContain('.mcp.json: added the "jig" MCP server entry.');
    expect(message).toContain('.gitignore: appended .jig/cache/.');

    const mcpJson = JSON.parse(await readFile(join(repoRoot, '.mcp.json'), 'utf8'));
    expect(mcpJson.mcpServers.jig).toEqual({ command: 'npx', args: ['jigbench', 'mcp'] });

    const gitignore = await readFile(join(repoRoot, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.jig/cache/');

    // The diff was printed to stdout before the write — this is the one command allowed to.
    expect(stdoutSpy).toHaveBeenCalled();
    const printed = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(printed).toContain('.mcp.json (before)');
    expect(printed).toContain('.mcp.json (after)');
  });

  it('merges into an existing .mcp.json without disturbing other servers', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-init-cmd-'));
    await writeFile(
      join(repoRoot, '.mcp.json'),
      JSON.stringify({ mcpServers: { other: { command: 'npx', args: ['other-tool'] } } }),
      'utf8',
    );
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runInitCommand({ repo: repoRoot });

    const mcpJson = JSON.parse(await readFile(join(repoRoot, '.mcp.json'), 'utf8'));
    expect(mcpJson.mcpServers.other).toEqual({ command: 'npx', args: ['other-tool'] });
    expect(mcpJson.mcpServers.jig).toEqual({ command: 'npx', args: ['jigbench', 'mcp'] });
  });

  it('is idempotent: running twice reports nothing left to change the second time', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-init-cmd-'));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runInitCommand({ repo: repoRoot });
    const second = await runInitCommand({ repo: repoRoot });

    expect(second.message).toContain('The .jig/ tree already existed');
    expect(second.message).toContain('.mcp.json: already up to date.');
    expect(second.message).toContain('.gitignore: .jig/cache/ was already covered.');
  });
});
