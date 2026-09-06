import type { Express } from 'express';
import type { PlateProxyHandle } from './proxy.js';

/** The one HTTP surface the bench server exposes for the plate: what the proxy is pointed
 * at, whether it's reachable, and every header it changed to make embedding possible — never
 * silent (ADR-002 / EXECUTION-PLAN §6 risk 1). Wired into `http.ts` with a single call.
 *
 * `getActiveFixture` (S7, optional) reports the loaded fixture's name — F10: "GET /api/plate
 * should show fixture: <name>|null". "None loaded" is represented by OMITTING the key rather
 * than sending a literal `null`: every pre-S7 caller (and every existing test) constructed
 * this route with no getter at all, and `res.json` drops `undefined`-valued keys the same way
 * an absent key would read, so this stays 100% backward compatible on the wire. */
export function attachPlateRoute(
  app: Express,
  plate: PlateProxyHandle,
  getActiveFixture?: () => string | null,
): void {
  app.get('/api/plate', async (_req, res, next) => {
    try {
      const status = await plate.getStatus();
      const fixture = getActiveFixture ? (getActiveFixture() ?? undefined) : undefined;
      res.json(fixture === undefined ? status : { ...status, fixture });
    } catch (err) {
      next(err);
    }
  });
}
