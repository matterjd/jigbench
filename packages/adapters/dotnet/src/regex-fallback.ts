import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Endpoint, NamedSchema } from '@jigbench/core';
import {
  findMatchingBracket,
  mapCSharpType,
  splitTopLevel,
  stripLeadingAttributes,
  toCamelCase,
  type JsonTypeShape,
} from './cs-parse-utils.js';

const SKIP_DIRS = new Set(['node_modules', 'bin', 'obj', '.git']);

async function findCsFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findCsFiles(full)));
    } else if (entry.name.endsWith('.cs')) {
      files.push(full);
    }
  }
  return files;
}

function joinCsPath(prefix: string, subpath: string): string {
  const p = prefix.replace(/\/+$/, '');
  const s = subpath ? (subpath.startsWith('/') ? subpath : `/${subpath}`) : '';
  return `${p}${s}` || '/';
}

const GROUP_ASSIGN_RE = /\b(\w+)\s*=\s*app\.MapGroup\(\s*"([^"]*)"\s*\)/g;
const MAP_CALL_RE = /\b(\w+)\.Map(Get|Post|Put|Delete|Patch)\(\s*"([^"]*)"/g;

/** Minimal-API route maps: `var group = app.MapGroup("/api/invoices"); group.MapGet("/{id}",
 * ...)` — the group's prefix plus every `Map*` call made against that group variable (or
 * directly against `app`), combined into one path. Every result is `stub: true`. */
function extractMinimalApiEndpoints(text: string): Endpoint[] {
  const prefixes = new Map<string, string>([['app', '']]);
  for (const m of text.matchAll(GROUP_ASSIGN_RE)) prefixes.set(m[1], m[2]);

  const endpoints: Endpoint[] = [];
  for (const m of text.matchAll(MAP_CALL_RE)) {
    const prefix = prefixes.get(m[1]);
    if (prefix === undefined) continue;
    endpoints.push({ method: m[2].toUpperCase(), path: joinCsPath(prefix, m[3]), stub: true });
  }
  return endpoints;
}

