import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { PlateRulers } from './PlateRulers.js';

afterEach(cleanup);

describe('PlateRulers', () => {
  it('renders a top ruler, a left ruler, and a corner box reading the plate\'s unit', () => {
    const { container, getByText } = render(<PlateRulers cursor={null} />);
    expect(container.querySelector('.jig-plate-rulers__top canvas')).toBeTruthy();
    expect(container.querySelector('.jig-plate-rulers__left canvas')).toBeTruthy();
    expect(getByText('px')).toBeTruthy();
  });

  // jsdom has no real canvas 2D context (getContext('2d') returns null), so this only proves
  // the component never throws when the context is unavailable — the actual tick drawing is
  // verified visually in the live browser check.
  it('does not throw when the canvas 2D context is unavailable', () => {
    expect(() => render(<PlateRulers cursor={null} />)).not.toThrow();
  });

  it('shows a cursor readout on each ruler when a cursor position is given', () => {
    const { getByText } = render(<PlateRulers cursor={{ x: 184, y: 220 }} />);
    expect(getByText('184')).toBeTruthy();
    expect(getByText('220')).toBeTruthy();
  });

  it('shows no cursor readout when cursor is null', () => {
    const { queryByTestId } = render(<PlateRulers cursor={null} />);
    expect(queryByTestId('ruler-cursor-x')).toBeNull();
    expect(queryByTestId('ruler-cursor-y')).toBeNull();
  });
});
