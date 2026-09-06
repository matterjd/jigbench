import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Design floor item 7 (DESIGN-TEAM.md §6, FLOOR B): "Colors come from the surface's token
 * file, not hand-rolled hex at the call site." `tokens.css` — the starter tokens, copied
 * verbatim — is the one file allowed to declare raw colour literals; everywhere else in
 * `packages/bench/src` a colour must be a `var(--...)` reference.
 *
 * Scans both `.css` files and inline-style colour literals in `.ts(x)` files (a hex/rgb/hsl
 * string passed to `style={{ ... }}`) — a hand-rolled literal at a call site is the ban
 * either way it's spelled.
 */

const SRC_DIR = import.meta.dirname;
const ALLOWED_FILE = 'tokens.css';

// #rgb / #rgba / #rrggbb / #rrggbbaa, and rgb()/rgba()/hsl()/hsla() function calls.
const COLOR_LITERAL_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g;

function findAllFiles(dir: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findAllFiles(full, pattern));
    } else if (pattern.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

interface Violation {
  file: string;
  match: string;
}

function findColorLiterals(source: string): string[] {
  // Strip comments first so a literal mentioned in prose (e.g. this very file's own doc
  // comment, or a CSS `/* #hex */` note) never counts as a declaration.
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments.replace(/\/\/.*$/gm, '');
  return [...withoutLineComments.matchAll(COLOR_LITERAL_RE)].map((m) => m[0]);
}

describe('design floor item 7 — colours come from the token file, never hand-rolled at the call site', () => {
  it('finds zero raw colour literals in .css files outside tokens.css', () => {
    const files = findAllFiles(SRC_DIR, /\.css$/);
    const violations: Violation[] = [];
    for (const file of files) {
      if (file.endsWith(ALLOWED_FILE)) continue;
      const matches = findColorLiterals(readFileSync(file, 'utf8'));
      for (const match of matches) violations.push({ file: relative(SRC_DIR, file), match });
    }
    expect(violations).toEqual([]);
  });

  it('finds zero raw colour literals in inline styles in .ts/.tsx files', () => {
    // Test files are excluded: their hex/rgb literals are FIXTURE DATA describing what a
    // clamped subject app's own (non-Jig) gauges might report — e.g. a mock `Gauge.$value`
    // of "#1a56db" — never Jig's own chrome. The same distinction the concept draws for the
    // `.ledger` block: "the subject's own token file ... deliberately not Jig's tongue."
    const files = findAllFiles(SRC_DIR, /\.tsx?$/).filter((f) => !/\.test\.tsx?$/.test(f));
    const violations: Violation[] = [];
    for (const file of files) {
      const matches = findColorLiterals(readFileSync(file, 'utf8'));
      for (const match of matches) violations.push({ file: relative(SRC_DIR, file), match });
    }
    expect(violations).toEqual([]);
  });

  // A control on the control: the detector must actually fire on the shapes it claims to
  // catch, and must leave var()-based colour and tokens.css's own declarations alone.
  it('DETECTOR CONTROL: fires on hex, rgb(), rgba(), hsl(), and hsla() literals', () => {
    expect(findColorLiterals('.x { color: #ff00ff; }')).toEqual(['#ff00ff']);
    expect(findColorLiterals('.x { color: rgb(1,2,3); }').length).toBe(1);
    expect(findColorLiterals('.x { color: rgba(1,2,3,0.5); }').length).toBe(1);
    expect(findColorLiterals('.x { color: hsl(1,2%,3%); }').length).toBe(1);
    expect(findColorLiterals('.x { color: hsla(1,2%,3%,0.5); }').length).toBe(1);
  });

  it('DETECTOR CONTROL: stays quiet on var() references and prose mentioning a hex code in a comment', () => {
    expect(findColorLiterals('.x { color: var(--ink); }')).toEqual([]);
    expect(findColorLiterals('/* the storm token is #5fc9e0 */\n.x { color: var(--storm); }')).toEqual([]);
  });
});
