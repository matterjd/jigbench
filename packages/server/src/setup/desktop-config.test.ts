import { describe, expect, it } from 'vitest';
import { claudeDesktopConfigPath, formatClaudeDesktopConfigDiff, mergeClaudeDesktopConfig } from './desktop-config.js';

describe('claudeDesktopConfigPath', () => {
  it('resolves the Windows location from %APPDATA%', () => {
    expect(claudeDesktopConfigPath({ platform: 'win32', appData: 'C:\\Users\\matte\\AppData\\Roaming' })).toBe(
      'C:\\Users\\matte\\AppData\\Roaming\\Claude\\claude_desktop_config.json',
    );
  });

  it('returns undefined on Windows with no APPDATA at all', () => {
    expect(claudeDesktopConfigPath({ platform: 'win32', appData: undefined })).toBeUndefined();
  });

  it('resolves the macOS location from the home directory', () => {
    expect(claudeDesktopConfigPath({ platform: 'darwin', homedir: '/Users/matte' })).toBe(
      '/Users/matte/Library/Application Support/Claude/claude_desktop_config.json',
    );
  });

  it('returns undefined on an unsupported platform', () => {
    expect(claudeDesktopConfigPath({ platform: 'linux', homedir: '/home/matte' })).toBeUndefined();
  });
});

describe('mergeClaudeDesktopConfig', () => {
  it('adds the jig entry with an explicit --repo (always, no cwd to rely on)', () => {
    const { merged, changed } = mergeClaudeDesktopConfig(undefined, '/repo');
    expect(changed).toBe(true);
    expect(merged).toEqual({ mcpServers: { jig: { command: 'npx', args: ['jigbench', 'mcp', '--repo', '/repo'] } } });
  });

  it('reports changed:false when already up to date', () => {
    const existing = { mcpServers: { jig: { command: 'npx', args: ['jigbench', 'mcp', '--repo', '/repo'] } } };
    expect(mergeClaudeDesktopConfig(existing, '/repo').changed).toBe(false);
  });

  it('preserves every other key untouched', () => {
    const existing = { mcpServers: { other: { command: 'y', args: [] } }, unrelated: true };
    const { merged } = mergeClaudeDesktopConfig(existing, '/repo');
    expect(merged.unrelated).toBe(true);
    expect((merged.mcpServers as Record<string, unknown>).other).toEqual({ command: 'y', args: [] });
  });
});

describe('formatClaudeDesktopConfigDiff', () => {
  it('shows "(no claude_desktop_config.json yet)" for a first-ever install', () => {
    const { merged } = mergeClaudeDesktopConfig(undefined, '/repo');
    const diff = formatClaudeDesktopConfigDiff(undefined, merged);
    expect(diff).toContain('(no claude_desktop_config.json yet)');
    expect(diff).toContain('"jig"');
  });
});
