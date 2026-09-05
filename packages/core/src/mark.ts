import { z } from 'zod';

export const MarkTargetSchema = z.object({
  /** The DOM path the loupe resolved on the plate. */
  path: z.string(),
  component: z.string().optional(),
  file: z.string().optional(),
  text: z.string().optional(),
});
export type MarkTarget = z.infer<typeof MarkTargetSchema>;

export const MarkSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  target: MarkTargetSchema,
  prompt: z.string(),
  createdAt: z.string(),
  workOrderId: z.string().optional(),
});
export type Mark = z.infer<typeof MarkSchema>;
