// Runs after tsup (see tsup.config.ts) has written dist/bin.js. Two things the bundle needs
// next to it, at runtime paths its own code resolves relative to `import.meta.url`:
//
//  - dist/bench/   — the built bench UI (packages/bench/dist, a `vite build` output). The
//    server's `defaultBenchDistDir` (packages/server/src/default-bench-dist.ts) looks for a
//    SIBLING `bench/` directory next to wherever its own bundled module is running from —
//    exactly this location — before falling back to the workspace's `../../bench/dist`.
//  - dist/loupe.js — the plate proxy's injected script (packages/server/src/plate/loupe.js,
//    plain ES2020, never compiled — see that package's own copy-loupe.mjs for why). The
//    plate proxy resolves it as `./loupe.js` relative to its OWN module's import.meta.url;
//    once bundled, that module's import.meta.url IS dist/bin.js's own location, so `./loupe.js`
//    means exactly this sibling file — no code change needed there, just putting the file here.
//
// Usage: node scripts/copy-release-assets.mjs   (run after `tsup`, i.e. as part of
// `npm run build:release` in this package — see package.json)
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // packages/cli/scripts
const cliRoot = join(here, '..'); // packages/cli
const repoRoot = join(cliRoot, '..', '..'); // repo root
const distDir = join(cliRoot, 'dist');

const binFile = join(distDir, 'bin.js');
if (!existsSync(binFile)) {
  console.error(`FAIL: ${binFile} does not exist — run tsup first (npm run build:release).`);
  process.exit(1);
}

const benchDistSrc = join(repoRoot, 'packages', 'bench', 'dist');
const benchIndexSrc = join(benchDistSrc, 'index.html');
if (!existsSync(benchIndexSrc)) {
  console.error(
    `FAIL: ${benchIndexSrc} does not exist — build the bench UI first ` +
      '(npm run build --workspace=@jigbench/bench).',
  );
  process.exit(1);
}
const benchDistDest = join(distDir, 'bench');
cpSync(benchDistSrc, benchDistDest, { recursive: true });
console.error(`copied ${benchDistSrc} -> ${benchDistDest}`);

// packages/bench's own `vite.config.ts` deliberately builds with `sourcemap: true` (useful
// for local dev/debugging of packages/bench/dist directly) — but the published npm tarball
// has no reason to ship a ~1.6MB debug map alongside a ~350KB bundle. Strip *.map files from
// THIS COPY only (never packages/bench/dist itself) and drop the now-dangling
// `//# sourceMappingURL=` comment from each .js/.css so a devtools session against the
// published bench never tries to fetch a map that isn't there.
const SOURCE_MAP_COMMENT = /\n?\/\/[#@] sourceMappingURL=.*$/;
function stripSourceMaps(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      stripSourceMaps(full);
      continue;
    }
    if (entry.name.endsWith('.map')) {
      unlinkSync(full);
      continue;
    }
    if (entry.name.endsWith('.js') || entry.name.endsWith('.css')) {
      const content = readFileSync(full, 'utf8');
      const stripped = content.replace(SOURCE_MAP_COMMENT, '');
      if (stripped !== content) writeFileSync(full, stripped);
    }
  }
}
stripSourceMaps(benchDistDest);
console.error(`stripped bench sourcemaps from ${benchDistDest} (release tarball only)`);

const loupeSrc = join(repoRoot, 'packages', 'server', 'src', 'plate', 'loupe.js');
if (!existsSync(loupeSrc)) {
  console.error(`FAIL: ${loupeSrc} does not exist.`);
  process.exit(1);
}
const loupeDest = join(distDir, 'loupe.js');
await copyFile(loupeSrc, loupeDest);
console.error(`copied ${loupeSrc} -> ${loupeDest}`);

// #22: the tarball must carry its own README and LICENSE. npm always includes a README* and a
// LICENSE* found next to package.json, whatever `files` says — but packages/cli has neither of
// its own, so 0.1.0 shipped without them and the npm page for `jigbench` showed no readme. The
// root files are the source; these copies are gitignored (`/packages/cli/README.md`,
// `/packages/cli/LICENSE`) and rewritten on every release build, never edited here.
// scripts/npx-control.sh asserts both in the packed tarball.
for (const name of ['README.md', 'LICENSE']) {
  const src = join(repoRoot, name);
  if (!existsSync(src)) {
    console.error(`FAIL: ${src} does not exist — the root ${name} is what the tarball ships.`);
    process.exit(1);
  }
  const dest = join(cliRoot, name);
  await copyFile(src, dest);
  console.error(`copied ${src} -> ${dest}`);
}

// npm generally handles the executable bit for a package's own `bin` entry on install, but
// setting it here too costs nothing and keeps `npm pack`'s own tarball entry executable on
// POSIX regardless of how a given CI runner's checkout left the source tree. try/catch:
// chmod is a no-op-ish concept on Windows (no POSIX mode bits) and must never fail the build.
try {
  chmodSync(binFile, 0o755);
} catch (err) {
  console.error(`note: could not chmod ${binFile} (${String(err)}) — harmless on Windows`);
}

mkdirSync(distDir, { recursive: true }); // no-op if it already exists; belt and suspenders
console.error('release assets copied: dist/bench/, dist/loupe.js, README.md, LICENSE');
