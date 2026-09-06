import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { DocsIndexSchema, WorkOrderHumanSchema, transition, type DocsIndex, type Mark, type MarkTarget, type WorkOrder, type WorkOrderHuman, type WorkOrderShop } from '@jigbench/core';
import type { JigStore } from '../store.js';
import { pathExists } from '../fs-util.js';
import { logger } from '../logger.js';
import { OllamaDrafter, type OllamaDraftContext } from './drafters/ollama.js';
import { AgentDrafter } from './drafters/shop.js';
import { HumanDrafter } from './drafters/human.js';
import { selectDrafter, type DrafterSelection } from './select-drafter.js';
import { buildShopFace } from './shop-face.js';
import { OrderConflictError, OrderNotFoundError } from './errors.js';

/**
 * The orders service (EXECUTION-PLAN.md §4 S5): the one place that turns a mark into a
 * work order, drafts it, releases it, and moves it through scrap/restore. `http.ts` is
 * the only caller — every route just maps this service's return value or thrown error
 * onto an HTTP response; the ladder rules and the drafter-selection order live here, not
 * there.
 */

export interface PickInput {
  path: string;
  component?: string;
  file?: string;
  text?: string;
}

export interface OrdersServiceOptions {
  store: JigStore;
  /** Called after every persisted mutation — `http.ts` wires this to its own
   * `broadcastState(wss, store)` so WS clients see the change land. Defaults to a no-op
   * so the service is usable standalone in tests. */
  notify?: () => void;
  ollama?: OllamaDrafter;
  shop?: AgentDrafter;
}

export interface DrafterInfo {
  driver: DrafterSelection['driver'];
  reason: string;
  model?: string;
  available: { ollama: boolean; shop: boolean };
}

const SCRAP_PREV_PREFIX = 'prev:';

function costNote(selection: DrafterSelection, elapsedMs: number): string {
  if (selection.driver === 'model') return `${selection.model} · ${(elapsedMs / 1000).toFixed(1)}s`;
  if (selection.driver === 'shop') return 'queued for the shop';
  return selection.reason;
}

// Finding 2 (wave-3 council, security high): `editHumanFace`'s `patch` parameter used to be
// typed `Partial<WorkOrderHuman>` and nothing more — a compile-time-only annotation, erased
// at runtime, so `PATCH /api/work-orders/:id` (http.ts) could merge ANY JSON object (wrong
// field types, unknown keys) straight into the persisted `human` face. `.strict()` rejects
// unknown keys instead of silently dropping or merging them; the `what` override adds a sane
// per-field length cap on top of the whole-body size limit `http.ts` sets on express.json() —
// a single absurdly long field could otherwise still bloat the frontmatter well under that
// overall byte budget.
const MAX_WHAT_LENGTH = 4000;
export const HumanFacePatchSchema = WorkOrderHumanSchema.partial()
  .extend({ what: z.string().max(MAX_WHAT_LENGTH).optional() })
  .strict();

function fallbackMark(order: WorkOrder): Mark {
  return {
    id: order.marks[0] ?? `m-${order.id}`,
    number: 1,
    target: { path: order.human.where },
    prompt: order.human.what,
    createdAt: new Date().toISOString(),
  };
}

// Finding 3 (wave-3 council, security medium): a bare counting semaphore bounding how many
// model (Ollama) calls run at once — a mark flood (each `POST /api/marks` auto-drafts) used
// to fan out one `/api/generate` call per mark with no cap at all. `acquire()` has no
// `await` on its fast path, so two callers racing for the same free slot are decided
// strictly by call order (whoever calls `acquire()` first, synchronously, wins it) — that
// determinism is what `service.test.ts`'s concurrency-cap test relies on.
class Semaphore {
  private free: number;
  private readonly queue: Array<() => void> = [];

  constructor(concurrency: number) {
    this.free = concurrency;
  }

