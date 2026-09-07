import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Wiring, WorkOrder } from '@jigbench/core';
import { ShopLane } from './ShopLane.js';

function wo(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    jigFormat: 1,
    id: '0001',
    slug: 'x',
    state: 'released',
    draftedBy: 'person',
    marks: ['m-0001'],
    human: { what: 'x', why: '', where: 'x', acceptance: [] },
    log: [],
    ...overrides,
  };
}

const baseWiring: Wiring = {
  survey: 'stub',
  proxy: 'none',
  drafter: 'stub',
  shop: 'none',
  fixtures: 'none',
  toolpath: 'none',
  sketch: 'none',
};

afterEach(() => cleanup());

// Retest defect 22 (2026-09-06 evening): "did not see it reflected in jig" — the shop lane
// stayed "none connected" even once an agent was genuinely connected. Root cause: ShopLane
// fetched `/api/state` exactly ONCE on mount and never again — a connection made after the
// bench page had already loaded never showed up without a manual reload. `wiring`/`shop` are
// now props sourced from App.tsx's `useJigState()` — the SAME live state, pushed on every WS
// broadcast, including the shop-freshness watcher's own wired/none flip.
describe('ShopLane', () => {
  it('says "none connected" when wiring.shop is none', () => {
    render(<ShopLane workOrders={[]} wiring={baseWiring} shop={null} />);
    expect(screen.getByText(/none connected/i)).toBeTruthy();
  });

  it('says connected once wiring.shop reports wired', () => {
    render(<ShopLane workOrders={[]} wiring={{ ...baseWiring, shop: 'wired' }} shop={null} />);
    expect(screen.getByText(/connected/i)).toBeTruthy();
    expect(screen.queryByText(/none connected/i)).toBeNull();
  });

  it('names the connected client from the shop prop once wired', () => {
    render(
      <ShopLane
        workOrders={[]}
        wiring={{ ...baseWiring, shop: 'wired' }}
        shop={{ client: 'Claude Code 2.1.259', connectedAt: '2026-09-06T00:00:00.000Z' }}
      />,
    );
    expect(screen.getByText(/Claude Code 2\.1\.259/)).toBeTruthy();
    expect(screen.queryByText(/none connected/i)).toBeNull();
  });

  it('falls back to a plain "connected" when wired but shop carries no client', () => {
    render(<ShopLane workOrders={[]} wiring={{ ...baseWiring, shop: 'wired' }} shop={null} />);
    expect(screen.getByText(/^connected$/)).toBeTruthy();
  });

  // The exact regression: nothing (props unset, before the bench's first state message) must
  // still read as an honest "none connected" — never a stale "connected" from a prior mount.
  it('treats an absent/unknown wiring as "none connected" (before the first state arrives)', () => {
    render(<ShopLane workOrders={[]} wiring={null} shop={null} />);
    expect(screen.getByText(/none connected/i)).toBeTruthy();
  });

  it('updates live on a rerender — no page reload needed to see a new connection', () => {
    const { rerender } = render(<ShopLane workOrders={[]} wiring={baseWiring} shop={null} />);
    expect(screen.getByText(/none connected/i)).toBeTruthy();

    rerender(
      <ShopLane
        workOrders={[]}
        wiring={{ ...baseWiring, shop: 'wired' }}
        shop={{ client: 'Claude Code 2.1.259', connectedAt: '2026-09-06T00:00:00.000Z' }}
      />,
    );
    expect(screen.getByText(/Claude Code 2\.1\.259/)).toBeTruthy();
    expect(screen.queryByText(/none connected/i)).toBeNull();
  });

  it('counts the released orders waiting for the shop', () => {
    const orders = [wo({ id: '0001', state: 'released' }), wo({ id: '0002', state: 'released' }), wo({ id: '0003', state: 'marked' })];
    render(<ShopLane workOrders={orders} wiring={baseWiring} shop={null} />);
    expect(screen.getByText(/2 released/)).toBeTruthy();
    expect(screen.getByText('#0001')).toBeTruthy();
    expect(screen.getByText('#0002')).toBeTruthy();
    expect(screen.queryByText('#0003')).toBeNull();
  });

  it('names which orders the shop currently holds (in-the-shop state)', () => {
    const orders = [wo({ id: '0004', state: 'in-the-shop' })];
    render(<ShopLane workOrders={orders} wiring={{ ...baseWiring, shop: 'wired' }} shop={null} />);
    expect(screen.getByText('#0004')).toBeTruthy();
  });

  it('is honest with nothing released and nothing held', () => {
    render(<ShopLane workOrders={[]} wiring={baseWiring} shop={null} />);
    expect(screen.getByText(/none connected/i)).toBeTruthy();
    expect(screen.getByText(/nothing released/i)).toBeTruthy();
  });

  it('is a vertical wyrd strip — every non-glyph label pairs a non-text signal or reads at 11px+', () => {
    render(<ShopLane workOrders={[]} wiring={baseWiring} shop={null} />);
    expect(screen.getByText(/none connected/i)).toBeTruthy();
    expect(screen.getByLabelText(/the shop/i)).toBeTruthy();
  });
});
