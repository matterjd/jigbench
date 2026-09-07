import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cliVersion } from './version.js';

const here = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version: string };
const binPath = join(here, '..', 'dist', 'bin.js');

/**
 * S15 (0.2.0): `jigbench --version` used to be a literal in bin.ts (`.version('0.1.0')`) that
 * nothing tied to package.json — so a published 0.2.0 would have answered `0.1.0`. The version
 * is read from package.json at runtime now (it ships in the tarball next to dist/), and this
 * test is the tie: the two can never drift again.
 */
describe('the CLI version', () => {
  it('is read from packages/cli/package.json, never a literal', () => {
    expect(cliVersion()).toBe(packageJson.version);
  });

  it('is 0.2.0 for this release', () => {
    expect(cliVersion()).toBe('0.2.0');
  });

  // Post-build, like bin.integration.test.ts: only meaningful once dist/bin.js exists.
  it.skipIf(!existsSync(binPath))('`jigbench --version` prints exactly that version', () => {
    const result = spawnSync('node', [binPath, '--version'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(packageJson.version);
  });
});
