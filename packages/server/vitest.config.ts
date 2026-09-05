import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const coreSrc = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));
// S2's survey/registry.ts imports both adapter packages directly (server may; adapters may
// not import server back) — aliased to source so server's tests never depend on the
// adapters having been built first, the same reason @jigbench/core is aliased below.
const adapterAngularSrc = fileURLToPath(new URL('../adapters/angular/src/index.ts', import.meta.url));
const adapterDotnetSrc = fileURLToPath(new URL('../adapters/dotnet/src/index.ts', import.meta.url));

export default defineConfig({
  test: {
    name: 'server',
    root: import.meta.dirname,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@jigbench/core': coreSrc,
      '@jigbench/adapter-angular': adapterAngularSrc,
      '@jigbench/adapter-dotnet': adapterDotnetSrc,
    },
  },
});
