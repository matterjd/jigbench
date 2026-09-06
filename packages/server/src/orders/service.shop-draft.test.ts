import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JigStore } from '../store.js';
import { OllamaDrafter } from './drafters/ollama.js';
import { OrdersService } from './service.js';
import { OrderConflictError, OrderNotFoundError } from './errors.js';

/**
 * S6's `jig_draft` MCP tool calls `OrdersService.draftByAgent` directly (the same relationship
 * S8's `jig_claim`/`jig_report` already have with `claim`/`reportDone`) — the agent hands back
 * a completed human face for an order sitting in `marked` (whether it got there fresh off a
 * mark, or via `draftOrder`'s own "queued for the shop" path, which never advances the ladder
 * off `marked` in the first place — see `orders/drafters/shop.ts`). This never invents a face:
 * unlike `draftOrder`, there is no drafter selection here, just validation + the ladder move.
 */

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function freshStore(): Promise<JigStore> {
  const repoRoot = await mkdtemp(join(tmpdir(), 'jig-orders-shop-draft-'));
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

/** Seeds a `marked` order WITHOUT running the auto-draft flow (`store.createMarkAndWorkOrder`
 * directly, the same helper `http.ts`'s own marks route uses under the hood) — `createMark`
 * would immediately auto-draft it away from `marked` via the human/model drafter, which is
 * exactly the state this file needs to avoid to test the precondition. */
async function markedOrder(store: JigStore): Promise<string> {
  const { workOrder } = await store.createMarkAndWorkOrder({
    target: { path: 'body > app-invoice-list', component: 'InvoiceListComponent' },
    prompt: 'flag overdue rows',
  });
  return workOrder.id;
}

const humanFace = {
  what: 'flag overdue rows',
  why: 'nobody notices overdue invoices',
  where: 'InvoiceListComponent',
  acceptance: ['an overdue row is styled red'],
};

describe('OrdersService.draftByAgent — the agent pulls a mark and hands back a draft', () => {
  it('moves a marked order to drafted, sets draftedBy "shop", and writes the human face', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });
    const id = await markedOrder(store);

    const drafted = await service.draftByAgent(id, humanFace, 'Claude Code 2.1.259');

    expect(drafted.state).toBe('drafted');
    expect(drafted.draftedBy).toBe('shop');
    expect(drafted.human).toEqual(humanFace);
  });

  it('logs the draft with actor "shop" and the client label as the note', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });
    const id = await markedOrder(store);

    const drafted = await service.draftByAgent(id, humanFace, 'Claude Code 2.1.259');
    const entry = drafted.log.at(-1)!;
    expect(entry.event).toBe('drafted');
    expect(entry.actor).toBe('shop');
    expect(entry.note).toBe('Claude Code 2.1.259');
  });

  it('persists the drafted human face to disk under the work order file', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });
    const id = await markedOrder(store);
    await service.draftByAgent(id, humanFace, 'Claude Code');

    const reloaded = new JigStore(store.repoRoot);
    await reloaded.init();
    const persisted = reloaded.getWorkOrder(id);
    expect(persisted?.state).toBe('drafted');
    expect(persisted?.draftedBy).toBe('shop');
    expect(persisted?.human.what).toBe(humanFace.what);
  });

  it('rejects an order that is not marked — 409-mapped OrderConflictError, ladder rule in the message', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });
    const id = await markedOrder(store);
    await service.draftByAgent(id, humanFace, 'Claude Code'); // now drafted

    await expect(service.draftByAgent(id, humanFace, 'Claude Code')).rejects.toBeInstanceOf(OrderConflictError);
    await expect(service.draftByAgent(id, humanFace, 'Claude Code')).rejects.toThrow(/not marked/);
  });

  it('rejects an unknown work order id — OrderNotFoundError', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });
    await expect(service.draftByAgent('9999', humanFace, 'Claude Code')).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it('rejects a malformed human face (schema violation) without persisting anything', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });
    const id = await markedOrder(store);

    await expect(
      service.draftByAgent(id, { what: 'x', why: 'y', where: 'z', acceptance: 'not-an-array' } as never, 'Claude Code'),
    ).rejects.toThrow();

    expect(store.getWorkOrder(id)?.state).toBe('marked'); // untouched
  });
});
