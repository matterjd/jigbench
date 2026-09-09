import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cliVersion } from './version.js';

const here = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version: string };

/**
 * S15 (0.2.0): `jigbench --version` used to be a literal in bin.ts (`.version('0.1.0')`) that
 * nothing tied to package.json — so a published 0.2.0 would have answered `0.1.0`. The version
 * is read from package.json at runtime now (it ships in the tarball next to dist/), and this
 * test is the tie: the two can never drift again.
 *
 * #24: the third case here used to be `it.skipIf(!existsSync(dist/bin.js))('`jigbench --version`
 * prints exactly that version')` — and ci.yml runs `npm test` BEFORE `npm run build`, so on
 * every CI run it was skipped and nothing checked the built binary at all. The assertion moved
 * to `scripts/npx-control.sh`, which runs after the release build against the packed tarball
 * (the artifact that is actually published), so it can never be skipped again. What is left
 * here is the pure half: the version is read from package.json, never a literal.
 */
describe('the CLI version', () => {
  it('is read from packages/cli/package.json, never a literal', () => {
    expect(cliVersion()).toBe(packageJson.version);
  });

  it('is 0.2.0 for this release', () => {
    expect(cliVersion()).toBe('0.2.0');
  });
});
