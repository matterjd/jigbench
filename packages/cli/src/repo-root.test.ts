import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findRepoRoot, resolveRepoRoot } from './repo-root.js';

describe('findRepoRoot', () => {
  it('finds a .git directory at the starting directory itself', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'jig-repo-'));
    await mkdir(join(repo, '.git'));

    expect(findRepoRoot(repo)).toBe(resolve(repo));
  });

  it('walks up through nested subdirectories to find .git', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'jig-repo-'));
    await mkdir(join(repo, '.git'));
    const nested = join(repo, 'src', 'app', 'deep');
    await mkdir(nested, { recursive: true });

    expect(findRepoRoot(nested)).toBe(resolve(repo));
  });

  it('falls back to the starting directory when no .git is ever found', async () => {
    const noGit = await mkdtemp(join(tmpdir(), 'jig-no-git-'));

    expect(findRepoRoot(noGit)).toBe(resolve(noGit));
  });
});

describe('resolveRepoRoot', () => {
  it('an explicit --repo always wins over detection', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'jig-explicit-'));
    expect(resolveRepoRoot(repo)).toBe(resolve(repo));
  });
});
