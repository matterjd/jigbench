import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// AGENTS.md "stdout is reserved" — packages/server speaks MCP JSON-RPC on stdout (wired up
// in S6). No file under its src/ may write to stdout, no exceptions: server has no
// human-output surface the way cli does.
const here = dirname(fileURLToPath(import.meta.url));

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('@jigbench/server never writes to stdout', () => {
  it('has no console.log and no process.stdout.write anywhere under src/', () => {
    const files = collectFiles(here);
    expect(files.length).toBeGreaterThan(0);

    const forbidden = /console\.log\s*\(|process\.stdout\.write\s*\(/;
    const offenders: string[] = [];
    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (forbidden.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
