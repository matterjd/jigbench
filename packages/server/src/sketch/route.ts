import type { IRouter, NextFunction, Request, Response } from 'express';
import { SketchLinkSchema, SketchElementSchema, type GaugeSet } from '@jigbench/core';
import { z } from 'zod';
import { SketchNotFoundError, SketchStore } from './store.js';
import { renderSketchHtml } from './render.js';

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

const SizeSchema = z.object({ w: z.number().positive(), h: z.number().positive() });

/** The `PUT /api/sketches/:id` body — a whole-sketch replace (the bench sends the sheet's
 * current elements/links on every save, the same "one write, whole document" shape
 * `writeWorkOrder` already uses in `store.ts`). Validated with the SAME element/link schemas
 * `@jigbench/core` uses for the file itself, so a raw value in a gauge slot or an element
 * outside the closed primitive set 400s here — never reaches disk. */
const UpdateSketchBodySchema = z.object({
  name: z.string().min(1),
  size: SizeSchema,
  elements: z.array(SketchElementSchema).default([]),
  links: z.array(SketchLinkSchema).default([]),
});

/**
 * F9 / CHASSIS.md's Sketch tool REST surface: list/create/read/update, scrap/restore (Law
 * II), and the standalone HTML render. Mounted once from `http.ts` alongside the other
 * `/api/*` routes, mirroring `fixtures/route.ts` and `toolpath/route.ts`. `getGaugeSet` is a
 * thunk (not a snapshot), the same reasoning `fixtures/route.ts`'s `getSurvey` thunk
 * documents — a sketch rendered after a re-survey uses the CURRENT gauge set.
 */
// S17b: `IRouter`, not `Express` — `bench/host.ts` mounts this on a per-bench `express.Router()`;
// an Express app satisfies `IRouter` too, so every existing call site is unchanged.
export function attachSketchesRoute(app: IRouter, sketchStore: SketchStore, getGaugeSet: () => GaugeSet): void {
  app.get('/api/sketches', (_req, res) => {
    res.json({ sketches: sketchStore.list() });
  });

  app.get('/api/sketches/:id', (req, res) => {
    const sketch = sketchStore.get(req.params.id);
    if (!sketch) {
      sendError(res, 404, `no sketch with id "${req.params.id}"`);
      return;
    }
    res.json(sketch);
  });

  app.get('/api/sketches/:id/html', (req, res) => {
    const sketch = sketchStore.get(req.params.id);
    if (!sketch) {
      sendError(res, 404, `no sketch with id "${req.params.id}"`);
      return;
    }
    res.status(200).type('html').send(renderSketchHtml(sketch, getGaugeSet()));
  });

  app.post('/api/sketches', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const name = String(req.body?.name ?? '');
      if (!name.trim()) {
        sendError(res, 400, 'name is required');
        return;
      }
      const size = SizeSchema.parse(req.body?.size ?? { w: 1024, h: 768 });
      const sketch = await sketchStore.create({ name, size });
      res.status(201).json(sketch);
    } catch (err) {
      if (err instanceof z.ZodError) {
        sendError(res, 400, err.message);
        return;
      }
      next(err);
    }
  });

  app.put('/api/sketches/:id', async (req, res, next) => {
    try {
      const input = UpdateSketchBodySchema.parse(req.body);
      const sketch = await sketchStore.update(req.params.id, input);
      res.status(200).json(sketch);
    } catch (err) {
      if (err instanceof SketchNotFoundError) {
        sendError(res, 404, err.message);
        return;
      }
      if (err instanceof z.ZodError) {
        sendError(res, 400, err.message);
        return;
      }
      next(err);
    }
  });

  app.post('/api/sketches/:id/scrap', async (req, res, next) => {
    try {
      res.json(await sketchStore.scrap(req.params.id));
    } catch (err) {
      if (err instanceof SketchNotFoundError) {
        sendError(res, 404, err.message);
        return;
      }
      next(err);
    }
  });

  app.post('/api/sketches/:id/restore', async (req, res, next) => {
    try {
      res.json(await sketchStore.restore(req.params.id));
    } catch (err) {
      if (err instanceof SketchNotFoundError) {
        sendError(res, 404, err.message);
        return;
      }
      next(err);
    }
  });
}
