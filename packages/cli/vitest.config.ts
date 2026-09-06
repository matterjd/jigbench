import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const coreSrc = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));
const serverSrc = fileURLToPath(new URL('../server/src/index.ts', import.meta.url));
// S2: the server imports both adapter packages; alias them to source so cli tests never depend on an
// adapter dist existing (the fresh-checkout control caught this after the S2 merge).
const adapterAngularSrc = fileURLToPath(new URL('../adapters/angular/src/index.ts', import.meta.url));
const adapterDotnetSrc = fileURLToPath(new URL('../adapters/dotnet/src/index.ts', import.meta.url));

export default defineConfig({
  test: {
    name: 'cli',
    root: import.meta.dirname,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@jigbench/core': coreSrc,
      '@jigbench/server': serverSrc,
      '@jigbench/adapter-angular': adapterAngularSrc,
      '@jigbench/adapter-dotnet': adapterDotnetSrc,
    },
  },
});
