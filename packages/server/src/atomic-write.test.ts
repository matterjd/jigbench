import { describe, expect, it } from 'vitest';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWriteFile } from './atomic-write.js';

describe('atomicWriteFile', () => {
  it('creates missing parent directories and writes the full content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-atomic-'));
    const target = join(dir, 'a', 'b', 'work-order.md');

    await atomicWriteFile(target, 'hello world');

    expect(await readFile(target, 'utf8')).toBe('hello world');
  });

  it('leaves no temp file behind after a successful write', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-atomic-'));
    const target = join(dir, 'file.txt');

    await atomicWriteFile(target, 'x');

    const entries = await readdir(dir);
    expect(entries).toEqual(['file.txt']);
  });

  it('overwrites an existing file completely, never appends', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-atomic-'));
    const target = join(dir, 'file.txt');

    await atomicWriteFile(target, 'first version, much longer than the second');
    await atomicWriteFile(target, 'second');

    expect(await readFile(target, 'utf8')).toBe('second');
  });
});
