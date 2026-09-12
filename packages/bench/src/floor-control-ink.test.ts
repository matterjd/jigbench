import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Retest 0.2.0 defect #56 — "the text you type is black on the dark card".
 *
 * Chrome does not inherit `color` (or `font`) into form controls: `input`, `textarea` and
 * `select` start from the UA's own `fieldtext`/`field` system colours and the UA's font, not
 * from the page. The bench sets its ink on the page (`body`, `.jig-chassis`), so ANY control
 * whose own rule forgets `color` renders in UA black on a `var(--bg2)` ground — unreadable,
 * with no hard-coded colour anywhere for `floor-colour-literals.test.ts` to catch. That test
 * counts wrong colours; this one counts MISSING ones.
 *
 * WHAT THIS TEST CANNOT DO. bench's vitest runs jsdom with CSS loading off, and jsdom ships no
 * UA stylesheet giving a `textarea` `fieldtext` — so a `getComputedStyle(textarea).color`
 * assertion is GREEN before the fix and proves nothing. That is precisely how this defect
 * reached the desk past a green suite. So the contract is pinned at the source, the same way
 * `Chassis.test.tsx`'s layout contract and `floor-colour-literals.test.ts` are, and the desk
 * step in `docs/TEST-RUN.md` is what proves the rendering.
 */

const SRC_DIR = import.meta.dirname;
const BASE_STYLESHEET = join(SRC_DIR, 'index.css');

/** The three element types that do not inherit page ink in a browser. */
const CONTROL_TAGS = ['input', 'textarea', 'select'] as const;

function findAllFiles(dir: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findAllFiles(full, pattern));
    else if (pattern.test(entry.name)) out.push(full);
  }
  return out;
}

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

function declares(body: string, property: string): boolean {
  return new RegExp(`(^|;)\\s*${property}\\s*:`).test(body);
}

/** The base reset: a rule whose selector list is BARE type selectors covering every control tag. */
function findControlReset(css: string): Rule | undefined {
  return rulesOf(css).find((rule) => {
    const parts = rule.selector.split(',').map((s) => s.trim());
    return CONTROL_TAGS.every((tag) => parts.includes(tag));
  });
}

describe('retest #56 — form controls take the house ink, never the browser default', () => {
  const baseCss = readFileSync(BASE_STYLESHEET, 'utf8');

  it('the base stylesheet resets input, textarea and select to the inherited ink and font', () => {
    const reset = findControlReset(baseCss);
    expect(reset, 'index.css has no `input, textarea, select` reset — a control with no colour rule of its own renders UA black on the dark ground').toBeDefined();
    expect(declares(reset!.body, 'color')).toBe(true);
    expect(reset!.body).toMatch(/color:\s*inherit/);
    expect(reset!.body).toMatch(/font:\s*inherit/);
  });

  it('the reset carries no background of its own, so a checkbox and a radio keep their native box', () => {
    // `.jig-rail__advanced input` and the Advanced drawer's rulers switch are real checkboxes;
    // a blanket `background` in the reset would paint them. Ink and font are safe for every
    // control type, a background is not — the ground belongs to each component's own rule.
    const reset = findControlReset(baseCss);
    expect(reset).toBeDefined();
    expect(declares(reset!.body, 'background')).toBe(false);
    expect(declares(reset!.body, 'background-color')).toBe(false);
  });

  it('the reset is bare type selectors only, so it never outranks a component rule that dims a control on purpose', () => {
    const reset = findControlReset(baseCss);
    expect(reset).toBeDefined();
    for (const part of reset!.selector.split(',').map((s) => s.trim())) {
      expect(CONTROL_TAGS as readonly string[]).toContain(part);
    }
    expect(reset!.body).not.toMatch(/!important/);
  });

  it('every control element the bench actually renders is covered by the reset', () => {
    const tsx = findAllFiles(SRC_DIR, /\.tsx?$/).filter((f) => !/\.test\.tsx?$/.test(f));
    const rendered = new Set<string>();
    for (const file of tsx) {
      for (const match of readFileSync(file, 'utf8').matchAll(/<(input|textarea|select)[\s/>]/g)) {
        rendered.add(match[1]);
      }
    }
    expect(rendered.size, 'no form control found in the bench at all — the scanner has gone blind').toBeGreaterThan(0);

    const reset = findControlReset(baseCss);
    const covered = new Set((reset?.selector ?? '').split(',').map((s) => s.trim()));
    expect([...rendered].filter((tag) => !covered.has(tag))).toEqual([]);
  });

  it('the two controls the retest named carry a house ground, and neither is left on the UA default', () => {
    // The defect itself: `.jig-prompt-card textarea` and `.jig-prompt-card__acc-list input`
    // both set `background: var(--bg2)` and neither set `color`. With the reset above they
    // inherit `--ink`; this pins that they still have a ground of their own to sit on, so a
    // later edit cannot leave a control with house ink on a native-light field.
    const cardCss = readFileSync(join(SRC_DIR, 'prompts', 'PromptCard.css'), 'utf8');
    for (const selector of ['.jig-prompt-card textarea', '.jig-prompt-card__acc-list input']) {
      const rule = rulesOf(cardCss).find((r) => r.selector === selector);
      expect(rule, `no rule for ${selector}`).toBeDefined();
      expect(rule!.body).toMatch(/background:\s*var\(--/);
    }
  });

  it('the sketch properties panel gives its own text controls a rule, not just its select', () => {
    // Same hole, one surface over: `SketchProperties.tsx` renders a `content` textarea and a
    // `label` input inside `.jig-sketch-properties__field`, which had a rule for `select`
    // alone — so those two took the UA's ink AND the UA's ground.
    const css = readFileSync(join(SRC_DIR, 'sketch', 'SketchProperties.css'), 'utf8');
    const covered = rulesOf(css).filter((r) => r.selector.includes('.jig-sketch-properties__field'));
    const selectors = covered.map((r) => r.selector).join(' | ');
    expect(selectors).toMatch(/\btextarea\b/);
    expect(selectors).toMatch(/\binput\b/);
  });

  // Controls on the controls: the parser must find what it claims to find, and must not
  // mistake a near-miss for the reset.
  it('DETECTOR CONTROL: finds a reset spelled as a bare type-selector list, in any order', () => {
    expect(findControlReset('textarea,\nselect,\ninput {\n  color: inherit;\n}')).toBeDefined();
    expect(findControlReset('input, textarea, select { color: inherit; font: inherit; }')).toBeDefined();
  });

  it('DETECTOR CONTROL: stays blind to a partial list, a scoped list, and a selector inside a comment', () => {
    expect(findControlReset('input, textarea { color: inherit; }')).toBeUndefined();
    expect(findControlReset('.card input, .card textarea, .card select { color: inherit; }')).toBeUndefined();
    expect(findControlReset('/* input, textarea, select { color: inherit; } */\nbody { margin: 0; }')).toBeUndefined();
  });

  it('DETECTOR CONTROL: `declares` reads a declaration, never a value that merely contains the word', () => {
    expect(declares('color: inherit;', 'color')).toBe(true);
    expect(declares('  caret-color: var(--ink);\n  color: inherit;', 'color')).toBe(true);
    expect(declares('caret-color: var(--ink);', 'color')).toBe(false);
    expect(declares('border: 1px solid var(--line);', 'background')).toBe(false);
  });
});
