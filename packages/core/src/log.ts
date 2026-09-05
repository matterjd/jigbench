import { z } from 'zod';

export const LogEntrySchema = z.object({
  at: z.string(),
  actor: z.string(),
  event: z.string(),
  ref: z.string(),
  note: z.string().optional(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;
