import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// AGENTS.md "stdout is reserved". This is the guard the deliverable names explicitly: no
// console.log / process.stdout.write anywhere under packages/server/src or
// packages/cli/src, EXCEPT cli/src/human-output.ts — and that one file must never be
// reachable (even transitively, through local imports) from the mcp command path.
const here = dirname(fileURLToPath(import.meta.url));
const cliSrc = here;
const serverSrc = resolve(here, '../../server/src');

const EXCEPTION = join(cliSrc, 'human-output.ts');

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

describe('stdout stays reserved across server + cli', () => {
  it('no console.log / process.stdout.write anywhere except cli/src/human-output.ts', () => {
    const files = [...collectFiles(cliSrc), ...collectFiles(serverSrc)];
    expect(files.length).toBeGreaterThan(0);

    const forbidden = /console\.log\s*\(|process\.stdout\.write\s*\(/;
    const offenders: string[] = [];
    for (const file of files) {
      if (resolve(file) === resolve(EXCEPTION)) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (forbidden.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it('human-output.ts itself is the one file allowed to write to stdout', () => {
    const text = readFileSync(EXCEPTION, 'utf8');
    expect(/process\.stdout\.write\s*\(/.test(text)).toBe(true);
  });

  it('the mcp command path never imports human-output.ts, even transitively', () => {
    const entry = join(cliSrc, 'commands', 'mcp.ts');
    const visited = new Set<string>();
    const stack = [entry];

    while (stack.length > 0) {
      const file = stack.pop()!;
      const resolved = resolve(file);
      if (visited.has(resolved)) continue;
      visited.add(resolved);

      if (resolved === resolve(EXCEPTION)) {
        throw new Error(`mcp command path reaches human-output.ts via: ${[...visited].join(' -> ')}`);
      }

      let text: string;
      try {
        text = readFileSync(resolved, 'utf8');
      } catch {
        continue; // not a local file we can read as source (e.g. a package export) — fine
      }

      const importRe = /from\s+['"](\.\.?\/[^'"]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(text)) !== null) {
        const specifier = m[1].replace(/\.js$/, '.ts');
        stack.push(resolve(dirname(resolved), specifier));
      }
    }

    expect(visited.has(resolve(EXCEPTION))).toBe(false);
  });
});
