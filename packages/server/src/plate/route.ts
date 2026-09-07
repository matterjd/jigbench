import type { IRouter } from 'express';
import type { PlateProxyHandle } from './proxy.js';

/** `GET /api/plate`'s `mirror` field (S8, CHASSIS.md's trial-fit mode) — deliberately a
 * plain shape here (not `import type` from `../trialfit/mirror.js`) so this file never has
 * to depend on the trial-fit module just to describe the two fields it reports. */
export interface MirrorStatusReport {
  port: number;
  status: 'up' | 'down' | 'none';
}

/** The one HTTP surface the bench server exposes for the plate: what the proxy is pointed
 * at, whether it's reachable, and every header it changed to make embedding possible — never
 * silent (ADR-002 / EXECUTION-PLAN §6 risk 1). Wired into `http.ts` with a single call.
 *
 * `getActiveFixture` (S7, optional) reports the loaded fixture's name — F10: "GET /api/plate
 * should show fixture: <name>|null". "None loaded" is represented by OMITTING the key rather
 * than sending a literal `null`: every pre-S7 caller (and every existing test) constructed
 * this route with no getter at all, and `res.json` drops `undefined`-valued keys the same way
 * an absent key would read, so this stays 100% backward compatible on the wire.
 *
 * `getMirrorStatus` (S8, optional) reports the trial-fit mirror's `{port, status}` the same
 * way — omitted when no mirror is running (or no getter was supplied at all), never a literal
 * `null`. Async because checking the mirror's real reachability is async (`TrialFitMirror`'s
 * own `getStatus()` probes it), unlike the fixture getter above. */
// S17b: `IRouter`, not `Express` — `bench/host.ts` mounts this on a per-bench `express.Router()`;
// an Express app satisfies `IRouter` too, so every existing call site is unchanged.
export function attachPlateRoute(
  app: IRouter,
  plate: PlateProxyHandle,
  getActiveFixture?: () => string | null,
  getMirrorStatus?: () => Promise<MirrorStatusReport | null>,
): void {
  app.get('/api/plate', async (_req, res, next) => {
    try {
      const status = await plate.getStatus();
      const fixture = getActiveFixture ? (getActiveFixture() ?? undefined) : undefined;
      const mirror = getMirrorStatus ? ((await getMirrorStatus()) ?? undefined) : undefined;
      res.json({
        ...status,
        ...(fixture === undefined ? {} : { fixture }),
        ...(mirror === undefined ? {} : { mirror }),
      });
    } catch (err) {
      next(err);
    }
  });
}
