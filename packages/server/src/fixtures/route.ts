import type { Express, NextFunction, Request, Response } from 'express';
import type { Fixture, Survey } from '@jigbench/core';
import {
  FixtureNameConflictError,
  FixtureNotFoundError,
  FixtureScrappedError,
  FixtureStore,
} from './store.js';

/** `POST /api/plate/fill`'s `fields` entry — the value the loupe should write into one named
 * input. Resolution only: the server never reaches the plate iframe itself (it's cross-origin
 * inside the bench's own page), so the bench posts the actual `jig:fill` message — see
 * `packages/bench/src/fixtures/FixturePanel.tsx`. */
export interface ResolvedField {
  name: string;
  value: unknown;
}

/** Matter's retest-18: "Fail but I did not receive the proof from a terminal" — the panel used
 * to claim "the plate answers from it" unconditionally on every load, whether or not the plate
 * actually did. This is the same check Matter ran by hand
 * (`curl -sI http://127.0.0.1:4601/api/invoices | grep -i x-jig-fixture`), made by the bench
 * itself, server-side, so the panel never has to trust an unverified claim. */
export type FixtureProof =
  | { ok: true; header: 'x-jig-fixture'; value: string }
  | { ok: false; reason: 'no-endpoints' | 'not-confirmed' | 'unreachable' };

const PROOF_TIMEOUT_MS = 2000;

/** Picks a single GET, non-templated response key to probe — a `{id}` segment has no real id
 * to substitute, and probing is only ever meant to prove "the plate is answering from this
 * fixture at all", not to exercise every route. `undefined` when the fixture has no such key —
 * exactly the Angular-only-survey case (0 endpoints surveyed, see `generateFixture`): honest
 * `{ ok: false, reason: 'no-endpoints' }`, no network call attempted. */
function pickProbeKey(fixture: Fixture): string | undefined {
  return Object.keys(fixture.responses).find((key) => {
    const spaceIndex = key.indexOf(' ');
    if (spaceIndex === -1) return false;
    const method = key.slice(0, spaceIndex);
    const path = key.slice(spaceIndex + 1);
    return method === 'GET' && !path.includes('{');
  });
}

/** Makes the REAL round-trip request through the plate proxy that `pickProbeKey` names — a
 * HEAD, the exact request TEST-RUN.md's own documented proof line runs via `curl -sI` — and
 * reports honestly whether the response actually carried this fixture's own `x-jig-fixture`
 * header. `plateUrl` undefined (no plate wired at all, e.g. a `createJigServer` caller with no
 * `--target`) skips the probe entirely rather than guessing — `undefined`, not a false claim,
 * so a caller can omit `proof` from its response altogether. */
export async function probeFixtureAnswers(plateUrl: string | undefined, fixture: Fixture): Promise<FixtureProof | undefined> {
  if (!plateUrl) return undefined;

  const probeKey = pickProbeKey(fixture);
  if (!probeKey) return { ok: false, reason: 'no-endpoints' };
  const path = probeKey.slice(probeKey.indexOf(' ') + 1);

  try {
    const res = await fetch(`${plateUrl.replace(/\/$/, '')}${path}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(PROOF_TIMEOUT_MS),
    });
    const value = res.headers.get('x-jig-fixture');
    if (value === fixture.name) return { ok: true, header: 'x-jig-fixture', value };
    return { ok: false, reason: 'not-confirmed' };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

/**
 * F10's REST surface: list/create/load/unload/scrap/restore fixtures, and resolve a fixture's
 * form values for the loupe's fill. Mounted once from `http.ts` alongside the other `/api/*`
 * routes; `getSurvey` is a thunk (not a snapshot) so a fixture created after a re-survey uses
 * the CURRENT survey, not whatever was live when the server started. `getPlateUrl` is the same
 * shape of thunk for the S7 proof line (`probeFixtureAnswers` above) — optional, so a caller
 * with no plate wired gets the prior contract back unchanged: `load` responds with just
 * `{ active }`, no `proof` key at all.
 */
export function attachFixturesRoute(
  app: Express,
  fixtureStore: FixtureStore,
  getSurvey: () => Survey,
  getPlateUrl?: () => string | undefined,
): void {
  app.get('/api/fixtures', (_req, res) => {
    // "active" is the fixture's NAME throughout this API (matching the interceptor's
    // x-jig-fixture header and GET /api/plate's `fixture` field) — `:id` in the routes below
    // is the internal filename-safe slug, which usually but not always equals the name.
    const active = fixtureStore.getActive();
    res.json({ fixtures: fixtureStore.list(), active: active ? active.name : null });
  });

  app.get('/api/fixtures/:id', (req, res) => {
    const fixture = fixtureStore.get(req.params.id);
    if (!fixture) {
      sendError(res, 404, `no fixture with id "${req.params.id}"`);
      return;
    }
    res.json(fixture);
  });

  app.post('/api/fixtures', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const name = String(req.body?.name ?? '');
      if (!name.trim()) {
        sendError(res, 400, 'name is required');
        return;
      }
      const seed = req.body?.seed as string | number | undefined;
      const fixture = await fixtureStore.create({ name, seed }, getSurvey());
      res.status(201).json(fixture);
    } catch (err) {
      if (err instanceof FixtureNameConflictError) {
        sendError(res, 409, err.message);
        return;
      }
      next(err);
    }
  });

  app.post('/api/fixtures/unload', (_req, res) => {
    fixtureStore.unload();
    res.json({ active: null });
  });

  app.post('/api/fixtures/:id/load', async (req, res, next) => {
    try {
      const fixture = fixtureStore.load(req.params.id);
      const proof = await probeFixtureAnswers(getPlateUrl?.(), fixture);
      res.json(proof ? { active: fixture.name, proof } : { active: fixture.name });
    } catch (err) {
      if (err instanceof FixtureNotFoundError) {
        sendError(res, 404, err.message);
      } else if (err instanceof FixtureScrappedError) {
        sendError(res, 409, err.message);
      } else {
        next(err);
      }
    }
  });

  app.post('/api/fixtures/:id/scrap', async (req, res, next) => {
    try {
      const fixture = await fixtureStore.scrap(req.params.id);
      res.json(fixture);
    } catch (err) {
      if (err instanceof FixtureNotFoundError) {
        sendError(res, 404, err.message);
        return;
      }
      next(err);
    }
  });

  app.post('/api/fixtures/:id/restore', async (req, res, next) => {
    try {
      const fixture = await fixtureStore.restore(req.params.id);
      res.json(fixture);
    } catch (err) {
      if (err instanceof FixtureNotFoundError) {
        sendError(res, 404, err.message);
        return;
      }
      next(err);
    }
  });

  // The REST route only RESOLVES which values to send — the bench posts the actual jig:fill
  // message to the plate iframe itself (packages/bench/src/fixtures/FixturePanel.tsx), since
  // the server has no way to reach a cross-origin iframe.
  app.post('/api/plate/fill', (req, res) => {
    const fixtureId = String(req.body?.fixture ?? '');
    const schemaRef = String(req.body?.schemaRef ?? '');
    const fixture = fixtureStore.get(fixtureId);
    if (!fixture) {
      sendError(res, 404, `no fixture with id "${fixtureId}"`);
      return;
    }
    const values = fixture.forms[schemaRef];
    if (!values) {
      sendError(res, 404, `fixture "${fixtureId}" has no form values for schema "${schemaRef}"`);
      return;
    }
    const fields: ResolvedField[] = Object.entries(values).map(([name, value]) => ({ name, value }));
    res.json({ fields });
  });
}
