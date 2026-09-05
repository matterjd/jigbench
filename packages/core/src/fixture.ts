import { z } from 'zod';
import { JIG_FORMAT } from './jig-format.js';

export const FixtureSchema = z.object({
  jigFormat: z.literal(JIG_FORMAT),
  id: z.string(),
  seed: z.union([z.string(), z.number()]),
  schemaRef: z.string(),
  data: z.unknown(),
});
export type Fixture = z.infer<typeof FixtureSchema>;
