import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultBenchDistDir } from './default-bench-dist.js';

// S10: `defaultBenchDistDir` must resolve correctly whether this module is running unbundled
// (the workspace `npm test`/`npm run dev`/`npm run build` layout — packages/server/{src,dist})
// or bundled into a single file inside `packages/cli`'s release build (`build:release`),
// where every `import.meta.url` in the bundle collapses to that one output file's own path.
// Injecting `metaUrl` (rather than relying on the real module's own `import.meta.url`) makes
// both layouts testable without touching the real source tree.
describe('defaultBenchDistDir', () => {
  it('prefers a sibling bench/ dir with an index.html — the release-bundle layout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jig-bundle-'));
    const benchDir = join(root, 'bench');
    await mkdir(benchDir, { recursive: true });
    await writeFile(join(benchDir, 'index.html'), '<!doctype html>', 'utf8');
    // Mirrors dist/bin.js in the packed cli release, with dist/bench/ alongside it.
    const fakeModule = pathToFileURL(join(root, 'bin.js')).href;

    expect(defaultBenchDistDir(fakeModule)).toBe(benchDir);
  });

  it('falls back to ../../bench/dist when no sibling bench/ exists — the workspace layout', () => {
    // A hardcoded 'C:\fake-repo-root' only reads as absolute on win32 — `path.join`/`join`
    // on POSIX treat backslash as an ordinary filename character, so the whole literal
    // becomes one relative segment and `pathToFileURL` resolves it against `process.cwd()`
    // instead of failing loudly. `resolve('/', ...)` is absolute on every OS: '/fake-repo-root'
    // on POSIX, and (win32's `resolve` anchors a rootless '/' segment to the current
    // working directory's own drive) 'C:\fake-repo-root'-shaped on Windows — either way a
    // real absolute path this test can round-trip through a file URL and back.
    const root = resolve('/', 'fake-repo-root');
    // Mirrors packages/server/src/http.ts (also true, at the same relative depth, of the
    // built packages/server/dist/http.js) — two directories below the level that holds
    // packages/bench.
    const fakeModule = pathToFileURL(join(root, 'packages', 'server', 'src', 'http.js')).href;

    const result = defaultBenchDistDir(fakeModule);
    expect(result).toBe(join(root, 'packages', 'bench', 'dist'));
  });

  it('falls back even when a sibling bench/ dir exists but has no index.html', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jig-no-index-'));
    await mkdir(join(root, 'bench'), { recursive: true }); // no index.html inside
    const fakeModule = pathToFileURL(join(root, 'packages', 'server', 'src', 'http.js')).href;

    const result = defaultBenchDistDir(fakeModule);
    expect(result).not.toBe(join(root, 'bench'));
  });
});
