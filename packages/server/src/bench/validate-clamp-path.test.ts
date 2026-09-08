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

  it('rejects a path inside a .jig/ directory', async () => {
    const dir = await freshDir();
    const inner = join(dir, '.jig', 'work-orders');
    await mkdir(inner, { recursive: true });
    const result = await validateClampPath(inner);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('.jig');
  });
});
