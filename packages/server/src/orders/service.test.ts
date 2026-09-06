import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JigStore } from '../store.js';
import { logger } from '../logger.js';
import { OllamaDrafter } from './drafters/ollama.js';
import { OrdersService } from './service.js';
import { OrderConflictError, OrderNotFoundError } from './errors.js';

const tempDirs: string[] = [];

// This suite drives `selectDrafter` (via `OrdersService.draftOrder`) entirely through
// `OllamaDrafter.available()` mocks (see `ollamaAvailable`/`ollamaThatIs` below) — it needs
// its mocked answer to be the one that decides the driver. `select-drafter.ts` deliberately
// makes `JIG_NO_MODEL=1` override that mock unconditionally (see `select-drafter.test.ts`'s
// own "JIG_NO_MODEL" describe block, which owns that contract), so this suite must not
// inherit whatever the ambient environment happens to set — `JIG_NO_MODEL=1 npm test` (the
// CI/S10 command; scripts/ci gates) would otherwise force every `available: true` mock in
// this file straight past the model and fail 8 assertions that have nothing to do with the
// env-var feature itself. Snapshot and clear it before each test, restore after — the same
// isolation pattern `select-drafter.test.ts` already uses per-test, just at the suite level
// since nothing here is testing the switch.
let priorJigNoModel: string | undefined;

beforeEach(() => {
  priorJigNoModel = process.env.JIG_NO_MODEL;
  delete process.env.JIG_NO_MODEL;
});

afterEach(async () => {
  if (priorJigNoModel === undefined) delete process.env.JIG_NO_MODEL;
  else process.env.JIG_NO_MODEL = priorJigNoModel;
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

// Finding 3 (wave-3 council, security medium): auto-draft had no de-dup and no concurrency
// cap — a second draftOrder call on an order already drafting fired a second model call,
// and nothing bounded how many /api/generate calls could be in flight at once (a mark flood
// fanned out unbounded). Both use a mocked `drafter.draft` that never resolves on its own,
// so the test controls exactly when each call completes.
describe('OrdersService.draftOrder — de-dup and concurrency cap (finding 3)', () => {
  function controllableDrafter(): {
    drafter: OllamaDrafter;
    draftSpy: ReturnType<typeof vi.spyOn>;
    releases: Array<() => void>;
    inFlight: () => number;
    maxInFlight: () => number;
  } {
    const drafter = new OllamaDrafter({ model: 'qwen2.5-coder:7b' });
    vi.spyOn(drafter, 'available').mockResolvedValue(true);
    vi.spyOn(drafter, 'rewrite').mockResolvedValue('');
    let inFlight = 0;
    let maxInFlight = 0;
    const releases: Array<() => void> = [];
    const draftSpy = vi.spyOn(drafter, 'draft').mockImplementation(() => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        releases.push(() => {
          inFlight--;
          resolve({ what: 'x', why: '', where: '', acceptance: [] } as never);
        });
      });
    });
    return { drafter, draftSpy, releases, inFlight: () => inFlight, maxInFlight: () => maxInFlight };
  }

  // A fixed real-timer yield (never `vi.waitFor` polling a condition that is already
  // trivially true) — a prior version of the concurrency test below used `vi.waitFor`
  // inside a hand-rolled `while` loop whose exit condition and poll condition could BOTH
  // stay satisfied without the production code making any progress; since a successful
  // `vi.waitFor` check resolves via a bare microtask, that combination re-enqueued
  // microtasks faster than Node could ever service a macrotask (a real timer, a queued fs
  // completion, even vitest's own per-test timeout) — a genuine event-loop-starving hang
  // that pegged a CPU core for minutes with zero output. A real `setTimeout` always yields
  // to the macrotask queue, so it cannot repeat that failure mode.
  function tick(ms = 100): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  it('a second draftOrder call on an order already drafting is a no-op returning the current state', async () => {
    const store = await freshStore();
    const { drafter, draftSpy, releases } = controllableDrafter();
    const service = new OrdersService({ store, ollama: drafter });
    const { workOrder } = await store.createMarkAndWorkOrder({ target: { path: 'x' }, prompt: 'x' });

    const first = service.draftOrder(workOrder.id); // starts, never resolves until released
    const second = await service.draftOrder(workOrder.id); // de-dup no-op, NOT a race — resolves
    // via a bare microtask (no real work), so it settles before `first` has necessarily
    // reached its own real fs work (loadDocsIndex) and the mocked draft() beyond it.

    expect(second.state).toBe('marked'); // the in-flight draft hasn't landed yet

    await tick(); // give `first` a real macrotask turn to actually reach draft()
    expect(draftSpy).toHaveBeenCalledTimes(1); // only ONE real call ever happened — from `first`

    releases[0]?.();
    const settled = await first;
    expect(settled.state).toBe('drafted');
  });

  it(
    'caps concurrent model calls at 2 — extra draft requests queue rather than firing at once',
    async () => {
      const store = await freshStore();
      const { drafter, draftSpy, releases, inFlight, maxInFlight } = controllableDrafter();
      const service = new OrdersService({ store, ollama: drafter });

      for (let i = 0; i < 5; i++) {
        await service.createMark({ pick: { path: `x${i}` }, prompt: `x${i}` }); // fires draftOrder in the background
      }

      // `vi.waitFor` on the observable count, not a fixed `tick()` — a slot doesn't free
      // until the released draft's real `persist()` (a real fs write: mkdir + write +
      // rename, plus the stability merge's own EPERM/EBUSY retry loop on top) actually
      // completes, and a loaded CI runner can make that take longer than any fixed guess.
      // CI evidence (windows-latest, run 34044270785): this loop's first iteration failed
      // "expected \"draft\" to be called 3 times, but got 2 times" behind a fixed 100ms
      // tick. This is a single flat `vi.waitFor` per step (never a hand-rolled while loop
      // around it — see the note above `tick()` on why that combination can starve the
      // event loop), so it stays exempt from that failure mode while still tolerating a
      // slow runner.
      await vi.waitFor(() => expect(draftSpy).toHaveBeenCalledTimes(2), { timeout: 5000, interval: 20 }); // only 2 ever reach draft(); 3 queue
      expect(inFlight()).toBe(2);

      // Release one at a time. Each release should free exactly one slot, immediately
      // backfilled by a queued order — the cap (the semaphore's high-water mark) must hold
      // at every step, not just at the end.
      for (const expectedCalls of [3, 4, 5]) {
        releases.shift()!();
        await vi.waitFor(() => expect(draftSpy).toHaveBeenCalledTimes(expectedCalls), { timeout: 5000, interval: 20 });
        expect(inFlight()).toBeLessThanOrEqual(2);
      }
      expect(maxInFlight()).toBeLessThanOrEqual(2); // never exceeded, at any point in the run

      // Drain what's left, then await the service being fully idle. Every backgrounded
      // draftOrder's real persist() must land before this test's `afterEach` removes its
      // temp directory (`tempDirs`, above) — otherwise the removal can race an in-flight
      // write and reproduce the ENOENT this same CI run logged moments earlier:
      // "[...] WARN  auto-draft failed Error: ENOENT: no such file or directory, open
      // 'C:\Users\RUNNER~1\...\jig-orders-...\.jig\work-orders\0003-x2.md.tmp-...'" — see
      // `OrdersService.close` below for the fix and its own deterministic reproduction.
      releases.shift()?.();
      releases.shift()?.();
      await service.close();
    },
    10_000,
  );
});

