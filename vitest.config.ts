import { defineConfig } from 'vitest/config';

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
  },
});
