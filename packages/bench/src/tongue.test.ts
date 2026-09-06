import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The tongue (COMMISSION.md §3): every shop word pairs with its plain word AT FIRST
 * ENCOUNTER — a "Word — plain word" form — and the plain word (the "Never" column) is
 * otherwise banned from naming anything on the surface: a panel, a button, a state, a file.
 *
 * This is a mechanical grep, not a full JSX parser — it is deliberately conservative (a
 * banned word inside `.test.tsx`/`.test.ts` files, inside comments, or inside a component's
 * OWN implementation details never ships to a reader, so those are out of scope) and it
 * allows exactly the pairing form the tongue requires: a banned word is fine when it is the
 * PLAIN-WORD half of a pairing — either the literal " — <plain word>" suffix of a string
 * (`PlateFrame.tsx`'s "Plate — where the app renders", say), or the `plain` prop of the
 * `Pairing` component, whose entire job is to hold that half.
 */

const SRC_DIR = join(import.meta.dirname);

// COMMISSION.md §3's "Never" column, verbatim. Multi-word phrases are matched as phrases;
// everything else is matched as a whole word (so "index" doesn't fire on "indexOf", etc).
const BANNED_WORDS: readonly string[] = [
  'project',
  'workspace',
  'import',
  'open',
  'connect',
  'scan',
  'analysis',
  'index',
  'preview',
  'canvas',
  'viewport',
  'inspector',
  'select',
  'selection',
  'annotation',
  'comment',
  'ticket',
  'issue',
  'task',
  'spec',
  'approve',
  'submit',
  'ai',
  'assistant',
  'bot',
  'demo',
  'diff',
  'flow',
  'journey',
  'recording',
  'mock data',
  'seed',
  'dummy data',
  'tokens',
  'theme',
  'styles',
  'wireframe',
  'mockup',
  'trash',
  'delete',
  'history',
  'activity',
  'audit log',
];

function findAllTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findAllTsxFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Extracts candidate "visible surface text" from a source file: JSX text nodes, and
 * aria-label/title/placeholder attribute values. `Pairing`'s own `plain="..."` prop values
 * are collected separately and never checked — that prop IS the plain-word half. */
function extractSurfaceStrings(source: string): { checked: string[]; plainProps: string[] } {
  const checked: string[] = [];
  const plainProps: string[] = [];

  for (const m of source.matchAll(/\bplain=["'`]([^"'`]*)["'`]/g)) {
    plainProps.push(m[1]);
  }

  // JSX text nodes: text directly between `>` and the next `<`, with no braces (an
  // expression) and at least one letter (so we skip pure whitespace/punctuation slivers).
  for (const m of source.matchAll(/>([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g)) {
    checked.push(m[1]);
  }

  // aria-label / title / placeholder as either a quoted literal or a template literal.
  for (const m of source.matchAll(/(?:aria-label|title|placeholder)=\{?["'`]([^"'`]*)["'`]\}?/g)) {
    checked.push(m[1]);
  }

  return { checked, plainProps };
}

/** True if `text` uses a banned word ONLY as the plain-word half of a pairing — i.e. every
 * occurrence sits after a " — " (em dash) in the same string. */
function bannedWordIsAlwaysPaired(text: string, banned: string): boolean {
  const lower = text.toLowerCase();
  const boundary = banned.includes(' ') ? banned : `\\b${banned}\\b`;
  const re = new RegExp(boundary, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(lower)) !== null) {
    const before = lower.slice(0, match.index);
    const lastDash = before.lastIndexOf('—'); // em dash
    if (lastDash === -1) return false; // this occurrence has no preceding pairing dash at all
  }
  return true;
}

interface Violation {
  file: string;
  text: string;
  word: string;
}

function findViolations(source: string, filePath: string): Violation[] {
  const { checked } = extractSurfaceStrings(source);
  const violations: Violation[] = [];
  for (const text of checked) {
    for (const banned of BANNED_WORDS) {
      const boundary = banned.includes(' ') ? banned : `\\b${banned}\\b`;
      const re = new RegExp(boundary, 'i');
      if (re.test(text) && !bannedWordIsAlwaysPaired(text, banned)) {
        violations.push({ file: filePath, text, word: banned });
      }
    }
  }
  return violations;
}

describe('the tongue — banned words never name anything on the surface', () => {
  it('finds zero violations across packages/bench/src (JSX text + aria-label/title/placeholder)', () => {
    const files = findAllTsxFiles(SRC_DIR);
    const allViolations = files.flatMap((f) => findViolations(readFileSync(f, 'utf8'), relative(SRC_DIR, f)));
    expect(allViolations).toEqual([]);
  });

  // A control on the control: prove the detector actually fires on an unpaired banned word,
  // and stays quiet on the pairing form and on the `Pairing` component's own `plain` prop —
  // otherwise an always-green grep would be worthless.
  it('DETECTOR CONTROL: fires on a bare banned word', () => {
    const violations = findViolations('<button aria-label="Open the thing">Open</button>', 'control.tsx');
    expect(violations.length).toBeGreaterThan(0);
  });

  it('DETECTOR CONTROL: stays quiet when the banned word is the paired plain-word half', () => {
    const violations = findViolations('<p>Plate — where the app renders</p>', 'control.tsx');
    expect(violations).toEqual([]);
  });

  it('DETECTOR CONTROL: stays quiet on Pairing\'s own plain prop', () => {
    const violations = findViolations('<Pairing word="Bench" plain="workspace — one per clamped repo" />', 'control.tsx');
    expect(violations).toEqual([]);
  });
});
