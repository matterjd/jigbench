import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { WorkOrder } from '@jigbench/core';
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

function fakeFetch(wiringShop: 'wired' | 'none'): typeof fetch {
  return vi.fn().mockResolvedValue({
    json: async () => ({ wiring: { shop: wiringShop } }),
  }) as unknown as typeof fetch;
}

afterEach(() => cleanup());

describe('ShopLane', () => {
  it('says "none connected" until S6 wires an agent', async () => {
    render(<ShopLane workOrders={[]} fetchImpl={fakeFetch('none')} />);
    await waitFor(() => expect(screen.getByText(/none connected/i)).toBeTruthy());
  });

  it('says connected once wiring.shop reports wired', async () => {
    render(<ShopLane workOrders={[]} fetchImpl={fakeFetch('wired')} />);
    await waitFor(() => expect(screen.getByText(/connected/i)).toBeTruthy());
    expect(screen.queryByText(/none connected/i)).toBeNull();
  });

  // S6 exposed /api/state's top-level `shop: {client, connectedAt}` (http.ts's
  // composedState) but nothing rendered it — this is that render.
  it('names the connected client from /api/state.shop once wired', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      json: async () => ({ wiring: { shop: 'wired' }, shop: { client: 'Claude Code 2.1.259', connectedAt: '2026-09-06T00:00:00.000Z' } }),
    }) as unknown as typeof fetch;
    render(<ShopLane workOrders={[]} fetchImpl={fetchImpl} />);
    await waitFor(() => expect(screen.getByText(/Claude Code 2\.1\.259/)).toBeTruthy());
    expect(screen.queryByText(/none connected/i)).toBeNull();
  });

  it('falls back to a plain "connected" when wired but /api/state carries no shop.client', async () => {
    render(<ShopLane workOrders={[]} fetchImpl={fakeFetch('wired')} />);
    await waitFor(() => expect(screen.getByText(/^connected$/)).toBeTruthy());
  });

  it('counts the released orders waiting for the shop', async () => {
    const orders = [wo({ id: '0001', state: 'released' }), wo({ id: '0002', state: 'released' }), wo({ id: '0003', state: 'marked' })];
    render(<ShopLane workOrders={orders} fetchImpl={fakeFetch('none')} />);
    await waitFor(() => expect(screen.getByText(/2 released/)).toBeTruthy());
    expect(screen.getByText('#0001')).toBeTruthy();
    expect(screen.getByText('#0002')).toBeTruthy();
    expect(screen.queryByText('#0003')).toBeNull();
  });

  it('names which orders the shop currently holds (in-the-shop state)', async () => {
    const orders = [wo({ id: '0004', state: 'in-the-shop' })];
    render(<ShopLane workOrders={orders} fetchImpl={fakeFetch('wired')} />);
    await waitFor(() => expect(screen.getByText('#0004')).toBeTruthy());
  });

  it('is honest with nothing released and nothing held', async () => {
    render(<ShopLane workOrders={[]} fetchImpl={fakeFetch('none')} />);
    await waitFor(() => expect(screen.getByText(/none connected/i)).toBeTruthy());
    expect(screen.getByText(/nothing released/i)).toBeTruthy();
  });

  it('is a vertical wyrd strip — every non-glyph label pairs a non-text signal or reads at 11px+', async () => {
    render(<ShopLane workOrders={[]} fetchImpl={fakeFetch('none')} />);
    await waitFor(() => expect(screen.getByText(/none connected/i)).toBeTruthy());
    expect(screen.getByLabelText(/the shop/i)).toBeTruthy();
  });
});
