import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkLocalPath } from './local-path.js';
import { UNC_REFUSED_MESSAGE } from './unc-path.js';

/**
 * #37: the rule both the folder browser and clamp go through. The shape that makes it matter —
 * a directory symlink inside the home pointing at `\\attacker\share` — cannot be planted
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

  // #81 item 2: the three prefixes, each pinned with a spy — `realpath` is what OPENS the SMB
  // connection on Windows when it is handed a share, so "refused" has to mean "refused before
  // that call", not "refused after it". `\\?\UNC\host\share` is the extended-length spelling of
  // exactly the same share and `\\.\` is the device namespace; both share the two-separator
  // prefix, which is why one rule covers all three.
  it('#81: refuses every UNC prefix spelling — `\\\\`, `//` and `\\\\?\\UNC` — with zero realpath calls', async () => {
    const spellings = [
      '\\\\evil.example\\share\\repo',
      '//evil.example/share/repo',
      '\\\\?\\UNC\\evil.example\\share\\repo',
      '//?/UNC/evil.example/share/repo',
      '\\\\?\\unc\\evil.example\\share',
      '\\\\.\\evil.example\\share',
    ];
    for (const unc of spellings) {
      const spy = vi.fn(async (p: string) => p);
      const result = await checkLocalPath(unc, { realpath: spy });
      expect(result.ok, unc).toBe(false);
      if (!result.ok) expect(result.error, unc).toBe(UNC_REFUSED_MESSAGE);
      expect(spy, unc).toHaveBeenCalledTimes(0);
    }
  });

  // #81 item 2, the hole a raw-string test cannot see: `checkLocalPath` judged `raw` and then
  // handed `realpath` the RESOLVED path, which it never judged. `path.resolve` takes a relative
  // — or a root-relative — value against `process.cwd()`, so a bench started FROM a share turns
  // `sub` into `\\host\share\dir\sub` and `\repo` into `\\host\share\repo`: neither raw
  // string is UNC-spelled, both land on the share, and `realpath` opened it.
  //
  // The cwd is spied rather than changed, because no CI runner can chdir into a UNC path without
  // the SMB connection this test exists to prove never happens. Both cases run identically on
  // both legs: the guard asks the question the WIN32 way (see `local-path.ts`), so the answer
  // does not depend on POSIX's `path.resolve` collapsing `//host/share` to `/host/share`.
  it('#81: refuses a relative or root-relative path that resolves onto a share, with zero realpath calls', async () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue('\\\\evil.example\\share\\dir');
    try {
      for (const raw of ['sub', '.', '..', 'a/b', '\\repo', '/repo']) {
        const spy = vi.fn(async (p: string) => p);
        const result = await checkLocalPath(raw, { realpath: spy });
        expect(result.ok, raw).toBe(false);
        if (!result.ok) expect(result.error, raw).toBe(UNC_REFUSED_MESSAGE);
        expect(spy, raw).toHaveBeenCalledTimes(0);
      }
    } finally {
      cwd.mockRestore();
    }
  });

  // The detector control for the case above: an ordinary local cwd must still let an ordinary
  // relative path through, or the rule above would be "refuse everything relative".
  it('#81: a relative path under an ordinary cwd is untouched by that rule', async () => {
    const dir = await freshDir();
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    try {
      const result = await checkLocalPath('.');
      expect(result.ok).toBe(true);
    } finally {
      cwd.mockRestore();
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

  // #81: `realpath` fails for more reasons than "nothing there", and the guard gave every one of
  // them ENOENT's words. A directory the user cannot traverse (EACCES/EPERM — a mode-700 folder
  // owned by someone else, a Windows ACL) was reported as `no such path`, which sends the human
  // looking for a typo in a path that is right there. A symlink loop (ELOOP) and a component
  // that is not a directory (ENOTDIR) are the same class: real, findable, mis-described.
  //
  // The errno is injected because planting a real unreadable directory is not portable — on a
  // CI runner the tests often run as root, for whom mode 000 is no obstacle at all, so a
  // planted case would silently pass for the wrong reason on one leg and not the other.
  it('#81: an unreadable path says so, rather than borrowing ENOENT\'s words', async () => {
    const dir = await freshDir();
    for (const code of ['EACCES', 'EPERM']) {
      const result = await checkLocalPath(dir, {
        realpath: async () => {
          throw Object.assign(new Error(`${code}: permission denied, lstat`), { code });
        },
      });
      expect(result.ok, code).toBe(false);
      if (!result.ok) {
        expect(result.error, code).toBe(`cannot read that path — permission denied: ${dir}`);
        expect(result.error, code).not.toMatch(/no such path/);
      }
    }
  });

  it('#81: a symlink loop and a non-directory component each say what they are', async () => {
    const dir = await freshDir();
    const cases: Array<[string, RegExp]> = [
      ['ELOOP', /too many symbolic links/i],
      ['ENOTDIR', /not a directory/i],
    ];
    for (const [code, words] of cases) {
      const result = await checkLocalPath(dir, {
        realpath: async () => {
          throw Object.assign(new Error(`${code}: something, lstat`), { code });
        },
      });
      expect(result.ok, code).toBe(false);
      if (!result.ok) {
        expect(result.error, code).toMatch(words);
        expect(result.error, code).not.toMatch(/no such path/);
      }
    }
  });

  // The detector control: ENOENT keeps the words it has always had, and so does an error with
  // no recognisable code at all — a guard that renamed the common case would be worse than the
  // defect it fixes.
  it('#81: ENOENT keeps its own words, and an unrecognised failure falls back to them', async () => {
    const dir = await freshDir();
    for (const thrown of [Object.assign(new Error('ENOENT'), { code: 'ENOENT' }), new Error('something else'), 'a string']) {
      const result = await checkLocalPath(dir, {
        realpath: async () => {
          throw thrown;
        },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe(`no such path: ${dir}`);
    }
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
