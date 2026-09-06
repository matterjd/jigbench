import { defineConfig } from 'vitest/config';
import { cpus } from 'node:os';

// Suite-stability fix (fix/suite-stability): the `forks` pool's default concurrency is
// effectively `cpus - 1`, and it is ONE pool SHARED across every `test.projects` entry below
// (core, both adapters, server, cli, bench all queue their files into it) — on a 12-core
// desktop that is 11 concurrent Node child processes, each transforming TypeScript and
// (bench) booting jsdom. At that concurrency this suite reproduced two distinct file-level
// load failures under `npm test` alone, with nothing else asked to run alongside it:
// `Error: Worker exited unexpectedly` (a whole file's tests silently dropped from the count)
// and a fork reading one of `ts-json-schema-generator`'s files back as
// `SyntaxError: Unexpected strict mode reserved word` at line 1 column 0 — the signature of a
// truncated read, not a real syntax problem in a file nothing here edited. Both are consistent
// with Windows' well-documented flakiness under heavy concurrent file I/O (antivirus/indexer
// filter drivers interfering with buffered reads and directory-handle renames alike — see
// `atomic-write.ts`'s matching EPERM-retry fix for the same underlying class of interference).
// 7 consecutive full runs at `maxWorkers: 4` reproduced neither failure (0/7) where the
// uncapped default hit one or the other in 2 of 7. Capped to a fixed small number rather than
// a fraction of `cpus()` so behavior stays the same on any machine, not just this one — a
// 2-core CI runner is already at or below this, so this never further throttles CI.
const MAX_TEST_WORKERS = Math.min(4, cpus().length);

// Replaces the old `vitest.workspace.ts`, which is INERT under the pinned vitest (4.1.11):
// `defineWorkspace` / a standalone workspace file is no longer wired into project discovery,
// so `npx vitest run --project core` reported "No projects match" and a bare `vitest run`
// fell through to sweeping the WHOLE repo with no per-package config applied — catching
// `examples/ledger-angular/**/*.spec.ts` (an Angular/Karma suite vitest cannot run) and
// running bench's React components under vitest's default `node` environment instead of the
// jsdom one `packages/bench/vitest.config.ts` declares.
//
// `test.projects` is the current mechanism: each glob resolves to that package's own
// `vitest.config.ts`, which keeps owning its own `environment`, `include`, and `resolve.alias`
// — nothing here overrides them. This root config has no tests of its own (see `test.include`
// below), so it never re-sweeps `examples/**`.
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'packages/adapters/*/vitest.config.ts'],
    // Belt and suspenders: the root project itself should never collect tests directly (that
    // is what the projects above are for), so pin its own include to nothing rather than rely
    // on `projects` alone to keep `examples/**` and `node_modules/**` out of the sweep.
    include: [],
    maxWorkers: MAX_TEST_WORKERS,
    minWorkers: 1,
  },
});
