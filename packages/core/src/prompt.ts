import { z } from 'zod';
import { JIG_FORMAT } from './jig-format.js';
import type { WorkOrder } from './work-order.js';

/**
 * S11 (AMENDMENT-1 §5 row S11, A4 "the artifact is a Prompt"): the artifact that replaces
 * the work order's two-face/six-rung shape. One file, `.jig/prompts/NNNN-<slug>.md`, states
 * draft -> ready -> building -> built (+ scrapped). The file IS the prompt Claude receives —
 * see `promptBodyForClaude` below for exactly which part of it that is.
 *
 * Core stays zero-I/O (no-io.test.ts): everything here is pure — schema, (de)serialization,
 * the state machine, and the work-order migration mapping. The server owns every actual
 * read/write under `.jig/prompts/` (packages/server/src/prompts/store.ts).
 */

export const PROMPT_STATES = ['draft', 'ready', 'building', 'built', 'scrapped'] as const;
export const PromptStateSchema = z.enum(PROMPT_STATES);
export type PromptState = (typeof PROMPT_STATES)[number];

export const PROMPT_EVENTS = ['ready', 'build', 'built', 'fail', 'scrap'] as const;
export const PromptEventSchema = z.enum(PROMPT_EVENTS);
export type PromptEvent = (typeof PROMPT_EVENTS)[number];

type PromptTransitions = Record<PromptState, Partial<Record<PromptEvent, PromptState>>>;

/** The only legal forward moves. `scrap` is legal from every non-terminal state; `restore`
 * is not a `promptTransition()` move (same reasoning as the old ladder's `restore` — it depends on
 * where the prompt was scrapped FROM, which `promptTransition()` alone can't answer) — see
 * `restorePromptState` below, mirroring `work-order.ts`'s service-level restore. */
const PROMPT_TRANSITIONS: PromptTransitions = {
  draft: { ready: 'ready', scrap: 'scrapped' },
  ready: { build: 'building', scrap: 'scrapped' },
  building: { built: 'built', fail: 'ready', scrap: 'scrapped' },
  built: { scrap: 'scrapped' },
  scrapped: {},
};

/** A pure function: given a state and an event, the next state — or `null` if that move is
 * illegal. Never throws; illegal moves are data, not exceptions (same contract as
 * `ladder.ts`'s `promptTransition`). */
export function promptTransition(state: PromptState, event: PromptEvent): PromptState | null {
  return PROMPT_TRANSITIONS[state]?.[event] ?? null;
}

/** The state `scrap` recorded on its way in (`scrappedFrom`, below) is what makes `restore`
 * possible without a full log — falls back to `draft` for a scrapped prompt that somehow
 * never recorded one (should not happen in practice; never throws). */
export function restorePromptState(scrappedFrom: PromptState | undefined): PromptState {
  if (!scrappedFrom || scrappedFrom === 'scrapped') return 'draft';
  return scrappedFrom;
}

export const PromptTargetKindSchema = z.enum(['element', 'sketch', 'none']);
export type PromptTargetKind = z.infer<typeof PromptTargetKindSchema>;

export const PromptTargetSchema = z.object({
  kind: PromptTargetKindSchema,
  /** The DOM path the loupe resolved on the plate, when `kind === 'element'`. */
  path: z.string().optional(),
  component: z.string().optional(),
  file: z.string().optional(),
  /** `.jig/sketches/` id, when `kind === 'sketch'` (S13: "build this screen"). */
  sketchId: z.string().optional(),
});
export type PromptTarget = z.infer<typeof PromptTargetSchema>;

export function noneTarget(): PromptTarget {
  return { kind: 'none' };
}

// ---------------------------------------------------------------------------------------
// Context — what Jig appends silently (AMENDMENT-1 §2): the selected component and file,
// the gauges it uses with values, the routes/endpoints it touches, the matching doc chunks.
// ---------------------------------------------------------------------------------------

export const PromptContextComponentSchema = z.object({
  name: z.string(),
  selector: z.string().optional(),
  file: z.string(),
});
export type PromptContextComponent = z.infer<typeof PromptContextComponentSchema>;

export const PromptContextGaugeSchema = z.object({
  name: z.string(),
  value: z.union([z.string(), z.number()]),
  category: z.string().optional(),
});
export type PromptContextGauge = z.infer<typeof PromptContextGaugeSchema>;

export const PromptContextRouteSchema = z.object({
  path: z.string(),
  component: z.string().optional(),
  file: z.string().optional(),
});
export type PromptContextRoute = z.infer<typeof PromptContextRouteSchema>;

