import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The prompts folder "exists" as far as the check is concerned, and is gone by the time it is
// read — the exact interleaving CI run 34161043365 (windows-latest, main at d157ae2) hit when
// `mcp/prompt-tools.ts`'s eagerly started `defaultPromptService` was still initialising its
// store while `mcp/prompts.test.ts`'s afterEach removed the temp repo:
//   Error: ENOENT: no such file or directory, scandir '…\.jig\prompts'
//     ❯ PromptStore.loadAll packages/server/src/prompts/store.ts:130:21
vi.mock('../fs-util.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../fs-util.js')>();
  return { ...real, pathExists: vi.fn(async () => true) };
});

import { PromptStore } from './store.js';

let dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs = [];
});

// #24 ("remaining ENOENT windows"): the same interleaving, one call earlier in `init()` —
// CI run 34174031120 (windows-latest, PR #25 at b241497) hit `migrateIfNeeded`'s own
// check-then-read on `.jig/work-orders`:
//   Error: ENOENT: no such file or directory, scandir '…\.jig\work-orders'
//     ❯ PromptStore.migrateIfNeeded packages/server/src/prompts/store.ts:109:21
//     ❯ PromptStore.init packages/server/src/prompts/store.ts:77:5
//     ❯ defaultPromptService packages/server/src/mcp/prompt-tools.ts:62:3
describe('PromptStore.init when .jig/work-orders "exists" but is gone by the time migration reads it', () => {
  it('resolves — migration has nothing to do — rather than throwing ENOENT', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-prompts-enoent-'));
    dirs.push(repoRoot);
    const store = new PromptStore(repoRoot); // .jig/work-orders was never made; pathExists says it was

    await expect(store.init()).resolves.toBeUndefined();
    expect(store.list()).toEqual([]);
    expect(store.migrationSkipped()).toEqual([]);
  });
});

describe('PromptStore.reload when .jig/prompts vanishes between the existence check and the read', () => {
  it('reads as "no prompts yet" — never a thrown ENOENT', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-prompts-enoent-'));
    dirs.push(repoRoot);
    const store = new PromptStore(repoRoot); // no init(): the folder was never made

    await expect(store.reload()).resolves.toBeUndefined();
    expect(store.list()).toEqual([]);
  });
});
