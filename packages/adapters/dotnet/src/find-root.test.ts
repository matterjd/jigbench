import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findDotnetRoot } from './find-root.js';

describe('findDotnetRoot', () => {
  it('finds a *.csproj at the repo root itself', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-dn-root-'));
    await writeFile(join(repoRoot, 'LedgerApi.csproj'), '<Project />');

    expect(await findDotnetRoot(repoRoot)).toBe(repoRoot.replace(/\\/g, '/'));

    await rm(repoRoot, { recursive: true, force: true });
  });

  it('finds a *.sln one level down (a --repo pointed at a parent folder)', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-dn-parent-'));
    const appDir = join(repoRoot, 'ledger-api');
    await mkdir(appDir);
    await writeFile(join(appDir, 'Ledger.sln'), '');

    expect(await findDotnetRoot(repoRoot)).toBe(appDir.replace(/\\/g, '/'));

    await rm(repoRoot, { recursive: true, force: true });
  });

  it('returns undefined when no *.csproj or *.sln exists at the root or one level down', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-dn-none-'));
    await mkdir(join(repoRoot, 'some-other-dir'));

    expect(await findDotnetRoot(repoRoot)).toBeUndefined();

    await rm(repoRoot, { recursive: true, force: true });
  });

  it('ignores a *.csproj sitting directly inside bin/ or obj/ (build output, not a project root)', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-dn-binobj-'));
    const bin = join(repoRoot, 'bin');
    await mkdir(bin, { recursive: true });
    await writeFile(join(bin, 'Copy.csproj'), '<Project />');

    expect(await findDotnetRoot(repoRoot)).toBeUndefined();

    await rm(repoRoot, { recursive: true, force: true });
  });

  it('prefers the non-test project when a sibling *.tests project also exists one level down (examples/ ships ledger-api + ledger-api.tests)', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-dn-testsibling-'));
    const testDir = join(repoRoot, 'ledger-api.tests');
    const appDir = join(repoRoot, 'ledger-api');
    // Create the test-project sibling FIRST so a naive "first match wins" search would
    // pick it if readdir happens to return it before the real app directory.
    await mkdir(testDir);
    await writeFile(join(testDir, 'LedgerApi.Tests.csproj'), '<Project />');
    await mkdir(appDir);
    await writeFile(join(appDir, 'LedgerApi.csproj'), '<Project />');

    expect(await findDotnetRoot(repoRoot)).toBe(appDir.replace(/\\/g, '/'));

    await rm(repoRoot, { recursive: true, force: true });
  });

  it('falls back to a *.tests project when it is the only candidate one level down', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-dn-onlytests-'));
    const testDir = join(repoRoot, 'ledger-api.tests');
    await mkdir(testDir);
    await writeFile(join(testDir, 'LedgerApi.Tests.csproj'), '<Project />');

    expect(await findDotnetRoot(repoRoot)).toBe(testDir.replace(/\\/g, '/'));

    await rm(repoRoot, { recursive: true, force: true });
  });
});
