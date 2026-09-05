import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'core',
    root: import.meta.dirname,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
