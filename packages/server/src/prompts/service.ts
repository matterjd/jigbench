import { z } from 'zod';
import {
  PromptTargetSchema,
  emptyPromptContext,
  promptBodyForClaude,
  promptTransition,
  restorePromptState,
  type DocsIndex,
  type GaugeSet,
  type Prompt,
  type PromptBuildRecord,
  type PromptState,
  type PromptTarget,
  type Survey,
} from '@jigbench/core';
import type { PromptStore } from './store.js';
import { buildPromptContext } from './context.js';
import { ClaudeNotInstalledError, PolishUnavailableError, PromptBuildConflictError, PromptConflictError } from './errors.js';
import type { OllamaLike } from '../orders/drafters/ollama.js';
import type { BuildRunnerLike, BuildStreamEvent, ClaudeStatus } from '../build/types.js';
import { logger } from '../logger.js';

/**
 * S11 `PromptService` (AMENDMENT-1 §5 row S11): the one place that turns a selection +
 * requirement into a prompt, moves it through draft -> ready -> building -> built (+
 * scrapped), runs Polish on demand, and kicks off a Build. `http.ts`'s prompts routes and
 * `mcp/prompt-tools.ts` are the only callers — same shape as `orders/service.ts`.
 */

export interface CreatePromptInput {
  requirement: string;
  acceptance?: string[];
  target?: PromptTarget;
}

const CreatePromptInputSchema = z.object({
  requirement: z.string(),
  acceptance: z.array(z.string()).optional(),
  target: PromptTargetSchema.optional(),
});

export const PromptEditSchema = z
  .object({
    requirement: z.string().max(20_000).optional(),
    acceptance: z.array(z.string()).optional(),
  })
  .strict();
export type PromptEditInput = z.infer<typeof PromptEditSchema>;

export interface PolishResult {
  requirement: string;
  acceptance: string[];
}

export interface PromptServiceOptions {
  store: PromptStore;
  /** Read fresh on every `ready()`/`polish()` call, same reasoning as `orders/service.ts`'s
   * own `this.store.getState().survey` — never cached here. */
  survey: () => Survey;
  gauges: () => GaugeSet;
  loadDocsIndex?: () => Promise<DocsIndex | undefined>;
  ollama?: OllamaLike;
  runner: BuildRunnerLike;
  /** Called after every persisted mutation (create/edit/ready/scrap/restore/build
   * start-or-finish) — `http.ts` wires this to its own state broadcast. Defaults to a no-op
   * so the service is usable standalone in tests, same contract as `OrdersServiceOptions`. */
  notify?: () => void;
  /** Called for every build-stream event, forwarded from the runner — `http.ts` wires this to
   * `{type:'build', id, event}` on the bench WS. Defaults to a no-op. */
  onBuildEvent?: (id: string, event: BuildStreamEvent, elapsedMs: number) => void;
}

function now(): string {
  return new Date().toISOString();
}

function randomBuildId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const ACCEPTANCE_BULLET_RE = /^[-*•]\s*/;

/** Splits Ollama's free-text "suggest some acceptance bullets" reply into a clean bullet
 * list — one per non-empty line, any leading `-`/`*`/`•` marker stripped. Never throws on
 * unexpected prose; a model that ignores the instruction just yields its lines verbatim
 * rather than an empty list, which is still strictly better than nothing for a human to edit. */
function parseAcceptanceBullets(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(ACCEPTANCE_BULLET_RE, '').trim())
    .filter((l) => l.length > 0);
}

export class PromptService {
  private readonly store: PromptStore;
  private readonly survey: () => Survey;
  private readonly gauges: () => GaugeSet;
  private readonly loadDocsIndex: () => Promise<DocsIndex | undefined>;
  private readonly ollama?: OllamaLike;
  private readonly runner: BuildRunnerLike;
  private readonly notify: () => void;
  private readonly onBuildEvent: (id: string, event: BuildStreamEvent, elapsedMs: number) => void;
  // Same reasoning as `orders/service.ts`'s `pendingDrafts` (wave-3 council finding 3): every
  // background build kicked off by `build()` is tracked here so `close()` can wait for it —
  // without this, a caller that tears down this service's backing store right after `build()`
  // returns (a test's temp-directory cleanup; a real server shutdown) can remove the directory
  // while `finishBuild`'s real fs write is still opening its temp file.
  private readonly pendingBuilds = new Set<Promise<unknown>>();

