import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PropertiesColumn } from './PropertiesColumn.js';

const HERE = dirname(fileURLToPath(import.meta.url));

afterEach(cleanup);

describe('PropertiesColumn', () => {
  it('defaults to the Loupe tab and renders all three tab labels', () => {
    render(
      <PropertiesColumn loupe={<div>loupe content</div>} gauges={<div>gauges content</div>} survey={<div>survey content</div>} />,
    );
    expect(screen.getByRole('tab', { name: /Loupe/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Gauges/ }).getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('tab', { name: /Survey/ }).getAttribute('aria-selected')).toBe('false');
    expect(screen.getByText('loupe content')).toBeTruthy();
  });

  it('switches tabs on click', () => {
    render(
      <PropertiesColumn loupe={<div>loupe content</div>} gauges={<div>gauges content</div>} survey={<div>survey content</div>} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /Gauges/ }));
    expect(screen.getByRole('tab', { name: /Gauges/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('gauges content')).toBeTruthy();
    expect(screen.queryByText('loupe content')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Survey/ }));
    expect(screen.getByText('survey content')).toBeTruthy();
  });

  it('renders a Fixture tab when fixture content is provided, and switches to it on click', () => {
    render(
      <PropertiesColumn
        loupe={<div>loupe content</div>}
        gauges={<div>gauges content</div>}
        survey={<div>survey content</div>}
        fixture={<div>fixture content</div>}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /Fixture/ }));
    expect(screen.getByRole('tab', { name: /Fixture/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('fixture content')).toBeTruthy();
    expect(screen.queryByText('loupe content')).toBeNull();
  });

  // S8 — the Toolpath tool's recorder/replay bar gets a fifth tab, the exact same
  // optional-prop pattern S7's Fixture tab above already established.
  it('renders a Toolpath tab when toolpath content is provided, and switches to it on click', () => {
    render(
      <PropertiesColumn
        loupe={<div>loupe content</div>}
        gauges={<div>gauges content</div>}
        survey={<div>survey content</div>}
        toolpath={<div>toolpath content</div>}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /Toolpath/ }));
    expect(screen.getByRole('tab', { name: /Toolpath/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('toolpath content')).toBeTruthy();
    expect(screen.queryByText('loupe content')).toBeNull();
  });

  it('the Toolpath tab is controllable — passing activeTab="toolpath" selects it without a click', () => {
    render(
      <PropertiesColumn
        loupe={<div>loupe content</div>}
        gauges={<div>gauges content</div>}
        survey={<div>survey content</div>}
        toolpath={<div>toolpath content</div>}
        activeTab="toolpath"
      />,
    );
    expect(screen.getByRole('tab', { name: /Toolpath/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('toolpath content')).toBeTruthy();
  });

  it('no Toolpath tab renders when no toolpath content is provided', () => {
    render(
      <PropertiesColumn loupe={<div>loupe content</div>} gauges={<div>gauges content</div>} survey={<div>survey content</div>} />,
    );
    expect(screen.queryByRole('tab', { name: /Toolpath/ })).toBeNull();
  });

  it('the Fixture tab is controllable — passing activeTab="fixture" selects it without a click', () => {
    render(
      <PropertiesColumn
        loupe={<div>loupe content</div>}
        gauges={<div>gauges content</div>}
        survey={<div>survey content</div>}
        fixture={<div>fixture content</div>}
        activeTab="fixture"
      />,
    );
    expect(screen.getByRole('tab', { name: /Fixture/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('fixture content')).toBeTruthy();
  });

  it('starts at the default width with no printed affordance shown', () => {
    const { container } = render(
      <PropertiesColumn loupe={<div />} gauges={<div />} survey={<div />} />,
    );
    const region = container.querySelector('.jig-properties') as HTMLElement;
    expect(region.style.width).toBe('320px');
    expect(screen.queryByRole('button', { name: /printed/i })).toBeNull();
  });

  it('dragging the resize handle changes the column width and reveals the printed affordance', () => {
    const { container } = render(
      <PropertiesColumn loupe={<div />} gauges={<div />} survey={<div />} />,
    );
    const region = container.querySelector('.jig-properties') as HTMLElement;
    const handle = screen.getByRole('separator', { name: /resize the properties column/i });

    fireEvent.mouseDown(handle, { clientX: 1000 });
    fireEvent.mouseMove(window, { clientX: 940 }); // dragged left by 60px -> wider
    fireEvent.mouseUp(window);

    expect(region.style.width).toBe('380px');
    expect(screen.getByRole('button', { name: /printed/i })).toBeTruthy();
  });

  it('the printed affordance returns the column to its default width', () => {
    const { container } = render(
      <PropertiesColumn loupe={<div />} gauges={<div />} survey={<div />} />,
    );
    const region = container.querySelector('.jig-properties') as HTMLElement;
    const handle = screen.getByRole('separator', { name: /resize the properties column/i });

    fireEvent.mouseDown(handle, { clientX: 1000 });
    fireEvent.mouseMove(window, { clientX: 940 });
    fireEvent.mouseUp(window);
    expect(region.style.width).toBe('380px');

    fireEvent.click(screen.getByRole('button', { name: /printed/i }));
    expect(region.style.width).toBe('320px');
    expect(screen.queryByRole('button', { name: /printed/i })).toBeNull();
  });

  it('accepts an externally-controlled active tab (e.g. a Loupe gauge chip switching to Gauges)', () => {
    const onTabChange = vi.fn();
    const { rerender } = render(
      <PropertiesColumn
        loupe={<div>loupe content</div>}
        gauges={<div>gauges content</div>}
        survey={<div>survey content</div>}
        activeTab="loupe"
        onTabChange={onTabChange}
      />,
    );
    expect(screen.getByText('loupe content')).toBeTruthy();
    rerender(
      <PropertiesColumn
        loupe={<div>loupe content</div>}
        gauges={<div>gauges content</div>}
        survey={<div>survey content</div>}
        activeTab="gauges"
        onTabChange={onTabChange}
      />,
    );
    expect(screen.getByText('gauges content')).toBeTruthy();
  });

  it('clamps the width to a sane minimum and maximum', () => {
    const { container } = render(
      <PropertiesColumn loupe={<div />} gauges={<div />} survey={<div />} />,
    );
    const region = container.querySelector('.jig-properties') as HTMLElement;
    const handle = screen.getByRole('separator', { name: /resize the properties column/i });

    fireEvent.mouseDown(handle, { clientX: 1000 });
    fireEvent.mouseMove(window, { clientX: 2000 }); // dragged far right -> would go far below min
    fireEvent.mouseUp(window);
    expect(region.style.width).toBe('240px'); // clamped to the minimum
  });
});

// Wave-4 fix (TEST-RUN.md's first live test, defects 1 & 3): "we will need a scroll bar on
// properties tabs. I can see the other props under gauges and survey" — the tab body never
// had a bounded height to scroll IN, so long tabs (Gauges, Survey) spilled out of the chassis
// and over the tray below. jsdom has no real grid/flex layout engine (getBoundingClientRect
// reports 0s here), so — same as Chassis.test.tsx and TrayRegion.test.tsx's "design floor"
// suite — this reads the actual rule out of PropertiesColumn.css.
describe('PropertiesColumn — layout contract: the tab body scrolls, it never grows past its row', () => {
  const css = readFileSync(join(HERE, 'PropertiesColumn.css'), 'utf8');

  function ruleFor(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`));
    if (!match) throw new Error(`no rule found for ${selector} in PropertiesColumn.css`);
    return match[0];
  }

  it('the column root fills the height the chassis grid row gives it', () => {
    expect(ruleFor('.jig-properties')).toMatch(/height:\s*100%/);
  });

  it('the tab body scrolls vertically with a visible, token-coloured scrollbar', () => {
    const pane = ruleFor('.jig-properties__pane');
    expect(pane).toMatch(/overflow-y:\s*auto/);
    expect(pane).toMatch(/min-height:\s*0/);
    expect(css).toMatch(/\.jig-properties__pane::-webkit-scrollbar\s*\{/);
    expect(pane).toMatch(/scrollbar-color:\s*var\(--line\)/);
  });
});
