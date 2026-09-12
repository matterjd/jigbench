import type { Express, NextFunction, Request, Response } from 'express';
import type { PlateProxyHandle } from '../plate/proxy.js';
import { TrialFitMirror } from './mirror.js';
import { SnapshotStore } from './snapshot.js';
import { sanitizeSnapshotHtml } from './sanitize-snapshot.js';
import { isValidPort, portRefusedMessage } from '../valid-port.js'; // #37

// Wave-4 council finding 4 (MEDIUM): the snapshot is served from ITS OWN response, standalone
// (no bench chrome around it) — these headers hold even if some future markup slips past
// sanitizeSnapshotHtml. `default-src 'none'` blocks script/frame/connect/etc. entirely;
// img/style/font are allowed (a frozen app snapshot legitimately has its own images/fonts and
// inline styles) but nothing that can execute. `X-Content-Type-Options: nosniff` stops a
// browser from ever reinterpreting this response as anything other than the `text/html`
// content-type it's served with.
const SNAPSHOT_CSP = "default-src 'none'; img-src data: http: https:; style-src 'unsafe-inline' http: https:; font-src data: http: https:";

const MIRROR_PORT_OFFSET = 1;
const FALLBACK_MIRROR_PORT = 4602;
/** #37: `listen(0)` asks the OS for any free port. Named so the one place that lets a request
 * through with it reads as a sentinel rather than as a number that slipped the bound. */
const EPHEMERAL_PORT = 0;

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

      // #37: bounded before `mirror.start()` binds anything. `1e999` arrives as Infinity,
      // which `server.listen` rejects with ERR_SOCKET_BAD_PORT — a 500 that says nothing about
      // the request. Same rule as `POST /api/target/start` (valid-port.ts), with ONE deliberate
      // addition here: `0` is the OS's "assign me any free port" sentinel and is legitimate on
      // THIS route, because its 200 body reports the port actually bound — a caller that asks
      // for 0 still learns where to reach the mirror. `POST /api/target/start` has no
      // equivalent: the port it takes is where the app is expected to answer, and no app binds
      // 0, so 0 there is the same nonsense as 65536.
      const rawPort: unknown = req.body?.port;
      const asksForAnyFreePort = rawPort === EPHEMERAL_PORT;
      if (rawPort !== undefined && !asksForAnyFreePort && !isValidPort(rawPort)) {
        sendError(res, 400, portRefusedMessage(rawPort));
        return;
      }
      const bodyPort = asksForAnyFreePort ? EPHEMERAL_PORT : isValidPort(rawPort) ? rawPort : undefined;

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
      // Sanitize AGAIN before persisting (finding 4): loupe.js's captureSnapshot() already
      // sanitizes client-side, but that page's own DOM is exactly what may already carry
      // attacker-controlled markup — never trust it as the only sanitization point.
      await snapshotStore.save(id, sanitizeSnapshotHtml(html));
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
      res.set('Content-Security-Policy', SNAPSHOT_CSP);
      res.set('X-Content-Type-Options', 'nosniff');
      res.status(200).type('html').send(html);
    } catch (err) {
      next(err);
    }
  });
}
