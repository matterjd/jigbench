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

  // S16 (nested workspaces, AMENDMENT-1 §6): command-center's real shape is a Rust workspace
  // with no angular.json at the root or one level down — the Angular app sits two levels down
  // at apps/desktop.
  it('finds angular.json two levels down under apps/* (command-center shape)', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-ng-apps-'));
    const appDir = join(repoRoot, 'apps', 'desktop');
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, 'angular.json'), '{}');

    expect(await findAngularRoot(repoRoot)).toBe(appDir.replace(/\\/g, '/'));

    await rm(repoRoot, { recursive: true, force: true });
  });

  it('also finds angular.json two levels down under packages/*', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-ng-packages-'));
    const appDir = join(repoRoot, 'packages', 'shell');
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, 'angular.json'), '{}');

    expect(await findAngularRoot(repoRoot)).toBe(appDir.replace(/\\/g, '/'));

    await rm(repoRoot, { recursive: true, force: true });
  });

  it('does not descend into node_modules under apps/* either', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-ng-apps-nm-'));
    const nm = join(repoRoot, 'apps', 'node_modules', 'ledger-angular');
    await mkdir(nm, { recursive: true });
    await writeFile(join(nm, 'angular.json'), '{}');

    expect(await findAngularRoot(repoRoot)).toBeUndefined();

    await rm(repoRoot, { recursive: true, force: true });
  });

  it('logs every match to stderr when more than one candidate matches, and still returns the first', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-ng-multi-'));
    await writeFile(join(repoRoot, 'angular.json'), '{}'); // root itself matches
    const appDir = join(repoRoot, 'apps', 'desktop');
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, 'angular.json'), '{}'); // apps/desktop also matches

    const calls: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => calls.push(args);
    try {
      const found = await findAngularRoot(repoRoot);
      expect(found).toBe(repoRoot.replace(/\\/g, '/')); // the root itself, found first
      expect(calls.length).toBeGreaterThan(0);
      const logged = calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain(repoRoot.replace(/\\/g, '/'));
      expect(logged).toContain(appDir.replace(/\\/g, '/'));
    } finally {
      console.error = original;
    }

    await rm(repoRoot, { recursive: true, force: true });
  });
});
