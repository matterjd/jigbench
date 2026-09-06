import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PlateGuides } from './PlateGuides.js';

afterEach(cleanup);

describe('PlateGuides', () => {
  it('renders nothing visible when there is no pick', () => {
    const { container } = render(<PlateGuides rect={null} grid={{ px: 4, fallbackUsed: false }} />);
    expect(container.querySelector('.jig-plate-guides__line')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('draws four guide lines at the picked rect\'s edges', () => {
    const { container } = render(
      <PlateGuides rect={{ x: 184, y: 220, width: 456, height: 40 }} grid={{ px: 4, fallbackUsed: false }} />,
    );
    const lines = container.querySelectorAll('.jig-plate-guides__line');
    expect(lines).toHaveLength(4);
  });

  it('prints the honest grid readout beside the guides', () => {
    render(<PlateGuides rect={{ x: 184, y: 220, width: 456, height: 40 }} grid={{ px: 4, fallbackUsed: false }} />);
    expect(screen.getByRole('status').textContent).toBe('456×40 @ 184,220 · on the 4px grid');
  });

  it('names the off-grid axis and its deviation for a real off-grid element', () => {
    render(<PlateGuides rect={{ x: 184, y: 220, width: 456, height: 38 }} grid={{ px: 4, fallbackUsed: false }} />);
    expect(screen.getByRole('status').textContent).toBe('456×38 @ 184,220 · off the 4px grid by 2.0px (h)');
  });

  it('discloses when the grid unit is a fallback rather than a surveyed one', () => {
    render(<PlateGuides rect={{ x: 0, y: 0, width: 10, height: 10 }} grid={{ px: 4, fallbackUsed: true }} />);
    expect(screen.getByText(/fallback grid — no space gauges surveyed/i)).toBeTruthy();
  });

  it('never shows the fallback note when the grid came from a surveyed gauge', () => {
    render(<PlateGuides rect={{ x: 0, y: 0, width: 8, height: 8 }} grid={{ px: 4, fallbackUsed: false }} />);
    expect(screen.queryByText(/fallback grid/i)).toBeNull();
  });
});
