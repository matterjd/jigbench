import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DESIGN-TEAM.md §6 FLOOR A, items 1, 2 and 6, at the sketch sheet — the lead review's two
 * blockers on #68.
 *
 * `--faint` is the one ink the token file itself annotates: `--faint: #5c6672;  /* provenance
 * only — never load-bearing (a11y floor) *​/` (tokens.css:39). Measured on the bench's grounds it
 * is 3.22:1 on `--bg1` and 3.36:1 on `--bg0` — under floor item 1's 4.5:1. The strip's hint and
 * the empty sheet's sentence are the ENTIRE answer to #68 ("I do not see a way to add a button"),
 * which makes them the most load-bearing words on the surface, so they take the house secondary
 * ink instead. The in-repo precedent for a legitimate `--faint` is `Rail.css:69`, the shortcut
 * letter: "an echo of the aria-label's own shortcut letter — provenance only".
 *
 * Item 6 — "colour never carries meaning alone" — is the second: the held primitive differed from
 * its siblings by ground and ink only, one ladder step from the hover state, and the words that
 * name it disappear the moment the sheet has an element on it. `Rail.css:45-62` already ruled the
 * shape: the active tool takes a storm mark on top of the same bg3/ink pair.
 *
 * WHAT THIS TEST CANNOT DO. bench's vitest runs jsdom with CSS loading off — `getComputedStyle`
 * returns nothing for any of this, before OR after the fix. So the contract is pinned at the
 * source in `floor-build-stream-box.test.ts`'s idiom, with detector controls on the parser, and
 * `docs/TEST-RUN.md` step 19 is what proves the rendering at the desk.
 *
 * The gate names the ALLOWED inks rather than the forbidden one: a denylist on `--faint` goes
 * green the moment someone writes `#5c6672` by hand, or reaches for another sub-floor token.
 */

const SRC_DIR = import.meta.dirname;

interface Rule {
  selector: string;
  body: string;
}

/** Every rule in a stylesheet, comments stripped first so a selector quoted in prose never counts. */
function rulesOf(css: string): Rule[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    selector: m[1].trim().replace(/\s+/g, ' '),
    body: m[2],
  }));
}

function sheet(...parts: string[]): Rule[] {
  return rulesOf(readFileSync(join(SRC_DIR, ...parts), 'utf8'));
}

function ruleFor(rules: Rule[], selector: string): Rule {
  const found = rules.find((r) => r.selector === selector);
  if (!found) throw new Error(`no rule for ${selector}`);
  return found;
}

/** The rule's own `color` declaration — not `border-color`, not `background-color`. */
function inkOf(body: string): string | null {
  const match = body.match(/(?:^|[;{\s])color\s*:\s*([^;]+)/);
  return match ? match[1].trim() : null;
}

/** The inks a sentence a first-time user MUST read is allowed to be painted in. */
const LOAD_BEARING_INKS = ['var(--ink)', 'var(--dim)'];

const SKETCH_CSS = ['sketch', 'SketchSheet.css'];
const SKETCH_TSX = join(SRC_DIR, 'sketch', 'SketchSheet.tsx');

/** The words #68 commissioned, and the rule that paints each of them. */
const INSTRUCTIONS = [
  { selector: '.jig-sketch-sheet-panel__hint', says: 'click a primitive, then click the sheet' },
  { selector: '.jig-sketch-sheet-panel__sheet-empty', says: 'nothing on this sheet yet' },
];

describe('floor A at the sketch sheet — the instructions #68 commissioned are readable, and the held primitive is not colour alone', () => {
  it('both instruction sentences are painted in an ink the floor allows to carry meaning', () => {
    expect(INSTRUCTIONS.length).toBeGreaterThan(0);
    for (const { selector } of INSTRUCTIONS) {
      const ink = inkOf(ruleFor(sheet(...SKETCH_CSS), selector).body);
      expect(LOAD_BEARING_INKS, `${selector} is painted ${ink}`).toContain(ink);
    }
  });

  it('the gate has not gone blind: both classes are still rendered, carrying the words it is here for', () => {
    // A rule can be renamed or the sentence moved, and an assertion on a dead selector throws
    // rather than passing — but the WORDS are the thing the floor is about, so pin those too.
    const tsx = readFileSync(SKETCH_TSX, 'utf8');
    for (const { selector, says } of INSTRUCTIONS) {
      expect(tsx).toContain(selector.slice(1));
      expect(tsx).toContain(says);
    }
  });

  it('the held primitive carries a mark that is not colour — a shape, the way the rail does', () => {
    const mark = ruleFor(sheet(...SKETCH_CSS), '.jig-sketch-sheet-panel__primitive--active::before');
    expect(mark.body).toMatch(/content:\s*''/);
    expect(mark.body).toMatch(/position:\s*absolute/);
    // A mark with no size is not a mark.
    expect(mark.body).toMatch(/(height|width):\s*\d+px/);

    // An absolutely-positioned mark needs its button to be the containing block, or it lands
    // against the strip and every held primitive marks the same place.
    const button = ruleFor(sheet(...SKETCH_CSS), '.jig-sketch-sheet-panel__primitive');
    expect(button.body).toMatch(/position:\s*relative/);
  });

  // Controls on the control.
  it('DETECTOR CONTROL: `inkOf` reads the ink, never a property that merely ends in -color', () => {
    expect(inkOf('color: var(--dim);')).toBe('var(--dim)');
    expect(inkOf('  font: 11px var(--mono);\n  color: var(--faint);\n')).toBe('var(--faint)');
    expect(inkOf('border-color: var(--line);')).toBeNull();
    expect(inkOf('background-color: var(--bg3);')).toBeNull();
    expect(inkOf('background: var(--bg1);')).toBeNull();
  });

  it('DETECTOR CONTROL: the allowed set rejects the sub-floor ink and a hand-written copy of it', () => {
    expect(LOAD_BEARING_INKS).not.toContain('var(--faint)');
    expect(LOAD_BEARING_INKS).not.toContain('#5c6672');
  });
});
