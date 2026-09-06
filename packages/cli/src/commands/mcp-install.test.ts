import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMcpInstallCommand } from './mcp-install.js';

/**
 * `jigbench mcp install --claude-desktop [--yes]` (S6): locates
 * `claude_desktop_config.json`, merges the `jig` entry (always carrying `--repo`, since
 * Desktop has no cwd), prints the diff first, and writes only with `--yes` — never
 * overwriting any other server entry. `configPath` is a test-only override (real lookup is
 * `claude-desktop-config.test.ts`'s job) so these tests never touch the real
 * `%APPDATA%`/home directory.
 */

async function freshConfigDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'jig-claude-desktop-'));
  return join(dir, 'Claude'); // the directory claudeDesktopConfigPath() itself would resolve
}

describe('runMcpInstallCommand', () => {
  it('prints the diff but writes nothing without --yes', async () => {
    const claudeDir = await freshConfigDir();
    await mkdir(claudeDir, { recursive: true });
    const configPath = join(claudeDir, 'claude_desktop_config.json');
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-repo-'));

    const result = await runMcpInstallCommand({ repo: repoRoot, configPath });

    expect(result.wrote).toBe(false);
    expect(result.message).toContain('claude_desktop_config.json (before)');
    expect(result.message).toContain('claude_desktop_config.json (after)');
    expect(result.message).toContain('--yes');
    await expect(readFile(configPath, 'utf8')).rejects.toThrow(); // never written
  });

  it('writes the merged config with --yes, carrying --repo (Desktop has no cwd)', async () => {
    const claudeDir = await freshConfigDir();
    await mkdir(claudeDir, { recursive: true });
    const configPath = join(claudeDir, 'claude_desktop_config.json');
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-repo-'));

    const result = await runMcpInstallCommand({ repo: repoRoot, configPath, yes: true });

    expect(result.wrote).toBe(true);
    const written = JSON.parse(await readFile(configPath, 'utf8'));
    expect(written.mcpServers.jig).toEqual({ command: 'npx', args: ['jigbench', 'mcp', '--repo', repoRoot] });
  });

  it('merges into an existing config without disturbing other servers', async () => {
    const claudeDir = await freshConfigDir();
    await mkdir(claudeDir, { recursive: true });
    const configPath = join(claudeDir, 'claude_desktop_config.json');
    await writeFile(configPath, JSON.stringify({ mcpServers: { other: { command: 'npx', args: ['other-tool'] } } }), 'utf8');
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-repo-'));

    await runMcpInstallCommand({ repo: repoRoot, configPath, yes: true });

    const written = JSON.parse(await readFile(configPath, 'utf8'));
    expect(written.mcpServers.other).toEqual({ command: 'npx', args: ['other-tool'] });
    expect(written.mcpServers.jig).toBeDefined();
  });

  it('reports "already up to date" and writes nothing when the entry already matches, even with --yes', async () => {
    const claudeDir = await freshConfigDir();
    await mkdir(claudeDir, { recursive: true });
    const configPath = join(claudeDir, 'claude_desktop_config.json');
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-repo-'));
    await writeFile(configPath, JSON.stringify({ mcpServers: { jig: { command: 'npx', args: ['jigbench', 'mcp', '--repo', repoRoot] } } }), 'utf8');
    const before = await readFile(configPath, 'utf8');

    const result = await runMcpInstallCommand({ repo: repoRoot, configPath, yes: true });

    expect(result.wrote).toBe(false);
    expect(result.message).toContain('up to date');
    expect(await readFile(configPath, 'utf8')).toBe(before);
  });

  it('reports honestly when Claude Desktop is not installed (the config directory does not exist)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-no-claude-desktop-'));
    const configPath = join(dir, 'NoSuchClaudeDir', 'claude_desktop_config.json');
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-repo-'));

    const result = await runMcpInstallCommand({ repo: repoRoot, configPath });

    expect(result.wrote).toBe(false);
    expect(result.message.toLowerCase()).toContain('is claude desktop installed');
  });

  it('reports honestly when this platform has no known config location at all', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-repo-'));
    const result = await runMcpInstallCommand({ repo: repoRoot, platform: 'linux' });
    expect(result.wrote).toBe(false);
    expect(result.message.toLowerCase()).toContain('not found');
  });

  it('treats a corrupt existing config as absent rather than crashing', async () => {
    const claudeDir = await freshConfigDir();
    await mkdir(claudeDir, { recursive: true });
    const configPath = join(claudeDir, 'claude_desktop_config.json');
    await writeFile(configPath, '{ not json', 'utf8');
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-repo-'));

    const result = await runMcpInstallCommand({ repo: repoRoot, configPath, yes: true });
    expect(result.wrote).toBe(true);
    const written = JSON.parse(await readFile(configPath, 'utf8'));
    expect(written.mcpServers.jig).toBeDefined();
  });
});
