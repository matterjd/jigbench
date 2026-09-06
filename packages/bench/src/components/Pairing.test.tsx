import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Pairing, resetPairingsForTests } from './Pairing.js';

afterEach(() => {
  cleanup();
  resetPairingsForTests();
});

describe('Pairing', () => {
  it('shows the plain word paired with an em-dash the first time a key is encountered', () => {
    const { container } = render(<Pairing word="Loupe" plain="point at anything and see what it is" />);
    expect(container.textContent).toBe('Loupe — point at anything and see what it is');
  });

  it('shows only the shop word on a later render of the same key', () => {
    render(<Pairing word="Loupe" plain="point at anything and see what it is" />);
    const second = render(<Pairing word="Loupe" plain="point at anything and see what it is" />);
    expect(second.container.textContent).toBe('Loupe');
  });

  it('treats distinct sessionKeys as distinct first encounters even when the word repeats', () => {
    render(<Pairing word="Loupe" plain="point at anything and see what it is" sessionKey="rail-loupe" />);
    const paletteInstance = render(
      <Pairing word="Loupe" plain="point at anything and see what it is" sessionKey="palette-loupe" />,
    );
    expect(paletteInstance.container.textContent).toBe('Loupe — point at anything and see what it is');
  });

  it('defaults the session key to the word itself when none is given', () => {
    render(<Pairing word="Release" plain="approve it" />);
    const again = render(<Pairing word="Release" plain="approve it" />);
    expect(again.container.textContent).toBe('Release');
  });

  it('resetPairingsForTests clears every recorded first encounter', () => {
    render(<Pairing word="Bench" plain="one clamped repo" />);
    resetPairingsForTests();
    const { container } = render(<Pairing word="Bench" plain="one clamped repo" />);
    expect(container.textContent).toBe('Bench — one clamped repo');
  });
});
