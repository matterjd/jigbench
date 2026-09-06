import { z } from 'zod';
import { JIG_FORMAT } from './jig-format.js';
import { GaugeCategorySchema, type GaugeSet } from './gauges.js';

// === S9 (EXECUTION-PLAN.md §4 row S9 / CHASSIS.md's Sketch tool / COMMISSION.md F9): "a
// screen that does not exist yet, drawn with the gauges" — low-fidelity screens built from a
// small closed set of primitives, each one styled ONLY through a reference to a surveyed
// gauge (never a raw CSS value at the call site — the same discipline
// `floor-colour-literals.test.ts` holds Jig's OWN chrome to, extended here to a sketch's
// data). Sketches are files (`.jig/sketches/`), scrapped not deleted (Law II), the same
// pattern `FixtureSchema`/`ToolpathSchema` already pin down. ===

/** A raw CSS value shape a gauge SLOT must never hold — a hex colour, an `rgb()`/`hsl()`
 * function call, or a bare px/rem/em number. A gauge reference is always a surveyed gauge's
 * `name`; this is the one check standing between "drawn with the gauges" and a sketch that
 * quietly hand-rolls a colour the way the design floor already forbids in Jig's own chrome. */
const RAW_CSS_VALUE_RE = /^\s*(#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|-?\d+(\.\d+)?(px|rem|em|%)?\s*$)/i;

export const GaugeRefSchema = z
  .string()
  .min(1)
  .refine((value) => !RAW_CSS_VALUE_RE.test(value), {
    message: 'a gauge slot holds a surveyed gauge NAME, never a raw CSS value (hex/rgb/hsl/number)',
  });
export type GaugeRef = z.infer<typeof GaugeRefSchema>;

/** Every gauge slot on an element is keyed by its own name ("fill", "radius", "shadow",
 * "type", …) — deliberately a record, not a fixed set of fields, so a `box` and a `button`
 * can share the "fill" slot without the schema growing a new field per kind. */
export const SketchElementGaugesSchema = z.record(z.string(), GaugeRefSchema);
export type SketchElementGauges = z.infer<typeof SketchElementGaugesSchema>;

export const SketchElementKindSchema = z.enum(['box', 'text', 'button', 'input', 'image', 'list']);
export type SketchElementKind = z.infer<typeof SketchElementKindSchema>;

const baseElement = {
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  /** Every slot this element draws with — resolved against the survey's `GaugeSet` at
   * render time (`resolveGauge` below); absent = "use the plate's own default", never "use
   * a raw value". */
  gauges: SketchElementGaugesSchema.default({}),
  label: z.string().optional(),
};

/** `box` — a rect; its fill/radius/shadow are gauge slots the properties column's pickers
 * populate (never typed in as a raw value). */
export const BoxElementSchema = z.object({ kind: z.literal('box'), ...baseElement });
/** `text` — a type gauge slot plus a size STEP (an index into the survey's type scale, not
 * a raw px size) and its content. */
export const TextElementSchema = z.object({
  kind: z.literal('text'),
  ...baseElement,
  content: z.string().default(''),
  sizeStep: z.number().int().nonnegative().default(0),
});
/** `button` — a label plus a fill gauge slot. */
export const ButtonElementSchema = z.object({ kind: z.literal('button'), ...baseElement });
/** `input` — a label/placeholder pair; no gauge slot is required (an input borrows the
 * plate's own field styling), though one may still be set. */
export const InputElementSchema = z.object({
  kind: z.literal('input'),
  ...baseElement,
  placeholder: z.string().optional(),
});
/** `image` — a labelled placeholder, never an actual asset (a sketch is a file, not a media
 * library). */
export const ImageElementSchema = z.object({ kind: z.literal('image'), ...baseElement });
/** `list` — `n` identical placeholder rows. */
export const ListElementSchema = z.object({
  kind: z.literal('list'),
  ...baseElement,
  rows: z.number().int().positive().default(3),
});

/** The closed set of primitives a sketch may draw with (COMMISSION.md F9 / CHASSIS.md) — a
 * screen sketched from anything outside this set is not a valid sketch. */
export const SketchElementSchema = z.discriminatedUnion('kind', [
  BoxElementSchema,
  TextElementSchema,
  ButtonElementSchema,
  InputElementSchema,
  ImageElementSchema,
  ListElementSchema,
]);
export type SketchElement = z.infer<typeof SketchElementSchema>;

/** A hotspot: one element on the sketch links to either another sketch (a screen not yet
 * built) or a surveyed route (a screen that already exists) — never both, never neither. */
export const SketchLinkSchema = z
  .object({
    fromElementId: z.string().min(1),
    toSketchId: z.string().min(1).optional(),
    toRoute: z.string().min(1).optional(),
  })
  .refine((link) => Boolean(link.toSketchId) !== Boolean(link.toRoute), {
    message: 'a link needs exactly one of toSketchId or toRoute',
  });
export type SketchLink = z.infer<typeof SketchLinkSchema>;

export const SketchSchema = z.object({
  jigFormat: z.literal(JIG_FORMAT),
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** The sheet's own size — defaults to nothing here; the bench draws it at the app's
   * viewport size (S9 brief), whatever that was when the sheet was created. */
  size: z.object({ w: z.number().positive(), h: z.number().positive() }),
  elements: z.array(SketchElementSchema).default([]),
  links: z.array(SketchLinkSchema).default([]),
  /** Law II: scrapped is a state, never a deletion — mirrors `FixtureSchema`/`ToolpathSchema`
   * exactly. Absent/false = live. */
  scrapped: z.boolean().optional(),
  scrappedAt: z.string().optional(),
});
export type Sketch = z.infer<typeof SketchSchema>;

/** The `GET /api/sketches` list item — mirrors `FixtureSummarySchema`/`ToolpathSummarySchema`:
 * everything the bench's sheet list renders per row, without shipping every element over the
 * wire just to list sketches. */
export const SketchSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  size: z.object({ w: z.number().positive(), h: z.number().positive() }),
  elementCount: z.number().int().nonnegative(),
  scrapped: z.boolean().optional(),
  scrappedAt: z.string().optional(),
});
export type SketchSummary = z.infer<typeof SketchSummarySchema>;

