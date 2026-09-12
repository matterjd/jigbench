import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Chassis } from './Chassis.js';

const HERE = dirname(fileURLToPath(import.meta.url));

afterEach(cleanup);

describe('Chassis (S12: rail | plate(+advanced drawer) | column, one status line)', () => {
  it('renders rail, plate, column, and the status line', () => {
    render(
      <Chassis
        rail={<div>rail content</div>}
        plate={<div>plate content</div>}
        column={<div>column content</div>}
        statusLine={<div>status line content</div>}
      />,
    );
    expect(screen.getByText('rail content')).toBeTruthy();
    expect(screen.getByText('plate content')).toBeTruthy();
    expect(screen.getByText('column content')).toBeTruthy();
    expect(screen.getByText('status line content')).toBeTruthy();
  });

  it('does not render an Advanced drawer region at all when none is given (off by default)', () => {
    const { container } = render(
      <Chassis rail={<div />} plate={<div />} column={<div />} statusLine={<div />} />,
    );
    expect(container.querySelector('.jig-chassis__advanced-slot')?.textContent).toBe('');
  });

  it('renders ONLY the screen (and the status line) when a screen is given — the Clamp screen replaces rail, plate and column (S17b)', () => {
    const { container } = render(
      <Chassis
        rail={<div>rail content</div>}
        plate={<div>plate content</div>}
        column={<div>column content</div>}
        statusLine={<div>status line content</div>}
        screen={<div>clamp screen content</div>}
      />,
    );
    expect(screen.getByText('clamp screen content')).toBeTruthy();
    expect(screen.getByText('status line content')).toBeTruthy();
    expect(screen.queryByText('rail content')).toBeNull();
    expect(screen.queryByText('plate content')).toBeNull();
    expect(screen.queryByText('column content')).toBeNull();
    expect(container.querySelector('.jig-chassis__bench')).toBeNull();
    expect(container.querySelector('.jig-chassis__screen')).toBeTruthy();
  });

  it('renders the Advanced drawer content when given', () => {
    render(
      <Chassis
        rail={<div />}
        plate={<div />}
        column={<div />}
        statusLine={<div />}
        advancedDrawer={<div>advanced drawer content</div>}
      />,
    );
    expect(screen.getByText('advanced drawer content')).toBeTruthy();
  });
});

// jsdom runs no real layout engine, so (same pattern as the v0.1 Chassis/floor tests) the grid
// contract is pinned by reading the actual CSS rules, not by measuring boxes.
describe('Chassis — layout contract', () => {
  const css = readFileSync(join(HERE, 'Chassis.css'), 'utf8');

  function ruleFor(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`));
    if (!match) throw new Error(`no rule found for ${selector} in Chassis.css`);
    return match[0];
  }

  // Retest #57 reversed two lines of this contract, and this test is where they were written
  // down: the chassis used to be `overflow: auto` ("never `hidden`" — v0.1's fallback, so a
  // floored region got a scrollbar rather than being clipped) with a bare `1fr` bench row.
  // Matter's ruling is that the page must never scroll: that fallback carried the rail and the
  // status line off the viewport instead of keeping anything visible. `floor-viewport-scroll.test.ts`
  // holds the whole new contract across all four stylesheets; these two lines change here so
  // the old decision is reversed in the open rather than left contradicting its replacement.
  it('the root fills the viewport with one bounded row for the bench and one 28px row for the status line, and cannot scroll itself', () => {
    // `\s*\{` in ruleFor only matches whitespace-then-brace immediately after the selector, so
    // '.jig-chassis' here correctly misses '.jig-chassis__bench {' (no whitespace before '__').
    const root = ruleFor('.jig-chassis');
    expect(root).toMatch(/height:\s*100vh/);
    expect(root).toMatch(/overflow:\s*hidden/);
    expect(root).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\)\s+28px/);
  });

  it('the bench splits into rail (56px) | centre (flexible) | column (340px)', () => {
    const bench = ruleFor('.jig-chassis__bench');
    expect(bench).toMatch(/grid-template-columns:\s*56px\s+minmax\(560px,\s*1fr\)\s+340px/);
  });

  it('the centre stacks the plate (a floored 1fr) over the advanced-drawer slot (auto — 0 height when empty)', () => {
    const centre = ruleFor('.jig-chassis__centre');
    expect(centre).toMatch(/grid-template-rows:\s*minmax\(400px,\s*1fr\)\s+auto/);
  });

  it('the screen slot fills the bench row and scrolls inside itself, never the page', () => {
    const screenRule = ruleFor('.jig-chassis__screen');
    expect(screenRule).toMatch(/min-height:\s*0/);
    expect(screenRule).toMatch(/overflow:\s*auto/);
  });

  it('every region is min-height/min-width: 0 so none can push another off-screen', () => {
    expect(ruleFor('.jig-chassis__centre')).toMatch(/min-height:\s*0/);
    expect(ruleFor('.jig-chassis__centre')).toMatch(/min-width:\s*0/);
    expect(ruleFor('.jig-chassis__plate')).toMatch(/min-height:\s*0/);
    expect(ruleFor('.jig-chassis__column')).toMatch(/min-height:\s*0/);
  });
});
