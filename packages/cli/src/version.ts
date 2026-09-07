import { readFileSync } from 'node:fs';

/**
 * The CLI's own version, read from the package.json that ships next to `dist/` — in the
 * workspace (`packages/cli/dist/bin.js` → `../package.json`), in the packed tarball
 * (`dist/bin.js` → `../package.json`), and from source under vitest (`src/version.ts` →
 * `../package.json`) it is the same relative hop. S15 (0.2.0): `jigbench --version` used to be
 * a literal in bin.ts that nothing tied to the package's real version.
 */
export function cliVersion(): string {
  const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const parsed = JSON.parse(raw) as { version?: unknown };
  return typeof parsed.version === 'string' ? parsed.version : '0.0.0';
}
