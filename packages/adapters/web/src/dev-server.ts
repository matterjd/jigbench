/** The slice of `package.json` this file reads — never the whole thing, and never validated
 * beyond "is this field present" (a malformed manifest just yields no guess, never a throw). */
export interface PackageJsonShape {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const SCRIPT_KEYS = ['dev', 'start', 'serve'] as const;
const PORT_FLAG_RE = /--port[=\s]+(\d+)/;

/** A dev-server URL guessed from one `package.json` script command, or `undefined` when the
 * command doesn't match any recognized shape. An explicit `--port N` always wins (it's the
 * most specific, literal signal a script can carry — e.g. worldloom's
 * `node serve.mjs --root . --port 8174`), checked before the framework-name heuristics. */
function guessFromCommand(command: string): string | undefined {
  const portMatch = PORT_FLAG_RE.exec(command);
  if (portMatch) return `http://localhost:${portMatch[1]}`;
  if (/\bvite\b/.test(command)) return 'http://localhost:5173';
  if (/\bnext\b/.test(command)) return 'http://localhost:3000';
  if (/\bng\s+serve\b/.test(command) || /@angular\/cli/.test(command)) return 'http://localhost:4200';
  return undefined;
}

/** A dev-server guess from `package.json`'s `dev`/`start`/`serve` scripts, checked in that
 * priority order — the first script that EXISTS and matches a recognized shape wins; a script
 * that exists but matches nothing is skipped in favor of the next key, rather than giving up
 * immediately (a repo commonly has a `dev` script that does something unrelated, like a
 * watcher, alongside a `start` that's the real server). A hint only, never live-checked —
 * `serve.ts`'s `--target` auto-detection always lets an explicit `--target` win over it. */
export function guessDevServer(pkg: PackageJsonShape): string | undefined {
  for (const key of SCRIPT_KEYS) {
    const command = pkg.scripts?.[key];
    if (!command) continue;
    const guess = guessFromCommand(command);
    if (guess) return guess;
  }
  return undefined;
}

const FRAMEWORK_DEPENDENCY_LABELS: Record<string, string> = {
  react: 'react',
  vue: 'vue',
  svelte: 'svelte',
  next: 'next',
  '@angular/core': 'angular',
  expo: 'expo',
};

/** Frameworks detected from `package.json`'s `dependencies`/`devDependencies` — an honest
 * hint (AMENDMENT-1 §6/A5: "recorded honestly as hints"), never inferred beyond what the
 * manifest actually declares. Order follows `FRAMEWORK_DEPENDENCY_LABELS`' declaration order,
 * not the manifest's. */
export function detectFrameworks(pkg: PackageJsonShape): string[] {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const found: string[] = [];
  for (const [dependency, label] of Object.entries(FRAMEWORK_DEPENDENCY_LABELS)) {
    if (deps[dependency] !== undefined) found.push(label);
  }
  return found;
}
