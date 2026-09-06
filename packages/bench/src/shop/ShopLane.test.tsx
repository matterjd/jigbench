import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ShopLane } from './ShopLane.js';

afterEach(cleanup);

// Placeholder only — S4 brief: "create ... a placeholder file ... (S5 overwrites it)". This
// file and its owning folder (`packages/bench/src/shop/`) belong to S5; S4 only creates the
// placeholder so the chassis has something to mount.
describe('ShopLane (S4 placeholder)', () => {
  it('renders the placeholder line S5 will replace', () => {
    render(<ShopLane />);
    expect(screen.getByText('the shop — connected agents · arrives with S5')).toBeTruthy();
  });
});
