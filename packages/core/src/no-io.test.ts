import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// This test file itself uses node:fs to police the rule — the rule is about `src/`'s
// non-test source files, not about the tests that verify them.
const here = dirname(fileURLToPath(import.meta.url));

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === '__fixtures__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('@jigbench/core has zero I/O', () => {
  it('never imports a Node builtin, or any other workspace package', () => {
    const files = collectSourceFiles(here);
    expect(files.length).toBeGreaterThan(0);

    const forbidden = /from\s+['"](node:[a-z/]+|fs|path|os|child_process|http|https|net|dns|@jigbench\/(?!core))/;
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, i) => {
        if (forbidden.test(line)) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
