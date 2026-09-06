import { z } from 'zod';
import { JIG_FORMAT } from './jig-format.js';

// --- S7 (fixtures): reproducible test data generated from the survey's schemas -----------
// F10: "fixtures generated from the survey's data shapes ... applied two ways without
// touching app code: the proxy serves fixture responses for /api/* when a fixture is
// loaded, and the loupe fills forms". A fixture used to model exactly one schema's worth of
// data (S1's placeholder shape: {schemaRef, data}); a real fixture spans the whole survey —
// every surveyed endpoint's response, plus every request/model schema's form values — so the
// shape below replaces it outright. Nothing else in the repo referenced the old fields
// (grepped before this change: only fixture.ts and jsonschema.ts's z.toJSONSchema() call).
export const FixtureSchema = z.object({
  jigFormat: z.literal(JIG_FORMAT),
  /** Stable, filename-safe (see `packages/server/src/fixtures/store.ts`'s slug+suffix). */
  id: z.string(),
  /** The human-facing name — also the `.jig/fixtures/<name-derived-id>.json` filename stem. */
  name: z.string(),
  /** A string OR number so "default seed = a stable hash of the name" (chassis card) and an
   * explicit numeric seed from `POST /api/fixtures` both round-trip without coercion. */
  seed: z.union([z.string(), z.number()]),
  createdAt: z.string(),
  /** Every `NamedSchema.schemaRef` this fixture drew data from — provenance, not a foreign
   * key; nothing re-reads it to regenerate. */
  schemaRefs: z.array(z.string()),
  /** Keyed `"${METHOD} ${path}"` using the path AS SURVEYED (a templated `{id}` segment for
   * an item endpoint, the literal path for a list endpoint) — this is exactly the key the
   * proxy interceptor matches an incoming request's method+path against
   * (`packages/server/src/fixtures/interceptor.ts`). Value is the generated JSON payload:
   * an array for a list endpoint, an object for an item endpoint. */
  responses: z.record(z.string(), z.unknown()),
  /** Keyed by `NamedSchema.schemaRef` (e.g. `"CreateInvoiceRequest"`) — one generated set of
   * field values per request/model schema, for the loupe's `jig:fill` form fill. */
  forms: z.record(z.string(), z.record(z.string(), z.unknown())),
  /** Law II: fixtures are scrapped, not deleted. Absent/false = live; `true` + `scrappedAt`
   * once `POST /api/fixtures/:id/scrap` marks it (restore clears both). */
  scrapped: z.boolean().optional(),
  scrappedAt: z.string().optional(),
});
export type Fixture = z.infer<typeof FixtureSchema>;

/** The `GET /api/fixtures` list item — everything the bench's `FixturePanel` renders per row,
 * without shipping the (potentially large) `responses`/`forms` payloads over the wire. */
export const FixtureSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  seed: z.union([z.string(), z.number()]),
  createdAt: z.string(),
  scrapped: z.boolean().optional(),
  scrappedAt: z.string().optional(),
});
export type FixtureSummary = z.infer<typeof FixtureSummarySchema>;
// --- end S7 fixtures block -----------------------------------------------------------------
