import { z } from 'zod';
import { JIG_FORMAT } from './jig-format.js';

export const GaugeCategorySchema = z.enum([
  'colour',
  'type',
  'space',
  'radius',
  'shadow',
  'motion',
  'z',
]);
export type GaugeCategory = z.infer<typeof GaugeCategorySchema>;

export const GaugeSourceSchema = z.object({
  file: z.string(),
  line: z.number().int().nonnegative(),
});
export type GaugeSource = z.infer<typeof GaugeSourceSchema>;

/** One file that references a gauge (`var(--name)` or `$name`), and how many times. Powers
 * the gauges panel's swatch → lit-instances interaction (S4): click a gauge, light every
 * file/count pair here. */
export const GaugeUsageSchema = z.object({
  file: z.string(),
  count: z.number().int().nonnegative(),
});
export type GaugeUsage = z.infer<typeof GaugeUsageSchema>;

/** DTCG-shaped (Design Tokens Community Group): $type / $value are the token's own words. */
export const GaugeSchema = z.object({
  name: z.string(),
  $type: z.string(),
  $value: z.union([z.string(), z.number()]),
  category: GaugeCategorySchema,
  source: GaugeSourceSchema,
  /** Optional so a gauge produced before S2 (or by a future adapter that doesn't compute
   * usages) still parses. adapter-angular always fills this in. */
  usages: z.array(GaugeUsageSchema).optional(),
});
export type Gauge = z.infer<typeof GaugeSchema>;

export const GaugeSetSchema = z.object({
  jigFormat: z.literal(JIG_FORMAT),
  gauges: z.array(GaugeSchema),
  generatedAt: z.string(),
});
export type GaugeSet = z.infer<typeof GaugeSetSchema>;

const COLOR_VALUE_RE = /^(#[0-9a-f]{3,8}\b|rgba?\(|hsla?\()/i;
const COLOR_NAME_RE =
  /colou?r|(^|-)(bg|ink|dim|faint|line|scrim|ember|wyrd|ok|warn|alert|gold|storm)(-|$)|accent/;

/** A pure heuristic — categorize one design token by its name and its raw CSS value.
 * S4 refines this against a real survey; S1 only needs it to sort `starter.css`-shaped
 * tokens correctly enough for the gauges panel to have categories to render. */
export function categorizeGauge(name: string, value: string): GaugeCategory {
  const n = name.toLowerCase().replace(/^--/, '');
  const v = value.trim();

  if (/shadow/.test(n)) return 'shadow';
  if (/^(t|ease)-/.test(n) || /duration|timing/.test(n)) return 'motion';
  if (/radius/.test(n) || /^r(-|$)/.test(n)) return 'radius';
  if (/z-index/.test(n) || /^z(-|$)/.test(n)) return 'z';
  if (/font|sans|mono|leading|tracking|weight/.test(n)) return 'type';
  if (COLOR_VALUE_RE.test(v) || COLOR_NAME_RE.test(n)) return 'colour';
  return 'space';
}
