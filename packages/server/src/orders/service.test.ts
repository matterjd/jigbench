import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JigStore } from '../store.js';
import { OllamaDrafter } from './drafters/ollama.js';
import { OrdersService } from './service.js';
import { OrderConflictError, OrderNotFoundError } from './errors.js';

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function freshStore(): Promise<JigStore> {
  const repoRoot = await mkdtemp(join(tmpdir(), 'jig-orders-'));
  tempDirs.push(repoRoot);
  const store = new JigStore(repoRoot);
  await store.init();
  return store;
}

function ollamaAvailable(face: unknown, elapsedMsAtLeast = 0): OllamaDrafter {
  const drafter = new OllamaDrafter({ model: 'qwen2.5-coder:7b' });
  vi.spyOn(drafter, 'available').mockResolvedValue(true);
  vi.spyOn(drafter, 'draft').mockImplementation(async () => {
    if (elapsedMsAtLeast > 0) await new Promise((r) => setTimeout(r, elapsedMsAtLeast));
    return face as never;
  });
  // release() probes availability again and may run the optional polish pass — stub
  // `rewrite` too so these tests never reach the real network, even on a desk where
  // Ollama happens to be running.
  vi.spyOn(drafter, 'rewrite').mockResolvedValue('');
  return drafter;
}

function ollamaThatFailsToParse(): OllamaDrafter {
  const drafter = new OllamaDrafter({ model: 'qwen2.5-coder:7b' });
  vi.spyOn(drafter, 'available').mockResolvedValue(true);
  vi.spyOn(drafter, 'draft').mockRejectedValue(new Error('ollama returned unparseable JSON'));
  return drafter;
}

function ollamaUnavailable(): OllamaDrafter {
  const drafter = new OllamaDrafter({ model: 'qwen2.5-coder:7b' });
  vi.spyOn(drafter, 'available').mockResolvedValue(false);
  return drafter;
}

describe('OrdersService.createMark + draftOrder — the auto-draft flow', () => {
  it('creates a marked order immediately and drafts it asynchronously via the model when Ollama is up', async () => {
    const store = await freshStore();
    const notify = vi.fn();
    const face = { what: 'flag overdue rows', why: 'nobody notices overdue invoices', where: 'InvoiceListComponent', acceptance: ['an overdue row is red'] };
    const service = new OrdersService({ store, notify, ollama: ollamaAvailable(face) });

    const { workOrder } = await service.createMark({ pick: { path: 'body > app-invoice-list', component: 'InvoiceListComponent' }, prompt: 'flag overdue rows' });
    expect(workOrder.state).toBe('marked');

    await vi.waitFor(() => {
      const reloaded = store.getWorkOrder(workOrder.id);
      expect(reloaded?.state).toBe('drafted');
    });

    const drafted = store.getWorkOrder(workOrder.id)!;
    expect(drafted.draftedBy).toBe('model');
    expect(drafted.human.acceptance).toEqual(['an overdue row is red']);
    expect(drafted.log.some((l) => l.event === 'drafted' && l.note?.includes('qwen2.5-coder:7b'))).toBe(true);
    expect(notify).toHaveBeenCalled();
  });

  it('degrades to human and still reaches drafted when Ollama is unreachable', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });

    const { workOrder } = await service.createMark({ pick: { path: 'x' }, prompt: 'do the thing' });

    await vi.waitFor(() => {
      expect(store.getWorkOrder(workOrder.id)?.state).toBe('drafted');
    });
    expect(store.getWorkOrder(workOrder.id)?.draftedBy).toBe('person');
  });

  it('a malformed-JSON draft failure leaves the order marked, logs the failure, and never throws out of draftOrder', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaThatFailsToParse() });

    const { mark, workOrder } = await store.createMarkAndWorkOrder({ target: { path: 'x', component: 'InvoiceListComponent' }, prompt: 'flag overdue rows' });
    void mark;

    const result = await service.draftOrder(workOrder.id);

    expect(result.state).toBe('marked');
    expect(result.log.some((l) => l.event === 'draft-failed')).toBe(true);
    expect(store.getWorkOrder(workOrder.id)?.state).toBe('marked');
  });

  it('draftOrder rejects with OrderConflictError when the order is not in marked', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaAvailable({ what: 'x', why: '', where: '', acceptance: [] }) });
    const { workOrder } = await service.createMark({ pick: { path: 'x' }, prompt: 'x' });
    await vi.waitFor(() => expect(store.getWorkOrder(workOrder.id)?.state).toBe('drafted'));

    await expect(service.draftOrder(workOrder.id)).rejects.toBeInstanceOf(OrderConflictError);
  });

  it('redraft is draftOrder again, usable to retry after a failure', async () => {
    const store = await freshStore();
    const failing = ollamaThatFailsToParse();
    const service = new OrdersService({ store, ollama: failing });
    const { workOrder } = await store.createMarkAndWorkOrder({ target: { path: 'x' }, prompt: 'x' });
    await service.draftOrder(workOrder.id);
    expect(store.getWorkOrder(workOrder.id)?.state).toBe('marked');

    vi.spyOn(failing, 'available').mockResolvedValue(false); // now falls to human
    const redrafted = await service.redraft(workOrder.id);

    expect(redrafted.state).toBe('drafted');
    expect(redrafted.draftedBy).toBe('person');
  });
});