  async acquire(): Promise<() => void> {
    if (this.free > 0) {
      this.free--;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        this.free--;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.free++;
    const next = this.queue.shift();
    if (next) next();
  }
}

const MAX_CONCURRENT_MODEL_CALLS = 2;

export class OrdersService {
  private readonly store: JigStore;
  private readonly notify: () => void;
  private readonly ollama: OllamaDrafter;
  private readonly shop: AgentDrafter;
  // Finding 3: per-order de-dup (a draft already running for this id) and the global
  // model-call cap (MAX_CONCURRENT_MODEL_CALLS) — both instance-scoped, since one
  // OrdersService instance is exactly one running server.
  private readonly draftsInFlight = new Set<string>();
  private readonly modelCallSemaphore = new Semaphore(MAX_CONCURRENT_MODEL_CALLS);

  constructor(opts: OrdersServiceOptions) {
    this.store = opts.store;
    this.notify = opts.notify ?? (() => {});
    this.ollama = opts.ollama ?? new OllamaDrafter();
    this.shop = opts.shop ?? new AgentDrafter();
  }

  private now(): string {
    return new Date().toISOString();
  }

  private require(id: string): WorkOrder {
    const wo = this.store.getWorkOrder(id);
    if (!wo) throw new OrderNotFoundError(id);
    return wo;
  }

  private async persist(wo: WorkOrder): Promise<WorkOrder> {
    await this.store.writeWorkOrder(wo);
    this.notify();
    return wo;
  }

  private async loadDocsIndex(): Promise<DocsIndex | undefined> {
    const file = join(this.store.paths.survey, 'docs.json');
    if (!(await pathExists(file))) return undefined;
    try {
      return DocsIndexSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    } catch (err) {
      logger.warn('docs.json failed to parse; drafting without doc context', String(err));
      return undefined;
    }
  }

  private async selectionFor(): Promise<DrafterSelection> {
    const shopWired = this.store.getWiring().shop === 'wired';
    return selectDrafter({ ollama: this.ollama, shop: this.shop, shopWired });
  }

  /** `GET /api/drafter` — recomputes the selection live (so the badge is never stale) and
   * mirrors it onto `wiring.drafter` so the SIM strip agrees with what a draft would
   * actually use right now. */
  async getDrafterInfo(): Promise<DrafterInfo> {
    const shopWired = this.store.getWiring().shop === 'wired';
    const ollamaUp = await this.ollama.available();
    const selection: DrafterSelection = ollamaUp
      ? { drafter: this.ollama, driver: 'model', reason: `${this.ollama.model} is reachable on this desk`, model: this.ollama.model }
      : shopWired
        ? { drafter: this.shop, driver: 'shop', reason: 'a shop agent is connected; no local model reachable' }
        : { drafter: new HumanDrafter(), driver: 'person', reason: 'no local model and no connected agent — fill the human face yourself' };

    this.store.setDrafterWiring(ollamaUp ? 'wired' : 'stub');
    return { driver: selection.driver, reason: selection.reason, model: selection.model, available: { ollama: ollamaUp, shop: shopWired } };
  }

  /** Mark + order in `marked`, then kicks off `draftOrder` without waiting for it —
   * "the order moves to `drafted` when the draft lands, the bench sees the state change
   * over WS" (EXECUTION-PLAN.md §4 S5). A failure in the background draft is logged, not
   * thrown here — the caller already has its mark. */
  async createMark(input: { pick: PickInput; prompt: string }): Promise<{ mark: Mark; workOrder: WorkOrder }> {
    const target: MarkTarget = { path: input.pick.path, component: input.pick.component, file: input.pick.file, text: input.pick.text };
    const created = await this.store.createMarkAndWorkOrder({ target, prompt: input.prompt });
    this.notify();
    this.draftOrder(created.workOrder.id).catch((err) => logger.warn('auto-draft failed', String(err)));
    return created;
  }

