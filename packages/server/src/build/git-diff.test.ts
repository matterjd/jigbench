import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { filesTouchedBetween, gitStatusSnapshot, __test__ } from './git-diff.js';

const execFileAsync = promisify(execFile);
const { parsePorcelainZ } = __test__;
const here = dirname(fileURLToPath(import.meta.url));
/** #37: a `git` that never answers. Driven through `process.execPath` the same way
 * `runner.test.ts` drives the fake `claude`, so nothing has to be on PATH and the fixture
 * behaves identically on both CI legs. */
const FAKE_GIT_HANGS = join(here, '__fixtures__', 'fake-git-hangs.mjs');

async function initRepo(cwd: string): Promise<void> {
  await execFileAsync('git', ['init'], { cwd });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd });
}

describe('parsePorcelainZ (git status --porcelain -z record parsing)', () => {
  it('parses a plain untracked-file record', () => {
    expect(parsePorcelainZ('?? new-file.txt\0')).toEqual(['new-file.txt']);
  });

  it('takes the destination path from a rename record and discards the origin field', () => {
    // -z rename shape: "XY <dest>\0<origin>\0" — no " -> " separator, two NUL-terminated
    // fields for one logical record (confirmed live, git 2.47.1).
    expect(parsePorcelainZ('R  sub/dir/renamed file.txt\0new-file.txt\0')).toEqual(['sub/dir/renamed file.txt']);
  });

  it('takes the destination path from a copy record and discards the origin field', () => {
    expect(parsePorcelainZ('C  copy-of-file.txt\0original.txt\0')).toEqual(['copy-of-file.txt']);
  });

  it('passes non-ASCII bytes through unescaped (the whole reason to prefer -z)', () => {
    expect(parsePorcelainZ('A  café.txt\0')).toEqual(['café.txt']);
  });

  it('parses multiple records back to back', () => {
    expect(parsePorcelainZ('?? a.txt\0 M b.txt\0R  c.txt\0old-c.txt\0')).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });

  it('ignores a trailing empty token after the final NUL', () => {
    expect(parsePorcelainZ('?? only.txt\0')).toEqual(['only.txt']);
  });

  it('defensively converts a backslash separator to forward slashes', () => {
    expect(parsePorcelainZ('?? sub\\dir\\file.txt\0')).toEqual(['sub/dir/file.txt']);
  });

  it('defensively strips a leading "./" prefix', () => {
    expect(parsePorcelainZ('?? ./file.txt\0')).toEqual(['file.txt']);
  });

  it('returns an empty array for empty stdout', () => {
    expect(parsePorcelainZ('')).toEqual([]);
  });
});

describe('gitStatusSnapshot — repoRoot reached through a path git itself does not report back', () => {
  let realDir: string;
  let aliasDir: string;

  beforeEach(async () => {
    realDir = await mkdtemp(join(tmpdir(), 'jig-git-diff-real-'));
    aliasDir = join(tmpdir(), `jig-git-diff-alias-${process.pid}-${Date.now()}`);
    await initRepo(realDir);
  });

  afterEach(async () => {
    await rm(aliasDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
    await rm(realDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  // `git rev-parse --show-toplevel` resolves an NTFS junction to its real target (confirmed
  // live on this desk) exactly the way it resolves the 8.3-shortened `RUNNER~1` TEMP path
  // that GitHub's windows-latest runner set for the actual CI failure this test guards
  // against (CI run 34148382041: `expected [ Array(1) ] to include 'new-file.txt'` — the one
  // array element was a `../`-laden path, not the plain filename). A junction reproduces the
  // same "repoRoot lexically differs from git's own toplevel" class without depending on
  // 8.3 short-name generation being enabled on the host.
  it.runIf(process.platform === 'win32')(
    'reports the plain filename when repoRoot is a junction pointing at the real git working tree',
    async () => {
      await symlink(realDir, aliasDir, 'junction');

      const before = await gitStatusSnapshot(aliasDir);
      expect(before).not.toBeNull();
      await writeFile(join(aliasDir, 'new-file.txt'), 'new\n', 'utf8');
      const after = await gitStatusSnapshot(aliasDir);
      expect(after).not.toBeNull();

      expect(filesTouchedBetween(before!, after!)).toEqual(['new-file.txt']);
    },
  );

  it('reports the plain filename when repoRoot already matches git\'s own toplevel', async () => {
    const before = await gitStatusSnapshot(realDir);
    expect(before).not.toBeNull();
    await writeFile(join(realDir, 'new-file.txt'), 'new\n', 'utf8');
    const after = await gitStatusSnapshot(realDir);
    expect(after).not.toBeNull();

    expect(filesTouchedBetween(before!, after!)).toEqual(['new-file.txt']);
  });
});

// #37: `BuildRunner.start()` awaits the before-snapshot BEFORE it spawns `claude` at all, and
// these two `git` calls were the only child processes in the build path with no timeout of any
// kind — so a wedged git (a credential helper waiting on a prompt, a dead network drive under the
// working tree, an `index.lock` someone else holds) held the whole build open forever with nothing
// to cancel and nothing in the log.
describe('#37: a git that never answers', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'jig-git-timeout-'));
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('gives up on its budget and reads as "no diff information", rather than hanging', async () => {
    const started = Date.now();

    const snapshot = await gitStatusSnapshot(repoRoot, {
      timeoutMs: 300,
      command: process.execPath,
      argsPrefix: [FAKE_GIT_HANGS],
    });

    const elapsed = Date.now() - started;
    expect(snapshot).toBeNull();
    // The point of the test, not decoration: without the budget this never resolves at all, and a
    // timeout that fired but killed nothing would leave the promise pending too. Generous enough
    // for a cold `process.execPath` start on a loaded runner, far under the 15 s default that
    // would prove nothing here.
    expect(elapsed, `gave up after ${elapsed}ms`).toBeLessThan(5_000);
  }, 20_000);

  it('does not cap a git that answers — the budget is a ceiling, not a wait', async () => {
    await initRepo(repoRoot);
    await writeFile(join(repoRoot, 'a.txt'), 'a\n', 'utf8');

    const snapshot = await gitStatusSnapshot(repoRoot, { timeoutMs: 15_000 });

    expect(snapshot).not.toBeNull();
    expect([...(snapshot?.paths ?? [])]).toEqual(['a.txt']);
  });
});