const CLASS_DECL_RE = /\bclass\s+(\w+)\b[^{;]*\{/g;
const METHOD_ATTR_RE = /\[Http(Get|Post|Put|Delete|Patch)(?:\(\s*"([^"]*)"\s*\))?\]/g;

/** Attribute-routed controllers: a class carrying `[ApiController]` and/or `[Route("...")]`,
 * with `[HttpGet("...")]`-style method attributes inside it. The class's own route (if any)
 * prefixes every method's route. Every result is `stub: true`. */
function extractControllerEndpoints(text: string): Endpoint[] {
  const endpoints: Endpoint[] = [];

  for (const m of text.matchAll(CLASS_DECL_RE)) {
    const declStart = m.index ?? 0;
    const braceIndex = declStart + m[0].length - 1;
    const precedingText = text.slice(0, declStart);

    const attrBlockMatch =
      /((?:\[[^[\]]*\]\s*)+)(?:(?:public|internal|partial|sealed|abstract|static)\s+)*$/.exec(
        precedingText,
      );
    const attrBlock = attrBlockMatch?.[1] ?? '';
    const hasApiController = /\[ApiController\]/.test(attrBlock);
    const routeMatch = /\[Route\(\s*"([^"]*)"\s*\)\]/.exec(attrBlock);
    if (!hasApiController && !routeMatch) continue;

    const classPrefix = routeMatch ? `/${routeMatch[1].replace(/^\/+/, '')}` : '';
    const bodyEnd = findMatchingBracket(text, braceIndex, '{', '}');
    const body = bodyEnd === -1 ? text.slice(braceIndex) : text.slice(braceIndex, bodyEnd);

    for (const mm of body.matchAll(METHOD_ATTR_RE)) {
      endpoints.push({
        method: mm[1].toUpperCase(),
        path: joinCsPath(classPrefix, mm[2] ?? ''),
        stub: true,
      });
    }
  }

  return endpoints;
}

const RECORD_RE = /\brecord\s+(\w+(?:Dto|Request|Response))\s*\(/g;

/** `record <Name>Dto|Request|Response(...)` primary-constructor parameter lists — one
 * skeletal object schema per record, property names camelCased to match how tier (a)/(b)
 * would have recorded the same DTO via System.Text.Json's default casing. */
function extractRecordDtos(text: string): NamedSchema[] {
  const schemas: NamedSchema[] = [];

  for (const m of text.matchAll(RECORD_RE)) {
    const name = m[1];
    const openParenIndex = (m.index ?? 0) + m[0].length - 1;
    const closeParenIndex = findMatchingBracket(text, openParenIndex, '(', ')');
    if (closeParenIndex === -1) continue;

    const paramsText = text.slice(openParenIndex + 1, closeParenIndex);
    const { properties, required } = parseParamList(paramsText);
    if (Object.keys(properties).length === 0) continue;

    schemas.push({ schemaRef: name, schema: { type: 'object', properties, required } });
  }

  return schemas;
}

const PARAM_TYPE_NAME_RE = /^([\w<>,.[\]?\s]+?)\s+(\w+)$/;

function parseParamList(paramsText: string): { properties: Record<string, JsonTypeShape>; required: string[] } {
  const properties: Record<string, JsonTypeShape> = {};
  const required: string[] = [];

  for (const rawParam of splitTopLevel(paramsText)) {
    const stripped = stripLeadingAttributes(rawParam).trim();
    const match = PARAM_TYPE_NAME_RE.exec(stripped);
    if (!match) continue;

    const [, csType, csName] = match;
    const nullable = csType.trim().endsWith('?');
    const propName = toCamelCase(csName);
    properties[propName] = mapCSharpType(csType);
    if (!nullable) required.push(propName);
  }

  return { properties, required };
}

const CLASS_PROPERTY_DTO_RE = /\bclass\s+(\w+(?:Dto|Request|Response))\s*(?::\s*[\w.<>,\s]+)?\s*\{/g;
const AUTO_PROPERTY_RE = /public\s+([\w<>,.[\]?]+)\s+(\w+)\s*\{\s*get;\s*(?:set;|init;)?\s*\}/g;

/** Plain `class <Name>Dto|Request|Response { public T Prop { get; set; } }` — the
 * property-bag style, as distinct from a record's primary constructor. The regex requires
 * `{` immediately after the class name (with only an optional `: Base` clause between), which
 * is what excludes a primary-constructor class — that shape is `extractRecordDtos`'s job. */
function extractClassPropertyDtos(text: string): NamedSchema[] {
  const schemas: NamedSchema[] = [];

  for (const m of text.matchAll(CLASS_PROPERTY_DTO_RE)) {
    const name = m[1];
    const braceIndex = (m.index ?? 0) + m[0].length - 1;
    const bodyEnd = findMatchingBracket(text, braceIndex, '{', '}');
    const body = bodyEnd === -1 ? text.slice(braceIndex) : text.slice(braceIndex, bodyEnd);

    const properties: Record<string, JsonTypeShape> = {};
    const required: string[] = [];
    for (const pm of body.matchAll(AUTO_PROPERTY_RE)) {
      const [, csType, csName] = pm;
      const nullable = csType.endsWith('?');
      const propName = toCamelCase(csName);
      properties[propName] = mapCSharpType(csType);
      if (!nullable) required.push(propName);
    }
    if (Object.keys(properties).length === 0) continue;

    schemas.push({ schemaRef: name, schema: { type: 'object', properties, required } });
  }

  return schemas;
}

export interface RegexFallbackResult {
  endpoints: Endpoint[];
  schemas: NamedSchema[];
}

/** Tier (c), the last resort: no recorded OpenAPI document, no running dev server. A text
 * scan over every `.cs` file for minimal-API route maps, attribute-routed controllers, and
 * DTO shapes. Every endpoint and the result as a whole are badged `stub: true` — this tier
 * never claims more confidence than a regex over source text actually has. */
export async function surveyFromRegexFallback(appRoot: string): Promise<RegexFallbackResult> {
  const files = await findCsFiles(appRoot);
  const endpoints: Endpoint[] = [];
  const schemas: NamedSchema[] = [];

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    endpoints.push(...extractMinimalApiEndpoints(text));
    endpoints.push(...extractControllerEndpoints(text));
    schemas.push(...extractRecordDtos(text));
    schemas.push(...extractClassPropertyDtos(text));
  }

  return { endpoints, schemas };
}
