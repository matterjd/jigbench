import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DetectedTargetSummary } from '@jigbench/core';

/**
 * S17a (AMENDMENT-1 §7, A6): "Start the app runs the detected dev script inside the repo".
 * Three fallback tiers, in order:
 *   1. `survey.devServer?.script` — a seam for S16's `adapter-web` (not landed at the time
 *      this was written; read structurally off whatever `survey` is handed in, so this file
 *      never has an import-time dependency on `@jigbench/adapter-web` or a `devServer` field
 *      existing on core's `Survey` type yet).
 *   2. `package.json`'s own `start`/`dev`/`serve` script, in that priority order — whichever
 *      is defined first wins; a repo commonly has more than one.
 *   3. `angular.json` alone, with no npm script found at all — `npx ng serve --port <n>`
 *      directly.
 * Every tier ALSO tries to read a real port out of `angular.json` (the same config
 * `packages/cli/src/commands/serve.ts`'s own `detectTarget` reads) — even when the command
 * came from a package.json script — since `ng serve` (whichever way it's invoked) binds to
 * that configured port, not a guessed one. `4200` (Angular's own default) is the last-resort
 * numeric guess when no `angular.json` exists at all; it is honestly a guess for a non-Angular
 * app with an unknown dev-server port, disclosed here rather than silently wrong.
 */

const DEFAULT_PORT_GUESS = 4200;
const PACKAGE_JSON_SCRIPT_PRIORITY = ['start', 'dev', 'serve'] as const;

/** Windows cannot `CreateProcess` a `.cmd` file directly — `spawn('npm.cmd', ..., {shell:
 * false})` throws a SYNCHRONOUS `EINVAL` on current Node (reproduced live during this slice's
 * build, Node v24.17.0), because a `.cmd`/`.bat` script isn't itself an executable image; only
 * `cmd.exe` (or `shell: true`, which spawns the identical thing internally) can run one.
 * Routing through `cmd.exe /d /s /c <bin> <args...>` gets the OS-level loader Windows actually
 * requires. It does NOT make the arguments safe (#17): Node joins this argv array into the ONE
 * command line Windows hands cmd.exe, and cmd.exe re-parses that line, so `&`, `|`, `^` or `%`
 * inside any element run as shell syntax — an argv array is no protection here the way it is
 * for a real executable. The protection lives upstream: every argument this module emits is
 * Jig's own literal, or a script NAME that is a key of the repo's own `package.json` `scripts`
 * (`packageJsonScriptNames` below is what `target/route.ts` checks an explicit `{script}`
 * against before it ever reaches here). POSIX needs none of this — `npm`/`npx` are ordinary
 * executables (or shebang scripts the kernel already knows how to exec) there. */
export function invocation(bin: 'npm' | 'npx', args: string[]): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', bin, ...args] };
  }
  return { command: bin, args };
}

export interface DetectedTarget {
  command: string;
  args: string[];
  cwd: string;
  /** Best-effort — see the module doc for how each tier picks this. */
  port: number;
  /** The npm script name, when `source` is `'survey'` or `'package.json'`. */
  script?: string;
  source: 'survey' | 'package.json' | 'angular.json';
}

interface DevServerHint {
  script?: string;
  port?: number;
  url?: string;
}

/** Reads `survey.devServer` structurally (duck-typed) — `survey` is `unknown` on purpose so
 * this never needs `@jigbench/adapter-web`'s (not-yet-existing) types, and tolerates a
 * `Survey` that doesn't have the field at all yet. */
function readDevServerHint(survey: unknown): DevServerHint | undefined {
  if (!survey || typeof survey !== 'object') return undefined;
  const raw = (survey as Record<string, unknown>).devServer;
  if (!raw || typeof raw !== 'object') return undefined;
  const hint = raw as Record<string, unknown>;
  return {
    script: typeof hint.script === 'string' ? hint.script : undefined,
    port: typeof hint.port === 'number' ? hint.port : undefined,
    url: typeof hint.url === 'string' ? hint.url : undefined,
  };
}

interface AngularJsonShape {
  defaultProject?: string;
  projects?: Record<string, { architect?: { serve?: { options?: { port?: number } } } }>;
}

/** The configured serve port from `angular.json`'s default project, when the file exists at
 * all — `DEFAULT_PORT_GUESS` when it exists but sets no explicit port, `undefined` when there
 * is no `angular.json` here (a distinct case from "exists but unconfigured": callers use the
 * `undefined` case to know they have no Angular-specific signal at all). */
function angularConfiguredPort(repoRoot: string): number | undefined {
  const angularJsonPath = join(repoRoot, 'angular.json');
  if (!existsSync(angularJsonPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(angularJsonPath, 'utf8')) as AngularJsonShape;
    const projectName = parsed.defaultProject ?? Object.keys(parsed.projects ?? {})[0];
    const port = projectName ? parsed.projects?.[projectName]?.architect?.serve?.options?.port : undefined;
    return typeof port === 'number' ? port : DEFAULT_PORT_GUESS;
  } catch {
    return DEFAULT_PORT_GUESS;
  }
}

