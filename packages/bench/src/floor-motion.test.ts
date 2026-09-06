import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Design floor items 5/9 (DESIGN-TEAM.md §6, FLOOR A — read the file for the count, never
 * restate it here) — wave-3 council finding 5 (Blocker-class): `TrayRegion.css`'s hold
 * transform/box-shadow transition and `FixturePanel.css`'s opacity transition ran
 * unconditionally, with no `@media (prefers-reduced-motion: no-preference)` gate. Anything
 * moving on screen must be an opt-IN for viewers who allow motion, never the default.
 *
 * ONE exception, named explicitly by the council finding: the hold ring's fill
 * (`TrayRegion.css`'s `.jig-release--holding .jig-release__fill`, keyed on the `--t-oath`
 * token) is a SAFETY signal — how much longer you must hold — not decoration, and may keep
 * animating even under reduced motion. This scanner allows exactly that one shape (a
 * `transition`/`animation` declaration whose value mentions `var(--t-oath)`) to sit outside
 * the gate; every other transition/animation in every `.css` file under `packages/bench/src`
 * must be nested inside a `prefers-reduced-motion: no-preference` block.
 */

const SRC_DIR = import.meta.dirname;
const SAFETY_EXEMPT_TOKEN = '--t-oath';

function findCssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findCssFiles(full));
    } else if (entry.name.endsWith('.css')) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length)); // keep offsets stable
}

/** Finds the index of the `}` matching the `{` at `openIndex`, by brace depth. */
function matchBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

/** Byte ranges `[start, end)` of every `@media (prefers-reduced-motion: no-preference) { ... }`
 * block's BODY (between its own braces) — a transition/animation whose start index falls in
 * one of these ranges is gated, regardless of how many rule blocks it's nested inside. */
function safeZones(source: string): Array<[number, number]> {
  const zones: Array<[number, number]> = [];
  const re = /@media\s*\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const openIndex = match.index + match[0].length - 1;
    const closeIndex = matchBrace(source, openIndex);
    zones.push([openIndex, closeIndex]);
  }
  return zones;
}

interface Violation {
  file: string;
  declaration: string;
}

function findUngatedMotion(source: string): string[] {
  const clean = stripComments(source);
  const zones = safeZones(clean);
  const violations: string[] = [];
  // One `transition:`/`animation:` PROPERTY declaration at a time, up to its terminating `;`
  // (or the enclosing `}` if the author omitted a trailing semicolon).
  const re = /\b(transition|animation)\s*:[^;{}]*;?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(clean))) {
    const start = match.index;
    const declaration = match[0];
    const inSafeZone = zones.some(([s, e]) => start >= s && start < e);
    if (inSafeZone) continue;
    if (declaration.includes(SAFETY_EXEMPT_TOKEN)) continue; // the hold ring's fill
    violations.push(declaration.trim());
  }
  return violations;
}

describe('design floor — every transition/animation is reduced-motion gated (finding 5)', () => {
  it('finds zero ungated transition/animation declarations outside the --t-oath safety exception', () => {
    const files = findCssFiles(SRC_DIR);
    const violations: Violation[] = [];
    for (const file of files) {
      for (const declaration of findUngatedMotion(readFileSync(file, 'utf8'))) {
        violations.push({ file: relative(SRC_DIR, file), declaration });
      }
    }
    expect(violations).toEqual([]);
  });

  // A control on the control: the scanner must actually fire on an ungated declaration, stay
  // quiet on a properly gated one, and still exempt the one named --t-oath shape.
  it('DETECTOR CONTROL: fires on an ungated transition and an ungated animation', () => {
    expect(findUngatedMotion('.x { transition: opacity 200ms; }')).toEqual(['transition: opacity 200ms;']);
    expect(findUngatedMotion('.x { animation: pulse 1s infinite; }')).toEqual(['animation: pulse 1s infinite;']);
  });

  it('DETECTOR CONTROL: stays quiet on a declaration nested inside the reduced-motion gate', () => {
    const gated = `
      @media (prefers-reduced-motion: no-preference) {
        .x { transition: opacity var(--t-feather) var(--ease-standard); }
      }
    `;
    expect(findUngatedMotion(gated)).toEqual([]);
  });

  it('DETECTOR CONTROL: exempts only a declaration that mentions --t-oath, ungated or not', () => {
    expect(findUngatedMotion('.x { transition: stroke-dashoffset var(--t-oath) linear; }')).toEqual([]);
    // a DIFFERENT ungated transition in the same file is still caught
    const mixed = '.x { transition: stroke-dashoffset var(--t-oath) linear; }\n.y { transition: transform 200ms; }';
    expect(findUngatedMotion(mixed)).toEqual(['transition: transform 200ms;']);
  });

  it('DETECTOR CONTROL: a comment mentioning "transition:" is not mistaken for a declaration', () => {
    expect(findUngatedMotion('/* transition: opacity 200ms; */\n.x { color: red; }')).toEqual([]);
  });
});
