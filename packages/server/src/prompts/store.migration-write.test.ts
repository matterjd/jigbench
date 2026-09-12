import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jigPaths, serializeWorkOrder, type WorkOrder } from '@jigbench/core';
import { logger } from '../logger.js';

/**
 * #37: the migration's ENOENT guard covered the WRITE as well as the read.
 *
 * The two are not the same failure. An ENOENT from the `readFile` means the work order was
 * removed between the listing and the read — there is nothing left to migrate, so `continue` is
 * the honest answer and nothing is lost. An ENOENT from `atomicWriteFile` means the prompt could
 * not be written: the work order is still there and has NOT been migrated, which is precisely
 * what `migrationSkipped()` exists to report.
 *
 * That write ENOENT is not hypothetical, and it is the reason the skip record exists at all.
 * `atomic-write.ts`'s own doc records it live on CI run 34148382041 (windows-latest):
 *
 *   S11 migration: work order … failed to migrate to a prompt; skipping it
 *   Error: ENOENT … open '…\.jig\prompts\….md.tmp-…'
 *
 * — a `mkdir` that had already resolved, followed by a `writeFile` into that very directory
 * reporting ENOENT. `565245b` ("retry a transient ENOENT on atomicWriteFile's write, surface
 * migration skips") added the retry AND the record for exactly that run; `cc35616` (#24) then
 * added the read guard in front of both, and re-swallowed the case the record was written for.
 *
 * The write is mocked rather than raced: the real shape is a Windows filesystem lag nothing can
 * reproduce on demand, and an injected ENOENT asks the only question that matters here — which
 * branch the guard sends it down.
 */
vi.mock('../atomic-write.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../atomic-write.js')>();
  return {
    ...real,
    atomicWriteFile: vi.fn(async (path: string) => {
      throw Object.assign(new Error(`ENOENT: no such file or directory, open '${path}.tmp-mocked'`), {
        code: 'ENOENT',
      });
    }),
  };
});

import { PromptStore } from './store.js';

/** Windows needs a privilege (or Developer Mode) to create a symlink; a runner that lacks it
 * should say so rather than fail as if the guard were broken. Probed for real, once. */
const canSymlink = ((): boolean => {
  const probe = mkdtempSync(join(tmpdir(), 'jig-symlink-probe-'));
  try {
    writeFileSync(join(probe, 'target'), 'x', 'utf8');
    symlinkSync(join(probe, 'target'), join(probe, 'link'));
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
  vi.restoreAllMocks();
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));
  dirs = [];
});

function sampleWorkOrder(): WorkOrder {
  return {
    jigFormat: 1,
    id: '0003',
    slug: 'days-overdue',
    state: 'trial-fit',
    human: {
      what: 'Show days overdue beside the due date',
      why: 'A PM asked for it',
      where: 'InvoiceListComponent',
      acceptance: ['Overdue invoices show a red badge'],
    },
    shop: {
      files: ['src/app/invoice-list.component.ts'],
      patterns: ['standalone component'],
      tests: [],
      brief: 'Show days overdue.',
      trialFit: { summary: 'Added the badge.', files: ['src/app/invoice-list.component.ts'] },
    },
    draftedBy: 'person',
    marks: ['m-0001'],
    log: [{ at: '2026-09-05T09:00:00.000Z', actor: 'bench', event: 'marked', ref: 'm-0001' }],
  };
}

describe('#37: a work order that parses but cannot be WRITTEN as a prompt', () => {
  it('is recorded in migrationSkipped(), not swallowed as the read gap', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-prompts-writeenoent-'));
    dirs.push(repoRoot);
    const paths = jigPaths(repoRoot);
    await mkdir(paths.workOrders, { recursive: true });
    const wo = sampleWorkOrder();
    const entry = `${wo.id}-${wo.slug}.md`;
    await writeFile(join(paths.workOrders, entry), serializeWorkOrder(wo), 'utf8');

    // The skip is logged as a WARN by design; this test asserts the RECORD, so the line itself
    // is suppressed the way `http.prompts.test.ts` suppresses it for its own migration case.
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const store = new PromptStore(repoRoot);
    await expect(store.init()).resolves.toBeUndefined(); // still never throws

    expect(store.migrationSkipped()).toEqual([
      { entry, error: expect.stringContaining('ENOENT') as unknown as string },
    ]);
    expect(warn).toHaveBeenCalled(); // and it still says so in the log

    // Law II: the work order it could not migrate is still on disk, unmigrated and not lost.
    expect(await readdir(paths.workOrders)).toContain(entry);
    expect(store.list()).toEqual([]);
  });

  // The other half of the guard, unchanged and pinned so narrowing it did not cost anything: an
  // ENOENT from the READ still means the work order went away between the listing and the read,
  // so there is nothing to migrate and nothing to report. Staged as a DANGLING SYMLINK named
  // `*.md` — `readdir` lists it, `readFile` answers ENOENT — which is the same interleaving
  // without a race to lose.
  itWithSymlink('still treats an ENOENT from the READ as nothing to migrate — no skip record', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-prompts-writeenoent-'));
    dirs.push(repoRoot);
    const paths = jigPaths(repoRoot);
    await mkdir(paths.workOrders, { recursive: true });
    await symlink(join(paths.workOrders, 'never-existed.md'), join(paths.workOrders, '0004-vanishes.md'));

    const store = new PromptStore(repoRoot);
    await expect(store.init()).resolves.toBeUndefined();

    expect(store.migrationSkipped()).toEqual([]);
    expect(store.list()).toEqual([]);
  });
});