/** #37: letters, digits, `-`, `_`, `:` and `.` — every shape a real npm script name takes
 * (`start`, `test:unit`, `build.prod`, `lint-all`, `under_score`) and nothing cmd.exe reads as
 * syntax. Deliberately ASCII: every cmd.exe metacharacter is ASCII, so this is stricter than it
 * strictly needs to be, but a name the console codepage can mangle is not a name worth handing
 * to a shell — and a repo whose only script is spelled otherwise still has
 * `POST /api/target/url` for an app it starts itself. */
const WIN32_RUNNABLE_SCRIPT_NAME = /^[A-Za-z0-9._:-]+$/;

/**
 * #37: may Jig put this script NAME on a command line? Being a key of the repo's own
 * `package.json` was the whole of #17's test, and a repo's own key can carry the
 * metacharacters — `"start&calc.exe": "echo pwned"` in a hostile clone is a name that splits.
 * libuv quotes an argument containing a space, a tab or a quote when it builds the single
 * command line Windows hands `cmd.exe`, so the SPACED spelling arrives as one quoted token and
 * was never the danger; `&`, `|`, `^`, `%` with no space around them are passed through bare and
 * cmd.exe re-parses the line on them.
 *
 * Off win32 every name passes: `npm` is an ordinary executable there, the argv array is the argv
 * the process gets, and nothing re-parses it — a name the repo chose is the repo's business.
 *
 * `platform` is a parameter (defaulting to this process's) so the win32 rule is provable on any
 * leg, the same reason `fs/win32-hidden.ts` splits `parseAttribOutput` out of its spawn.
 */
export function isRunnableScriptName(name: string, platform: string = process.platform): boolean {
  if (platform !== 'win32') return true;
  return WIN32_RUNNABLE_SCRIPT_NAME.test(name);
}

/** The names `package.json` `scripts` defines in this repo AND Jig is willing to run — the ONLY
 * values `POST /api/target/start` accepts for an explicit `{script}`, and the same list every
 * detection tier picks from (#17: see `invocation` above for why the name must come from the
 * repo and never from the request; #37: and why coming from the repo is not by itself enough on
 * win32 — see `isRunnableScriptName`). Empty when there is no package.json, when it will not
 * parse, or when it defines no string-valued scripts. */
export function packageJsonScriptNames(repoRoot: string, platform?: string): string[] {
  const packageJsonPath = join(repoRoot, 'package.json');
  if (!existsSync(packageJsonPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { scripts?: unknown };
    const scripts = parsed.scripts;
    if (!scripts || typeof scripts !== 'object') return [];
    return Object.entries(scripts as Record<string, unknown>)
      .filter(([, value]) => typeof value === 'string')
      .map(([name]) => name)
      .filter((name) => isRunnableScriptName(name, platform));
  } catch {
    // A corrupt package.json reads as "no scripts" — detection's next tier still gets a chance.
    return [];
  }
}

function packageJsonScript(repoRoot: string, preferred?: string): { name: string } | undefined {
  const names = packageJsonScriptNames(repoRoot);
  if (preferred && names.includes(preferred)) return { name: preferred };
  for (const name of PACKAGE_JSON_SCRIPT_PRIORITY) {
    if (names.includes(name)) return { name };
  }
  return undefined;
}

/** S17b: a `DetectedTarget` (command/args/cwd are the runner's business) reduced to the wire
 * shape the Clamp screen and the setup checklist render — what "Start the app" would run.
 * `POST /api/clamp` and `GET /api/setup` (#20) both answer with this, so the drawer one click
 * from the status line can start the app exactly as the Clamp screen can. */
export function summarizeDetectedTarget(detected: DetectedTarget | null): DetectedTargetSummary | null {
  if (!detected) return null;
  return {
    ...(detected.script === undefined ? {} : { script: detected.script }),
    port: detected.port,
    source: detected.source,
  };
}

/** Never throws — an undetectable repo (no survey hint, no package.json script, no
 * angular.json) returns `null`, the honest "nothing to start" answer; the setup checklist and
 * `POST /api/target/start` both treat that as "ask the human for a URL instead". */
export function detectDevScript(repoRoot: string, survey?: unknown): DetectedTarget | null {
  const hint = readDevServerHint(survey);
  if (hint?.script) {
    return {
      ...invocation('npm', ['run', hint.script]),
      cwd: repoRoot,
      port: hint.port ?? angularConfiguredPort(repoRoot) ?? DEFAULT_PORT_GUESS,
      script: hint.script,
      source: 'survey',
    };
  }

  const pkgScript = packageJsonScript(repoRoot, hint?.script);
  if (pkgScript) {
    return {
      ...invocation('npm', ['run', pkgScript.name]),
      cwd: repoRoot,
      port: angularConfiguredPort(repoRoot) ?? DEFAULT_PORT_GUESS,
      script: pkgScript.name,
      source: 'package.json',
    };
  }

  const angularPort = angularConfiguredPort(repoRoot);
  if (angularPort !== undefined) {
    return {
      ...invocation('npx', ['ng', 'serve', '--port', String(angularPort)]),
      cwd: repoRoot,
      port: angularPort,
      source: 'angular.json',
    };
  }

  return null;
}
