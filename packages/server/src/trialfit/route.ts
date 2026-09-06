import type { Express, NextFunction, Request, Response } from 'express';
import type { PlateProxyHandle } from '../plate/proxy.js';
import { TrialFitMirror } from './mirror.js';
import { SnapshotStore } from './snapshot.js';

const MIRROR_PORT_OFFSET = 1;
const FALLBACK_MIRROR_PORT = 4602;

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

export interface AttachTrialFitRouteOptions {
  mirror: TrialFitMirror;
  snapshotStore: SnapshotStore;
  /** The primary plate, when the CLI has one running — supplies the mirror's default
   * target (its current target) and default port (its own port + 1) whenever the request
   * body omits them. Absent (no `--target` yet, or S1's stub host): the caller must name an
   * explicit `target`, or the request 409s rather than guessing. */
  primaryPlate?: PlateProxyHandle;
}

/**
 * F11 / CHASSIS.md's trial-fit mode REST surface: start (or repoint) the mirror, and
 * save/serve the release-moment "before" snapshot the loupe's `jig:snapshot` produces.
 * Mounted once from `http.ts` alongside the other `/api/*` routes.
 */
export function attachTrialFitRoute(app: Express, options: AttachTrialFitRouteOptions): void {
  const { mirror, snapshotStore, primaryPlate } = options;

  app.post('/api/plate/mirror', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodyTarget = typeof req.body?.target === 'string' && req.body.target.trim() ? req.body.target : undefined;
      const bodyPort = typeof req.body?.port === 'number' ? req.body.port : undefined;

      let target = bodyTarget;
      if (!target && primaryPlate) {
        target = (await primaryPlate.getStatus()).target ?? undefined;
      }
      if (!target) {
        sendError(res, 409, 'no target to mirror — pass "target" in the body, or point the primary plate at one first');
        return;
      }

      const port = bodyPort ?? (primaryPlate ? primaryPlate.port + MIRROR_PORT_OFFSET : FALLBACK_MIRROR_PORT);
      const handle = await mirror.start(target, port);
      res.status(200).json({ target, port: handle.port });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/plate/snapshot', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.body?.id ?? '');
      const html = String(req.body?.html ?? '');
      if (!id.trim() || !html.trim()) {
        sendError(res, 400, 'id and html are both required');
        return;
      }
      await snapshotStore.save(id, html);
      res.status(201).json({ id });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/plate/snapshot/:id', async (req, res, next) => {
    try {
      const html = await snapshotStore.read(req.params.id);
      if (html === undefined) {
        sendError(res, 404, `no snapshot with id "${req.params.id}"`);
        return;
      }
      res.status(200).type('html').send(html);
    } catch (err) {
      next(err);
    }
  });
}
