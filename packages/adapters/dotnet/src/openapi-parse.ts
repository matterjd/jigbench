import type { Endpoint, NamedSchema } from '@jigbench/core';

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch'] as const;
const OPENAPI_SCHEMA_PREFIX = '#/components/schemas/';
const LOCAL_SCHEMA_PREFIX = '#/schemas/';

/** Recursively rewrite every `$ref` pointing into `#/components/schemas/*` to our own local
 * `#/schemas/*` convention — the one every `NamedSchema.schemaRef` in a merged Survey uses. */
export function rewriteRefs<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => rewriteRefs(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === '$ref' && typeof v === 'string' && v.startsWith(OPENAPI_SCHEMA_PREFIX)) {
        out[k] = LOCAL_SCHEMA_PREFIX + v.slice(OPENAPI_SCHEMA_PREFIX.length);
      } else {
        out[k] = rewriteRefs(v);
      }
    }
    return out as T;
  }
  return value;
}

function firstJsonSchema(content: unknown): Record<string, unknown> | undefined {
  if (!content || typeof content !== 'object') return undefined;
  for (const media of Object.values(content as Record<string, unknown>)) {
    const schema = (media as { schema?: unknown } | undefined)?.schema;
    if (schema && typeof schema === 'object') return rewriteRefs(schema as Record<string, unknown>);
  }
  return undefined;
}

function firstSuccessResponseSchema(responses: unknown): Record<string, unknown> | undefined {
  if (!responses || typeof responses !== 'object') return undefined;
  for (const [status, response] of Object.entries(responses as Record<string, unknown>)) {
    if (!/^2\d\d$/.test(status)) continue;
    const schema = firstJsonSchema((response as { content?: unknown } | undefined)?.content);
    if (schema) return schema;
  }
  return undefined;
}

export interface OpenApiDocument {
  paths?: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, unknown> };
}

export interface OpenApiParseResult {
  endpoints: Endpoint[];
  schemas: NamedSchema[];
}

/** Shared by both real-document tiers (`'openapi-file'` on disk, `'openapi-live'` fetched
 * from a running dev server) — an OpenAPI 3.x document is an OpenAPI 3.x document regardless
 * of where it came from. */
export function parseOpenApiDocument(doc: OpenApiDocument): OpenApiParseResult {
  const endpoints: Endpoint[] = [];
  for (const [path, operations] of Object.entries(doc.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = operations[method] as
        | { operationId?: string; requestBody?: { content?: unknown }; responses?: unknown }
        | undefined;
      if (!op) continue;

      endpoints.push({
        method: method.toUpperCase(),
        path,
        operationId: op.operationId,
        requestSchema: firstJsonSchema(op.requestBody?.content),
        responseSchema: firstSuccessResponseSchema(op.responses),
      });
    }
  }

  const schemas: NamedSchema[] = Object.entries(doc.components?.schemas ?? {}).map(
    ([schemaRef, schema]) => ({
      schemaRef,
      schema: rewriteRefs(schema as Record<string, unknown>),
    }),
  );

  return { endpoints, schemas };
}
