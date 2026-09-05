import type { Express } from 'express';
import type { PlateProxyHandle } from './proxy.js';

/** The one HTTP surface the bench server exposes for the plate: what the proxy is pointed
 * at, whether it's reachable, and every header it changed to make embedding possible — never
 * silent (ADR-002 / EXECUTION-PLAN §6 risk 1). Wired into `http.ts` with a single call. */
export function attachPlateRoute(app: Express, plate: PlateProxyHandle): void {
  app.get('/api/plate', async (_req, res, next) => {
    try {
      res.json(await plate.getStatus());
    } catch (err) {
      next(err);
    }
  });
}
