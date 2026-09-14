import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Retest 0.2.0 round 2, defect #67 — "the build stream overflows the prompt card and the Prompts
 * pane; the card shows too much of it."
 *
 * The build's presence has two tiers, and they are not the same tier:
 *
 * 1. **On the card** — a peek. The state line and the last three stream lines, wrapped, in a
 *    strip of FIXED height with no scrollbar of its own. The card is a control surface anchored
 *    beside a selection (#66): anything that grows with the stream makes it move, or makes it
 *    scroll, or pushes it past the plate's edge. So the stream contributes a constant height.
 * 2. **In the Prompts pane and the logbook drawer** — the record. The whole stream, wrapped, in a
 *    scroll box of its own. After #57 the tab panel is already the one scroll container in the
 *    right column, so a stream that sizes to its content pushes the pane's scroll around instead
 *    of scrolling itself.
 *
 * WHAT THIS TEST CANNOT DO. jsdom runs no layout engine and loads no CSS: every box measures 0,
 * so `scrollWidth > clientWidth` is `0 > 0` before AND after the fix, and the issue's own
 * "the card's height with 40 frames equals its height with 3" is trivially true either way.
 * There is no browser anywhere in this repo (no Playwright, no Puppeteer, none on either CI leg
 * — #64 is that slice). So the contract is pinned at the source, in `floor-viewport-scroll.ts`'s
 * idiom, with detector controls; the COUNT the card renders is pinned behaviourally in
 * `prompts/PromptCard.test.tsx`; and `docs/TEST-RUN.md` steps 16 and 17 carry the desk steps that
 * prove the rendering at 1280x720.
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

/** A box that takes a scrollbar of its own — `overflow`, `overflow-x` or `overflow-y`. */
function scrolls(body: string): boolean {
  return /overflow(-[xy])?\s*:\s*(auto|scroll)/.test(body);
}

/** A box whose height cannot be driven by what is inside it. `max-height` is deliberately NOT
 * fixed — bounded is not fixed, and a bounded box still grows until it hits the bound. */
function heightIsFixed(body: string): boolean {
  const match = body.match(/(?:^|[;{\s])height\s*:\s*([^;]+)/);
  if (!match) return false;
  return !/^(auto|fit-content|max-content|min-content|inherit|initial)\b/.test(match[1].trim());
}

const CARD = ['prompts', 'PromptCard.css'];
const PANE = ['prompts', 'PromptsPane.css'];
const LOGBOOK = ['logbook', 'LogbookDrawer.css'];

describe('retest #67 — the build stream is a peek on the card and a record in the pane', () => {
  it('the card\'s stream strip is a fixed height, and takes no scrollbar of its own', () => {
    const lines = ruleFor(sheet(...CARD), '.jig-prompt-card__stream-lines');
    expect(heightIsFixed(lines.body)).toBe(true);
    expect(scrolls(lines.body)).toBe(false);
    expect(lines.body).toMatch(/overflow:\s*hidden/);

    // The strip's wrapper must not grow or scroll either — a fixed strip inside a scrolling box
    // is still a card whose scrollbar appears the moment Claude says anything long.
    const strip = ruleFor(sheet(...CARD), '.jig-prompt-card__stream');
    expect(scrolls(strip.body)).toBe(false);
  });

  it('a stream line on the card wraps rather than running past the card\'s edge', () => {
    const line = ruleFor(sheet(...CARD), '.jig-prompt-card__stream li');
    expect(line.body).toMatch(/overflow-wrap:\s*anywhere/);
    expect(line.body).not.toMatch(/white-space:\s*(nowrap|pre)\b/);
  });

  it('the pane\'s stream is the record: its own scroll box, bounded, and wrapped', () => {
    const stream = ruleFor(sheet(...PANE), '.jig-prompts-pane__stream');
    expect(stream.body).toMatch(/max-height:\s*[^;]+/);
    expect(stream.body).toMatch(/overflow-y:\s*auto/);
    // Horizontally it never scrolls — a long transcript line wraps instead.
    expect(stream.body).not.toMatch(/overflow-x:\s*(auto|scroll)/);
    expect(stream.body).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('the logbook drawer already wraps its rows, and stays that way', () => {
    // Not a change — a guard. The drawer is the third surface the stream reaches, and #67 names
    // it; its body has scrolled inside itself and wrapped its text since #57.
    const body = ruleFor(sheet(...LOGBOOK), '.jig-logbook-drawer__body');
    expect(body.body).toMatch(/overflow-y:\s*auto/);
    expect(body.body).toMatch(/overflow-x:\s*hidden/);
    for (const selector of ['.jig-logbook-drawer__event', '.jig-logbook-drawer__note']) {
      expect(ruleFor(sheet(...LOGBOOK), selector).body).toMatch(/overflow-wrap:\s*anywhere/);
    }
  });

  // Controls on the controls.
  it('DETECTOR CONTROL: the scroll detector fires on every spelling and stays quiet otherwise', () => {
    expect(scrolls('overflow: auto;')).toBe(true);
    expect(scrolls('overflow-y: scroll;')).toBe(true);
    expect(scrolls('overflow-x: auto;')).toBe(true);
    expect(scrolls('overflow: hidden;')).toBe(false);
    expect(scrolls('overflow-wrap: anywhere;')).toBe(false); // the near-miss that shares a prefix
    expect(scrolls('padding: 6px 10px;')).toBe(false);
  });

  it('DETECTOR CONTROL: the fixed-height detector fires on a real height and stays quiet on auto and on max-height', () => {
    expect(heightIsFixed('height: 54px;')).toBe(true);
    expect(heightIsFixed('height: calc(3 * 17px);')).toBe(true);
    expect(heightIsFixed('height: auto;')).toBe(false);
    expect(heightIsFixed('height: fit-content;')).toBe(false);
    expect(heightIsFixed('max-height: 240px;')).toBe(false); // bounded is not fixed
    expect(heightIsFixed('line-height: 1.4;')).toBe(false);
    expect(heightIsFixed('padding: 6px 10px;')).toBe(false);
  });
});
