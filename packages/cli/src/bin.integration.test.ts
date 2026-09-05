import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const binPath = join(here, '..', 'dist', 'bin.js');

// A real subprocess test against the BUILT binary — the one thing the unit tests (which
// call command handlers directly, bypassing commander's own argv parsing) cannot catch.
// It found a real bug once: `--repo` declared on both the root command and every
// subcommand made commander route the parsed value to the root's opts only, so every
// subcommand silently ignored its own `--repo` flag and fell back to cwd detection. Unit
// tests all stayed green throughout because they never went through bin.ts at all.
//
// Only runs once `npm run build --workspace=jigbench` has produced dist/bin.js — like
// scripts/stdout-guard.sh, this is a post-build check, not a pre-build one.
const describeIfBuilt = existsSync(binPath) ? describe : describe.skip;

describeIfBuilt('bin.js (built) honors --repo on every subcommand', () => {
  it('mcp --repo <path> resolves exactly that path, not the cwd', async () => {
    const target = process.platform === 'win32' ? 'C:/scratch/jig-integration-test' : '/scratch/jig-integration-test';
    const { stdout, stderr } = await execFileAsync('node', [binPath, 'mcp', '--repo', target]);

    expect(stdout).toBe('');
    expect(stderr).toContain('MCP arrives in S6');
    expect(stderr).toContain('jig-integration-test');
    // Would fail if the repo option leaked back to the process's actual cwd instead.
    expect(stderr).not.toContain(process.cwd().replace(/\\/g, '\\\\'));
  });
});
