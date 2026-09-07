import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findWebRoot } from './find-root.js';

const NESTED_WORKSPACE_ROOT = fileURLToPath(
  new URL('./__fixtures__/nested-workspace', import.meta.url),
);

function forwardSlashes(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

describe('findWebRoot', () => {
  it('finds a package.json at the repo root itself', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-web-root-'));
    await writeFile(join(repoRoot, 'package.json'), '{}');

    expect(await findWebRoot(repoRoot)).toBe(forwardSlashes(repoRoot));

    await rm(repoRoot, { recursive: true, force: true });
  });

  it('finds qualifying css under src/ at the repo root itself, with no package.json at all', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-web-root-css-'));
    await mkdir(join(repoRoot, 'src'));
    await writeFile(join(repoRoot, 'src', 'site.css'), ':root { --x: 1px; }');

    expect(await findWebRoot(repoRoot)).toBe(forwardSlashes(repoRoot));

    await rm(repoRoot, { recursive: true, force: true });
  });

  it('finds a package.json one level down (a --repo pointed at a parent folder)', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-web-parent-'));
    const appDir = join(repoRoot, 'my-app');
    await mkdir(appDir);
    await writeFile(join(appDir, 'package.json'), '{}');

    expect(await findWebRoot(repoRoot)).toBe(forwardSlashes(appDir));

    await rm(repoRoot, { recursive: true, force: true });
  });

  it('returns undefined for a repo with neither a package.json nor any qualifying stylesheet', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-web-none-'));
    await mkdir(join(repoRoot, 'some-other-dir'));

    expect(await findWebRoot(repoRoot)).toBeUndefined();

    await rm(repoRoot, { recursive: true, force: true });
  });

  it('does not descend into node_modules when searching one level down', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-web-nm-'));
    const nm = join(repoRoot, 'node_modules', 'some-pkg');
    await mkdir(nm, { recursive: true });
    await writeFile(join(nm, 'package.json'), '{}');

    expect(await findWebRoot(repoRoot)).toBeUndefined();

    await rm(repoRoot, { recursive: true, force: true });
  });

  it('a css file under a random top-level dir (not src/app/public/styles) does not count', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-web-random-dir-'));
    await mkdir(join(repoRoot, 'random'));
    await writeFile(join(repoRoot, 'random', 'site.css'), ':root { --x: 1px; }');

    expect(await findWebRoot(repoRoot)).toBeUndefined();

    await rm(repoRoot, { recursive: true, force: true });
  });

  // The nested-workspace fixture (packages/adapters/web/src/__fixtures__/nested-workspace)
  // mirrors worldloom's real shape: a Rust-workspace-style root with no package.json and no
  // stylesheet of its own, one level down has no direct hit either (apps/, packages/ are
  // themselves plain container dirs), and the actual web surface sits two levels down at
  // packages/chart-harness. command-center's apps/desktop is the same shape, one folder
  // group over.
  it('finds a package.json two levels down under packages/* (worldloom/packages/chart-harness shape)', async () => {
    const found = await findWebRoot(NESTED_WORKSPACE_ROOT);
    expect(found).toBe(`${forwardSlashes(NESTED_WORKSPACE_ROOT)}/packages/chart-harness`);
  });

  it('also finds apps/* two levels down when packages/* has nothing', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-web-apps-'));
    const appDir = join(repoRoot, 'apps', 'desktop');
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, 'package.json'), '{}');

    expect(await findWebRoot(repoRoot)).toBe(forwardSlashes(appDir));

    await rm(repoRoot, { recursive: true, force: true });
  });

  // Regression: a root with package.json AND a conventional src/app/*.scss layout (any real
  // Angular or React app) must NOT ALSO report src/ itself as a second "web root" one level
  // down, purely because src/app/ happens to contain stylesheets further in — that's the
  // repo's own internal structure, not a sibling project.
  it('does not report src/ itself as a second candidate when the root already matches via package.json', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-web-self-nest-'));
    await writeFile(join(repoRoot, 'package.json'), '{}');
    await mkdir(join(repoRoot, 'src', 'app', 'shell'), { recursive: true });
    await writeFile(join(repoRoot, 'src', 'app', 'shell', 'shell.scss'), '.x { color: red; }');

    const calls: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => calls.push(args);
    try {
      const found = await findWebRoot(repoRoot);
      expect(found).toBe(forwardSlashes(repoRoot));
      expect(calls).toHaveLength(0); // no spurious "multiple web roots" warning
    } finally {
      console.error = original;
    }

    await rm(repoRoot, { recursive: true, force: true });
  });

  it('logs every match to stderr when more than one candidate matches, and still returns the first', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-web-multi-'));
    await writeFile(join(repoRoot, 'package.json'), '{}'); // root itself matches
    const appDir = join(repoRoot, 'apps', 'desktop');
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, 'package.json'), '{}'); // apps/desktop also matches

    const calls: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => calls.push(args);
    try {
      const found = await findWebRoot(repoRoot);
      expect(found).toBe(forwardSlashes(repoRoot)); // the root itself, found first
      expect(calls.length).toBeGreaterThan(0);
      const logged = calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain(forwardSlashes(repoRoot));
      expect(logged).toContain(forwardSlashes(appDir));
    } finally {
      console.error = original;
    }

    await rm(repoRoot, { recursive: true, force: true });
  });
});
