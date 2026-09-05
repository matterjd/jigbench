import { z } from 'zod';
import { JIG_FORMAT } from './jig-format.js';

export const ComponentSchema = z.object({
  name: z.string(),
  selector: z.string(),
  file: z.string(),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
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
  requestSchema: z.record(z.string(), z.unknown()).optional(),
  responseSchema: z.record(z.string(), z.unknown()).optional(),
  file: z.string().optional(),
});
export type Endpoint = z.infer<typeof EndpointSchema>;

export const SurveySchema = z.object({
  jigFormat: z.literal(JIG_FORMAT),
  stack: z.array(z.string()),
  components: z.array(ComponentSchema),
  routes: z.array(RouteSchema),
  endpoints: z.array(EndpointSchema),
  schemas: z.array(z.unknown()),
  docs: z.array(z.unknown()),
  generatedAt: z.string(),
  stub: z.boolean().optional(),
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