// The ENOENT WARN CI logged moments before the assertion failure above ("auto-draft failed
// Error: ENOENT ... open '...work-orders\0003-x2.md.tmp-...'") came from THIS suite: a
// background auto-draft's real persist() (mkdir + write + rename) was still opening its
// temp file when `afterEach` removed the test's temp directory out from under it — nothing
// in the test awaited that write before returning. `close()` (service.ts) exists to close
// that gap; this suite proves it does, with a deterministic (not timing-dependent) delay
// standing in for "the write is still slow when teardown wants to run."
describe('OrdersService.close', () => {
  it('awaits an in-flight background auto-draft before resolving, so a caller can safely tear down its store afterward', async () => {
    const store = await freshStore();
    const realWrite = store.writeWorkOrder.bind(store);
    let writeStarted = false;
    let writeFinished = false;
    // Stands in for a slow real fs write (the Windows CI runner's atomic-write retry loop)
    // — deterministic, not a race against real disk timing.
    vi.spyOn(store, 'writeWorkOrder').mockImplementation(async (wo) => {
      writeStarted = true;
      await new Promise((r) => setTimeout(r, 50));
      await realWrite(wo);
      writeFinished = true;
    });
    const service = new OrdersService({ store, ollama: ollamaAvailable({ what: 'x', why: '', where: '', acceptance: [] }) });

    await service.createMark({ pick: { path: 'x' }, prompt: 'x' }); // fires draftOrder in the background; its write hasn't started yet
    expect(writeStarted).toBe(false);
    expect(writeFinished).toBe(false);

    await service.close();

    expect(writeStarted).toBe(true);
    expect(writeFinished).toBe(true); // close() did not resolve until the real write actually landed
  });

  it('reproduces the CI ENOENT: a removal landing between the write\'s mkdir and its file-open fails the write, and without close() nothing stops it racing an in-flight auto-draft', async () => {
    // `atomic-write.ts`'s own retry loop is correct (reviewed: the temp file is never
    // touched again after a final failure, never re-created against a missing directory) —
    // this reproduces the TOCTOU one level up, at the exact two steps `atomicWriteFile`
    // itself always does in order (mkdir, then open-for-write), with a removal deterministically
    // landing in the gap between them instead of depending on real OS scheduling to hit it.
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-orders-'));
    const store = new JigStore(repoRoot);
    await store.init();
    const workOrdersDir = store.paths.workOrders;
    vi.spyOn(store, 'writeWorkOrder').mockImplementation(async () => {
      await mkdir(workOrdersDir, { recursive: true }); // atomicWriteFile's own first step
      await rm(repoRoot, { recursive: true, force: true }); // the race: teardown removes the dir HERE — no close() awaited it first
      await writeFile(join(workOrdersDir, 'race.md.tmp-test'), 'x', 'utf8'); // atomicWriteFile's second step — now ENOENT
    });
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const service = new OrdersService({ store, ollama: ollamaAvailable({ what: 'x', why: '', where: '', acceptance: [] }) });

    await service.createMark({ pick: { path: 'x' }, prompt: 'x' }); // fires draftOrder in the background, never awaited by the caller

    await vi.waitFor(() => expect(warnSpy).toHaveBeenCalled(), { timeout: 5000, interval: 20 });
    const [message, detail] = warnSpy.mock.calls[0]!;
    expect(message).toBe('auto-draft failed');
    expect(String(detail)).toMatch(/ENOENT/); // matches CI: "auto-draft failed Error: ENOENT: no such file or directory, open '...work-orders\...tmp-...'"
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

  // Finding 2 (wave-3 council, security high): editHumanFace used to spread `patch` into
  // `human` with no runtime validation — a `Partial<WorkOrderHuman>` type annotation is
  // erased at build time, so nothing stopped a caller (the PATCH route passes raw req.body)
  // from writing arbitrary junk into the frontmatter.
  describe('runtime validation of the patch (finding 2)', () => {
    it('rejects an unknown key rather than merging it silently', async () => {
      const store = await freshStore();
      const service = new OrdersService({ store, ollama: ollamaUnavailable() });
      const { workOrder } = await store.createMarkAndWorkOrder({ target: { path: 'x' }, prompt: 'x' });

      await expect(service.editHumanFace(workOrder.id, { evil: { $ref: 'x' } })).rejects.toThrow();
      // and the junk never landed — untouched, not partially written.
      expect((store.getWorkOrder(workOrder.id)?.human as unknown as Record<string, unknown>).evil).toBeUndefined();
    });

    it('rejects a field of the wrong type (what as a number, not a string)', async () => {
      const store = await freshStore();
      const service = new OrdersService({ store, ollama: ollamaUnavailable() });
      const { workOrder } = await store.createMarkAndWorkOrder({ target: { path: 'x' }, prompt: 'x' });

      await expect(service.editHumanFace(workOrder.id, { what: 1 as unknown as string })).rejects.toThrow();
      expect(store.getWorkOrder(workOrder.id)?.human.what).toBe('x'); // unchanged
    });

    it('rejects acceptance when it is not an array', async () => {
      const store = await freshStore();
      const service = new OrdersService({ store, ollama: ollamaUnavailable() });
      const { workOrder } = await store.createMarkAndWorkOrder({ target: { path: 'x' }, prompt: 'x' });

      await expect(
        service.editHumanFace(workOrder.id, { acceptance: 'not-an-array' as unknown as string[] }),
      ).rejects.toThrow();
    });

    it('rejects a "what" longer than the sane per-field cap even though the whole patch is tiny', async () => {
      const store = await freshStore();
      const service = new OrdersService({ store, ollama: ollamaUnavailable() });
      const { workOrder } = await store.createMarkAndWorkOrder({ target: { path: 'x' }, prompt: 'x' });

      await expect(service.editHumanFace(workOrder.id, { what: 'x'.repeat(5000) })).rejects.toThrow();
    });

    it('still accepts a well-formed, fully-populated patch (control)', async () => {
      const store = await freshStore();
      const service = new OrdersService({ store, ollama: ollamaUnavailable() });
      const { workOrder } = await store.createMarkAndWorkOrder({ target: { path: 'x' }, prompt: 'x' });

      const patched = await service.editHumanFace(workOrder.id, {
        what: 'flag overdue rows',
        why: 'nobody notices',
        where: 'InvoiceListComponent',
        acceptance: ['an overdue row is red'],
        fixture: 'overdue-fixture',
      });

      expect(patched.human).toEqual({
        what: 'flag overdue rows',
        why: 'nobody notices',
        where: 'InvoiceListComponent',
        acceptance: ['an overdue row is red'],
        fixture: 'overdue-fixture',
      });
    });
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
