import { generateSync, type JsonSchema } from 'json-schema-faker';
import { faker } from '@faker-js/faker';
import { JIG_FORMAT, slugify, type Endpoint, type Fixture, type Survey } from '@jigbench/core';

/**
 * F10 / EXECUTION-PLAN S7: "Fixture = seeded data from the survey's schemas (json-schema-faker
 * + faker, fixed seed)". Two libraries, two jobs:
 *   - json-schema-faker (jsf) walks the JSON Schema and decides STRUCTURE (which optional
 *     properties appear, array lengths, which format generator runs) — its `seed` option pins
 *     its own internal Mulberry32 PRNG (v0.6's "Deterministic output via seeded PRNG" feature).
 *   - @faker-js/faker supplies REALISTIC leaf VALUES (names, emails, money) via jsf's `faker`
 *     extension keyword (`{ type: 'string', faker: 'person.fullName' }`) — but faker has its
 *     OWN independent PRNG, so `jsf.option({ seed })` alone does NOT make a faker-driven field
 *     reproduce. Both must be seeded: `faker.seed(n)` immediately before the matching
 *     `generateSync(schema, { seed: n, ... })` call. Proven in packages/server/jsf-experiment
 *     (throwaway, not committed) before writing this: dropping either seed call made the
 *     corresponding field re-roll between two calls with the same fixture seed.
 */

const REF_PREFIX = '#/schemas/';
const LIST_SIZE = 8;

// --- seeding -------------------------------------------------------------------------------

/** FNV-1a — cheap, deterministic, and stable across Node versions (unlike Object hashing or
 * `Math.random`-seeded schemes). Turns `Fixture.seed` (string | number) plus a per-entity
 * discriminator into the single integer both jsf's `seed` option and `faker.seed()` want. */
export function hashSeed(seed: string | number): number {
  const s = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function entitySeed(baseSeed: number, discriminator: string, index: number): number {
  return hashSeed(`${baseSeed}:${discriminator}:${index}`);
}

// --- $ref resolution (the local "#/schemas/X" convention from survey/merge.ts) -------------

function refTarget(node: unknown): string | undefined {
  if (node && typeof node === 'object' && '$ref' in node) {
    const ref = (node as { $ref: unknown }).$ref;
    if (typeof ref === 'string' && ref.startsWith(REF_PREFIX)) return ref.slice(REF_PREFIX.length);
  }
  return undefined;
}

/** Recursively resolves every `#/schemas/X` `$ref` against `schemas`. Never throws: an
 * unresolved ref falls back to a permissive `{ type: 'object' }` (a fixture that's slightly
 * wrong shape beats one that crashes fixture creation), and a self/mutual cycle bottoms out at
 * the same fallback once a ref name is seen TWICE on one $ref chain — `seen` tracks ref
 * NAMES, not tree depth, which is the fix for a real bug this hit against the Ledger
 * example's actual OpenAPI output: an earlier version capped by raw recursion depth instead,
 * and a `type: ["integer", "string"]` array nested five-ish levels down (Invoice ->
 * properties.lines -> items -> InvoiceLineDto -> properties.quantity -> type[]) tripped that
 * cap and silently rewrote each element of the type array into `{ type: 'object' }` — jsf then
 * threw "Unknown type: [object Object]" on a schema that was never actually cyclic. A bounded
 * schema graph has finitely many distinct ref NAMES, so `seen` alone guarantees termination
 * without needing (or wrongly limiting) ordinary structural nesting. */
export function dereferenceSchema(
  node: unknown,
  schemas: Map<string, unknown>,
  seen: ReadonlySet<string> = new Set(),
): unknown {
  if (Array.isArray(node)) {
    return node.map((child) => dereferenceSchema(child, schemas, seen));
  }
  if (node && typeof node === 'object') {
    const ref = refTarget(node);
    if (ref) {
      if (seen.has(ref)) return { type: 'object' };
      const target = schemas.get(ref);
      if (target === undefined) return { type: 'object' };
      return dereferenceSchema(target, schemas, new Set(seen).add(ref));
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out[key] = dereferenceSchema(value, schemas, seen);
    }
    return out;
  }
  return node;
}

// --- faker hints: realistic leaf values by property-name heuristic -------------------------

type FakerHint = string | Record<string, unknown[]>;

function looksLikeId(propName: string): boolean {
  return propName.toLowerCase() === 'id' || /[a-z0-9]Id$/.test(propName);
}

const NAME_HINTS: Array<[RegExp, FakerHint]> = [
  [/email/i, 'internet.email'],
  [/phone/i, 'phone.number'],
  [/(^|[a-z])name$/i, 'person.fullName'],
  [/company/i, 'company.name'],
  [/(amount|total|price|balance|cost)/i, { 'finance.amount': [{ min: 5, max: 5000, dec: 2 }] }],
  [/(notes|description|comment|summary)/i, 'lorem.sentence'],
];

function fakerHintFor(propName: string): FakerHint | undefined {
  if (looksLikeId(propName)) return 'string.uuid';
  for (const [pattern, hint] of NAME_HINTS) {
    if (pattern.test(propName)) return hint;
  }
  return undefined;
}

/** Walks an already-dereferenced JSON Schema and stamps jsf's `faker` extension keyword onto
 * leaf string/number properties whose NAME matches a realistic-data heuristic (id, name,
 * email, money, ...) — see F10: "using @faker-js/faker ... for realistic strings (names,
 * dates, money)". Dates are left to jsf's own seeded `format: 'date'/'date-time'` generator
 * (proven deterministic and already realistic-looking in the throwaway experiment); a leaf
 * that already pins its value (`const`/`enum`) or already carries a `faker` hint is untouched. */
export function withFakerHints(node: unknown, propName?: string): unknown {
  if (Array.isArray(node)) return node.map((child) => withFakerHints(child));
  if (!node || typeof node !== 'object') return node;

  const schema = node as Record<string, unknown>;

  if (schema.properties && typeof schema.properties === 'object') {
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
      properties[key] = withFakerHints(value, key);
    }
    return { ...schema, properties };
  }
  if (schema.items !== undefined) {
    return { ...schema, items: withFakerHints(schema.items) };
  }

  if (propName && !('const' in schema) && !('enum' in schema) && !('faker' in schema)) {
    const type = schema.type;
    const isStringy = type === 'string' || (Array.isArray(type) && type.includes('string'));
    const isNumbery = type === 'number' || type === 'integer';
    if (isStringy || isNumbery) {
      const hint = fakerHintFor(propName);
      if (hint !== undefined) return { ...schema, faker: hint };
    }
  }
  return schema;
}