  /** Runs the drafter-selection order once and applies its result. On success (model,
   * shop, or person — human drafting never fails) the ladder moves `marked` -> `drafted`,
   * UNLESS the shop was selected: an agent pull is pending (S6), so the order is left in
   * `marked` for it. On failure (e.g. Ollama returned unparseable JSON) the order stays
   * `marked`, the failure is logged, and responsibility "falls to human" — nothing here
   * auto-fills a face from garbage. Never throws for a draft failure; only for calling it
   * on an order that is not `marked` in the first place. */
  async draftOrder(id: string): Promise<WorkOrder> {
    const order = this.require(id);
    if (order.state !== 'marked') {
      throw new OrderConflictError(`work order ${id} is ${order.state}, not marked — cannot draft`);
    }
    // Finding 3 (wave-3 council, security medium): a second draftOrder call for an order
    // that already has one running is a no-op returning the CURRENT (still `marked`)
    // state, not a second model call. `http.ts`'s POST /draft route checks state
    // synchronously before calling this, so two racing calls both pass that check before
    // either persists — this is the guard that actually closes the race. Added to
    // `draftsInFlight` synchronously (no `await` before this line), so a second call
    // issued right after this one — even in the same microtask — still sees it.
    if (this.draftsInFlight.has(id)) {
      return order;
    }
    this.draftsInFlight.add(id);

    try {
      const mark = this.store.getMark(order.marks[0] ?? '') ?? fallbackMark(order);
      const selection = await this.selectionFor();
      this.store.setDrafterWiring(selection.driver === 'model' ? 'wired' : 'stub');

      const survey = this.store.getState().survey;
      const docsIndex = await this.loadDocsIndex();
      // Widened context (survey + the optional S2b docs index) built as a typed variable,
      // not an inline literal, so it stays assignable to the plain `DrafterContext` every
      // `Drafter` declares — only `OllamaDrafter` actually reads `docsIndex`.
      const context: OllamaDraftContext = { survey, docsIndex };

      // Finding 3: only real model calls are throttled — shop/person drafting never hits
      // an external service, so neither one ever waits on this semaphore. Acquired BEFORE
      // `started` so queue wait time is never counted in the measured `elapsedMs` badge
      // (EXECUTION-PLAN.md §4 S5: "always the measured elapsedMs, never a guess" — that
      // means the model's own cost, not this service's scheduling overhead).
      const releaseModelSlot = selection.driver === 'model' ? await this.modelCallSemaphore.acquire() : undefined;
      const started = Date.now();

      try {
        const human: WorkOrderHuman = await selection.drafter.draft(mark, context);
        const elapsedMs = Date.now() - started;

        const draftedLog = { at: this.now(), actor: selection.driver, event: selection.driver === 'shop' ? 'queued-to-shop' : 'drafted', ref: id, note: costNote(selection, elapsedMs) };
        const next: WorkOrder = {
          ...order,
          human: { ...order.human, ...human },
          draftedBy: selection.driver,
          log: [...order.log, draftedLog],
        };

        if (selection.driver !== 'shop') {
          const nextState = transition(order.state, 'draft');
          if (nextState) next.state = nextState;
        }

        return await this.persist(next);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const failed: WorkOrder = {
          ...order,
          log: [...order.log, { at: this.now(), actor: 'model', event: 'draft-failed', ref: id, note: message }],
        };
        return await this.persist(failed);
      } finally {
        releaseModelSlot?.();
      }
    } finally {
      this.draftsInFlight.delete(id);
    }
  }

  /** Re-attempts drafting a `marked` order — the same flow `createMark` triggers
   * automatically, exposed for an explicit retry after a logged failure. */
  async redraft(id: string): Promise<WorkOrder> {
    return this.draftOrder(id);
  }

  /** The human face stays editable before release ("released — the file is written; a
   * change now is a new work order", concept B F6) — `marked` and `drafted` only.
   *
   * `patch` is `unknown`, not `Partial<WorkOrderHuman>` — it is untrusted request-body
   * content (http.ts passes `req.body` straight through), so the TYPE alone must not be
   * trusted either; `HumanFacePatchSchema.parse` is the runtime check that used to be
   * missing entirely (finding 2). A rejected patch throws a `ZodError` (the same pattern
   * `http.ts`'s `POST /api/marks` already uses for `MarkTargetSchema`), which the PATCH
   * route's catch-all maps to 400 — nothing merges until validation passes. */
  async editHumanFace(id: string, patch: unknown): Promise<WorkOrder> {
    const order = this.require(id);
    if (order.state !== 'marked' && order.state !== 'drafted') {
      throw new OrderConflictError(`work order ${id} is ${order.state} — the human face is only editable before release`);
    }
    const validated = HumanFacePatchSchema.parse(patch);
    return this.persist({ ...order, human: { ...order.human, ...validated } });
  }

