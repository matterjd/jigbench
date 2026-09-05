import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const coreSrc = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));
const serverSrc = fileURLToPath(new URL('../server/src/index.ts', import.meta.url));

export default defineConfig({
  test: {
    name: 'cli',
    root: __dirname,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@jigbench/core': coreSrc,
      '@jigbench/server': serverSrc,
    },
  },
});
