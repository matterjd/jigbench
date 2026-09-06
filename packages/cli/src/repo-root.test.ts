import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findRepoRoot, isOutsideRepoRoot, resolveRepoRoot } from './repo-root.js';

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

/**
 * S6: "add --repo when init is run from outside the repo root". `isOutsideRepoRoot` is the
 * pure decision behind that — used by `jigbench init` to decide whether the `.mcp.json`
 * entry it writes needs `--repo <path>` (cwd bears no relation to the clamped repo at all)
 * or can rely on Claude Code cwd-ing into the directory that holds `.mcp.json` (cwd is the
 * repo root itself, or somewhere inside it).
 */
describe('isOutsideRepoRoot', () => {
  it('is false when cwd IS the repo root', () => {
    expect(isOutsideRepoRoot('/repo', '/repo')).toBe(false);
  });

  it('is false when cwd is a subdirectory of the repo root', () => {
    expect(isOutsideRepoRoot('/repo', '/repo/src/app')).toBe(false);
  });

  it('is true when cwd is a sibling directory', () => {
    expect(isOutsideRepoRoot('/repo', '/sibling')).toBe(true);
  });

  it('is true when cwd is an ancestor of the repo root (not the same, not inside it)', () => {
    expect(isOutsideRepoRoot('/repo/nested', '/repo')).toBe(true);
  });

  it('normalizes both paths before comparing (trailing slashes, relative segments)', () => {
    expect(isOutsideRepoRoot('/repo/', '/repo/./')).toBe(false);
  });
});
