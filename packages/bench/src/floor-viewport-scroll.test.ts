import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Retest 0.2.0 defect #57 — "the whole page scrolls instead of the column".
 *
 * Concept D / `docs/team/v0.2/CHASSIS.md`: one status line at the bottom, the plate filling the
 * middle, and **the page never scrolls**. A tall panel — the Design system with every gauge a
 * real repo has — has to scroll INSIDE its tab panel; if the chassis itself takes the scrollbar,
 * the rail and the status line ride off the bottom of the viewport with it.
 *
 * The two mechanisms this pins, because they are what actually went wrong:
 *
 * 1. **A bare `1fr` track has an automatic minimum of `auto`** — i.e. its content's min-content
 *    size — so a track spelled `1fr` cannot be shorter than what is inside it, and a long panel
 *    grows the grid past its container instead of scrolling. `minmax(0, 1fr)` is the spelling
 *    that says "this row may be shorter than its content"; every row that holds a scrolling
 *    region has to use it.
 * 2. **One scroll container per region, and it is the innermost box** — the active tab panel,
 *    the drawer's section, the logbook's body. A region that is merely `overflow: hidden` (as
 *    the right column was) clips nothing useful: its content still contributes its full height
 *    to the track above it.
 *
 * WHAT THIS TEST CANNOT DO. jsdom runs no layout engine: every box measures 0, so
 * `document.documentElement.scrollHeight <= innerHeight` is trivially true before AND after the
 * fix. The issue anticipated this and offered the floor e2e instead — there is no e2e harness in
 * this repo (no Playwright, no Puppeteer, no browser on either CI leg), so the contract is
 * pinned at the source, the same way `Chassis.test.tsx` already pins the grid, and
 * `docs/TEST-RUN.md` carries the desk step that proves the rendering at both viewports.
 */

const SRC_DIR = join(import.meta.dirname);

interface Rule {
  selector: string;
  body: string;
}

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

/** A track list spelled with a bare `1fr` — the one that cannot shrink below its content. */
function hasBareFrTrack(body: string): boolean {
  const match = body.match(/grid-template-(?:rows|columns)\s*:\s*([^;]+)/);
  if (!match) return false;
  // Drop every minmax(...) first; what is left is the bare tracks.
  const bare = match[1].replace(/minmax\([^)]*\)/g, '');
  return /(^|\s)1fr(\s|$)/.test(bare);
}

const CHASSIS = ['chassis', 'Chassis.css'];
const COLUMN = ['chassis', 'RightColumn.css'];
const ADVANCED = ['chassis', 'AdvancedDrawer.css'];
const LOGBOOK = ['logbook', 'LogbookDrawer.css'];

describe('retest #57 — the page never scrolls; a tall panel scrolls inside itself', () => {
  it('the chassis is a fixed viewport grid — 100vh, and the page itself cannot scroll', () => {
    const root = ruleFor(sheet(...CHASSIS), '.jig-chassis');
    expect(root.body).toMatch(/height:\s*100vh/);
    // Reverses v0.1's "never `hidden`" fallback, on Matter's own ruling in #57: a whole-chassis
    // scrollbar does not keep a floored region visible, it carries the rail and the status line
    // off the viewport with it.
    expect(root.body).toMatch(/overflow:\s*hidden/);
    expect(root.body).not.toMatch(/overflow:\s*(auto|scroll)/);
  });

  it('every row that holds a scrolling region is minmax(0, 1fr), never a bare 1fr', () => {
    const offenders: string[] = [];
    const cases: Array<[string[], string]> = [
      [CHASSIS, '.jig-chassis'],
      [CHASSIS, '.jig-chassis__bench'],
      [COLUMN, '.jig-right-column'],
      [ADVANCED, '.jig-advanced'],
      [LOGBOOK, '.jig-logbook-drawer'],
    ];
    for (const [file, selector] of cases) {
      if (hasBareFrTrack(ruleFor(sheet(...file), selector).body)) offenders.push(selector);
    }
    expect(offenders).toEqual([]);
  });

  it('the bench row is bounded, so the three regions cannot grow it past the viewport', () => {
    const bench = ruleFor(sheet(...CHASSIS), '.jig-chassis__bench');
    expect(bench.body).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\)/);
    expect(bench.body).toMatch(/min-height:\s*0/);
    // The column split is unchanged — this fix is about height, not width.
    expect(bench.body).toMatch(/grid-template-columns:\s*56px\s+minmax\(560px,\s*1fr\)\s+340px/);
  });

  it('the right column fills its slot rather than sizing to its content', () => {
    const column = ruleFor(sheet(...COLUMN), '.jig-right-column');
    // Without this the column is a block box of `height: auto` inside a stretched grid item, so
    // its `1fr` row resolves against its own content and the bounded row above buys nothing.
    expect(column.body).toMatch(/height:\s*100%/);
    expect(column.body).toMatch(/grid-template-rows:\s*40px\s+minmax\(0,\s*1fr\)/);
  });

  it('the active tab panel is the one scroll container in the right column', () => {
    const pane = ruleFor(sheet(...COLUMN), '.jig-right-column__pane');
    expect(pane.body).toMatch(/min-height:\s*0/);
    expect(pane.body).toMatch(/overflow-y:\s*auto/);
  });

  it('the Advanced drawer and the logbook drawer scroll inside their own body, by the same rule', () => {
    const advancedBody = ruleFor(sheet(...ADVANCED), '.jig-advanced__body');
    expect(advancedBody.body).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\)/);
    expect(advancedBody.body).toMatch(/min-height:\s*0/);

    const section = ruleFor(sheet(...ADVANCED), '.jig-advanced__section');
    expect(section.body).toMatch(/min-height:\s*0/);
    expect(section.body).toMatch(/overflow-y:\s*auto/);

    const logbookBody = ruleFor(sheet(...LOGBOOK), '.jig-logbook-drawer__body');
    expect(logbookBody.body).toMatch(/min-height:\s*0/);
    expect(logbookBody.body).toMatch(/overflow-y:\s*auto/);
  });

  it('the Clamp screen keeps its own scroll — it replaces the three regions, it is not one of them', () => {
    // `.jig-chassis__screen` is the one region that is a whole page of its own, and it always
    // scrolled inside itself. The chassis going `hidden` must not take that away.
    const screenRule = ruleFor(sheet(...CHASSIS), '.jig-chassis__screen');
    expect(screenRule.body).toMatch(/min-height:\s*0/);
    expect(screenRule.body).toMatch(/overflow:\s*auto/);
  });

  // Controls on the controls.
  it('DETECTOR CONTROL: the bare-1fr detector fires on a bare track and stays quiet on minmax', () => {
    expect(hasBareFrTrack('grid-template-rows: 40px 1fr;')).toBe(true);
    expect(hasBareFrTrack('grid-template-rows: 1fr 28px;')).toBe(true);
    expect(hasBareFrTrack('grid-template-columns: 1.5fr 1fr 1fr 1fr;')).toBe(true);
    expect(hasBareFrTrack('grid-template-rows: 40px minmax(0, 1fr);')).toBe(false);
    expect(hasBareFrTrack('grid-template-rows: minmax(0, 1fr) 28px;')).toBe(false);
    expect(hasBareFrTrack('grid-template-columns: 56px minmax(560px, 1fr) 340px;')).toBe(false);
    expect(hasBareFrTrack('display: grid;')).toBe(false);
  });

  it('DETECTOR CONTROL: rulesOf skips a selector quoted inside a comment', () => {
    expect(rulesOf('/* .x { overflow: auto; } */ .y { margin: 0; }').map((r) => r.selector)).toEqual(['.y']);
  });
});
