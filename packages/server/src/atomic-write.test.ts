import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWriteFile } from './atomic-write.js';

function eperm(message = 'EPERM: operation not permitted, rename'): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = 'EPERM';
  return err;
}

function enoent(message: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = 'ENOENT';
  return err;
}

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

  // A directory `fs.watch`'d elsewhere (JigWatcher, in production; or a concurrent test's
  // own watcher) can make Windows' rename-over-existing-file transiently fail with EPERM
  // even though nothing is actually wrong (nodejs/node#4812-class flake) — reproduced live
  // by the shop-heartbeat's own refresh warnings under a loaded machine. `rename` is mocked
  // here (not a real watcher) so the test is fast and deterministic rather than racy itself.
  describe('transient Windows rename races', () => {
    afterEach(() => {
      vi.doUnmock('node:fs/promises');
      vi.resetModules();
    });

    it('retries past a transient EPERM on rename and still writes the file', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'jig-atomic-retry-'));
      const target = join(dir, 'file.txt');
      let calls = 0;

      vi.resetModules();
      vi.doMock('node:fs/promises', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:fs/promises')>();
        return {
          ...actual,
          rename: vi.fn(async (...args: Parameters<typeof actual.rename>) => {
            calls++;
            if (calls < 3) throw eperm();
            return actual.rename(...args);
          }),
        };
      });
      const { atomicWriteFile: atomicWriteFileMocked } = await import('./atomic-write.js');

      await atomicWriteFileMocked(target, 'hello');

      expect(calls).toBe(3);
      expect(await readFile(target, 'utf8')).toBe('hello');
    });

    it('gives up and throws once a persistent EPERM outlasts every retry', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'jig-atomic-retry-'));
      const target = join(dir, 'file.txt');

      vi.resetModules();
      vi.doMock('node:fs/promises', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:fs/promises')>();
        return { ...actual, rename: vi.fn(async () => { throw eperm(); }) };
      });
      const { atomicWriteFile: atomicWriteFileMocked } = await import('./atomic-write.js');

      await expect(atomicWriteFileMocked(target, 'hello')).rejects.toThrow(/EPERM/);
    });

    it('never retries a non-transient error (e.g. a real permission problem reported as EACCES on a read-only path)', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'jig-atomic-retry-'));
      const target = join(dir, 'file.txt');
      let calls = 0;

      vi.resetModules();
      vi.doMock('node:fs/promises', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:fs/promises')>();
        return {
          ...actual,
          rename: vi.fn(async () => {
            calls++;
            const err = new Error('ENOSPC: no space left on device, rename') as NodeJS.ErrnoException;
            err.code = 'ENOSPC';
            throw err;
          }),
        };
      });
      const { atomicWriteFile: atomicWriteFileMocked } = await import('./atomic-write.js');

      await expect(atomicWriteFileMocked(target, 'hello')).rejects.toThrow(/ENOSPC/);
      expect(calls).toBe(1);
    });
  });

  // CI run 34148382041 (Windows leg): "S11 migration: work order ... failed to migrate to a
  // prompt; skipping it Error: ENOENT ... open '...\.jig\prompts\...md.tmp-...'" — the ENOENT
  // fired on the initial temp-file WRITE, an instant after this function's own
  // `mkdir(dirname(path), { recursive: true })` had already completed without error for that
  // exact directory. Only Windows CI reproduced it (not this desk), which is the same
  // "freshly created directory not yet visible to the very next open()" class the module's
  // own rename retry already documents — it just struck a different syscall. `writeFile` is
  // mocked here (not a real race) so the test is fast and deterministic rather than racy
  // itself, mirroring the rename-retry tests above exactly.
  describe('transient Windows races on the initial write', () => {
    afterEach(() => {
      vi.doUnmock('node:fs/promises');
      vi.resetModules();
    });

    it('retries past a transient ENOENT on the initial write and still writes the file', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'jig-atomic-write-retry-'));
      const target = join(dir, 'sub', 'file.txt');
      let calls = 0;

      vi.resetModules();
      vi.doMock('node:fs/promises', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:fs/promises')>();
        return {
          ...actual,
          writeFile: vi.fn(async (...args: Parameters<typeof actual.writeFile>) => {
            calls++;
            if (calls < 3) throw enoent('ENOENT: no such file or directory, open');
            return actual.writeFile(...args);
          }),
        };
      });
      const { atomicWriteFile: atomicWriteFileMocked } = await import('./atomic-write.js');

      await atomicWriteFileMocked(target, 'hello');

      expect(calls).toBe(3);
      expect(await readFile(target, 'utf8')).toBe('hello');
    });

    it('gives up and throws once a persistent ENOENT outlasts every write retry', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'jig-atomic-write-retry-'));
      const target = join(dir, 'file.txt');

      vi.resetModules();
      vi.doMock('node:fs/promises', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:fs/promises')>();
        return {
          ...actual,
          writeFile: vi.fn(async () => {
            throw enoent('ENOENT: no such file or directory, open');
          }),
        };
      });
      const { atomicWriteFile: atomicWriteFileMocked } = await import('./atomic-write.js');

      await expect(atomicWriteFileMocked(target, 'hello')).rejects.toThrow(/ENOENT/);
    });

    it('never retries a non-transient error on the initial write (e.g. ENOSPC)', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'jig-atomic-write-retry-'));
      const target = join(dir, 'file.txt');
      let calls = 0;

      vi.resetModules();
      vi.doMock('node:fs/promises', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:fs/promises')>();
        return {
          ...actual,
          writeFile: vi.fn(async () => {
            calls++;
            const err = new Error('ENOSPC: no space left on device, open') as NodeJS.ErrnoException;
            err.code = 'ENOSPC';
            throw err;
          }),
        };
      });
      const { atomicWriteFile: atomicWriteFileMocked } = await import('./atomic-write.js');

      await expect(atomicWriteFileMocked(target, 'hello')).rejects.toThrow(/ENOSPC/);
      expect(calls).toBe(1);
    });
  });
});
