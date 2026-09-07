import type { Express } from 'express';
import { detectDevScript, invocation } from './detect.js';
import type { StartTargetInput, TargetRunnerLike } from './runner.js';
import { logger } from '../logger.js';

/**
 * S17a (AMENDMENT-1 §7, A6): "Start the app runs the detected dev script inside the repo with
 * its log visible (or take a URL)". `POST /api/target/start` is fire-and-forget (202) — the
 * runner's own state transitions (`starting` -> `up`/`down`) ride the same `notify`/WS
 * broadcast every other bench mutation already uses, exactly like `orders/service.ts`'s
 * fire-and-forget `draftOrder`.
 */

/** S17b: the slice of a `Bench` this route reads (the repo to run in, the survey to detect
 * from) — narrowed from the full `Bench` so `http.ts`'s --repo-at-boot path can mount it
 * without constructing one. A `Bench` satisfies it structurally. */
export interface TargetBenchView {
  repoRoot: string;
  store: { getState(): { survey: unknown } };
}

export interface TargetRouteContext {
  getBench: () => TargetBenchView | null;
  getRunner: () => TargetRunnerLike;
}

export function attachTargetRoute(app: Express, ctx: TargetRouteContext): void {
  app.post('/api/target/start', (req, res) => {
    const bench = ctx.getBench();
    if (!bench) {
      res.status(409).json({ error: 'no repo is clamped' });
      return;
    }

    const runner = ctx.getRunner();
    const current = runner.getState();
    if (current.status === 'starting' || current.status === 'up') {
      res.status(409).json({ error: `target is already ${current.status}` });
      return;
    }

    const body = (req.body ?? {}) as { script?: unknown; port?: unknown };
    const detected = detectDevScript(bench.repoRoot, bench.store.getState().survey);
    const explicitPort = typeof body.port === 'number' ? body.port : undefined;

    let spec: StartTargetInput | null = null;
    if (typeof body.script === 'string' && body.script.trim().length > 0) {
      spec = {
        ...invocation('npm', ['run', body.script]),
        cwd: bench.repoRoot,
        port: explicitPort ?? detected?.port ?? 4200,
      };
    } else if (detected) {
      spec = { command: detected.command, args: detected.args, cwd: detected.cwd, port: explicitPort ?? detected.port };
    }

    if (!spec) {
      res.status(400).json({
        error: 'could not detect a dev script for this repo — pass {script} in the body, or use POST /api/target/url for an already-running app',
      });
      return;
    }

    res.status(202).json({ accepted: true, port: spec.port });
    runner.start(spec).catch((err: unknown) => logger.warn('target failed to start', String(err)));
  });

  app.post('/api/target/stop', async (_req, res, next) => {
    try {
      await ctx.getRunner().stop();
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/target/url', (req, res) => {
    const url = (req.body as { url?: unknown } | undefined)?.url;
    if (typeof url !== 'string' || url.trim().length === 0) {
      res.status(400).json({ error: 'url is required' });
      return;
    }
    ctx.getRunner().setUrl(url);
    res.json({ ok: true });
  });
}
