import type { Express } from 'express';
import { detectDevScript, invocation, isRunnableScriptName, packageJsonScriptNames } from './detect.js';
import type { StartTargetInput, TargetRunnerLike } from './runner.js';
import { isValidPort, portRefusedMessage } from '../valid-port.js'; // #37
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

    // #37: a `port` the request names is bounded BEFORE anything spawns. `typeof === 'number'`
    // (what this used to be) passes `1e999`, which a JSON parser reads as Infinity: the app
    // was started and the runner's 120-second availability probe spent on a port that cannot
    // exist. A port that is present but not a whole 1..65535 is a 400 in words, never a
    // silent substitution of the detected one — see valid-port.ts for the rule and for why 0
    // is out.
    if (body.port !== undefined && !isValidPort(body.port)) {
      res.status(400).json({ error: portRefusedMessage(body.port) });
      return;
    }

    const detected = detectDevScript(bench.repoRoot, bench.store.getState().survey);
    const explicitPort = isValidPort(body.port) ? body.port : undefined;

    let spec: StartTargetInput | null = null;
    if (typeof body.script === 'string' && body.script.trim().length > 0) {
      // #17: on win32 `invocation` goes through cmd.exe, which re-parses its command line — an
      // argv array does not stop `&`, `|`, `^` or `%` in a script value from running as shell
      // syntax (see detect.ts). So an explicit script is accepted ONLY when it is a key of the
      // clamped repo's own package.json `scripts`: the repo names what "Start the app" may
      // run; the request only picks one of those names. Anything else is a 400, in words,
      // before anything is spawned.
      //
      // #37: and on win32 the name must pass `isRunnableScriptName` too — a repo's own key can
      // carry those metacharacters. One consequence, accepted rather than papered over: a win32
      // repo whose every script name fails the charset reads as `scripts.length === 0` below,
      // so an unrelated `{script}` is told "defines no scripts" where "defines none Jig can run"
      // is the truth. That sentence is left exactly as it is because a separate S20 PR (the
      // test-gap one) pins its wording; if it changes, change it there.
      const scripts = packageJsonScriptNames(bench.repoRoot);
      const asked = JSON.stringify(body.script.length > 60 ? `${body.script.slice(0, 60)}…` : body.script);

      // #37: checked BEFORE the membership test, so a name the repo really does define but Jig
      // will not run is told why — rather than "is not a script in this repo's package.json",
      // which of that name would be a lie (`packageJsonScriptNames` has already dropped it).
      if (!isRunnableScriptName(body.script)) {
        res.status(400).json({
          error: `${asked} cannot be run: on Windows a script name must be letters, digits, "-", "_", ":" or "." — cmd.exe re-parses the command line npm is given, so any other character in the name would run as shell syntax; rename the script, or use POST /api/target/url for an app you already have running`,
        });
        return;
      }

      if (!scripts.includes(body.script)) {
        res.status(400).json({
          error:
            scripts.length === 0
              ? `${asked} cannot be run: this repo's package.json defines no scripts — Start the app runs only a script the repo itself names; use POST /api/target/url for an app you already have running`
              : `${asked} is not a script in this repo's package.json — Start the app runs only a script the repo itself names: ${scripts.join(', ')}`,
        });
        return;
      }
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