  constructor(opts: PromptServiceOptions) {
    this.store = opts.store;
    this.survey = opts.survey;
    this.gauges = opts.gauges;
    this.loadDocsIndex = opts.loadDocsIndex ?? (async () => undefined);
    this.ollama = opts.ollama;
    this.runner = opts.runner;
    this.notify = opts.notify ?? (() => {});
    this.onBuildEvent = opts.onBuildEvent ?? (() => {});
  }

  list(state?: PromptState): Prompt[] {
    return this.store.list(state);
  }

  get(id: string): Prompt | undefined {
    return this.store.get(id);
  }

  private async persist(prompt: Prompt): Promise<Prompt> {
    const written = await this.store.write(prompt);
    this.notify();
    return written;
  }

  /** "create (from a selection + requirement)" — a fresh prompt always starts `draft`, with
   * an empty context: `ready()` is what fills the context in from the survey/docs, never
   * `create()` (S11 brief: "ready(id) ... regenerates the context block ... at that moment"). */
  async create(input: CreatePromptInput): Promise<Prompt> {
    const validated = CreatePromptInputSchema.parse(input);
    const prompt = await this.store.create({
      requirement: validated.requirement,
      acceptance: validated.acceptance,
      target: validated.target,
      context: emptyPromptContext(),
    });
    this.notify();
    return prompt;
  }

  /** The requirement/acceptance stay editable before a build starts — `draft` and `ready`
   * only (mirrors `orders/service.ts`'s `editHumanFace` window, which stopped at `released`;
   * here the equivalent boundary is `building`). `patch` is `unknown`-shaped input validated
   * by `PromptEditSchema.strict()` before anything merges — the same wave-3-council fix
   * `orders/service.ts` needed (finding 2) applied from the start. */
  async edit(id: string, patch: unknown): Promise<Prompt> {
    const prompt = this.store.require(id);
    if (prompt.state !== 'draft' && prompt.state !== 'ready') {
      throw new PromptConflictError(`prompt ${id} is ${prompt.state} — only a draft or ready prompt is editable`);
    }
    const validated = PromptEditSchema.parse(patch);
    return this.persist({ ...prompt, ...validated, updatedAt: now() });
  }

  /** RELEASE's equivalent (AMENDMENT-1 §3: "ready is the human's word (the old release)"):
   * regenerates the context block from the survey/docs AT THIS MOMENT — never at `create()`
   * time, so a requirement drafted before the app was surveyed still gets a real context once
   * the human is satisfied enough to hold Ready. */
  async ready(id: string): Promise<Prompt> {
    const prompt = this.store.require(id);
    const nextState = promptTransition(prompt.state, 'ready');
    if (!nextState) {
      throw new PromptConflictError(`prompt ${id} is ${prompt.state}, not draft — ready needs a draft first`);
    }
    const docsIndex = await this.loadDocsIndex();
    const context = buildPromptContext({
      survey: this.survey(),
      gauges: this.gauges(),
      docsIndex,
      target: prompt.target,
      queryText: [prompt.requirement, ...prompt.acceptance].join(' '),
    });
    return this.persist({ ...prompt, state: nextState, context, updatedAt: now() });
  }

  /** Law II: scrapped is a state, never a deletion. `scrappedFrom` records where it came
   * from so `restore()` can put it back exactly there — `core`'s `restorePromptState` reads
   * it back, same role `work-order.ts`'s `log` note played for the old ladder. */
  async scrap(id: string): Promise<Prompt> {
    const prompt = this.store.require(id);
    const nextState = promptTransition(prompt.state, 'scrap');
    if (!nextState) {
      throw new PromptConflictError(`prompt ${id} is already ${prompt.state} — nothing to scrap`);
    }
    return this.persist({ ...prompt, state: nextState, scrappedFrom: prompt.state, updatedAt: now() });
  }

