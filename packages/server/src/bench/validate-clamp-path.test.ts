import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateClampPath } from './validate-clamp-path.js';

let dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs = [];
});

async function freshDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'jig-validate-'));
  dirs.push(d);
  return d;
}

describe('validateClampPath', () => {
  it('accepts a real, existing directory', async () => {
    const dir = await freshDir();
    const result = await validateClampPath(dir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.resolved).toBe(dir);
  });

  it('rejects an empty/blank path with a clear message', async () => {
    const result = await validateClampPath('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it('rejects a path that does not exist', async () => {
    const result = await validateClampPath(join(await freshDir(), 'nope-not-here'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('no such path');
  });

  it('rejects a path that is a file, not a directory', async () => {
    const dir = await freshDir();
    const file = join(dir, 'a-file.txt');
    await writeFile(file, 'x', 'utf8');
    const result = await validateClampPath(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not a directory');
  });

  it('#18: rejects a UNC path in either spelling before ever touching it', async () => {
    for (const unc of ['\\\\evil.example\\share\\repo', '//evil.example/share/repo']) {
      const result = await validateClampPath(unc);
      expect(result.ok, unc).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/UNC/);
    }
  });

  // #37: #18's guard read the spelling, and a symlink (or an NTFS junction) inside the home is
  // spelled like any other local path — the `stat` that followed it was the SMB connection the
  // guard exists to prevent, made after the guard had said yes. The win32 shape cannot be planted
  // on either CI leg without making that connection for real, so the realpath answer is injected;
  // `fs/local-path.test.ts` plants the link-following half for real.
  it('#37: rejects a locally-spelled path whose real target is a UNC share, in either spelling', async () => {
    for (const real of ['\\\\attacker.example\\share\\loot', '//attacker.example/share/loot']) {
      const dir = await freshDir();
      const result = await validateClampPath(dir, { realpath: async () => real });
      expect(result.ok, real).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/UNC/);
    }
  });

  it('#37: rejects a locally-spelled path whose real target is inside a .jig/ directory', async () => {
    const dir = await freshDir();
    const insideJig = join(dir, '.jig', 'prompts');
    await mkdir(insideJig, { recursive: true }); // a real directory, so only the `.jig` rule can refuse it

    const result = await validateClampPath(dir, { realpath: async () => insideJig });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('.jig');
  });

  it('#37: still answers with the spelling the caller gave, not the canonical one', async () => {
    const dir = await freshDir();
    const elsewhere = await freshDir();

    const result = await validateClampPath(dir, { realpath: async () => elsewhere });

    expect(result.ok).toBe(true);
    // The clamp records what the human picked. `realpath` on win32 also expands an 8.3 alias
    // (`C:\Users\RUNNER~1\…`), and rewriting `repoRoot` to that is a different change.
    if (result.ok) expect(result.resolved).toBe(dir);
  });

  it('rejects a path inside a .jig/ directory', async () => {
    const dir = await freshDir();
    const inner = join(dir, '.jig', 'work-orders');
    await mkdir(inner, { recursive: true });
    const result = await validateClampPath(inner);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('.jig');
  });
});
