import { z } from 'zod';
import { JIG_FORMAT } from './jig-format.js';
import { LadderStateSchema } from './ladder.js';
import { LogEntrySchema, type LogEntry } from './log.js';

export const DraftedBySchema = z.enum(['model', 'shop', 'person']);
export type DraftedBy = z.infer<typeof DraftedBySchema>;

export const WorkOrderHumanSchema = z.object({
  what: z.string(),
  why: z.string(),
  where: z.string(),
  acceptance: z.array(z.string()),
  fixture: z.string().optional(),
});
export type WorkOrderHuman = z.infer<typeof WorkOrderHumanSchema>;

export const WorkOrderShopSchema = z.object({
  files: z.array(z.string()),
  patterns: z.array(z.string()),
  tests: z.array(z.string()),
  brief: z.string(),
});
export type WorkOrderShop = z.infer<typeof WorkOrderShopSchema>;

export const WorkOrderSchema = z.object({
  jigFormat: z.literal(JIG_FORMAT),
  id: z.string().regex(/^\d{4}$/, 'work-order id must be four digits'),
  slug: z.string(),
  state: LadderStateSchema,
  human: WorkOrderHumanSchema,
  shop: WorkOrderShopSchema.optional(),
  draftedBy: DraftedBySchema,
  marks: z.array(z.string()),
  log: z.array(LogEntrySchema),
});
export type WorkOrder = z.infer<typeof WorkOrderSchema>;

// ---------------------------------------------------------------------------------------
// Markdown <-> WorkOrder. The frontmatter carries id/slug/state/draftedBy/marks/jigFormat
// (Runtime `log` entries are not part of the file format in S1 — the logbook is a separate
// surface; nothing here is lossy about the fields the file format actually owns).
// ---------------------------------------------------------------------------------------

function yamlScalar(value: string): string {
  // Quote defensively whenever the bare form would be YAML-ambiguous (leading zero,
  // colons, quotes) — every value we emit here is a plain identifier except `id`, which
  // always needs it to keep its leading zero a string and not an octal-looking number.
  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function yamlFlowArray(values: readonly string[]): string {
  return `[${values.map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(', ')}]`;
}

function parseYamlFlowArray(raw: string): string[] {
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '').trim();
  if (inner === '') return [];
  const out: string[] = [];
  // Simple quoted-string flow-array parser — sufficient for the marks id list we emit
  // ourselves; it never needs to handle arbitrary YAML.
  const re = /"((?:\\.|[^"\\])*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    out.push(m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  }
  return out;
}

function section(heading: string, body: string[]): string[] {
  return ['', heading, '', ...body];
}

export function serializeWorkOrder(wo: WorkOrder): string {
  const frontmatter = [
    '---',
    `jigFormat: ${wo.jigFormat}`,
    `id: "${wo.id}"`,
    `slug: ${yamlScalar(wo.slug)}`,
    `state: ${yamlScalar(wo.state)}`,
    `draftedBy: ${yamlScalar(wo.draftedBy)}`,
    `marks: ${yamlFlowArray(wo.marks)}`,
    '---',
  ];

  const lines: string[] = [...frontmatter];
  lines.push(...section('## What', [wo.human.what]));
  lines.push(...section('## Why', [wo.human.why]));
  lines.push(...section('## Where', [wo.human.where]));
  lines.push(...section('## Acceptance', wo.human.acceptance.map((a) => `- ${a}`)));
  lines.push(...section('## Fixture', [wo.human.fixture ?? '_none_']));

  if (wo.shop) {
    lines.push(...section('## Shop brief', [wo.shop.brief]));
    lines.push(...section('### Files', wo.shop.files.map((f) => `- ${f}`)));
    lines.push(...section('### Patterns', wo.shop.patterns.map((p) => `- ${p}`)));
    lines.push(...section('### Tests', wo.shop.tests.map((t) => `- ${t}`)));
  }

  lines.push('');
  return lines.join('\n');
}

function stripListMarkers(lines: string[]): string[] {
  return lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.replace(/^-\s?/, ''));
}

export function parseWorkOrder(markdown: string): WorkOrder {
  const text = markdown.replace(/\r\n/g, '\n');
  const fmMatch = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!fmMatch) {
    throw new Error('parseWorkOrder: no YAML frontmatter block found');
  }
  const [, fmBlock, body] = fmMatch;

  const fm: Record<string, string> = {};
  for (const line of fmBlock.split('\n')) {
    if (!line.trim()) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    fm[key] = value;
  }

  const unquote = (v: string): string =>
    v.startsWith('"') && v.endsWith('"')
      ? v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      : v;

  const jigFormat = Number.parseInt(fm.jigFormat ?? '', 10);
  const id = unquote(fm.id ?? '');
  const slug = unquote(fm.slug ?? '');
  const state = unquote(fm.state ?? '');
  const draftedBy = unquote(fm.draftedBy ?? '');
  const marks = parseYamlFlowArray(fm.marks ?? '[]');

  // Split the body into sections keyed by their heading line.
  const bodyLines = body.split('\n');
  const sections = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of bodyLines) {
    if (/^##\s+/.test(line) || /^###\s+/.test(line)) {
      current = line.replace(/^#+\s+/, '').trim();
      sections.set(current, []);
    } else if (current) {
      sections.get(current)!.push(line);
    }
  }

  const textOf = (heading: string): string =>
    (sections.get(heading) ?? []).filter((l) => l.trim().length > 0).join('\n').trim();

  const fixtureRaw = textOf('Fixture');
  const shopBriefPresent = sections.has('Shop brief');

  const human = {
    what: textOf('What'),
    why: textOf('Why'),
    where: textOf('Where'),
    acceptance: stripListMarkers(sections.get('Acceptance') ?? []),
    ...(fixtureRaw && fixtureRaw !== '_none_' ? { fixture: fixtureRaw } : {}),
  };

  const shop = shopBriefPresent
    ? {
        brief: textOf('Shop brief'),
        files: stripListMarkers(sections.get('Files') ?? []),
        patterns: stripListMarkers(sections.get('Patterns') ?? []),
        tests: stripListMarkers(sections.get('Tests') ?? []),
      }
    : undefined;

  const workOrder: WorkOrder = {
    jigFormat: jigFormat as typeof JIG_FORMAT,
    id,
    slug,
    state: state as WorkOrder['state'],
    human,
    ...(shop ? { shop } : {}),
    draftedBy: draftedBy as WorkOrder['draftedBy'],
    marks,
    log: [] as LogEntry[],
  };

  return WorkOrderSchema.parse(workOrder);
}
