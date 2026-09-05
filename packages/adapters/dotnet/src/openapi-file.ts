import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Endpoint, NamedSchema } from '@jigbench/core';
import { parseOpenApiDocument, type OpenApiDocument } from './openapi-parse.js';

const SKIP_DIRS = new Set(['node_modules', 'bin', 'obj', '.git']);

/** Finds the first `**\/openapi*.json` or `**\/swagger*.json` under `appRoot` (excluding
 * `bin`/`obj`), depth-first. A repo the commission's fixture ships one of; a real clamp
 * might have none, which is why every caller treats `undefined` as "try the next tier". */
export async function findOpenApiFile(appRoot: string): Promise<string | undefined> {
  async function walk(dir: string): Promise<string | undefined> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return undefined;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = await walk(full);
        if (found) return found;
      } else if (/^(openapi|swagger).*\.json$/i.test(entry.name)) {
        return full;
      }
    }
    return undefined;
  }
  return walk(appRoot);
}

export interface OpenApiSurveyResult {
  endpoints: Endpoint[];
  schemas: NamedSchema[];
  file: string;
}

/** Parses an OpenAPI 3.x document already on disk (tier `'openapi-file'`) into core
 * `Endpoint`/`NamedSchema` entries. Never guesses at a document that isn't there — returns
 * `undefined` so the caller falls through to tier (b) or (c). */
export async function surveyFromOpenApiFile(appRoot: string): Promise<OpenApiSurveyResult | undefined> {
  const file = await findOpenApiFile(appRoot);
  if (!file) return undefined;

  const doc = JSON.parse(await readFile(file, 'utf8')) as OpenApiDocument;
  const { endpoints, schemas } = parseOpenApiDocument(doc);

  return { endpoints, schemas, file };
}
