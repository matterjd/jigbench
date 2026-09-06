import { JIG_FORMAT, type Survey } from '@jigbench/core';
import { findAngularRoot } from './find-root.js';
import { surveyComponents } from './components.js';
import { surveyRoutes } from './routes.js';
import { surveySchemas } from './schemas.js';

export { findAngularRoot } from './find-root.js';
export { surveyComponents } from './components.js';
export { surveyRoutes } from './routes.js';
export { surveyGauges } from './gauges.js';
export { surveySchemas } from './schemas.js';

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
    adapters: [{ adapter: 'angular', stub: true }],
  };
}

/**
 * The Angular `SurveyAdapter` (structurally — this package never imports `@jigbench/server`,
 * per the boundary rule in AGENTS.md; `packages/server/src/survey/registry.ts` is the one
 * place that treats this object as a `SurveyAdapter`).
 *
 * `detect`/`survey` agree on the same app-root search (`findAngularRoot`: the repo root
 * itself, or exactly one level down) so `jigbench survey --repo examples` finds
 * `examples/ledger-angular` the same way `jigbench survey --repo examples/ledger-angular`
 * finds itself.
 */
export const angularAdapter = {
  async detect(repoRoot: string): Promise<boolean> {
    return (await findAngularRoot(repoRoot)) !== undefined;
  },

  async survey(repoRoot: string): Promise<Survey> {
    const appRoot = await findAngularRoot(repoRoot);
    if (!appRoot) return stubSurvey();

    const components = await surveyComponents(appRoot);
    const routes = await surveyRoutes(appRoot, components);
    const schemas = await surveySchemas(appRoot);

    return {
      jigFormat: JIG_FORMAT,
      stack: ['angular'],
      components,
      routes,
      endpoints: [],
      schemas,
      docs: [],
      generatedAt: new Date().toISOString(),
      stub: false,
      adapters: [{ adapter: 'angular', appRoot, source: 'ts-morph', stub: false }],
    };
  },
};
