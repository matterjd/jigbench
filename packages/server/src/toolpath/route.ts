import type { IRouter, NextFunction, Request, Response } from 'express';
import type { ToolpathStep } from '@jigbench/core';
import { ToolpathNotFoundError, ToolpathStore } from './store.js';

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

/**
 * F11 / CHASSIS.md's toolpath scrubber REST surface: save a recording, list/read them, and
 * scrap/restore (Law II). Mounted once from `http.ts` alongside the other `/api/*` routes,
 * mirroring `fixtures/route.ts` exactly.
 */
// #23 ruling 1: `IRouter`, not `Express` — `bench/host.ts` mounts this on a per-bench
// `express.Router()` too now; an Express app satisfies `IRouter`, so `http.ts`'s call is
// unchanged. Same move `fixtures/route.ts` and `plate/route.ts` made for S17b.
export function attachToolpathsRoute(app: IRouter, toolpathStore: ToolpathStore): void {
  app.get('/api/toolpaths', (_req, res) => {
    res.json({ toolpaths: toolpathStore.list() });
  });

  app.get('/api/toolpaths/:id', (req, res) => {
    const toolpath = toolpathStore.get(req.params.id);
    if (!toolpath) {
      sendError(res, 404, `no toolpath with id "${req.params.id}"`);
      return;
    }
    res.json(toolpath);
  });

  app.post('/api/toolpaths', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const name = String(req.body?.name ?? '');
      if (!name.trim()) {
        sendError(res, 400, 'name is required');
        return;
      }
      const startUrl = typeof req.body?.startUrl === 'string' ? req.body.startUrl : undefined;
      const steps = (Array.isArray(req.body?.steps) ? req.body.steps : []) as ToolpathStep[];
      const toolpath = await toolpathStore.create({ name, startUrl, steps });
      res.status(201).json(toolpath);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/toolpaths/:id/scrap', async (req, res, next) => {
    try {
      res.json(await toolpathStore.scrap(req.params.id));
    } catch (err) {
      if (err instanceof ToolpathNotFoundError) {
        sendError(res, 404, err.message);
        return;
      }
      next(err);
    }
  });

  app.post('/api/toolpaths/:id/restore', async (req, res, next) => {
    try {
      res.json(await toolpathStore.restore(req.params.id));
    } catch (err) {
      if (err instanceof ToolpathNotFoundError) {
        sendError(res, 404, err.message);
        return;
      }
      next(err);
    }
  });
}
