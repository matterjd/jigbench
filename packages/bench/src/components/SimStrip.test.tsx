import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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

// Retest defect 22 (2026-09-06 evening): "the SIM strip SHOP: NONE" even once the shop had
// actually connected. Root cause: SimStrip fetched `/api/state` exactly ONCE on mount and
// never again — App.tsx already holds a LIVE state (`useJigState`'s WebSocket-pushed
// `state`, updated on every broadcast, including the shop-freshness watcher's own flip) but
// SimStrip ignored it entirely. SimStrip now takes `wiring`/`connected` as props sourced
// from that live state — the same data, but it actually updates when the connection changes
// after the page has already loaded.
describe('SimStrip', () => {
  it('shows a loading state — the only moving thing on the page — until the first state arrives', () => {
    render(<SimStrip wiring={null} connected={true} />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renders every subsystem labeled SIM once wiring is known', () => {
    render(<SimStrip wiring={wiring} connected={true} />);

    expect(screen.getByLabelText('sim: what is wired')).toBeTruthy();
    for (const name of ['survey', 'proxy', 'drafter', 'shop', 'fixtures', 'toolpath', 'sketch']) {
      expect(screen.getByText(new RegExp(name, 'i'))).toBeTruthy();
    }
  });

  it('is honest when the bench socket is not connected', () => {
    render(<SimStrip wiring={null} connected={false} />);
    expect(screen.getByText(/unreachable/i)).toBeTruthy();
  });

  // A real disconnect after already having live data — the socket drops, but the strip
  // still knows the last wiring it heard. "Unreachable" (the connection fact) wins over
  // stale chips, exactly like App.tsx's own separate "bench socket: reconnecting" indicator.
  it('shows "unreachable" once disconnected, even with a previously-known wiring', () => {
    render(<SimStrip wiring={wiring} connected={false} />);
    expect(screen.getByText(/unreachable/i)).toBeTruthy();
  });

  it('updates live when wiring changes on a rerender — no page reload needed', () => {
    const { rerender } = render(<SimStrip wiring={null} connected={true} />);
    expect(screen.getByRole('status')).toBeTruthy();

    rerender(<SimStrip wiring={{ ...wiring, shop: 'wired' }} connected={true} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText(/shop: wired/i)).toBeTruthy();
  });

  it('pairs every sub-11px subsystem chip with a non-text glyph (design floor item 3)', () => {
    render(<SimStrip wiring={wiring} connected={true} />);
    // One glyph per subsystem chip (7 subsystems) — each chip's own text renders at 10px,
    // under the floor's 11px threshold, so it must carry a paired non-text signal.
    expect(document.querySelectorAll('.jig-chip__glyph')).toHaveLength(7);
  });
});
