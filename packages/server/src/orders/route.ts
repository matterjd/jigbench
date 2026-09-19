import type { IRouter, NextFunction, Response } from 'express';
import { MarkTargetSchema } from '@jigbench/core';
import type { JigStore } from '../store.js';
import { logger } from '../logger.js';
import { OrderConflictError, OrderNotFoundError } from './errors.js';
import type { OrdersService } from './service.js';

export interface WorkOrdersRouteContext {
  store: JigStore;
  orders: OrdersService;
  /** Called once `POST /api/marks` has persisted. That route writes through the store
   * directly (`createMarkAndWorkOrder`) rather than through `OrdersService`, so the
   * broadcast every OTHER move here gets from the service's own `notify` has to be made by
   * the route itself — `http.ts` passes its `broadcastState(wss, store)`, `bench/host.ts`
   * its per-bench one. */
  notify: () => void;
}

/**
 * S5/S8's work-order REST surface, lifted verbatim out of `http.ts`'s two delimited blocks
 * (#23 ruling 1, 2026-09-14: "MOUNT them (toolpath, work orders, trial fit) so the Clamp path
 * equals --repo"). It was the one Advanced surface with no `attachXRoute` of its own, which is
 * why `bench/host.ts` could not mount it. Nothing about the routes changed in the move: same
 * paths, same status codes, same sentences, same fire-and-forget draft —
 * `orders/http.orders.test.ts` and `orders/http.trialfit.test.ts` are the control on that.
 *
 * `IRouter`, not `Express`: `bench/host.ts` mounts this on a per-bench `express.Router()`, the
 * same way `fixtures/route.ts` and `plate/route.ts` are mounted since S17b.
 */
export function attachWorkOrdersRoute(app: IRouter, ctx: WorkOrdersRouteContext): void {
  const { store, orders, notify } = ctx;

  app.post('/api/marks', async (req, res, next) => {
    try {
      // S5: body may carry `pick` (the loupe's PlatePick shape) instead of `target` — the
      // existing `target` shape is untouched, so nothing about this route's prior timing
      // or broadcast behavior changes for a caller that still sends `target`.
      const pick = req.body?.pick;
      const rawTarget =
        req.body?.target ??
        (pick && typeof pick === 'object'
          ? { path: pick.path, component: pick.component, file: pick.file, text: pick.text }
          : undefined);
      const target = MarkTargetSchema.parse(rawTarget);
      const prompt = String(req.body?.prompt ?? '');
      if (!prompt.trim()) {
        res.status(400).json({ error: 'prompt is required' });
        return;
      }
      const created = await store.createMarkAndWorkOrder({ target, prompt });
      notify();
      res.status(201).json(created);

      // Integration seam 2 (wave-3 merge): the product flow is "mark -> drafting
      // immediately, with its cost shown" (commission F7, CHASSIS.md) — fire the same
      // auto-draft `OrdersService.createMark` already does for its own callers, but from
      // this route too, since http.ts creates marks via `store.createMarkAndWorkOrder`
      // directly rather than through `orders.createMark`. Opt out with `draft:false` in the
      // body. Fire-and-forget, after the 201 has already gone out: a slow (or absent)
      // drafter must never hold the mark-creation response open. Failure leaves the order
      // `marked` with a logged `draft-failed` entry (orders/service.ts's own `draftOrder`
      // never throws for a draft failure) — logged here too since nothing else awaits it.
      if (req.body?.draft !== false) {
        orders.draftOrder(created.workOrder.id).catch((err) => logger.warn('auto-draft failed', String(err)));
      }
    } catch (err) {
      next(err);
    }
  });

  function mapOrderError(err: unknown, res: Response, next: NextFunction): void {
    if (err instanceof OrderNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof OrderConflictError) {
      res.status(409).json({ error: err.message });
      return;
    }
    next(err);
  }

  app.post('/api/work-orders/:id/draft', (req, res) => {
    const order = store.getWorkOrder(req.params.id);
    if (!order) {
      res.status(404).json({ error: `no such work order: ${req.params.id}` });
      return;
    }
    if (order.state !== 'marked') {
      res.status(409).json({ error: `work order ${order.id} is ${order.state}, not marked — cannot draft` });
      return;
    }
    res.status(202).json({ accepted: true, id: order.id });
    orders.draftOrder(order.id).catch((err) => logger.warn('draft failed', String(err)));
  });

  app.post('/api/work-orders/:id/release', async (req, res, next) => {
    try {
      res.status(200).json(await orders.release(req.params.id));
    } catch (err) {
      mapOrderError(err, res, next);
    }
  });

  app.post('/api/work-orders/:id/scrap', async (req, res, next) => {
    try {
      res.status(200).json(await orders.scrap(req.params.id));
    } catch (err) {
      mapOrderError(err, res, next);
    }
  });

  app.post('/api/work-orders/:id/restore', async (req, res, next) => {
    try {
      res.status(200).json(await orders.restore(req.params.id));
    } catch (err) {
      mapOrderError(err, res, next);
    }
  });

  app.patch('/api/work-orders/:id', async (req, res, next) => {
    try {
      res.status(200).json(await orders.editHumanFace(req.params.id, req.body ?? {}));
    } catch (err) {
      mapOrderError(err, res, next);
    }
  });

  app.get('/api/drafter', async (_req, res, next) => {
    try {
      res.json(await orders.getDrafterInfo());
    } catch (err) {
      next(err);
    }
  });
  // === end S5 orders block ===

  // === S8 (trial fit): the two ladder moves the shop drives ==============================
  app.post('/api/work-orders/:id/claim', async (req, res, next) => {
    try {
      const by = typeof req.body?.by === 'string' && req.body.by.trim() ? req.body.by : undefined;
      res.status(200).json(await orders.claim(req.params.id, by));
    } catch (err) {
      mapOrderError(err, res, next);
    }
  });

  app.post('/api/work-orders/:id/report', async (req, res, next) => {
    try {
      const summary = String(req.body?.summary ?? '');
      if (!summary.trim()) {
        res.status(400).json({ error: 'summary is required' });
        return;
      }
      const files = Array.isArray(req.body?.files) ? req.body.files.map(String) : undefined;
      res.status(200).json(await orders.reportDone(req.params.id, { summary, files }));
    } catch (err) {
      mapOrderError(err, res, next);
    }
  });
  // === end S8 block ===
}
