import { defineWorkspace } from 'vitest/config';

// One project per package. Each package owns its own vitest.config.ts so it can set its
// own test environment (core/server/cli run under node; bench runs under jsdom).
export default defineWorkspace([
  'packages/core/vitest.config.ts',
  'packages/server/vitest.config.ts',
  'packages/cli/vitest.config.ts',
  'packages/bench/vitest.config.ts',
]);
