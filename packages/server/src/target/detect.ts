import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DetectedTargetSummary } from '@jigbench/core';

/**
 * S17a (AMENDMENT-1 §7, A6): "Start the app runs the detected dev script inside the repo".
 * Three fallback tiers, in order:
 *   1. `survey.devServer?.script` — a seam for S16's `adapter-web` (not landed at the time
 *      this was written; read structurally off whatever `survey` is handed in, so this file
 *      never has an import-time dependency on `@jigbench/adapter-web` or a `devServer` field
 *      existing on core's `Survey` type yet). #37: the hint chooses among the repo's own
 *      scripts — it must be a key of `package.json`'s `scripts`, exactly like an explicit
 *      `{script}` on `POST /api/target/start` — so no adapter's output can name a command.
 *   2. `package.json`'s own `start`/`dev`/`serve` script, in that priority order — whichever
 *      is defined first wins; a repo commonly has more than one.
 *   3. `angular.json` alone, with no npm script found at all — `npx --no-install ng serve
 *      --port <n>` directly, and ONLY when the repo has its own `node_modules/.bin/ng` (#81:
 *      without that guard `npx` downloads `ng` from the registry and runs it, on nothing but
 *      the presence of an `angular.json`). A repo with the config and no `ng` of its own
 *      declines the tier and answers `null` — "nothing to start". The gate is the repo's own
 *      `.bin`, nothing wider, so a hoisted or globally installed `ng` declines too, though npx
 *      would have run it with no download.
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

/** #81: a name is a key of the repo's OWN `package.json`, which means it is whatever a hostile
 * clone wrote there. 214 is far past `npm run`'s practical ceiling and well under every
 * platform's argument limit — a cap that no real script name can notice. */
const MAX_SCRIPT_NAME_LENGTH = 214;

/**
 * #81: the repo's OWN `ng`, when it has one. `npx ng serve` resolves a local
 * `node_modules/.bin/ng` first — and DOWNLOADS `ng` from the registry when there is none, then
 * runs it. That is a network fetch and an execution on nothing but the presence of an
 * `angular.json` in a folder the human pointed at, which is not a thing a detector may decide
 * to do. Both spellings are checked because npm writes `ng` and `ng.cmd` side by side on
 * Windows, and only the `.cmd` is the executable one there.
 *
 * This is NARROWER than npx's own resolution, deliberately and at a cost (the lead's
 * 2026-09-15 review): npx also finds an ancestor `node_modules/.bin` — a monorepo hoist — and
 * a globally installed `ng` on PATH, and would have run either with no registry fetch at all.
 * Both decline the tier here, so an Angular repo that starts fine from the human's own shell
 * can read as "nothing to start". The narrow check is the one that can be made from a path
 * alone, and declining is what #81 asked for; the cost belongs in the words, not hidden.
 */
function hasLocalAngularCli(repoRoot: string): boolean {
  const base = join(repoRoot, 'node_modules', '.bin', 'ng');
  return existsSync(base) || existsSync(`${base}.cmd`);
}

/**
 * #37: may Jig put this script NAME on a command line? Being a key of the repo's own
 * `package.json` was the whole of #17's test, and a repo's own key can carry the
 * metacharacters — `"start&calc.exe": "echo pwned"` in a hostile clone is a name that splits.
 * libuv quotes an argument containing a space, a tab or a quote when it builds the single
 * command line Windows hands `cmd.exe`, so the SPACED spelling arrives as one quoted token and
 * was never the danger; `&`, `|`, `^`, `%` with no space around them are passed through bare and
 * cmd.exe re-parses the line on them.
 *
 * Off win32 every OTHER name passes: `npm` is an ordinary executable there, the argv array is
 * the argv the process gets, and nothing re-parses it — a name the repo chose is the repo's
 * business. #81 carved out the two shapes that are not about re-parsing at all, and so hold
 * everywhere: a leading `-` (an option, not a name, to any argv) and an unbounded length.
 *
 * `platform` is a parameter (defaulting to this process's) so the win32 rule is provable on any
 * leg, the same reason `fs/win32-hidden.ts` splits `parseAttribOutput` out of its spawn.
 */
export function isRunnableScriptName(name: string, platform: string = process.platform): boolean {
  // #81: two rules that hold on EVERY platform, because neither is about cmd.exe re-parsing a
  // line — which is the only thing the win32 charset below is about.
  //
  // A leading `-` is read as an OPTION by whatever the argv reaches: `npm run -x` hands npm a
  // flag, not a script name, on Windows and POSIX alike. It also slipped through the win32
  // charset, which allows `-` so that `lint-all` works, so even the strict leg accepted it.
  // No legitimate npm script name begins with one.
  //
  // And a length cap, for the same reason the charset exists: the name comes from a file the
  // repo controls, not from Jig.
  if (name.length === 0 || name.length > MAX_SCRIPT_NAME_LENGTH) return false;
  if (name.startsWith('-')) return false;

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
  // #37: the hint says WHICH script; the repo is what says a script may run at all. This tier
  // used to build `npm run <hint.script>` straight from the survey and return, the one path
  // through this module that never met `packageJsonScriptNames` — and on win32 these args reach
  // cmd.exe, which re-parses them (see `invocation` above), so a name that came from data rather
  // than from the repo is exactly what #17 exists to refuse. It was unreachable only because
  // `SurveySchema` strips a top-level `devServer` today; the first adapter to emit one would
  // have made it live. A hint the repo does not name is not an error — the tiers below still get
  // their turn, and answer with the repo's own script or with an honest null.
  if (hint?.script && packageJsonScriptNames(repoRoot).includes(hint.script)) {
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

  // #81: this tier ran `npx ng serve`, and `npx` FETCHES `ng` from the registry when the repo
  // has no local install — a download and then an execution, decided by a detector, on nothing
  // but the presence of an `angular.json`. Two changes, and the second is the one that holds:
  //
  //   - the tier is declined outright unless the repo has its own `node_modules/.bin/ng`, so
  //     the answer is the honest `null` this function already documents ("nothing to start",
  //     which the checklist and `POST /api/target/start` read as "ask the human for a URL");
  //   - and `--no-install` goes on the invocation as well, which stops npx INSTALLING and
  //     running a package the repo does not have — it does NOT stop npx asking the registry
  //     about one. Measured on the lead's desk with npm 11.13.0:
  //     `npx --no-install nonexistent-pkg-zzz9` answers with a 404 FROM the registry, and
  //     `npx --no-install cowsay hi` cancels naming a resolved `cowsay@1.6.0` — a manifest
  //     lookup. So the flag is a second belt, not the thing that prevents a fetch-and-run;
  //     `hasLocalAngularCli` above is.
  //
  // `npx` stays the launcher rather than the binary path itself: it already resolves the local
  // `.bin` first, `invocation()`'s cmd.exe routing is proven for it on both CI legs, and a bare
  // `node_modules/.bin/ng.cmd` path would have to survive cmd.exe's own quote handling on a
  // desk whose home directory has a space in it.
  const angularPort = angularConfiguredPort(repoRoot);
  if (angularPort !== undefined && hasLocalAngularCli(repoRoot)) {
    return {
      ...invocation('npx', ['--no-install', 'ng', 'serve', '--port', String(angularPort)]),
      cwd: repoRoot,
      port: angularPort,
      source: 'angular.json',
    };
  }

  return null;
}
