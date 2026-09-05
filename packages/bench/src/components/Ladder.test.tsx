// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Ladder } from './Ladder.js';

afterEach(() => cleanup());

describe('Ladder', () => {
  it('renders every rung of the state ladder', () => {
    render(<Ladder current="drafted" />);
    for (const step of ['marked', 'drafted', 'released', 'in-the-shop', 'trial-fit']) {
      expect(screen.getByText(step)).toBeTruthy();
    }
  });

  it('lights exactly the current rung', () => {
    render(<Ladder current="released" />);
    const lit = screen.getByText('released');
    expect(lit.className).toContain('jig-ladder__step--lit');

    const notLit = screen.getByText('drafted');
    expect(notLit.className).not.toContain('jig-ladder__step--lit');
  });

  it('shows scrapped as a state, not a hidden ladder (Law II)', () => {
    render(<Ladder current="scrapped" />);
    // The full ladder is still rendered, unlit...
    for (const step of ['marked', 'drafted', 'released', 'in-the-shop', 'trial-fit']) {
      expect(screen.getByText(step).className).not.toContain('--lit');
    }
    // ...and scrapped is called out explicitly, never silently disappeared.
    expect(screen.getByText('scrapped')).toBeTruthy();
  });
});
