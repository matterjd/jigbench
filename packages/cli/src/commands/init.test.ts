import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInitCommand } from './init.js';

function posix(path: string): string {
  return path.replace(/\\/g, '/');
}

describe('runInitCommand', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Retest defect 22 (2026-09-06 evening): "pass and connected! did not see it reflected in
  // jig". The old behavior — omitting `--repo` whenever cwd already equals the clamped repo
  // root, relying on whatever spawns `npx jigbench mcp` later to cwd into the same directory
  // — broke the moment that directory has no `.git` of its own (`examples/ledger-angular`
  // inside the jigbench monorepo): the later `jigbench mcp` process re-detects the repo root
  // from ITS OWN cwd and can walk right past the intended folder to an ancestor's `.git`.
  // `init` now ALWAYS bakes `--repo <clamped path, forward slashes>` into the entry so the
  // served root never depends on cwd-based re-detection at all, matching what the Claude
  // Desktop installer (`claude-desktop-config.ts`) already does unconditionally.
  it('writes the .jig/ skeleton, creates .mcp.json with --repo, and appends .gitignore', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-init-cmd-'));
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { message } = await runInitCommand({ repo: repoRoot });

    expect(message).toContain('Created:');
    expect(message).toContain('.mcp.json: added the "jig" MCP server entry.');
    expect(message).toContain('.gitignore: appended .jig/cache/.');

    const mcpJson = JSON.parse(await readFile(join(repoRoot, '.mcp.json'), 'utf8'));
    expect(mcpJson.mcpServers.jig).toEqual({ command: 'npx', args: ['jigbench', 'mcp', '--repo', posix(resolve(repoRoot))] });

    const gitignore = await readFile(join(repoRoot, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.jig/cache/');

    // The diff was printed to stdout before the write — this is the one command allowed to.
    expect(stdoutSpy).toHaveBeenCalled();
    const printed = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(printed).toContain('.mcp.json (before)');
    expect(printed).toContain('.mcp.json (after)');
  });

  it('still writes --repo even when run from inside the repo it is initializing (cwd === repoRoot)', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-init-cmd-'));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(repoRoot);

    await runInitCommand({ repo: repoRoot });

    const mcpJson = JSON.parse(await readFile(join(repoRoot, '.mcp.json'), 'utf8'));
    expect(mcpJson.mcpServers.jig).toEqual({ command: 'npx', args: ['jigbench', 'mcp', '--repo', posix(resolve(repoRoot))] });
    cwdSpy.mockRestore();
  });

  // The exact repro shape: `examples/ledger-angular` has no `.git` of its own (only the
  // jigbench monorepo root does) — `--repo` must still be written explicitly rather than
  // relying on a `.git`-based re-detection that would walk past this folder entirely.
  it('writes --repo for a repo root with no .git of its own (a subfolder of a bigger repo)', async () => {
    const monorepoRoot = await mkdtemp(join(tmpdir(), 'jig-init-cmd-monorepo-'));
    await mkdir(join(monorepoRoot, '.git'));
    const exampleRoot = join(monorepoRoot, 'examples', 'ledger-angular');
    await mkdir(exampleRoot, { recursive: true });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(exampleRoot);

    await runInitCommand({ repo: exampleRoot });

    const mcpJson = JSON.parse(await readFile(join(exampleRoot, '.mcp.json'), 'utf8'));
    expect(mcpJson.mcpServers.jig).toEqual({ command: 'npx', args: ['jigbench', 'mcp', '--repo', posix(resolve(exampleRoot))] });
    cwdSpy.mockRestore();
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
    expect(mcpJson.mcpServers.jig).toEqual({ command: 'npx', args: ['jigbench', 'mcp', '--repo', posix(resolve(repoRoot))] });
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
