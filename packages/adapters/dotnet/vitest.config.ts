import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const coreSrc = fileURLToPath(new URL('../../core/src/index.ts', import.meta.url));

export default defineConfig({
  test: {
    name: 'adapter-dotnet',
    root: import.meta.dirname,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // tier (b) probes a live localhost URL with a short timeout of its own; the outer test
    // timeout only needs headroom for file-system + fetch-timeout tests, not a real server.
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@jigbench/core': coreSrc,
    },
  },
});
