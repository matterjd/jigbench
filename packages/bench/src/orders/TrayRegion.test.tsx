import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TrayRegion } from './TrayRegion.js';

afterEach(cleanup);

// Placeholder only — S4 brief: "create that file as a minimal placeholder ... (S5 overwrites
// it)". This file and its owning folder (`packages/bench/src/orders/`) belong to S5; S4 only
// creates the placeholder so the chassis has something to mount.
describe('TrayRegion (S4 placeholder)', () => {
  it('renders the placeholder line S5 will replace', () => {
    render(<TrayRegion />);
    expect(screen.getByText('tray — work orders · arrives with S5')).toBeTruthy();
  });
});