  async restore(id: string): Promise<Prompt> {
    const prompt = this.store.require(id);
    if (prompt.state !== 'scrapped') {
      throw new PromptConflictError(`prompt ${id} is ${prompt.state}, not scrapped — nothing to restore`);
    }
    const prevState = restorePromptState(prompt.scrappedFrom);
    const { scrappedFrom: _scrappedFrom, ...rest } = prompt;
    return this.persist({ ...rest, state: prevState, updatedAt: now() });
  }

  /** "on demand — a Polish button ... rewrites requirement + suggests acceptance; returns
   * the diff; never automatic; 404-style honest error when no model" (AMENDMENT-1 A2, S11
   * brief). Read-only: the caller applies the suggestion via `edit()` itself, deliberately —
   * nothing here writes anything, so a Polish call that a human dislikes costs nothing to
   * discard. `JIG_NO_MODEL=1` short-circuits the same way `orders/select-drafter.ts` does,
   * for the exact same CI/S10 command (`JIG_NO_MODEL=1 npm test`). */
  async polish(id: string): Promise<PolishResult> {
    const prompt = this.store.require(id);
    if (!this.ollama) throw new PolishUnavailableError();
    const available = process.env.JIG_NO_MODEL === '1' ? false : await this.ollama.available();
    if (!available) throw new PolishUnavailableError();

    const requirement = await this.ollama.rewrite(
      prompt.requirement,
      'Rewrite the following feature requirement so it reads clearly, the way a PM would write it for an engineer. Keep every fact and constraint — change only the prose. Reply with the requirement only, no preamble.',
    );
    const acceptanceText = await this.ollama.rewrite(
      prompt.requirement,
      'Suggest 2 to 4 short, testable acceptance criteria for the following requirement, one per line, no numbering, no preamble.',
    );
    return { requirement: requirement.trim() || prompt.requirement, acceptance: parseAcceptanceBullets(acceptanceText) };
  }

  /** "only ONE build at a time per repo (a second Build while building -> 409 with the
   * running id)" and "Never run when claude is not on PATH" (S11 brief). Fire-and-forget,
   * same shape as `orders/service.ts`'s `draftOrder`: the prompt flips to `building` and is
   * persisted before this returns, but the actual `claude -p` run (and the eventual
   * built/ready-on-failure transition) happens in the background — `finishBuild` below is
   * what lands it. */
  async build(id: string): Promise<{ buildId: string }> {
    const prompt = this.store.require(id);
    const nextState = promptTransition(prompt.state, 'build');
    if (!nextState) {
      throw new PromptConflictError(`prompt ${id} is ${prompt.state}, not ready — build needs a ready prompt first`);
    }

    const running = this.runner.currentBuild();
    if (running) throw new PromptBuildConflictError(running.promptId, running.buildId);

    if (!(await this.runner.isClaudeAvailable())) {
      throw new ClaudeNotInstalledError();
    }

    const buildId = randomBuildId();
    const startedAt = now();
    await this.persist({ ...prompt, state: nextState, updatedAt: startedAt });

    const promise = this.runner
      .start({
        promptId: id,
        buildId,
        repoRoot: this.store.repoRoot,
        promptText: promptBodyForClaude(prompt),
        onEvent: (event, elapsedMs) => this.onBuildEvent(id, event, elapsedMs),
      })
      .then((outcome) => this.finishBuild(id, buildId, startedAt, outcome))
      .catch((err: unknown) => {
        logger.warn('build failed to run', String(err));
        return this.finishBuild(id, buildId, startedAt, {
          exitCode: null,
          filesTouched: [],
          summary: err instanceof Error ? err.message : String(err),
          transcriptPath: '',
          cancelled: false,
        });
      });
    this.pendingBuilds.add(promise);
    promise.then(
      () => this.pendingBuilds.delete(promise),
      () => this.pendingBuilds.delete(promise),
    );

    return { buildId };
  }

