import { defineConfig } from 'tsup';

// S10 (the ship path): `npm publish jigbench` cannot depend on unpublished `@jigbench/*`
// workspace packages, so this bundles the whole in-repo dependency graph — core, server, and
// both adapters — INTO one file, while every third-party runtime dependency stays external
// (resolved normally from node_modules at install time, the same version ranges the
// workspace already uses — see package.json `dependencies`, kept in sync by hand since there
// is no dependency-flattening tool in this v0.1).
//
// This is a SEPARATE build from the plain `tsc -p tsconfig.json` the workspace's own
// `npm run build`/`npm test` rely on (that one still compiles every file under src/ to its
// own dist/*.js, unbundled, for fast incremental workspace development and for
// `commands/*.test.ts` etc. to import individual compiled modules). `npm run build:release`
// (this config) is what `packages/cli/package.json`'s `files` whitelist actually ships.
export default defineConfig({
  entry: { bin: 'src/bin.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  bundle: true,
  splitting: false,
  sourcemap: false,
  dts: false,
  // Every real (non-workspace) run-time dependency, so esbuild leaves a plain `import`
  // pointing at node_modules instead of inlining a copy — must match `dependencies` below.
  external: [
    '@faker-js/faker',
    '@modelcontextprotocol/sdk',
    'commander',
    'express',
    'http-proxy',
    'json-schema-faker',
    'open',
    'pdf-parse',
    'ts-json-schema-generator',
    'ts-morph',
    'ws',
    'zod',
  ],
  // The workspace packages this bundle exists to fold in — never resolvable as real npm
  // packages once published, so they must never be left as bare `import` specifiers.
  noExternal: [/^@jigbench\//],
  // `clean: true` wipes packages/cli/dist before writing bin.js — deliberate: the workspace
  // `npm run build`'s plain `tsc` build may have already populated packages/cli/dist with
  // one .js/.d.ts/.map per source file (index.js, commands/*.js, ...); a release tarball must
  // ship only the bundle plus the two assets `scripts/copy-release-assets.mjs` copies in
  // after this runs (dist/bench/, dist/loupe.js) — never that per-file workspace output.
  clean: true,
  outDir: 'dist',
});
