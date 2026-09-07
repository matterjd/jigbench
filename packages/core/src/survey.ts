import { z } from 'zod';
import { JIG_FORMAT } from './jig-format.js';

/** One `@Input()`/`input()`/`model()` (or `@Output()`/`output()`) property on a component,
 * as S2's adapter-angular reads it from both the decorator and Angular 20 signal forms. Not
 * every property kind has a meaningful "required" (plain `@Output()` never does) — the
 * adapter records `false` rather than omitting the field, so a consumer never has to treat
 * absence and `false` differently. */
export const ComponentPropertySchema = z.object({
  name: z.string(),
  required: z.boolean(),
});
export type ComponentProperty = z.infer<typeof ComponentPropertySchema>;

export const ComponentSchema = z.object({
  name: z.string(),
  selector: z.string(),
  file: z.string(),
  /** `@Component({ standalone: ... })` — Angular 20 defaults to `true` when omitted. */
  standalone: z.boolean(),
  /** `true` when the component has an inline `template:` instead of `templateUrl`. */
  inline: z.boolean(),
  inputs: z.array(ComponentPropertySchema),
  outputs: z.array(ComponentPropertySchema),
  templateUrl: z.string().optional(),
  styleUrls: z.array(z.string()),
});
export type Component = z.infer<typeof ComponentSchema>;

export const RouteSchema = z.object({
  path: z.string(),
  component: z.string(),
  file: z.string(),
});
export type Route = z.infer<typeof RouteSchema>;

export const EndpointSchema = z.object({
  method: z.string(),
  path: z.string(),
  operationId: z.string().optional(),
  requestSchema: z.record(z.string(), z.unknown()).optional(),
  responseSchema: z.record(z.string(), z.unknown()).optional(),
  file: z.string().optional(),
  /** Set by adapter-dotnet's regex-lite fallback tier — never guessed silently elsewhere. */
  stub: z.boolean().optional(),
});
export type Endpoint = z.infer<typeof EndpointSchema>;

/** One JSON Schema extracted from the target's own data shapes (a TS interface, a C# DTO
 * record, or an OpenAPI `components.schemas` entry). `schemaRef` is namespaced by adapter
 * (`"dotnet.InvoiceDto"`) only when two adapters would otherwise collide on the same name —
 * see `mergeSchemas` in `@jigbench/server`'s `survey/merge.ts`. */
export const NamedSchemaSchema = z.object({
  schemaRef: z.string(),
  schema: z.record(z.string(), z.unknown()),
});
export type NamedSchema = z.infer<typeof NamedSchemaSchema>;

/** Provenance for one adapter's contribution to a merged Survey — the honest badge the
 * commission requires ("never guess silently"): which adapter ran, where it found the app
 * root, which tier it read from (e.g. dotnet's `'openapi-file' | 'openapi-live' |
 * 'regex-stub'`), and whether its output counts as a stub. */
export const SurveyAdapterMetaSchema = z.object({
  adapter: z.string(),
  appRoot: z.string().optional(),
  source: z.string().optional(),
  stub: z.boolean(),
  /** S16 (adapter-web): a dev-server URL guessed from `package.json` scripts — a hint only,
   * never live-checked. `serve.ts`'s `--target` auto-detection reads this before falling back
   * to a stack adapter's own heuristic (e.g. Angular's `angular.json` port). */
  devServer: z.string().optional(),
  /** S16 (adapter-web): frameworks detected from `package.json` dependencies (react, vue,
   * svelte, next, @angular/core, expo) — an honest hint, never inferred beyond what the
   * repo's own manifest declares. */
  frameworks: z.array(z.string()).optional(),
  /** S16 (adapter-web): true when this adapter cannot enumerate components/routes for its
   * stack at all (the generic web adapter, always) — distinguishes "empty because none exist"
   * from "empty because we never surveyed for them" so a consumer never reads a bare `[]` as
   * "this app has no components." */
  unknown: z.boolean().optional(),
});
export type SurveyAdapterMeta = z.infer<typeof SurveyAdapterMetaSchema>;

export const SurveySchema = z.object({
  jigFormat: z.literal(JIG_FORMAT),
  stack: z.array(z.string()),
  components: z.array(ComponentSchema),
  routes: z.array(RouteSchema),
  endpoints: z.array(EndpointSchema),
  schemas: z.array(NamedSchemaSchema),
  docs: z.array(z.unknown()),
  generatedAt: z.string(),
  stub: z.boolean().optional(),
  /** Present once at least one SurveyAdapter has run (S2 on). Absent on the S1 stub. */
  adapters: z.array(SurveyAdapterMetaSchema).optional(),
});
export type Survey = z.infer<typeof SurveySchema>;

/** An honest stub survey — S1 has no adapters wired, so `jigbench survey` writes this and
 * says so, rather than guessing at a repo it never actually read. */
export function stubSurvey(generatedAt: string = new Date().toISOString()): Survey {
  return {
    jigFormat: JIG_FORMAT,
    stack: [],
    components: [],
    routes: [],
    endpoints: [],
    schemas: [],
    docs: [],
    generatedAt,
    stub: true,
  };
}
