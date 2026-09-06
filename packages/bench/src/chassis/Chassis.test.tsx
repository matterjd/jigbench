import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Chassis } from './Chassis.js';

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
