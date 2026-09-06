import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * Where to find the built bench UI when no `benchDistDir` override is given (`http.ts`'s
 * `createJigServer`).
 *
 * Two layouts exist, and this must resolve correctly under both without being TOLD which one
 * it's running in:
 *
 *  - **Workspace** (`npm run dev` / `npm test` / `npm run build` in this monorepo): this
 *    module lives at `packages/server/src/default-bench-dist.ts` (or, built,
 *    `packages/server/dist/default-bench-dist.js`) — two directories below the level that
 *    holds `packages/bench` — so `../../bench/dist` reaches `packages/bench/dist`.
 *  - **Release bundle** (S10 — `packages/cli`'s `build:release` inlines this whole module,
 *    along with the rest of `@jigbench/server`, into one file, e.g. `dist/bin.js`): every
 *    `import.meta.url` inside that bundle now points at THAT ONE FILE's own location, so the
 *    workspace's two-levels-up computation no longer lands anywhere near a real `bench/`
 *    directory. The release build copies the built bench UI to `dist/bench/` instead — a
 *    SIBLING of the bundle file — so this checks for that sibling first.
 *
 * Checking for the sibling's `index.html` (rather than branching on some "am I bundled" flag
 * the bundler would have to set) means this function needs no cooperation from the bundler at
 * all — it is correct either way by construction, and unit-testable by pointing `metaUrl` at a
 * throwaway location instead of relying on this module's own real `import.meta.url`.
 */
export function defaultBenchDistDir(metaUrl: string = import.meta.url): string {
  const here = fileURLToPath(new URL('.', metaUrl));
  const releaseCandidate = join(here, 'bench');
  if (existsSync(join(releaseCandidate, 'index.html'))) return releaseCandidate;
  return fileURLToPath(new URL('../../bench/dist', metaUrl));
}
