import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createJigServer, createPlateProxy, initJigTree, runSurvey } from '@jigbench/server';
import { resolveRepoRoot } from '../repo-root.js';

/** S17a (AMENDMENT-1 §7, A6): "`jigbench` with no `--repo` and no `.jig`/`.git` in cwd ->
 * serves with no bench (the Clamp screen)". `resolveRepoRoot` (unchanged, `repo-root.ts` is
 * out of this slice's file scope) always returns SOME path — it falls back to cwd itself when
 * neither marker is found, walking up — so "nothing to clamp" is judged here, directly, by
 * the same two markers it walks for, rather than by ever getting a falsy root back. */
function hasClampableRepoAt(cwd: string): boolean {
  return existsSync(join(cwd, '.git')) || existsSync(join(cwd, '.jig'));
}

export interface ServeCommandOptions {
  repo?: string;
  port?: number;
  /** Interface to bind to — defaults to loopback-only inside `createJigServer`. Exposed here
   * so `--host` can opt into LAN exposure deliberately; nothing sets it implicitly. */
  host?: string;
  open?: boolean;
  /** The target app's own dev server, e.g. `http://localhost:4200`. Always wins over
   * auto-detection. */
  target?: string;
  /** The plate proxy's own listening port (S3). Defaults to 4601. */
  platePort?: number;
  /** Test-only override for the "is there a repo here at all" check — defaults to
   * `process.cwd()`. Never set by the real CLI entrypoint. */
  cwd?: string;
}

export interface ServeCommandResult {
  message: string;
  url: string;
  close: () => Promise<void>;
}

const DEFAULT_PORT = 4600;
const DEFAULT_ANGULAR_SERVE_PORT = 4200;

interface AngularJsonShape {
  defaultProject?: string;
  projects?: Record<string, { architect?: { serve?: { options?: { port?: number } } } }>;
}

/** The pre-S16 heuristic, kept as the fallback tier: if the clamped repo has an
 * `angular.json`, guess its dev-server URL from the default project's configured serve port,
 * falling back to Angular's own default (4200) when no port is set. Cheap and often right —
 * never a substitute for `--target` when it's wrong, and silently absent (no target) for
 * anything that isn't an Angular repo. */
function detectTargetFromAngularJson(repoRoot: string): string | undefined {
  const angularJsonPath = join(repoRoot, 'angular.json');
  if (!existsSync(angularJsonPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(angularJsonPath, 'utf8')) as AngularJsonShape;
    const projectName = parsed.defaultProject ?? Object.keys(parsed.projects ?? {})[0];
    const port = projectName ? parsed.projects?.[projectName]?.architect?.serve?.options?.port : undefined;
    return `http://localhost:${typeof port === 'number' ? port : DEFAULT_ANGULAR_SERVE_PORT}`;
  } catch {
    return undefined;
  }
}

/** `--target` always wins (checked by the caller before this ever runs). S16 (AMENDMENT-1
 * §6/A5) adds a first tier ahead of the pre-existing Angular-only heuristic: run the survey
 * (the generic web adapter, when it detects the repo, reads a devServer guess off
 * `package.json`'s scripts) and use whatever devServer guess a per-adapter meta entry carries,
 * before falling back to the direct `angular.json` read, then giving up (no target). Running
 * the survey here is the same shape already used by `mcp.ts` (also calls `runSurvey` right
 * after `initJigTree`) — it writes `.jig/survey/*` as a side effect, which is fine: the bench
 * would run the same survey again on its own the moment it starts anyway. */
async function detectTarget(repoRoot: string): Promise<string | undefined> {
  const { survey } = await runSurvey(repoRoot);
  const surveyGuess = survey.adapters?.find((meta) => meta.devServer)?.devServer;
  if (surveyGuess) return surveyGuess;
  return detectTargetFromAngularJson(repoRoot);
}

/** `jigbench` with no subcommand. `--repo` always clamps at boot (unchanged). With no
 * `--repo`, a cwd that has neither `.git` nor `.jig` clamps nothing at all — `createJigServer`
 * (repoRoot omitted) then serves the S17a host, its Clamp screen's server side, with a
 * `POST /api/clamp` away from a real bench. Otherwise (today's exact behaviour): detects the
 * repo root, ensures `.jig/` exists (the same skeleton `init` writes), starts the S3 plate
 * proxy in front of the target's own dev server (when one is known), and starts the bench
 * server already clamped. */
export async function runServeCommand(options: ServeCommandOptions): Promise<ServeCommandResult> {
  const port = options.port ?? DEFAULT_PORT;

  if (!options.repo && !hasClampableRepoAt(options.cwd ?? process.cwd())) {
    const handle = await createJigServer({
      port,
      host: options.host,
      openBrowser: options.open ?? true,
    });
    const message = [`Jig is on the bench: ${handle.url}`, 'No repo clamped yet — open the bench to pick one.'].join('\n');
    return { message, url: handle.url, close: () => handle.close() };
  }

  const repoRoot = resolveRepoRoot(options.repo);
  await initJigTree(repoRoot);

  const benchOrigin = `http://localhost:${port}`;
  const target = options.target ?? (await detectTarget(repoRoot));

  const plate = createPlateProxy({
    target,
    benchOrigin,
    port: options.platePort,
    host: options.host,
  });

  const handle = await createJigServer({
    repoRoot,
    port,
    host: options.host,
    openBrowser: options.open ?? true,
    plate,
  });

  const message = [
    `Jig is on the bench: ${handle.url}`,
    `Clamped: ${repoRoot}`,
    target
      ? `Plate: ${plate.url} -> ${target}`
      : `Plate: ${plate.url} (no target set — pass --target <url> to clamp a running app)`,
  ].join('\n');

  return {
    message,
    url: handle.url,
    async close() {
      await handle.close();
      await plate.close();
    },
  };
}
