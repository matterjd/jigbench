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
  /** S2b — the docs clamp. Defaults to 'none' so every pre-existing caller that never
   * heard of docs (S1's wiring object literals included) still parses without change. */
  docs: WiringStatusSchema.default('none'),
});
export type Wiring = z.infer<typeof WiringSchema>;

// Retest defect 22 (2026-09-06 evening): the bench's ShopLane/SimStrip need to show WHO is
// connected, live — this used to be an ad hoc extension `http.ts`'s `composedState` bolted
// onto `store.getState()`'s output only at the HTTP/WS boundary (`JigState & {shop: ...}`),
// invisible to `JigState`'s own type. Folding it into the canonical schema means
// `store.getState()` can include it directly, and the bench's `useJigState` (which already
// pushes every WS state broadcast live) carries it too — no separate one-shot fetch needed.
export const ShopInfoSchema = z.object({
  client: z.string(),
  connectedAt: z.string(),
});
export type ShopInfo = z.infer<typeof ShopInfoSchema>;

export const JigStateSchema = z.object({
  survey: SurveySchema,
  gauges: GaugeSetSchema,
  marks: z.array(MarkSchema),
  workOrders: z.array(WorkOrderSchema),
  wiring: WiringSchema,
  // Optional (not required, no default): every pre-existing JigState-shaped object literal
  // across the codebase that never mentions `shop` stays valid, both through `.parse()` and
  // as a plain TS literal typed `JigState` (an optional field can simply be omitted).
  shop: ShopInfoSchema.nullable().optional(),
});
export type JigState = z.infer<typeof JigStateSchema>;
