import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JigStore } from '../store.js';
import { OllamaDrafter } from './drafters/ollama.js';
import { OrdersService } from './service.js';
import { OrderConflictError } from './errors.js';

/**
 * S8 (EXECUTION-PLAN.md §4 row S8 / F11): `claim` (released -> in-the-shop) and `reportDone`
 * (in-the-shop -> trial-fit) — the two ladder moves the shop drives, over the same
 * `OrdersService` `draftOrder`/`release`/`scrap`/`restore` already live on (S6's `jig_report`
 * MCP tool calls `reportDone` directly — this is that exact method).
 */

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function freshStore(): Promise<JigStore> {
  const repoRoot = await mkdtemp(join(tmpdir(), 'jig-orders-trialfit-'));
  tempDirs.push(repoRoot);
  const store = new JigStore(repoRoot);
  await store.init();
  return store;
}

function ollamaUnavailable(): OllamaDrafter {
  const drafter = new OllamaDrafter({ model: 'qwen2.5-coder:7b' });
  vi.spyOn(drafter, 'available').mockResolvedValue(false);
  return drafter;
}

/** Walks a fresh mark all the way to `released` — every test in this file starts from
 * there, since `claim`/`reportDone` only make sense past release. `createMark` kicks off
 * its own auto-draft in the background (fire-and-forget, same as `http.ts`'s route) — the
 * same `vi.waitFor` pattern `service.test.ts` already uses for this, rather than assuming
 * it has landed by the time `createMark` returns. */
async function releasedOrder(store: JigStore, service: OrdersService): Promise<string> {
  const { workOrder } = await service.createMark({ pick: { path: 'body > app-invoice-list', component: 'InvoiceListComponent' }, prompt: 'flag overdue rows' });
  await vi.waitFor(() => expect(store.getWorkOrder(workOrder.id)?.state).toBe('drafted'));
  const released = await service.release(workOrder.id);
  return released.id;
}

describe('OrdersService.claim — released -> in-the-shop', () => {
  it('moves a released order to in-the-shop, actor "shop", and logs who claimed it', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });
    const id = await releasedOrder(store, service);

    const claimed = await service.claim(id, 'Claude Code');
    expect(claimed.state).toBe('in-the-shop');
    const entry = claimed.log.at(-1)!;
    expect(entry.event).toBe('claimed');
    expect(entry.actor).toBe('shop');
    expect(entry.note).toBe('Claude Code');
  });

  it('defaults the claimant note to "the shop" when none is given', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });
    const id = await releasedOrder(store, service);
    const claimed = await service.claim(id);
    expect(claimed.log.at(-1)?.note).toBe('the shop');
  });

  it('rejects claiming a work order that is not released — 409-mapped OrderConflictError', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });
    const { workOrder } = await service.createMark({ pick: { path: 'x' }, prompt: 'x' });
    await expect(service.claim(workOrder.id)).rejects.toBeInstanceOf(OrderConflictError);
  });

  it('rejects claiming an already-claimed order a second time', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });
    const id = await releasedOrder(store, service);
    await service.claim(id);
    await expect(service.claim(id)).rejects.toBeInstanceOf(OrderConflictError);
  });
});

describe('OrdersService.reportDone — in-the-shop -> trial-fit', () => {
  async function claimedOrder(store: JigStore, service: OrdersService): Promise<string> {
    const id = await releasedOrder(store, service);
    await service.claim(id);
    return id;
  }

  it('moves a claimed order to trial-fit and stores the summary + files in the shop face', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });
    const id = await claimedOrder(store, service);

    const reported = await service.reportDone(id, { summary: 'renamed the Total column', files: ['src/app/invoice-list/invoice-list.component.html'] });
    expect(reported.state).toBe('trial-fit');
    expect(reported.shop?.trialFit).toEqual({
      summary: 'renamed the Total column',
      files: ['src/app/invoice-list/invoice-list.component.html'],
    });
  });

  it('defaults files to an empty list when the shop names none', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });
    const id = await claimedOrder(store, service);
    const reported = await service.reportDone(id, { summary: 'no files touched' });
    expect(reported.shop?.trialFit?.files).toEqual([]);
  });

  it('logs the report with actor "shop" and the summary as the note', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });
    const id = await claimedOrder(store, service);
    const reported = await service.reportDone(id, { summary: 'renamed the Total column' });
    const entry = reported.log.at(-1)!;
    expect(entry.event).toBe('reported');
    expect(entry.actor).toBe('shop');
    expect(entry.note).toBe('renamed the Total column');
  });

  it('rejects reporting a work order that is still just released (never claimed) — 409-mapped', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });
    const id = await releasedOrder(store, service);
    await expect(service.reportDone(id, { summary: 'x' })).rejects.toBeInstanceOf(OrderConflictError);
  });

  it('rejects reporting an already-trial-fit order a second time', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });
    const id = await claimedOrder(store, service);
    await service.reportDone(id, { summary: 'first' });
    await expect(service.reportDone(id, { summary: 'second' })).rejects.toBeInstanceOf(OrderConflictError);
  });

  it('persists the trial-fit report to disk under the "## Trial fit" section', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });
    const id = await claimedOrder(store, service);
    await service.reportDone(id, { summary: 'renamed the Total column', files: ['a.html'] });

    const reloaded = new JigStore(store.repoRoot);
    await reloaded.init();
    const persisted = reloaded.getWorkOrder(id);
    expect(persisted?.state).toBe('trial-fit');
    expect(persisted?.shop?.trialFit).toEqual({ summary: 'renamed the Total column', files: ['a.html'] });
  });
});