describe('OrdersService.editHumanFace', () => {
  it('patches the human face while marked or drafted', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });
    const { workOrder } = await store.createMarkAndWorkOrder({ target: { path: 'x' }, prompt: 'x' });

    const patched = await service.editHumanFace(workOrder.id, { why: 'because customers miss them' });

    expect(patched.human.why).toBe('because customers miss them');
    expect(patched.human.what).toBe('x'); // untouched fields survive the patch
  });

  it('refuses to edit the human face once released (409-shaped error)', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaAvailable({ what: 'x', why: '', where: '', acceptance: [] }) });
    const { workOrder } = await service.createMark({ pick: { path: 'x' }, prompt: 'x' });
    await vi.waitFor(() => expect(store.getWorkOrder(workOrder.id)?.state).toBe('drafted'));
    await service.release(workOrder.id);

    await expect(service.editHumanFace(workOrder.id, { why: 'too late' })).rejects.toBeInstanceOf(OrderConflictError);
  });

  it('throws OrderNotFoundError for an unknown id', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store });
    await expect(service.editHumanFace('9999', { why: 'x' })).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});

describe('OrdersService.release', () => {
  it('fills the shop face, moves to released, and rewrites the file on disk', async () => {
    const store = await freshStore();
    // Seed a real survey so buildShopFace has a component to name — a bare stub survey
    // (S1's honest default) would legitimately produce an empty files list, which is not
    // what this test is trying to prove.
    await writeFile(
      join(store.paths.survey, 'survey.json'),
      JSON.stringify({
        jigFormat: 1,
        stack: ['angular'],
        components: [
          {
            name: 'InvoiceListComponent',
            selector: 'app-invoice-list',
            file: 'src/app/invoices/invoice-list/invoice-list.ts',
            standalone: true,
            inline: false,
            inputs: [],
            outputs: [],
            templateUrl: './invoice-list.html',
            styleUrls: ['./invoice-list.scss'],
          },
        ],
        routes: [],
        endpoints: [],
        schemas: [],
        docs: [],
        generatedAt: new Date().toISOString(),
      }),
      'utf8',
    );
    await store.reload();

    const service = new OrdersService({ store, ollama: ollamaUnavailable() }); // no polish pass
    const { workOrder } = await service.createMark({ pick: { path: 'body > app-invoice-list', component: 'InvoiceListComponent' }, prompt: 'flag overdue rows' });
    await vi.waitFor(() => expect(store.getWorkOrder(workOrder.id)?.state).toBe('drafted'));

    const released = await service.release(workOrder.id);

    expect(released.state).toBe('released');
    expect(released.shop).toBeTruthy();
    expect(released.shop!.brief.length).toBeGreaterThan(0);
    expect(released.log.some((l) => l.event === 'released')).toBe(true);

    // Rebuild a store from disk to prove the file, not just memory, carries the new state.
    const reread = new JigStore(store.repoRoot);
    await reread.init();
    expect(reread.getWorkOrder(workOrder.id)?.state).toBe('released');
    expect(reread.getWorkOrder(workOrder.id)?.shop?.files.length).toBeGreaterThan(0);
  });

  it('refuses to release a work order that is not drafted (409-shaped error)', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store });
    const { workOrder } = await store.createMarkAndWorkOrder({ target: { path: 'x' }, prompt: 'x' });

    await expect(service.release(workOrder.id)).rejects.toBeInstanceOf(OrderConflictError);
  });
});

describe('OrdersService.scrap / restore', () => {
  it('scraps a marked order and restores it back to marked', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store });
    const { workOrder } = await store.createMarkAndWorkOrder({ target: { path: 'x' }, prompt: 'x' });

    const scrapped = await service.scrap(workOrder.id);
    expect(scrapped.state).toBe('scrapped');

    const restored = await service.restore(workOrder.id);
    expect(restored.state).toBe('marked');
  });

  it('never removes the file from .jig/work-orders/ on scrap (Law II)', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store });
    const { workOrder } = await store.createMarkAndWorkOrder({ target: { path: 'x' }, prompt: 'x' });
    await service.scrap(workOrder.id);

    const reread = new JigStore(store.repoRoot);
    await reread.init();
    expect(reread.getWorkOrder(workOrder.id)?.state).toBe('scrapped');
  });

  it('refuses to restore an order that was never scrapped (409-shaped error)', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store });
    const { workOrder } = await store.createMarkAndWorkOrder({ target: { path: 'x' }, prompt: 'x' });

    await expect(service.restore(workOrder.id)).rejects.toBeInstanceOf(OrderConflictError);
  });

  it('scrap is legal from every non-scrapped, non-terminal state (ladder transitions only)', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaAvailable({ what: 'x', why: '', where: '', acceptance: [] }) });
    const { workOrder } = await service.createMark({ pick: { path: 'x' }, prompt: 'x' });
    await vi.waitFor(() => expect(store.getWorkOrder(workOrder.id)?.state).toBe('drafted'));
    await service.release(workOrder.id);

    const scrapped = await service.scrap(workOrder.id);
    expect(scrapped.state).toBe('scrapped');

    const restored = await service.restore(workOrder.id);
    expect(restored.state).toBe('released');
  });
});

describe('OrdersService.getDrafterInfo', () => {
  it('reports the model driver and updates the store wiring when Ollama answers', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaAvailable({ what: '', why: '', where: '', acceptance: [] }) });

    const info = await service.getDrafterInfo();

    expect(info.driver).toBe('model');
    expect(info.available.ollama).toBe(true);
    expect(store.getWiring().drafter).toBe('wired');
  });

  it('reports the person driver and keeps the store wiring honest when nothing is reachable', async () => {
    const store = await freshStore();
    const service = new OrdersService({ store, ollama: ollamaUnavailable() });

    const info = await service.getDrafterInfo();

    expect(info.driver).toBe('person');
    expect(store.getWiring().drafter).toBe('stub');
  });
});
