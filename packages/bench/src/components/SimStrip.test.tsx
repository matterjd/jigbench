import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { SimStrip } from './SimStrip.js';
import type { Wiring } from '@jigbench/core';

afterEach(() => cleanup());

const wiring: Wiring = {
  survey: 'stub',
  proxy: 'none',
  drafter: 'stub',
  shop: 'none',
  fixtures: 'none',
  toolpath: 'none',
  sketch: 'none',
};

function fakeFetch(result: unknown, delayMs = 0): typeof fetch {
  return (() =>
    new Promise((resolve) =>
      setTimeout(() => resolve({ json: () => Promise.resolve(result) } as Response), delayMs),
    )) as unknown as typeof fetch;
}

describe('SimStrip', () => {
  it('shows a loading state — the only moving thing on the page — while fetching', async () => {
    render(<SimStrip fetchImpl={fakeFetch({ wiring }, 50)} />);
    expect(screen.getByRole('status')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('renders every subsystem labeled SIM once state arrives', async () => {
    render(<SimStrip fetchImpl={fakeFetch({ wiring })} />);

    await waitFor(() => expect(screen.getByText(/survey/i)).toBeTruthy());
    expect(screen.getByLabelText('sim: what is wired')).toBeTruthy();
    for (const name of ['survey', 'proxy', 'drafter', 'shop', 'fixtures', 'toolpath', 'sketch']) {
      expect(screen.getByText(new RegExp(name, 'i'))).toBeTruthy();
    }
  });

  it('is honest when the server is unreachable', async () => {
    const failingFetch = (() => Promise.reject(new Error('network down'))) as unknown as typeof fetch;
    render(<SimStrip fetchImpl={failingFetch} />);
    await waitFor(() => expect(screen.getByText(/unreachable/i)).toBeTruthy());
  });

  it('pairs every sub-11px subsystem chip with a non-text glyph (design floor item 3)', async () => {
    render(<SimStrip fetchImpl={fakeFetch({ wiring })} />);
    await waitFor(() => expect(screen.getByText(/survey/i)).toBeTruthy());
    // One glyph per subsystem chip (7 subsystems) — each chip's own text renders at 10px,
    // under the floor's 11px threshold, so it must carry a paired non-text signal.
    expect(document.querySelectorAll('.jig-chip__glyph')).toHaveLength(7);
  });
});
