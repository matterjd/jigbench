import type { Express, NextFunction, Request, Response } from 'express';
import type { Survey } from '@jigbench/core';
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

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

/**
 * F10's REST surface: list/create/load/unload/scrap/restore fixtures, and resolve a fixture's
 * form values for the loupe's fill. Mounted once from `http.ts` alongside the other `/api/*`
 * routes; `getSurvey` is a thunk (not a snapshot) so a fixture created after a re-survey uses
 * the CURRENT survey, not whatever was live when the server started.
 */
export function attachFixturesRoute(app: Express, fixtureStore: FixtureStore, getSurvey: () => Survey): void {
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

  app.post('/api/fixtures/:id/load', (req, res) => {
    try {
      const fixture = fixtureStore.load(req.params.id);
      res.json({ active: fixture.name });
    } catch (err) {
      if (err instanceof FixtureNotFoundError) {
        sendError(res, 404, err.message);
      } else if (err instanceof FixtureScrappedError) {
        sendError(res, 409, err.message);
      } else {
        throw err;
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