  /** RELEASE — the one demand (design-book Law I.2, CHASSIS.md): fills the shop face
   * deterministically from the survey, then (Ollama permitting) runs one optional polish
   * pass that may only rewrite the brief paragraph, never invent a file. */
  async release(id: string): Promise<WorkOrder> {
    const order = this.require(id);
    const nextState = transition(order.state, 'release');
    if (!nextState) {
      throw new OrderConflictError(`work order ${id} is ${order.state}, not drafted — release needs a draft first`);
    }

    const survey = this.store.getState().survey;
    const mark = this.store.getMark(order.marks[0] ?? '');
    const shopFace: WorkOrderShop = buildShopFace({
      survey,
      componentName: mark?.target.component,
      file: mark?.target.file,
      human: order.human,
      promptText: `${order.human.what} ${order.human.why}`,
    });

    const extraLog: WorkOrder['log'] = [];
    let finalShopFace = shopFace;
    if (await this.ollama.available()) {
      try {
        const polished = await this.ollama.rewrite(
          shopFace.brief,
          'Rewrite the following brief paragraph so it reads naturally. Keep every fact, file name, and list item exactly as given — change only the prose. Reply with the paragraph only, no preamble.',
        );
        if (polished) {
          finalShopFace = { ...shopFace, brief: polished };
          extraLog.push({ at: this.now(), actor: 'model', event: 'shop-face-polished', ref: id, note: `brief rewritten by ${this.ollama.model}` });
        }
      } catch (err) {
        logger.warn('shop-face polish pass failed; keeping the deterministic brief', String(err));
      }
    }

    const next: WorkOrder = {
      ...order,
      state: nextState,
      shop: finalShopFace,
      log: [...order.log, ...extraLog, { at: this.now(), actor: 'person', event: 'released', ref: id, note: 'shop face filled; file rewritten under .jig/' }],
    };
    return this.persist(next);
  }

  /** Law II: scrapped is a state, never a deletion — the file stays in
   * `.jig/work-orders/`, untouched, and the prior state is recorded on the log entry so
   * `restore` can put it back exactly where it left off. */
  async scrap(id: string): Promise<WorkOrder> {
    const order = this.require(id);
    const nextState = transition(order.state, 'scrap');
    if (!nextState) {
      throw new OrderConflictError(`work order ${id} is already ${order.state} — nothing to scrap`);
    }
    const next: WorkOrder = {
      ...order,
      state: nextState,
      log: [...order.log, { at: this.now(), actor: 'person', event: 'scrapped', ref: id, note: `${SCRAP_PREV_PREFIX}${order.state}` }],
    };
    return this.persist(next);
  }

  /** The ladder has no event out of `scrapped` (it is deliberately terminal there) — this
   * reads the state `scrap` recorded on its way in and writes it back directly, the one
   * documented exception to going through `transition()`. */
  async restore(id: string): Promise<WorkOrder> {
    const order = this.require(id);
    if (order.state !== 'scrapped') {
      throw new OrderConflictError(`work order ${id} is ${order.state}, not scrapped — nothing to restore`);
    }
    const lastScrap = [...order.log].reverse().find((l) => l.event === 'scrapped' && l.note?.startsWith(SCRAP_PREV_PREFIX));
    const prevState = (lastScrap?.note?.slice(SCRAP_PREV_PREFIX.length) as WorkOrder['state'] | undefined) ?? 'marked';
    const next: WorkOrder = {
      ...order,
      state: prevState,
      log: [...order.log, { at: this.now(), actor: 'person', event: 'restored', ref: id, note: `back to ${prevState}` }],
    };
    return this.persist(next);
  }

  selectOrder(id: string): WorkOrder | undefined {
    return this.store.getWorkOrder(id);
  }
}