export const PromptContextEndpointSchema = z.object({
  method: z.string(),
  path: z.string(),
  file: z.string().optional(),
});
export type PromptContextEndpoint = z.infer<typeof PromptContextEndpointSchema>;

/** A matching doc chunk, quoted with provenance (AMENDMENT-1 §4: "matching doc chunks
 * quoted with provenance") — also the vehicle `migrateWorkOrder` uses to fold the old shop
 * face's brief/patterns/tests text in without inventing new structured fields for them. */
export const PromptContextDocSchema = z.object({
  provenance: z.string(),
  text: z.string(),
});
export type PromptContextDoc = z.infer<typeof PromptContextDocSchema>;

export const PromptContextSchema = z.object({
  components: z.array(PromptContextComponentSchema),
  files: z.array(z.string()),
  gauges: z.array(PromptContextGaugeSchema),
  routes: z.array(PromptContextRouteSchema),
  endpoints: z.array(PromptContextEndpointSchema),
  docs: z.array(PromptContextDocSchema),
});
export type PromptContext = z.infer<typeof PromptContextSchema>;

export function emptyPromptContext(): PromptContext {
  return { components: [], files: [], gauges: [], routes: [], endpoints: [], docs: [] };
}

// ---------------------------------------------------------------------------------------
// Builds — one entry per `claude -p` run the Build runner made for this prompt.
// ---------------------------------------------------------------------------------------

export const PromptBuildRecordSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  exitCode: z.number().int().optional(),
  filesTouched: z.array(z.string()),
  summary: z.string().optional(),
  /** `.jig/cache/builds/<promptId>-<buildId>.jsonl` — the full stream-json transcript. */
  transcriptPath: z.string().optional(),
});
export type PromptBuildRecord = z.infer<typeof PromptBuildRecordSchema>;

