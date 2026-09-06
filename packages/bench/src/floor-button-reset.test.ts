import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Design floor item 1 (DESIGN-TEAM.md §6, FLOOR A — read the file yourself for the count,
 * never restate it here) — wave-3 council finding 4 (Blocker-class): with no global
 * `<button>` reset, Chrome's native ButtonFace (rgb(240,240,240)) rendered under `--ink`
 * text on the Properties tabs and most Rail tool buttons: contrast 1.09:1.
 *
 * This is the "declared class/rule contract" half of the fix (component-level, no real
 * browser needed) — it asserts the CSS rules exist with the right shape. The other half —
 * the LIVE measurement of `getComputedStyle` in a real browser, before and after — is done
 * separately (worker report, finding 4) since jsdom/vitest here never actually applies these
 * .css files (no `css: true` in vitest.config.ts), so `getComputedStyle` in a component test
 * would only ever see jsdom's own built-in defaults, never these rules.
 */

const BENCH_SRC = join(import.meta.dirname);

function read(relPath: string): string {
  return readFileSync(join(BENCH_SRC, relPath), 'utf8');
}

describe('design floor item 1 — every button gets a reset, never native ButtonFace (finding 4)', () => {
  it('index.css declares a global button reset: no native background/border/padding/font survive', () => {
    const css = read('index.css');
    const match = /button\s*\{([^}]*)\}/.exec(css);
    expect(match, 'expected a bare `button { ... }` rule in index.css').toBeTruthy();
    const body = match![1];
    expect(body).toMatch(/background\s*:\s*none/);
    expect(body).toMatch(/border\s*:\s*0/);
    expect(body).toMatch(/color\s*:\s*inherit/);
    expect(body).toMatch(/font\s*:\s*inherit/);
    expect(body).toMatch(/padding\s*:\s*0/);
    expect(body).toMatch(/cursor\s*:\s*pointer/);
  });

  it('index.css gives every button a visible :focus-visible outline in --storm', () => {
    const css = read('index.css');
    const match = /button:focus-visible\s*\{([^}]*)\}/.exec(css);
    expect(match, 'expected a `button:focus-visible { ... }` rule in index.css').toBeTruthy();
    expect(match![1]).toMatch(/outline/);
    expect(match![1]).toContain('var(--storm)');
  });

  it('the Properties tabs declare an explicit active ground (--bg3) and ink, not just an underline', () => {
    const css = read('chassis/PropertiesColumn.css');
    const active = /\.jig-properties__tabs button\[aria-selected='true'\]\s*\{([^}]*)\}/.exec(css);
    expect(active, "expected button[aria-selected='true'] { ... } in PropertiesColumn.css").toBeTruthy();
    expect(active![1]).toContain('var(--bg3)');
    expect(active![1]).toContain('var(--ink)');
  });

  it('the Properties tabs declare an explicit inactive ink (--dim)', () => {
    const css = read('chassis/PropertiesColumn.css');
    const base = /\.jig-properties__tabs button\[role='tab'\]\s*\{([^}]*)\}/.exec(css);
    expect(base, "expected button[role='tab'] { ... } in PropertiesColumn.css").toBeTruthy();
    expect(base![1]).toContain('var(--dim)');
  });

  it('Rail tools declare explicit backgrounds for both base and active/hover states (no reliance on ButtonFace)', () => {
    const css = read('chassis/Rail.css');
    const active = /\.jig-rail__tool--active\s*\{([^}]*)\}/.exec(css);
    expect(active, 'expected .jig-rail__tool--active { ... } in Rail.css').toBeTruthy();
    expect(active![1]).toContain('var(--bg3)');
    expect(active![1]).toContain('var(--ink)');
    const hover = /\.jig-rail__tool:hover\s*\{([^}]*)\}/.exec(css);
    expect(hover, 'expected .jig-rail__tool:hover { ... } in Rail.css').toBeTruthy();
    expect(hover![1]).toContain('var(--bg2)');
  });
});
