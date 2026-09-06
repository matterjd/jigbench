import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Chassis } from './Chassis.js';

const HERE = dirname(fileURLToPath(import.meta.url));

afterEach(cleanup);

describe('Chassis', () => {
  it('renders every region CHASSIS.md names', () => {
    render(
      <Chassis
        rail={<div>rail content</div>}
        plate={<div>plate content</div>}
        properties={<div>properties content</div>}
        tray={<div>tray content</div>}
        bottomBar={<div>bottom bar content</div>}
      />,
    );
    expect(screen.getByText('rail content')).toBeTruthy();
    expect(screen.getByText('plate content')).toBeTruthy();
    expect(screen.getByText('properties content')).toBeTruthy();
    expect(screen.getByText('tray content')).toBeTruthy();
    expect(screen.getByText('bottom bar content')).toBeTruthy();
  });

  it('the tray region is collapsed (~56px) by default', () => {
    const { container } = render(
      <Chassis rail={<div />} plate={<div />} properties={<div />} tray={<div />} bottomBar={<div />} />,
    );
    const tray = container.querySelector('.jig-chassis__tray') as HTMLElement;
    expect(tray.className).toContain('jig-chassis__tray--collapsed');
  });

  it('expands the tray region when trayExpanded is true', () => {
    const { container } = render(
      <Chassis
        rail={<div />}
        plate={<div />}
        properties={<div />}
        tray={<div />}
        bottomBar={<div />}
        trayExpanded
      />,
    );
    const tray = container.querySelector('.jig-chassis__tray') as HTMLElement;
    expect(tray.className).toContain('jig-chassis__tray--expanded');
    expect(tray.className).not.toContain('jig-chassis__tray--collapsed');
  });
});

// Wave-4 fix (TEST-RUN.md's first live test): the chassis is a CSS grid, and jsdom does not
// run a real layout engine (getBoundingClientRect/getComputedStyle report nothing useful for
// grid tracks here) — same as TrayRegion.test.tsx's "design floor: ember" suite, this reads
// the actual rules out of Chassis.css, the only reliable way to pin the layout contract in
// this test environment.
describe('Chassis — layout contract: the grid never overflows the window', () => {
  const css = readFileSync(join(HERE, 'Chassis.css'), 'utf8');

  function ruleFor(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`));
    if (!match) throw new Error(`no rule found for ${selector} in Chassis.css`);
    return match[0];
  }

  it('the chassis root fills the viewport exactly, with the whole-chassis fallback scroll', () => {
    const root = ruleFor('.jig-chassis');
    expect(root).toMatch(/height:\s*100vh/);
    // NOT `overflow: hidden` — that would clip an over-minimum layout instead of scrolling it.
    expect(root).toMatch(/overflow:\s*auto/);
  });

  it('the plate row and the plate/properties columns carry an explicit usable floor (~560x400)', () => {
    const root = ruleFor('.jig-chassis');
    expect(root).toMatch(/grid-template-rows:\s*minmax\(400px,\s*1fr\)/);
    expect(root).toMatch(/grid-template-columns:\s*56px\s+minmax\(560px,\s*1fr\)\s+minmax\(240px,\s*560px\)/);
  });

  it('every region is min-height: 0 (and the plate/properties columns are also min-width: 0) so none can push another off-screen', () => {
    for (const region of ['rail', 'plate', 'properties', 'tray', 'bottom-bar']) {
      expect(ruleFor(`.jig-chassis__${region}`)).toMatch(/min-height:\s*0/);
    }
    expect(ruleFor('.jig-chassis__plate')).toMatch(/min-width:\s*0/);
    expect(ruleFor('.jig-chassis__properties')).toMatch(/min-width:\s*0/);
  });

  // Defect 3: "the tray and its mark prompt are never under the properties column."
  it('stacks the tray above the properties column', () => {
    const trayZ = Number(ruleFor('.jig-chassis__tray').match(/z-index:\s*(\d+)/)?.[1]);
    const propsZ = Number(ruleFor('.jig-chassis__properties').match(/z-index:\s*(\d+)/)?.[1]);
    expect(Number.isNaN(trayZ)).toBe(false);
    expect(Number.isNaN(propsZ)).toBe(false);
    expect(trayZ).toBeGreaterThan(propsZ);
  });

  // Defects 5 & 6: the collapsed tray must be tall enough for the header, the badge, a slice
  // of the human face, AND the pinned RELEASE/scrap footer — not the old fixed 56px.
  it('the collapsed tray is taller than the old 56px, and still leaves the plate its 400px floor at 1280x720', () => {
    const collapsed = ruleFor('.jig-chassis__tray--collapsed');
    const heightMatch = collapsed.match(/height:\s*(\d+)px/);
    expect(heightMatch).toBeTruthy();
    const trayHeight = Number(heightMatch![1]);
    expect(trayHeight).toBeGreaterThan(56);
    const bottomBarHeight = 32; // .jig-chassis__bottom-bar's fixed height, asserted elsewhere
    expect(720 - trayHeight - bottomBarHeight).toBeGreaterThanOrEqual(400);
  });
});
