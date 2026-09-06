import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// bench may import @jigbench/core (pure TS, no I/O) — aliased to SOURCE so tests and dev never depend on
// core/dist existing (the fresh-checkout control caught this after the wave-3 merge).
const coreSrc = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@jigbench/core': coreSrc } },
  test: {
    name: 'bench',
    root: import.meta.dirname,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
  },
});
