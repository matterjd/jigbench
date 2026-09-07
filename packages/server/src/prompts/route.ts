import { readFile } from 'node:fs/promises';
import type { Express, NextFunction, Request, Response } from 'express';
import { PromptStateSchema } from '@jigbench/core';
import { ClaudeNotInstalledError, PolishUnavailableError, PromptBuildConflictError, PromptConflictError } from './errors.js';
import { PromptNotFoundError } from './store.js';
import type { PromptService } from './service.js';

/**
 * S11 REST surface — `GET/POST /api/prompts`, `GET/PATCH /api/prompts/:id`, the seven
 * state-changing actions, and the transcript reader. Same shape as `fixtures/route.ts`:
 * one `attachXRoute(app, service)` mounted once from `http.ts`'s own delimited S11 block.
 */

function sendError(res: Response, status: number, message: string, extra?: Record<string, unknown>): void {
  res.status(status).json({ error: message, ...extra });
}

function mapPromptError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof PromptNotFoundError) {
    sendError(res, 404, err.message);
    return;
  }
  if (err instanceof PromptBuildConflictError) {
    sendError(res, 409, err.message, { runningId: { promptId: err.runningPromptId, buildId: err.runningBuildId } });
    return;
  }
  if (err instanceof PromptConflictError) {
    sendError(res, 409, err.message);
    return;
  }
  if (err instanceof ClaudeNotInstalledError) {
    sendError(res, 503, err.message);
    return;
  }
  if (err instanceof PolishUnavailableError) {
    // "404-style honest error when no model" (S11 brief) — the button/route is absent, not
    // a stub, so a literal 404 status is the honest answer here.
    sendError(res, 404, err.message);
    return;
  }
  next(err);
}

export function attachPromptsRoute(app: Express, prompts: PromptService): void {
  app.get('/api/prompts', (req, res) => {
    const stateParam = typeof req.query.state === 'string' ? req.query.state : undefined;
    const parsedState = stateParam ? PromptStateSchema.safeParse(stateParam) : undefined;
    if (stateParam && !parsedState?.success) {
      sendError(res, 400, `unknown prompt state: ${stateParam}`);
      return;
    }
    res.json({ prompts: prompts.list(parsedState?.data) });
  });

  app.post('/api/prompts', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prompt = await prompts.create(req.body ?? {});
      res.status(201).json(prompt);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/prompts/:id', (req, res) => {
    const prompt = prompts.get(req.params.id);
    if (!prompt) {
      sendError(res, 404, `no such prompt: ${req.params.id}`);
      return;
    }
    res.json(prompt);
  });

  app.patch('/api/prompts/:id', async (req, res, next) => {
    try {
      res.json(await prompts.edit(req.params.id, req.body ?? {}));
    } catch (err) {
      mapPromptError(err, res, next);
    }
  });

  app.post('/api/prompts/:id/ready', async (req, res, next) => {
    try {
      res.json(await prompts.ready(req.params.id));
    } catch (err) {
      mapPromptError(err, res, next);
    }
  });

  app.post('/api/prompts/:id/polish', async (req, res, next) => {
    try {
      res.json(await prompts.polish(req.params.id));
    } catch (err) {
      mapPromptError(err, res, next);
    }
  });

  app.post('/api/prompts/:id/build', async (req, res, next) => {
    try {
      res.status(202).json(await prompts.build(req.params.id));
    } catch (err) {
      mapPromptError(err, res, next);
    }
  });

  app.post('/api/prompts/:id/cancel', (req, res, next) => {
    try {
      prompts.cancel(req.params.id);
      res.status(202).json({ accepted: true, id: req.params.id });
    } catch (err) {
      mapPromptError(err, res, next);
    }
  });

  app.post('/api/prompts/:id/scrap', async (req, res, next) => {
    try {
      res.json(await prompts.scrap(req.params.id));
    } catch (err) {
      mapPromptError(err, res, next);
    }
  });

  app.post('/api/prompts/:id/restore', async (req, res, next) => {
    try {
      res.json(await prompts.restore(req.params.id));
    } catch (err) {
      mapPromptError(err, res, next);
    }
  });

  app.get('/api/prompts/:id/builds/:buildId/transcript', async (req, res, next) => {
    try {
      const prompt = prompts.get(req.params.id);
      if (!prompt) {
        sendError(res, 404, `no such prompt: ${req.params.id}`);
        return;
      }
      const build = prompt.builds.find((b) => b.id === req.params.buildId);
      if (!build?.transcriptPath) {
        sendError(res, 404, `no transcript for build "${req.params.buildId}" on prompt ${req.params.id}`);
        return;
      }
      const contents = await readFile(build.transcriptPath, 'utf8');
      res.type('application/x-ndjson').send(contents);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        sendError(res, 404, `transcript file for build "${req.params.buildId}" is missing on disk`);
        return;
      }
      next(err);
    }
  });
}
