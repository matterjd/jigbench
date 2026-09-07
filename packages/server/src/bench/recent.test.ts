import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultRecentBenchesFile, readRecentBenches, recordRecentBench } from './recent.js';

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
