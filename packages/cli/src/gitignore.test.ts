import { describe, expect, it } from 'vitest';
import { ensureGitignoreEntry } from './gitignore.js';

describe('ensureGitignoreEntry', () => {
  it('appends the entry to an empty/missing .gitignore', () => {
    const { updated, changed } = ensureGitignoreEntry(undefined, '.jig/cache/');
    expect(changed).toBe(true);
    expect(updated).toBe('.jig/cache/\n');
  });

  it('appends on a new line, adding one first if the file lacks a trailing newline', () => {
    const { updated, changed } = ensureGitignoreEntry('node_modules/', '.jig/cache/');
    expect(changed).toBe(true);
    expect(updated).toBe('node_modules/\n.jig/cache/\n');
  });

  it('does not duplicate a trailing newline that already exists', () => {
    const { updated } = ensureGitignoreEntry('node_modules/\n', '.jig/cache/');
    expect(updated).toBe('node_modules/\n.jig/cache/\n');
  });

  it('is a no-op when the entry is already present', () => {
    const { updated, changed } = ensureGitignoreEntry('node_modules/\n.jig/cache/\n', '.jig/cache/');
    expect(changed).toBe(false);
    expect(updated).toBe('node_modules/\n.jig/cache/\n');
  });
});