// --- generation ------------------------------------------------------------------------------

function generateEntity(schema: unknown, seed: number): unknown {
  faker.seed(seed);
  return generateSync(schema as JsonSchema, {
    seed,
    alwaysFakeOptionals: true,
    fixedProbabilities: true,
    extensions: { faker },
  });
}

function isArrayShape(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object') return false;
  const s = schema as Record<string, unknown>;
  return s.type === 'array' || 'items' in s;
}

export interface GenerateFixtureInput {
  survey: Survey;
  seed: string | number;
  name: string;
  /** Defaults to `survey.endpoints` — overridable so a caller (or a future `POST
   * /api/fixtures` `endpoints` filter) can generate from a subset. */
  endpoints?: Endpoint[];
  /** Clock injection for deterministic-comparison tests; defaults to `new Date().toISOString()`. */
  createdAt?: string;
}

/**
 * Generates a whole-survey `Fixture`: every surveyed endpoint with a `responseSchema` gets a
 * canned response (an 8-entity array for a list shape, one entity for an item shape — entities
 * sharing a `$ref` are drawn from the SAME seeded pool, so a list and its sibling item/create
 * endpoints agree on ids), and every schema in `survey.schemas` gets one generated value set
 * under `forms` for the loupe's `jig:fill`.
 */
export function generateFixture(input: GenerateFixtureInput): Fixture {
  const { survey, seed, name } = input;
  const endpoints = input.endpoints ?? survey.endpoints;
  const schemaMap = new Map(survey.schemas.map((s) => [s.schemaRef, s.schema]));
  const baseSeed = hashSeed(seed);

  const pools = new Map<string, unknown[]>();
  const usedSchemaRefs = new Set<string>();

  function poolFor(schemaRef: string, itemSchemaNode: unknown): unknown[] {
    let pool = pools.get(schemaRef);
    if (!pool) {
      const hinted = withFakerHints(dereferenceSchema(itemSchemaNode, schemaMap));
      pool = Array.from({ length: LIST_SIZE }, (_, i) => generateEntity(hinted, entitySeed(baseSeed, schemaRef, i)));
      pools.set(schemaRef, pool);
    }
    usedSchemaRefs.add(schemaRef);
    return pool;
  }

  const responses: Record<string, unknown> = {};

  for (const endpoint of endpoints) {
    if (!endpoint.responseSchema) continue;
    const key = `${endpoint.method.toUpperCase()} ${endpoint.path}`;
    const responseSchema = endpoint.responseSchema;

    if (isArrayShape(responseSchema)) {
      const itemsNode = (responseSchema as Record<string, unknown>).items;
      const itemRef = refTarget(itemsNode);
      if (itemRef) {
        responses[key] = poolFor(itemRef, itemsNode);
      } else {
        const hinted = withFakerHints(dereferenceSchema({ ...responseSchema, minItems: LIST_SIZE, maxItems: LIST_SIZE }, schemaMap));
        responses[key] = generateEntity(hinted, entitySeed(baseSeed, key, 0));
      }
      continue;
    }

    const ref = refTarget(responseSchema);
    if (ref) {
      const pool = poolFor(ref, responseSchema);
      responses[key] = pool[0];
    } else {
      const hinted = withFakerHints(dereferenceSchema(responseSchema, schemaMap));
      responses[key] = generateEntity(hinted, entitySeed(baseSeed, key, 0));
    }
  }

  const forms: Record<string, Record<string, unknown>> = {};
  for (const { schemaRef, schema } of survey.schemas) {
    const hinted = withFakerHints(dereferenceSchema(schema, schemaMap));
    const value = generateEntity(hinted, entitySeed(baseSeed, `form:${schemaRef}`, 0));
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      forms[schemaRef] = value as Record<string, unknown>;
      usedSchemaRefs.add(schemaRef);
    }
  }

  return {
    jigFormat: JIG_FORMAT,
    id: slugify(name),
    name,
    seed,
    createdAt: input.createdAt ?? new Date().toISOString(),
    schemaRefs: [...usedSchemaRefs].sort(),
    responses,
    forms,
  };
}
