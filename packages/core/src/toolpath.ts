import { z } from 'zod';
import { JIG_FORMAT } from './jig-format.js';

export const ToolpathStepSchema = z.object({
  kind: z.enum(['click', 'input', 'navigate']),
  path: z.string(),
  value: z.string().optional(),
  at: z.string(),
});
export type ToolpathStep = z.infer<typeof ToolpathStepSchema>;

export const ToolpathSchema = z.object({
  jigFormat: z.literal(JIG_FORMAT),
  id: z.string(),
  steps: z.array(ToolpathStepSchema),
});
export type Toolpath = z.infer<typeof ToolpathSchema>;
