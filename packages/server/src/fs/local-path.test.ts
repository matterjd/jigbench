import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkLocalPath } from './local-path.js';

/**
 * #37: the rule both the folder browser and clamp go through. The shape that makes it matter —
 * a symlink or NTFS junction inside the home pointing at `\\attacker\share` — cannot be planted
 * for real on either CI leg without opening the very SMB connection the guard exists to prevent,
 * so the realpath answer is injected for that half. The link-following half is planted for real.
 */

/** Windows needs a privilege (or Developer Mode) to create a directory symlink, and a runner
 * that lacks it should say so rather than fail as if the rule were broken. Probed once, for
 * real, instead of guessed from `process.platform`. */
const canSymlink = ((): boolean => {
  const probe = mkdtempSync(join(tmpdir(), 'jig-symlink-probe-'));
  try {
    mkdirSync(join(probe, 'target'));
    symlinkSync(join(probe, 'target'), join(probe, 'link'), 'dir');
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probe, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
})();
const itWithSymlink = canSymlink ? it : it.skip;

let dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));
  dirs = [];
});

async function freshDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'jig-localpath-'));
  dirs.push(d);
  return d;
}

describe('checkLocalPath', () => {
  it('refuses a UNC path by its spelling, in either form, before it resolves anything', async () => {
    for (const unc of ['\\\\evil.example\\share\\repo', '//evil.example/share/repo', '  //evil.example/share']) {
      const result = await checkLocalPath(unc, {
        realpath: async () => {
          throw new Error('realpath must never be reached for a lexically UNC path');
        },
      });
      expect(result.ok, unc).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/UNC/);
    }
  });

  it('refuses a LOCALLY-SPELLED path whose real target is a UNC share — the case a lexical guard cannot see', async () => {
    const link = join(await freshDir(), 'looks-local');

    const result = await checkLocalPath(link, { realpath: async () => '\\\\attacker.example\\share\\loot' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/UNC/);
  });

  it('refuses the forward-slash spelling of a real target too', async () => {
    const result = await checkLocalPath(await freshDir(), { realpath: async () => '//attacker.example/share' });
    expect(result.ok).toBe(false);
  });

  itWithSymlink('answers with both spellings: what the caller asked for, and what it really is', async () => {
    const dir = await freshDir();
    const target = join(dir, 'target');
    const link = join(dir, 'link');
    await mkdir(target);
    await symlink(target, link, 'dir');

    const result = await checkLocalPath(link);
    if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);

    // The spelling the human clicked — every message, every `entries[].path`, and a clamp's own
    // `repoRoot` keep using this.
    expect(result.resolved).toBe(link);
    // What it really is — the guards judge this, and the filesystem calls use it.
    expect(result.real).toBe(await realpath(target));
  });

  it('a path that is not there reads as "no such path", naming the resolved spelling', async () => {
    const missing = join(await freshDir(), 'nope-not-here');
    const result = await checkLocalPath(missing);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(`no such path: ${missing}`);
  });

  itWithSymlink('a dangling symlink reads the same way — nothing is stat-ed through it', async () => {
    const dir = await freshDir();
    const link = join(dir, 'dangling');
    await symlink(join(dir, 'never-existed'), link, 'dir');

    const result = await checkLocalPath(link);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no such path/);
  });
});
