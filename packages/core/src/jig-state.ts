import { z } from 'zod';
import { SurveySchema } from './survey.js';
import { GaugeSetSchema } from './gauges.js';
import { MarkSchema } from './mark.js';
import { WorkOrderSchema } from './work-order.js';

/**
 * The aggregate `GET /api/state` shape. It doesn't correspond to a single file under
 * `.jig/` the way Survey/GaugeSet/WorkOrder do — it's server's composed view over all of
 * them — but it lives here, not in `server`, because `bench` may only import core TYPES
 * (never server's) and still needs to know this shape to render it.
 */
export const WiringStatusSchema = z.enum(['wired', 'stub', 'none']);
export type WiringStatus = z.infer<typeof WiringStatusSchema>;

export const WiringSchema = z.object({
  survey: WiringStatusSchema,
  proxy: WiringStatusSchema,
  drafter: WiringStatusSchema,
  shop: WiringStatusSchema,
  fixtures: WiringStatusSchema,
  toolpath: WiringStatusSchema,
  sketch: WiringStatusSchema,
});
export type Wiring = z.infer<typeof WiringSchema>;

export const JigStateSchema = z.object({
  survey: SurveySchema,
  gauges: GaugeSetSchema,
  marks: z.array(MarkSchema),
  workOrders: z.array(WorkOrderSchema),
  wiring: WiringSchema,
});
export type JigState = z.infer<typeof JigStateSchema>;