export const PromptSchema = z.object({
  jigFormat: z.literal(JIG_FORMAT),
  id: z.string().regex(/^\d{4}$/, 'prompt id must be four digits'),
  slug: z.string(),
  state: PromptStateSchema,
  requirement: z.string(),
  acceptance: z.array(z.string()),
  target: PromptTargetSchema,
  context: PromptContextSchema,
  builds: z.array(PromptBuildRecordSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** The state a scrapped prompt was scrapped FROM — `restorePromptState` reads it back.
   * Not part of the four states + scrapped in the product's own words (AMENDMENT-1 §3);
   * a small, necessary bookkeeping field the file format still carries in frontmatter, the
   * same role `work-order.ts`'s `log` entry ("prev:<state>") played for the old ladder. */
  scrappedFrom: PromptStateSchema.optional(),
});
export type Prompt = z.infer<typeof PromptSchema>;

// ---------------------------------------------------------------------------------------
// Markdown <-> Prompt.
// ---------------------------------------------------------------------------------------

function yamlScalar(value: string): string {
  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function yamlOptionalScalar(value: string | undefined): string | null {
  return value === undefined ? null : yamlScalar(value);
}

function section(heading: string, body: string[]): string[] {
  return ['', heading, '', ...body];
}

const RULES_BLOCK = [
  '- Work in this repo only.',
  '- Test-first: write the failing test before the code that passes it.',
  '- Do not edit `.jig/` — that tree belongs to Jig, never to a build.',
  '- Report the files you touched at the end as a line `FILES: a, b, c`.',
];

function contextLines(context: PromptContext): string[] {
  const lines: string[] = [];
  if (context.components.length > 0) {
    lines.push('### Component', '');
    for (const c of context.components) {
      lines.push(`- ${c.name}${c.selector ? ` <${c.selector}>` : ''} — ${c.file}`);
    }
    lines.push('');
  }
  if (context.files.length > 0) {
    lines.push('### Files', '');
    for (const f of context.files) lines.push(`- ${f}`);
    lines.push('');
  }
  if (context.gauges.length > 0) {
    lines.push('### Gauges', '');
    for (const g of context.gauges) lines.push(`- ${g.name}: ${g.value}${g.category ? ` (${g.category})` : ''}`);
    lines.push('');
  }
  if (context.routes.length > 0) {
    lines.push('### Routes', '');
    for (const r of context.routes) lines.push(`- ${r.path}${r.component ? ` -> ${r.component}` : ''}`);
    lines.push('');
  }
  if (context.endpoints.length > 0) {
    lines.push('### Endpoints', '');
    for (const e of context.endpoints) lines.push(`- ${e.method.toUpperCase()} ${e.path}`);
    lines.push('');
  }
  if (context.docs.length > 0) {
    lines.push('### Docs', '');
    for (const d of context.docs) lines.push(`--- ${d.provenance} ---`, d.text, '');
  }
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.length > 0 ? lines : ['_nothing surveyed yet_'];
}

/** Exactly what `claude -p` receives (AMENDMENT-1 §4: "the file is the prompt Claude
 * receives, verbatim: the requirement on top, then what Jig knows"). Deliberately excludes
 * the frontmatter and the build-history section `serializePrompt` appends below it — a
 * model has no use for its own past run's exit codes, and the frontmatter is bookkeeping. */
export function promptBodyForClaude(prompt: Prompt): string {
  const lines: string[] = [];
  lines.push('# Requirement', '', prompt.requirement || '_(no requirement written yet)_');
  lines.push(...section('## Acceptance', prompt.acceptance.length > 0 ? prompt.acceptance.map((a) => `- ${a}`) : ['_none given_']));
  lines.push(...section('## Context', contextLines(prompt.context)));
  lines.push(...section('## Rules', RULES_BLOCK));
  lines.push('');
  return lines.join('\n');
}

function buildLogLines(builds: readonly PromptBuildRecord[]): string[] {
  const lines: string[] = [];
  for (const b of builds) {
    lines.push(`### Build ${b.id}`, '');
    lines.push(`- started: ${b.startedAt}`);
    if (b.finishedAt) lines.push(`- finished: ${b.finishedAt}`);
    if (b.exitCode !== undefined) lines.push(`- exit code: ${b.exitCode}`);
    if (b.transcriptPath) lines.push(`- transcript: ${b.transcriptPath}`);
    lines.push(`- files touched: ${b.filesTouched.length > 0 ? b.filesTouched.join(', ') : '_none_'}`);
    if (b.summary) lines.push('', b.summary);
    lines.push('');
  }
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** The full file: frontmatter (id/slug/state/target/timestamps — `scrappedFrom` rides along
 * as a small bookkeeping extra, see the schema comment) + the four `promptBodyForClaude`
 * sections + an optional `## Builds` history section once at least one build has run. */
export function serializePrompt(prompt: Prompt): string {
  const frontmatter = [
    '---',
    `jigFormat: ${prompt.jigFormat}`,
    `id: "${prompt.id}"`,
    `slug: ${yamlScalar(prompt.slug)}`,
    `state: ${yamlScalar(prompt.state)}`,
    `target: ${JSON.stringify(prompt.target)}`,
    `createdAt: ${yamlScalar(prompt.createdAt)}`,
    `updatedAt: ${yamlScalar(prompt.updatedAt)}`,
    ...(prompt.scrappedFrom ? [`scrappedFrom: ${yamlScalar(prompt.scrappedFrom)}`] : []),
    '---',
  ];

  const lines: string[] = [...frontmatter];
  lines.push('', '# Requirement', '', prompt.requirement || '_(no requirement written yet)_');
  lines.push(...section('## Acceptance', prompt.acceptance.length > 0 ? prompt.acceptance.map((a) => `- ${a}`) : ['_none given_']));
  lines.push(...section('## Context', contextLines(prompt.context)));
  lines.push(...section('## Rules', RULES_BLOCK));
  if (prompt.builds.length > 0) {
    lines.push(...section('## Builds', buildLogLines(prompt.builds)));
  }
  lines.push('');
  return lines.join('\n');
}

function unquote(v: string): string {
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\') : v;
}

function stripListMarkers(lines: string[]): string[] {
  return lines.filter((l) => l.trim().length > 0).map((l) => l.replace(/^-\s?/, ''));
}

/** Re-derives the `## Builds` section back into `PromptBuildRecord[]` — the inverse of
 * `buildLogLines`. Tolerant of a hand-edited/missing field (`exitCode`/`transcriptPath`
 * absent, `summary` blank) since a human may edit this file directly. */
function parseBuildLog(sections: Map<string, string[]>): PromptBuildRecord[] {
  const builds: PromptBuildRecord[] = [];
  for (const [heading, bodyLines] of sections) {
    const m = /^Build (.+)$/.exec(heading);
    if (!m) continue;
    const id = m[1]!;
    let startedAt = '';
    let finishedAt: string | undefined;
    let exitCode: number | undefined;
    let transcriptPath: string | undefined;
    const filesTouched: string[] = [];
    const summaryLines: string[] = [];
    let pastFields = false;
    for (const raw of bodyLines) {
      const line = raw.trim();
      if (!pastFields) {
        const started = /^-\s*started:\s*(.+)$/.exec(line);
        const finished = /^-\s*finished:\s*(.+)$/.exec(line);
        const exit = /^-\s*exit code:\s*(-?\d+)$/.exec(line);
        const transcript = /^-\s*transcript:\s*(.+)$/.exec(line);
        const files = /^-\s*files touched:\s*(.+)$/.exec(line);
        if (started) {
          startedAt = started[1]!;
          continue;
        }
        if (finished) {
          finishedAt = finished[1]!;
          continue;
        }
        if (exit) {
          exitCode = Number.parseInt(exit[1]!, 10);
          continue;
        }
        if (transcript) {
          transcriptPath = transcript[1]!;
          continue;
        }
        if (files) {
          if (files[1] !== '_none_') filesTouched.push(...files[1]!.split(',').map((f) => f.trim()).filter(Boolean));
          // "files touched" is always the LAST known field `buildLogLines` emits — once
          // seen, everything else is summary prose (which may itself start with a blank
          // line, or with a line that happens to look like a field on a hand-edited file).
          pastFields = true;
          continue;
        }
        if (line === '') continue; // a blank line before any field is seen yet — ignore it
      }
      if (line.length > 0 || summaryLines.length > 0) summaryLines.push(raw);
    }
    while (summaryLines.length > 0 && summaryLines[summaryLines.length - 1]!.trim() === '') summaryLines.pop();
    builds.push({
      id,
      startedAt,
      ...(finishedAt ? { finishedAt } : {}),
      ...(exitCode !== undefined ? { exitCode } : {}),
      filesTouched,
      ...(summaryLines.length > 0 ? { summary: summaryLines.join('\n').trim() } : {}),
      ...(transcriptPath ? { transcriptPath } : {}),
    });
  }
  return builds;
}

function parseContextSection(sections: Map<string, string[]>): PromptContext {
  const textOf = (heading: string): string[] => sections.get(heading) ?? [];

  const components: PromptContextComponent[] = stripListMarkers(textOf('Component')).map((line) => {
    const m = /^(.+?)(?:\s*<(.+?)>)?\s*—\s*(.+)$/.exec(line);
    if (!m) return { name: line, file: '' };
    return { name: m[1]!.trim(), ...(m[2] ? { selector: m[2] } : {}), file: m[3]!.trim() };
  });

  const files = stripListMarkers(textOf('Files'));

  const gauges: PromptContextGauge[] = stripListMarkers(textOf('Gauges')).map((line) => {
    const m = /^(.+?):\s*(.+?)(?:\s*\((.+)\))?$/.exec(line);
    if (!m) return { name: line, value: '' };
    const raw = m[2]!.trim();
    const value = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
    return { name: m[1]!.trim(), value, ...(m[3] ? { category: m[3] } : {}) };
  });

  const routes: PromptContextRoute[] = stripListMarkers(textOf('Routes')).map((line) => {
    const m = /^(.+?)(?:\s*->\s*(.+))?$/.exec(line);
    if (!m) return { path: line };
    return { path: m[1]!.trim(), ...(m[2] ? { component: m[2]!.trim() } : {}) };
  });

  const endpoints: PromptContextEndpoint[] = stripListMarkers(textOf('Endpoints')).map((line) => {
    const [method, ...rest] = line.split(' ');
    return { method: (method ?? '').toLowerCase(), path: rest.join(' ') };
  });

  const docLines = textOf('Docs');
  const docs: PromptContextDoc[] = [];
  let currentProvenance: string | null = null;
  let currentText: string[] = [];
  const flushDoc = () => {
    if (currentProvenance !== null) docs.push({ provenance: currentProvenance, text: currentText.join('\n').trim() });
    currentProvenance = null;
    currentText = [];
  };
  for (const raw of docLines) {
    const m = /^---\s*(.+?)\s*---$/.exec(raw.trim());
    if (m) {
      flushDoc();
      currentProvenance = m[1]!;
      continue;
    }
    if (currentProvenance !== null) currentText.push(raw);
  }
  flushDoc();

  return { components, files, gauges, routes, endpoints, docs };
}

export function parsePrompt(markdown: string): Prompt {
  const text = markdown.replace(/\r\n/g, '\n');
  const fmMatch = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!fmMatch) {
    throw new Error('parsePrompt: no YAML frontmatter block found');
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

  const jigFormat = Number.parseInt(fm.jigFormat ?? '', 10);
  const id = unquote(fm.id ?? '');
  const slug = unquote(fm.slug ?? '');
  const state = unquote(fm.state ?? '');
  const target: PromptTarget = fm.target ? (JSON.parse(fm.target) as PromptTarget) : { kind: 'none' };
  const createdAt = unquote(fm.createdAt ?? '');
  const updatedAt = unquote(fm.updatedAt ?? '');
  const scrappedFromRaw = fm.scrappedFrom ? unquote(fm.scrappedFrom) : undefined;

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

  // "# Requirement" is a top-level (single `#`) heading, handled separately from the `##`/`###`
  // section map above — its body runs until the first `##` heading.
  const reqIdx = bodyLines.findIndex((l) => /^#\s+Requirement\s*$/.test(l));
  let requirement = '';
  if (reqIdx !== -1) {
    const reqLines: string[] = [];
    for (let i = reqIdx + 1; i < bodyLines.length; i++) {
      if (/^##\s+/.test(bodyLines[i]!)) break;
      reqLines.push(bodyLines[i]!);
    }
    requirement = reqLines.join('\n').trim();
  }
  if (requirement === '_(no requirement written yet)_') requirement = '';

  const acceptanceRaw = stripListMarkers(sections.get('Acceptance') ?? []);
  const acceptance = acceptanceRaw.length === 1 && acceptanceRaw[0] === '_none given_' ? [] : acceptanceRaw;

  const context = parseContextSection(sections);
  const builds = parseBuildLog(sections);

  const prompt: Prompt = {
    jigFormat: jigFormat as typeof JIG_FORMAT,
    id,
    slug,
    state: state as PromptState,
    requirement,
    acceptance,
    target,
    context,
    builds,
    createdAt,
    updatedAt,
    ...(scrappedFromRaw ? { scrappedFrom: scrappedFromRaw as PromptState } : {}),
  };

  return PromptSchema.parse(prompt);
}

// ---------------------------------------------------------------------------------------
// Migration — the old ladder folded onto the new four states (AMENDMENT-1 §5 row S11).
// ---------------------------------------------------------------------------------------

const LADDER_TO_PROMPT_STATE: Record<string, PromptState> = {
  marked: 'draft',
  drafted: 'draft',
  released: 'ready',
  'in-the-shop': 'building',
  'trial-fit': 'built',
  scrapped: 'scrapped',
};

/** Maps one old `WorkOrder` onto the new `Prompt` shape (AMENDMENT-1 §5 row S11): the ladder
 * folds onto draft/ready/building/built(+scrapped); the human face's `what`/`why` become the
 * requirement, `acceptance` carries straight across; the shop face (when present) becomes
 * the context block — `files` maps directly, and `brief`/`patterns`/`tests` (which have no
 * structured home in `PromptContext`) are folded into `context.docs` as provenance-labelled
 * text so migration never silently drops information. A `trialFit` (the old "done" report)
 * becomes one synthetic `PromptBuildRecord` so build history survives the migration too. */
export function migrateWorkOrder(wo: WorkOrder): Prompt {
  const requirement = [wo.human.what, wo.human.why].filter((s) => s.trim().length > 0).join('\n\n');
  const createdAt = wo.log[0]?.at ?? new Date().toISOString();
  const updatedAt = wo.log[wo.log.length - 1]?.at ?? createdAt;

  const context = emptyPromptContext();
  if (wo.shop) {
    context.files = [...wo.shop.files];
    if (wo.shop.brief) context.docs.push({ provenance: 'migrated: shop brief', text: wo.shop.brief });
    if (wo.shop.patterns.length > 0) context.docs.push({ provenance: 'migrated: patterns', text: wo.shop.patterns.join('\n') });
    if (wo.shop.tests.length > 0) context.docs.push({ provenance: 'migrated: tests', text: wo.shop.tests.join('\n') });
  }

  const builds: PromptBuildRecord[] = [];
  if (wo.shop?.trialFit) {
    builds.push({
      id: `migrated-${wo.id}`,
      startedAt: createdAt,
      finishedAt: updatedAt,
      exitCode: 0,
      filesTouched: [...wo.shop.trialFit.files],
      summary: wo.shop.trialFit.summary,
    });
  }

  const state = LADDER_TO_PROMPT_STATE[wo.state] ?? 'draft';
  const scrapLog = wo.state === 'scrapped' ? [...wo.log].reverse().find((l) => l.event === 'scrapped' && l.note?.startsWith('prev:')) : undefined;
  const scrappedFromLadder = scrapLog?.note?.slice('prev:'.length);
  const scrappedFrom = scrappedFromLadder ? LADDER_TO_PROMPT_STATE[scrappedFromLadder] : undefined;

  return PromptSchema.parse({
    jigFormat: JIG_FORMAT,
    id: wo.id,
    slug: wo.slug,
    state,
    requirement,
    acceptance: [...wo.human.acceptance],
    target: { kind: 'element', path: wo.human.where },
    context,
    builds,
    createdAt,
    updatedAt,
    ...(scrappedFrom ? { scrappedFrom } : {}),
  });
}
