import { describe, expect, it } from 'vitest';
import { claudeDesktopConfigPath, formatClaudeDesktopConfigDiff, mergeClaudeDesktopConfig } from './claude-desktop-config.js';

describe('claudeDesktopConfigPath', () => {
  it('resolves %APPDATA%\\Claude\\claude_desktop_config.json on Windows', () => {
    const path = claudeDesktopConfigPath({ platform: 'win32', appData: 'C:\\Users\\matte\\AppData\\Roaming' });
    expect(path?.replace(/\\/g, '/')).toBe('C:/Users/matte/AppData/Roaming/Claude/claude_desktop_config.json');
  });

  it('returns undefined on Windows when APPDATA is not set (never crashes)', () => {
    expect(claudeDesktopConfigPath({ platform: 'win32', appData: undefined })).toBeUndefined();
  });

  it('resolves ~/Library/Application Support/Claude/claude_desktop_config.json on macOS', () => {
    const path = claudeDesktopConfigPath({ platform: 'darwin', homedir: '/Users/matte' });
    expect(path).toBe('/Users/matte/Library/Application Support/Claude/claude_desktop_config.json');
  });

  it('returns undefined (honest, no guess) for an unsupported platform', () => {
    expect(claudeDesktopConfigPath({ platform: 'linux' })).toBeUndefined();
  });
});

describe('mergeClaudeDesktopConfig', () => {
  it('creates a fresh shape with --repo always present (Desktop has no cwd)', () => {
    const { merged, changed } = mergeClaudeDesktopConfig(undefined, '/repo/path');
    expect(changed).toBe(true);
    expect(merged).toEqual({ mcpServers: { jig: { command: 'npx', args: ['jigbench', 'mcp', '--repo', '/repo/path'] } } });
  });

  it('merges into an existing config, preserving every other server entry', () => {
    const existing = { mcpServers: { other: { command: 'npx', args: ['other-tool'] } }, someKey: true };
    const { merged, changed } = mergeClaudeDesktopConfig(existing, '/repo/path');
    expect(changed).toBe(true);
    expect(merged).toEqual({
      mcpServers: { other: { command: 'npx', args: ['other-tool'] }, jig: { command: 'npx', args: ['jigbench', 'mcp', '--repo', '/repo/path'] } },
      someKey: true,
    });
  });

  it('reports unchanged when the jig entry already matches exactly', () => {
    const existing = { mcpServers: { jig: { command: 'npx', args: ['jigbench', 'mcp', '--repo', '/repo/path'] } } };
    const { changed } = mergeClaudeDesktopConfig(existing, '/repo/path');
    expect(changed).toBe(false);
  });

  it('never overwrites the file — only ever adds/replaces the jig key', () => {
    const existing = { mcpServers: { jig: { command: 'stale' } } };
    const { merged } = mergeClaudeDesktopConfig(existing, '/repo/path');
    expect(merged.mcpServers).toEqual({ jig: { command: 'npx', args: ['jigbench', 'mcp', '--repo', '/repo/path'] } });
  });
});

describe('formatClaudeDesktopConfigDiff', () => {
  it('shows "no file yet" when there was nothing to merge into', () => {
    const { merged } = mergeClaudeDesktopConfig(undefined, '/repo/path');
    const diff = formatClaudeDesktopConfigDiff(undefined, merged);
    expect(diff).toContain('(no claude_desktop_config.json yet)');
    expect(diff).toContain('"jig"');
  });
});
