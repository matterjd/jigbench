// loupe.js is served as a static string (AGENTS.md / EXECUTION-PLAN §4 S3 — "plain ES2020,
// no build step"): tsc ignores it entirely (it's not a .ts file), so after compiling this
// package we copy it into dist/plate/ next to the compiled proxy.js that reads it at
// runtime via a path relative to its own module URL.
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = join(root, 'src', 'plate', 'loupe.js');
const destDir = join(root, 'dist', 'plate');
const dest = join(destDir, 'loupe.js');

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.error(`copied ${src} -> ${dest}`);
