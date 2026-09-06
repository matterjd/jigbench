import { z } from 'zod';
import type { DocsIndex, Mark, Survey } from '@jigbench/core';
import { WorkOrderHumanSchema, type WorkOrderHuman } from '@jigbench/core';
import type { Drafter, DrafterContext } from '../../seams.js';
import { contextForPrompt, type DocsContext } from '../../docs/context.js';

/**
 * The real drafting driver (EXECUTION-PLAN.md §4 S5, decision 16): a local Ollama model
 * asked for the work order's HUMAN FACE as JSON, via Ollama's `format` structured-output
 * parameter (measured against `qwen2.5-coder:7b` on this desk: 81 tokens in ~5s, cold
 * load ~37s — the cost `service.ts` badges is always the measured `elapsedMs`, never a
 * guess). `available()` is the cheap yes/no `select-drafter.ts` needs before committing
 * to a `draft()` call that can legitimately take tens of seconds.
 */

export interface OllamaDrafterOptions {
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  /** Budget for `available()`'s `/api/tags` probe. Default 800ms per the commission's
   * measured facts — long enough for a loopback round trip, short enough that a dead
   * Ollama never stalls the drafter-selection order. */
  availabilityTimeoutMs?: number;
  /** Budget for a real `/api/generate` call (`draftWithMeta`/`rewrite`) — unlike
   * `available()`'s probe this can legitimately take tens of seconds (commission: ~5s
   * warm, ~37s cold-load), so the default is generous. Without SOME bound a wedged
   * Ollama process hangs `draftOrder` forever (finding 3, wave-3 council). On expiry the
   * call rejects with a clear "timed out" Error — `draftOrder`'s existing catch already
   * logs any draft failure and leaves the order `marked`, so a timeout needs no separate
   * handling there. */
  draftTimeoutMs?: number;
}

/** `DrafterContext` plus the S2b docs index, when one is clamped — `docsIndex` is
 * optional so this stays assignable wherever a plain `DrafterContext` is expected. */
export interface OllamaDraftContext extends DrafterContext {
  docsIndex?: DocsIndex;
}

export interface OllamaDraftResult {
  human: WorkOrderHuman;
  model: string;
  elapsedMs: number;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'qwen2.5-coder:7b';
const DEFAULT_AVAILABILITY_TIMEOUT_MS = 800;
const DEFAULT_DRAFT_TIMEOUT_MS = 90_000;
const DOCS_WORD_BUDGET = 600;

const HUMAN_FACE_JSON_SCHEMA = z.toJSONSchema(WorkOrderHumanSchema);

function splitCamel(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 2 && w !== 'component');
}

function nounsFor(mark: Mark): string[] {
  const nouns = new Set<string>();
  if (mark.target.component) for (const w of splitCamel(mark.target.component)) nouns.add(w);
  if (mark.target.text) for (const w of mark.target.text.toLowerCase().split(/\s+/)) if (w.length > 2) nouns.add(w);
  return [...nouns];
}

function relatedEndpointsAndSchemas(survey: Survey, nouns: readonly string[]): { endpointLines: string[]; schemaLines: string[] } {
  const endpointLines: string[] = [];
  for (const ep of survey.endpoints) {
    const haystack = `${ep.path} ${ep.operationId ?? ''}`.toLowerCase();
    if (nouns.some((n) => haystack.includes(n))) {
      endpointLines.push(`- ${ep.method.toUpperCase()} ${ep.path}${ep.stub ? ' (stub)' : ''}`);
    }
  }
  const schemaLines: string[] = [];
  for (const s of survey.schemas) {
    if (nouns.some((n) => s.schemaRef.toLowerCase().includes(n))) {
      schemaLines.push(`- ${s.schemaRef}: ${JSON.stringify(s.schema.properties ?? {})}`);
    }
  }
  return { endpointLines, schemaLines };
}

export class OllamaDrafter implements Drafter {
  readonly model: string;
  readonly draftTimeoutMs: number;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly availabilityTimeoutMs: number;

  constructor(opts: OllamaDrafterOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.availabilityTimeoutMs = opts.availabilityTimeoutMs ?? DEFAULT_AVAILABILITY_TIMEOUT_MS;
    this.draftTimeoutMs = opts.draftTimeoutMs ?? DEFAULT_DRAFT_TIMEOUT_MS;
  }