/** Snaps `value` to the nearest multiple of `grid` (the surveyed 4px space gauge, or
 * whatever the app's smallest `space` gauge measures) — every sketch element's x/y/w/h goes
 * through this before it lands on the sheet. A non-positive grid is treated as "no grid" —
 * the value passes through unchanged rather than dividing by zero. */
export function snap(value: number, grid: number): number {
  if (!(grid > 0)) return value;
  return Math.round(value / grid) * grid;
}

/** The next four-digit sketch id, given the ids already on disk under `.jig/sketches/` — the
 * exact numbering rule `nextWorkOrderId`/`nextToolpathId` already use (`ids.ts`), reproduced
 * here rather than importing across modules for five lines of padding logic. */
export function nextSketchId(existing: readonly string[]): string {
  let max = 0;
  for (const id of existing) {
    const n = Number.parseInt(id, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1).padStart(4, '0');
}

/** Collects every distinct gauge reference used anywhere across `sketch`'s elements and
 * resolves each one against `gaugeSet` — exactly the shape the server's HTML renderer needs
 * to emit CSS custom properties for the gauges a sketch actually uses (`GET
 * /api/sketches/:id/html`). A reference with no match in the gauge set is simply omitted; an
 * unresolved ref never throws — a sketch drawn against a stale survey still renders. */
export function resolveGauge(sketch: Sketch, gaugeSet: GaugeSet): Record<string, GaugeSet['gauges'][number]> {
  const byName = new Map(gaugeSet.gauges.map((gauge) => [gauge.name, gauge]));
  const resolved: Record<string, GaugeSet['gauges'][number]> = {};
  for (const element of sketch.elements) {
    for (const ref of Object.values(element.gauges ?? {})) {
      const gauge = byName.get(ref);
      if (gauge) resolved[ref] = gauge;
    }
  }
  return resolved;
}

// Re-exported so a consumer that only needs to validate a category name for a gauge slot
// (the bench's picker, filtering the Gauges panel's categories) doesn't need a second import
// from './gauges.js' just for this one enum.
export { GaugeCategorySchema };
// === end S9 block ===
