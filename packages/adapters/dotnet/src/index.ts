import { JIG_FORMAT, type Endpoint, type NamedSchema, type Survey } from '@jigbench/core';
import { findDotnetRoot } from './find-root.js';
import { surveyFromOpenApiFile } from './openapi-file.js';
import { surveyFromOpenApiLive } from './openapi-live.js';
import { surveyFromRegexFallback } from './regex-fallback.js';

export { findDotnetRoot } from './find-root.js';
export { findOpenApiFile, surveyFromOpenApiFile } from './openapi-file.js';
export { fetchLiveOpenApi, surveyFromOpenApiLive } from './openapi-live.js';
export { readApplicationUrl } from './launch-settings.js';
export { surveyFromRegexFallback } from './regex-fallback.js';

/** Which of the three tiers actually produced this survey — never guessed at, always the
 * literal tier that ran. `'openapi-file'` and `'openapi-live'` are a real, served OpenAPI
 * document; `'regex-stub'` is the text-scan fallback and always carries `stub: true`. */
export type DotnetSurveySource = 'openapi-file' | 'openapi-live' | 'regex-stub';

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
    adapters: [{ adapter: 'dotnet', stub: true }],
  };
}

function buildSurvey(
  appRoot: string,
  endpoints: Endpoint[],
  schemas: NamedSchema[],
  source: DotnetSurveySource,
  stub: boolean,
): Survey {
  return {
    jigFormat: JIG_FORMAT,
    stack: ['dotnet'],
    components: [],
    routes: [],
    endpoints,
    schemas,
    docs: [],
    generatedAt: new Date().toISOString(),
    stub,
    adapters: [{ adapter: 'dotnet', appRoot, source, stub }],
  };
}

/**
 * The .NET `SurveyAdapter` (structurally — never imports `@jigbench/server`, per the
 * boundary rule in AGENTS.md).
 *
 * `survey()` tries three tiers, in order, and stops at the first that answers: (a) a
 * recorded OpenAPI document already in the repo, (b) a live fetch against the dev server
 * named in `Properties/launchSettings.json`, (c) a regex-lite scan of every `.cs` file. Tier
 * (c) is the only one ever badged `stub: true` — it is a text scan, never a guess dressed up
 * as a real read.
 */
export const dotnetAdapter = {
  async detect(repoRoot: string): Promise<boolean> {
    return (await findDotnetRoot(repoRoot)) !== undefined;
  },

  async survey(repoRoot: string): Promise<Survey> {
    const appRoot = await findDotnetRoot(repoRoot);
    if (!appRoot) return stubSurvey();

    const fromFile = await surveyFromOpenApiFile(appRoot);
    if (fromFile) return buildSurvey(appRoot, fromFile.endpoints, fromFile.schemas, 'openapi-file', false);

    const fromLive = await surveyFromOpenApiLive(appRoot);
    if (fromLive) return buildSurvey(appRoot, fromLive.endpoints, fromLive.schemas, 'openapi-live', false);

    const fallback = await surveyFromRegexFallback(appRoot);
    return buildSurvey(appRoot, fallback.endpoints, fallback.schemas, 'regex-stub', true);
  },
};
