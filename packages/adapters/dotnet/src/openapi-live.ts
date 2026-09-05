import type { Endpoint, NamedSchema } from '@jigbench/core';
import { readApplicationUrl } from './launch-settings.js';
import { parseOpenApiDocument, type OpenApiDocument } from './openapi-parse.js';

const CANDIDATE_PATHS = ['/openapi/v1.json', '/swagger/v1/swagger.json'];
const DEFAULT_TIMEOUT_MS = 1500;

export interface LiveFetchResult {
  url: string;
  doc: OpenApiDocument;
}

/** Tries `<baseUrl>/openapi/v1.json` then `<baseUrl>/swagger/v1/swagger.json`, each bounded
 * by `timeoutMs` (default 1500ms per the commission) via `AbortController`. Any failure —
 * non-2xx, network error, or timeout — moves on to the next candidate; `undefined` after
 * both means "the dev server isn't up", not an error to surface. */
export async function fetchLiveOpenApi(
  baseUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<LiveFetchResult | undefined> {
  const base = baseUrl.replace(/\/+$/, '');

  for (const path of CANDIDATE_PATHS) {
    const url = `${base}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) continue;
      const doc = (await response.json()) as OpenApiDocument;
      return { url, doc };
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
  }

  return undefined;
}

export interface OpenApiLiveSurveyResult {
  endpoints: Endpoint[];
  schemas: NamedSchema[];
  url: string;
}

/** Tier (b): `Properties/launchSettings.json` names an `applicationUrl` → try the two
 * well-known OpenAPI document routes against the running dev server. `undefined` whenever
 * there's no `applicationUrl` or nothing answers, so the caller falls through to tier (c). */
export async function surveyFromOpenApiLive(
  appRoot: string,
  timeoutMs?: number,
): Promise<OpenApiLiveSurveyResult | undefined> {
  const baseUrl = await readApplicationUrl(appRoot);
  if (!baseUrl) return undefined;

  const live = await fetchLiveOpenApi(baseUrl, timeoutMs);
  if (!live) return undefined;

  const { endpoints, schemas } = parseOpenApiDocument(live.doc);
  return { endpoints, schemas, url: live.url };
}
