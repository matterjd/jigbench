import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findAngularRoot } from './find-root.js';

describe('findAngularRoot', () => {
  it('finds angular.json at the repo root itself', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-ng-root-'));
    await writeFile(join(repoRoot, 'angular.json'), '{}');

    expect(await findAngularRoot(repoRoot)).toBe(repoRoot.replace(/\\/g, '/'));

    await rm(repoRoot, { recursive: true, force: true });
  });

  it('finds angular.json one level down (a --repo pointed at a parent folder)', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-ng-parent-'));
    const appDir = join(repoRoot, 'ledger-angular');
    await mkdir(appDir);
    await writeFile(join(appDir, 'angular.json'), '{}');

    expect(await findAngularRoot(repoRoot)).toBe(appDir.replace(/\\/g, '/'));

    await rm(repoRoot, { recursive: true, force: true });
  });

  it('returns undefined when no angular.json exists at the root or one level down', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-ng-none-'));
    await mkdir(join(repoRoot, 'some-other-dir'));

    expect(await findAngularRoot(repoRoot)).toBeUndefined();

    await rm(repoRoot, { recursive: true, force: true });
  });

  it('does not descend into node_modules when searching one level down', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-ng-nm-'));
    const nm = join(repoRoot, 'node_modules', 'ledger-angular');
    await mkdir(nm, { recursive: true });
    await writeFile(join(nm, 'angular.json'), '{}');

    expect(await findAngularRoot(repoRoot)).toBeUndefined();

    await rm(repoRoot, { recursive: true, force: true });
  });
});
