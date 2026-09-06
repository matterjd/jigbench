import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PropertiesColumn } from './PropertiesColumn.js';

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
