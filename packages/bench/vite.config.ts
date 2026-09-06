import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// bench may import @jigbench/core (pure TS, no I/O) — aliased to SOURCE so tests and dev never depend on
// core/dist existing (the fresh-checkout control caught this after the wave-3 merge).
const coreSrc = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@jigbench/core': coreSrc } },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4600',
      '/ws': { target: 'ws://localhost:4600', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
