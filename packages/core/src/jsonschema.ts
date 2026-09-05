import { z } from 'zod';
import { SurveySchema } from './survey.js';
import { GaugeSetSchema, GaugeSchema } from './gauges.js';
import { WorkOrderSchema } from './work-order.js';
import { FixtureSchema } from './fixture.js';
import { ToolpathSchema } from './toolpath.js';

/** JSON Schema export for each `.jig/` root format, via zod 4's native converter. Kept as
 * a lazy object (functions, not pre-computed constants) so a consumer that only needs one
 * format never pays for converting the rest. */
export const jigJsonSchemas = {
  survey: () => z.toJSONSchema(SurveySchema),
  gaugeSet: () => z.toJSONSchema(GaugeSetSchema),
  gauge: () => z.toJSONSchema(GaugeSchema),
  workOrder: () => z.toJSONSchema(WorkOrderSchema),
  fixture: () => z.toJSONSchema(FixtureSchema),
  toolpath: () => z.toJSONSchema(ToolpathSchema),
};
