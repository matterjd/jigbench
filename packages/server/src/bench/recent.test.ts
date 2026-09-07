import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultRecentBenchesFile, readRecentBenches, recordRecentBench, updateRecentBench } from './recent.js';

let dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs = [];
});

async function freshFile(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'jig-recent-'));
  dirs.push(d);
  return join(d, 'recent.json');
}

describe('defaultRecentBenchesFile', () => {
  it('lives under the user home, not the clamped repo', () => {
    const file = defaultRecentBenchesFile();
    expect(file).toContain('.jig');
    expect(file.endsWith('recent.json')).toBe(true);
  });
});

describe('readRecentBenches', () => {
  it('returns an empty list when the file does not exist yet', async () => {
    const file = await freshFile();
    expect(await readRecentBenches(file)).toEqual([]);
  });

  it('returns an empty list (never throws) on a corrupt file', async () => {
    const file = await freshFile();
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, 'not json{{{', 'utf8');
    expect(await readRecentBenches(file)).toEqual([]);
  });
});

describe('recordRecentBench', () => {
  it('writes a new entry as the only, most-recent one', async () => {
    const file = await freshFile();
    const list = await recordRecentBench({ repoRoot: '/repo/a', clampedAt: '2026-01-01T00:00:00.000Z' }, file);
    expect(list).toEqual([{ repoRoot: '/repo/a', clampedAt: '2026-01-01T00:00:00.000Z' }]);

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk).toEqual(list);
  });

  it('moves an already-known repo to the front instead of duplicating it', async () => {
    const file = await freshFile();
    await recordRecentBench({ repoRoot: '/repo/a', clampedAt: '2026-01-01T00:00:00.000Z' }, file);
    await recordRecentBench({ repoRoot: '/repo/b', clampedAt: '2026-01-02T00:00:00.000Z' }, file);
    const list = await recordRecentBench(
      { repoRoot: '/repo/a', clampedAt: '2026-01-03T00:00:00.000Z', lastUsedTargetUrl: 'http://localhost:4200' },
      file,
    );
    expect(list).toEqual([
      { repoRoot: '/repo/a', clampedAt: '2026-01-03T00:00:00.000Z', lastUsedTargetUrl: 'http://localhost:4200' },
      { repoRoot: '/repo/b', clampedAt: '2026-01-02T00:00:00.000Z' },
    ]);
  });

  it('keeps at most 10 entries, dropping the oldest', async () => {
    const file = await freshFile();
    for (let i = 0; i < 12; i++) {
      await recordRecentBench({ repoRoot: `/repo/${i}`, clampedAt: new Date(2026, 0, i + 1).toISOString() }, file);
    }
    const list = await readRecentBenches(file);
    expect(list).toHaveLength(10);
    expect(list[0].repoRoot).toBe('/repo/11');
    expect(list.some((e) => e.repoRoot === '/repo/0')).toBe(false);
    expect(list.some((e) => e.repoRoot === '/repo/1')).toBe(false);
  });
});

// S17b: the target URL is remembered per recent bench — a patch to ONE entry, in place.
describe('updateRecentBench', () => {
  it('patches the matching entry in place — never reorders, never bumps clampedAt', async () => {
    const file = await freshFile();
    await recordRecentBench({ repoRoot: '/repo/a', clampedAt: '2026-01-01T00:00:00.000Z' }, file);
    await recordRecentBench({ repoRoot: '/repo/b', clampedAt: '2026-01-02T00:00:00.000Z' }, file);

    const list = await updateRecentBench('/repo/a', { lastUsedTargetUrl: 'http://localhost:8080' }, file);
    expect(list).toEqual([
      { repoRoot: '/repo/b', clampedAt: '2026-01-02T00:00:00.000Z' },
      { repoRoot: '/repo/a', clampedAt: '2026-01-01T00:00:00.000Z', lastUsedTargetUrl: 'http://localhost:8080' },
    ]);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(list);
  });

  it('overwrites a prior lastUsedTargetUrl on the same entry', async () => {
    const file = await freshFile();
    await recordRecentBench({ repoRoot: '/repo/a', clampedAt: '2026-01-01T00:00:00.000Z', lastUsedTargetUrl: 'http://localhost:1' }, file);
    const list = await updateRecentBench('/repo/a', { lastUsedTargetUrl: 'http://localhost:2' }, file);
    expect(list[0].lastUsedTargetUrl).toBe('http://localhost:2');
  });

  it('is a no-op when the repo is not in the list — nothing added, nothing written', async () => {
    const file = await freshFile();
    await recordRecentBench({ repoRoot: '/repo/a', clampedAt: '2026-01-01T00:00:00.000Z' }, file);
    const before = await readFile(file, 'utf8');

    const list = await updateRecentBench('/repo/nowhere', { lastUsedTargetUrl: 'http://localhost:8080' }, file);
    expect(list).toEqual([{ repoRoot: '/repo/a', clampedAt: '2026-01-01T00:00:00.000Z' }]);
    expect(await readFile(file, 'utf8')).toBe(before);
  });

  it('is a no-op on a missing file too — it never creates one', async () => {
    const file = await freshFile();
    expect(await updateRecentBench('/repo/a', { lastUsedTargetUrl: 'http://localhost:8080' }, file)).toEqual([]);
    const { pathExists } = await import('../fs-util.js');
    expect(await pathExists(file)).toBe(false);
  });
});
