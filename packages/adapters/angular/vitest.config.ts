import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const coreSrc = fileURLToPath(new URL('../../core/src/index.ts', import.meta.url));

export default defineConfig({
  test: {
    name: 'adapter-angular',
    root: import.meta.dirname,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // ts-morph parses a real Angular project (examples/ledger-angular); loading it in a
    // worker per file would repeatedly re-parse the same tsconfig/program.
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@jigbench/core': coreSrc,
    },
  },
});
