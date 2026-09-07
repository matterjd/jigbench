import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JIG_FORMAT, type Survey } from '@jigbench/core';
import { findWebRoot } from './find-root.js';
import { detectFrameworks, guessDevServer, type PackageJsonShape } from './dev-server.js';

export { findWebRoot } from './find-root.js';
export { surveyGauges } from './gauges.js';
export { detectFrameworks, guessDevServer } from './dev-server.js';
export type { PackageJsonShape } from './dev-server.js';

function stubSurvey(): Survey {
  return {
    jigFormat: JIG_FORMAT,
    stack: [],
    components: [],
    routes: [],
    endpoints: [],
    schemas: [],
    docs: [],
    generatedAt: new Date().toISOString(),
    stub: true,
    adapters: [{ adapter: 'web', stub: true }],
  };
}

async function readPackageJson(root: string): Promise<PackageJsonShape | undefined> {
  try {
    const text = await readFile(join(root, 'package.json'), 'utf8');
    return JSON.parse(text) as PackageJsonShape;
  } catch {
    return undefined;
  }
}

/**
 * The generic web `SurveyAdapter` (structurally — this package never imports
 * `@jigbench/server`, per the boundary rule in AGENTS.md).
 *
 * AMENDMENT-1 §6 (A5): "Jig works with any app that has a dev server; ... adapters only
 * enrich." This is the fallback adapter — it matches almost any web codebase (a `package.json`
 * or a stylesheet under a conventional location) and NEVER invents components or routes: its
 * own contribution to a Survey is always `components: []`, `routes: []`, badged `unknown:
 * true` so a consumer never mistakes "we never surveyed for these" for "this app has none." It
 * still does real work: a CSS/SCSS/Less token scan (`gauges.ts`, reported separately — see
 * `@jigbench/server`'s `survey/run.ts`), a dev-server guess, and framework hints — all
 * surfaced on its own per-adapter meta entry (`adapters[0]`) so `serve.ts`'s `--target`
 * inference and the human summary ("web: <root> (css/scss scan)") can read them. When a stack
 * adapter (Angular, .NET, ...) ALSO matches, `@jigbench/server`'s `survey/merge.ts` folds in
 * only this adapter's meta entry (for its devServer/frameworks hints) and its gauges — never
 * its `stack`/`components`/`routes`, which yield to the real stack adapter's own findings.
 */
export const webAdapter = {
  async detect(repoRoot: string): Promise<boolean> {
    return (await findWebRoot(repoRoot)) !== undefined;
  },

  async survey(repoRoot: string): Promise<Survey> {
    const appRoot = await findWebRoot(repoRoot);
    if (!appRoot) return stubSurvey();

    const pkg = await readPackageJson(appRoot);
    const devServer = pkg ? guessDevServer(pkg) : undefined;
    const frameworks = pkg ? detectFrameworks(pkg) : [];

    return {
      jigFormat: JIG_FORMAT,
      stack: ['web'],
      components: [],
      routes: [],
      endpoints: [],
      schemas: [],
      docs: [],
      generatedAt: new Date().toISOString(),
      stub: false,
      adapters: [
        {
          adapter: 'web',
          appRoot,
          source: 'css/scss scan',
          stub: false,
          unknown: true,
          ...(devServer ? { devServer } : {}),
          ...(frameworks.length > 0 ? { frameworks } : {}),
        },
      ],
    };
  },
};