  /** Shared `/api/generate` caller for `draftWithMeta` and `rewrite` — both are real model
   * calls that can legitimately take a while, and both used to have no bound at all
   * (finding 3). An abort on timeout is re-thrown as a plain, clearly-worded Error rather
   * than surfacing fetch's generic `AbortError` — the message is what ends up in the
   * order's `draft-failed` log entry (`service.ts`'s `draftOrder` catch). */
  private async generate(body: Record<string, unknown>): Promise<{ response?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.draftTimeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`ollama /api/generate timed out after ${this.draftTimeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`ollama /api/generate responded ${res.status}`);
    return (await res.json()) as { response?: string };
  }

  /** `GET /api/tags` — never throws. Any failure (refused connection, timeout, a non-2xx
   * status) reports unavailable, since "is a model here right now" must always be
   * answerable cheaply and synchronously from `select-drafter.ts`'s point of view. */
  async available(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.availabilityTimeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/tags`, { signal: controller.signal });
      if (!res.ok) return false;
      const body = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
      const names = (body.models ?? []).map((m) => m.name ?? m.model);
      return names.includes(this.model);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private buildPrompt(mark: Mark, survey: Survey, docsContext: DocsContext | null): string {
    const nouns = nounsFor(mark);
    const component = survey.components.find(
      (c) => c.name === mark.target.component || c.file === mark.target.file,
    );
    const routes = component ? survey.routes.filter((r) => r.component === component.name) : [];
    const { endpointLines, schemaLines } = relatedEndpointsAndSchemas(survey, nouns);

    const lines: string[] = [
      'You are drafting the HUMAN FACE of a work order for a UX partner and an engineer.',
      'Answer only with JSON matching the given schema — what/why/where/acceptance/fixture.',
      '',
      `Mark prompt: "${mark.prompt}"`,
      mark.target.text ? `Marked text on the page: "${mark.target.text}"` : '',
      '',
    ];

    if (component) {
      lines.push(
        `Picked component: ${component.name} (selector <${component.selector}>), file ${component.file}`,
        `Inputs: ${component.inputs.map((i) => i.name).join(', ') || 'none'}`,
        `Outputs: ${component.outputs.map((o) => o.name).join(', ') || 'none'}`,
      );
      if (routes.length > 0) lines.push(`Routes: ${routes.map((r) => r.path).join(', ')}`);
    } else {
      lines.push(`No surveyed component matched this mark's target: ${mark.target.component ?? mark.target.file ?? mark.target.path}`);
    }

    if (endpointLines.length > 0) lines.push('', 'Related endpoints:', ...endpointLines);
    if (schemaLines.length > 0) lines.push('', 'Related data shapes:', ...schemaLines);

    if (docsContext && docsContext.chunks.length > 0) {
      lines.push('', 'Relevant documentation:');
      for (const chunk of docsContext.chunks) {
        lines.push(`--- ${chunk.provenance} ---`, chunk.text);
      }
    }

    return lines.filter((l) => l !== '').join('\n');
  }

  async draft(mark: Mark, context: OllamaDraftContext): Promise<WorkOrderHuman> {
    const result = await this.draftWithMeta(mark, context);
    return result.human;
  }

  /** Same as `draft`, plus the measured wall-clock cost and the model name — `service.ts`
   * uses these to badge the order ("drafted · qwen2.5-coder:7b · 4.9 s"), never a guess. */
  async draftWithMeta(mark: Mark, context: OllamaDraftContext): Promise<OllamaDraftResult> {
    const docsContext = context.docsIndex
      ? contextForPrompt(context.docsIndex, mark.prompt, nounsFor(mark), DOCS_WORD_BUDGET)
      : null;
    const prompt = this.buildPrompt(mark, context.survey, docsContext);

    const started = Date.now();
    const body = await this.generate({ model: this.model, prompt, format: HUMAN_FACE_JSON_SCHEMA, stream: false });
    const elapsedMs = Date.now() - started;

    let parsed: unknown;
    try {
      parsed = JSON.parse(body.response ?? '');
    } catch (err) {
      throw new Error(`ollama returned unparseable JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    const human = WorkOrderHumanSchema.parse(parsed); // zod throws a plain, catchable Error on a schema mismatch
    return { human, model: this.model, elapsedMs };
  }

  /** A plain-text rewrite, used only to polish a deterministic shop-face brief on
   * release (`shop-face.ts`'s optional pass) — never structured output, and the caller
   * is responsible for treating the result as advisory (it may return prose the caller
   * chooses not to use). */
  async rewrite(text: string, instruction: string): Promise<string> {
    const body = await this.generate({ model: this.model, prompt: `${instruction}\n\n${text}`, stream: false });
    return (body.response ?? '').trim();
  }
}
