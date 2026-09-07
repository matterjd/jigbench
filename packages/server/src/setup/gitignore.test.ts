import { describe, expect, it } from 'vitest';
import { ensureGitignoreEntry } from './gitignore.js';

describe('ensureGitignoreEntry (server-side copy)', () => {
  it('creates a fresh .gitignore with the entry when none existed', () => {
    const { updated, changed } = ensureGitignoreEntry(undefined, '.jig/cache/');
    expect(changed).toBe(true);
    expect(updated).toBe('.jig/cache/\n');
  });

  it('appends to existing content, adding a newline first if missing', () => {
    const { updated, changed } = ensureGitignoreEntry('node_modules/', '.jig/cache/');
    expect(changed).toBe(true);
    expect(updated).toBe('node_modules/\n.jig/cache/\n');
  });

  it('reports changed:false when the entry is already present on its own line', () => {
    const { updated, changed } = ensureGitignoreEntry('node_modules/\n.jig/cache/\n', '.jig/cache/');
    expect(changed).toBe(false);
    expect(updated).toBe('node_modules/\n.jig/cache/\n');
  });
});