  private async finishBuild(
    id: string,
    buildId: string,
    startedAt: string,
    outcome: { exitCode: number | null; filesTouched: string[]; summary?: string; sessionId?: string; transcriptPath: string; cancelled: boolean },
  ): Promise<void> {
    const prompt = this.store.get(id);
    // The prompt may have been scrapped mid-build (`scrap` is legal from `building`) — never
    // resurrect a scrapped prompt's state here; only ever move it on FROM `building`.
    if (!prompt || prompt.state !== 'building') return;

    const finishedAt = now();
    const record: PromptBuildRecord = {
      id: buildId,
      startedAt,
      finishedAt,
      ...(outcome.exitCode !== null ? { exitCode: outcome.exitCode } : {}),
      filesTouched: outcome.filesTouched,
      ...(outcome.summary ? { summary: outcome.summary } : {}),
      ...(outcome.transcriptPath ? { transcriptPath: outcome.transcriptPath } : {}),
    };

    const success = !outcome.cancelled && outcome.exitCode === 0;
    const nextState = success ? (promptTransition('building', 'built') ?? 'built') : (promptTransition('building', 'fail') ?? 'ready');

    await this.persist({ ...prompt, state: nextState, builds: [...prompt.builds, record], updatedAt: finishedAt });
  }

  /** Requests cancellation of the build in progress for `id` — the actual `ready` transition
   * lands via `finishBuild` once the runner's `start()` promise settles with
   * `cancelled: true`, exactly the same path a natural exit takes. Throws if nothing is
   * running for this id (never a silent no-op — the caller asked to cancel something
   * specific). */
  cancel(id: string): void {
    this.store.require(id); // 404s on an unknown id before anything else
    const running = this.runner.currentBuild();
    if (!running || running.promptId !== id) {
      throw new PromptConflictError(`prompt ${id} has no build in progress to cancel`);
    }
    this.runner.cancel(id);
  }

  /** `jig_mark_built` (S11 MCP alias, ADR-001 "the agent pulls"): an EXTERNAL agent — one
   * that built the change itself, outside Jig's own Build runner entirely — reports a
   * ready-or-building prompt done. Legal from `building` (Jig's own build is what's running)
   * or `ready` (no Build runner involved at all, an agent picked it up over MCP the same way
   * the old `jig_report` let the shop claim a released work order) — never from `draft`,
   * `built`, or `scrapped`. */
  async markBuiltExternally(id: string, input: { summary: string; files: string[] }): Promise<Prompt> {
    const prompt = this.store.require(id);
    if (prompt.state !== 'ready' && prompt.state !== 'building') {
      throw new PromptConflictError(`prompt ${id} is ${prompt.state} — an external agent can only report a ready or building prompt done`);
    }
    const finishedAt = now();
    const record: PromptBuildRecord = {
      id: `external-${finishedAt}`,
      startedAt: finishedAt,
      finishedAt,
      filesTouched: input.files,
      summary: input.summary,
    };
    return this.persist({ ...prompt, state: 'built', builds: [...prompt.builds, record], updatedAt: finishedAt });
  }

  /** `status.claude` on `GET /api/state` (S11 brief) — a thin passthrough to the runner's own
   * status, so `http.ts` never needs to know the runner's internals. */
  claudeStatus(): ClaudeStatus {
    return this.runner.status();
  }

  /** Await every `build()` call currently in flight — see `pendingBuilds` above. Never
   * rejects: a build's own failure is already caught and persisted inside `finishBuild`
   * (it never reaches this promise as a rejection); `allSettled` is defence for anything
   * that still manages to throw. */
  async close(): Promise<void> {
    await Promise.allSettled([...this.pendingBuilds]);
  }
}
