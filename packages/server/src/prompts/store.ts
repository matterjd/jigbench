import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  JIG_FORMAT,
  emptyPromptContext,
  jigPaths,
  migrateWorkOrder,
  nextPromptId,
  parsePrompt,
  parseWorkOrder,
  serializePrompt,
  slugify,
  type Prompt,
  type PromptContext,
  type PromptState,
  type PromptTarget,
} from '@jigbench/core';
import { atomicWriteFile } from '../atomic-write.js';
import { pathExists } from '../fs-util.js';
import { logger } from '../logger.js';

/**
 * S11 (AMENDMENT-1 A4, commission F5 "files are the state"): the on-disk index of
 * `.jig/prompts/<id>-<slug>.md`. Same shape as `store.ts`'s work-order handling — an
 * in-memory list rebuilt from disk, every write atomic — but standalone: prompts are a
 * distinct collection from work orders, not folded into `JigStore`.
 *
 * On first `init()`, if `.jig/work-orders/` exists and `.jig/prompts/` does not (yet) hold
 * any prompt files, every existing work order is migrated into a prompt file
 * (`core`'s `migrateWorkOrder`) — the OLD files are left exactly where they were (Law II:
 * nothing here ever deletes), and the migration is logged once.
 */

export class PromptNotFoundError extends Error {
  constructor(id: string) {
    super(`no such prompt: ${id}`);
    this.name = 'PromptNotFoundError';
  }
}

/** One work order the S11 migration could not turn into a prompt (CI run 34148382041: the
 * migration failure this recorded was previously visible ONLY in a server log line — a real
 * user with a v0.1 work order would have silently lost it). Exposed via `migrationSkipped()`
 * so a caller (`GET /api/state`'s `migration.skipped`, in particular) can surface it instead
 * of the migration just moving on. */
export interface MigrationSkip {
  /** The work-order filename under `.jig/work-orders/` that failed to migrate. */
  entry: string;
  /** `String(err)` from the failure — never swallowed. */
  error: string;
}

export interface CreatePromptInput {
  requirement: string;
  acceptance?: string[];
  target?: PromptTarget;
  context?: PromptContext;
}

export class PromptStore {
  readonly repoRoot: string;
  readonly paths: ReturnType<typeof jigPaths>;
  private prompts: Prompt[] = [];
  private migrationSkips: MigrationSkip[] = [];

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.paths = jigPaths(repoRoot);
  }

  async init(): Promise<void> {
    await mkdir(this.paths.prompts, { recursive: true });
    await this.migrateIfNeeded();
    await this.reload();
  }

  async reload(): Promise<void> {
    this.prompts = await this.loadAll();
  }

  /** Work orders the S11 migration could not turn into a prompt — empty when nothing was
   * skipped, or migration never ran. Never cleared across `reload()`; only a fresh `init()`
   * (a new process/instance) resets it, matching migration itself only ever running once. */
  migrationSkipped(): MigrationSkip[] {
    return [...this.migrationSkips];
  }

  private async hasAnyPromptFile(): Promise<boolean> {
    if (!(await pathExists(this.paths.prompts))) return false;
    const entries = await readdir(this.paths.prompts);
    return entries.some((e) => e.endsWith('.md'));
  }

  /** "on first load, if `.jig/work-orders/` exists and `.jig/prompts/` does not, migrate
   * (write prompts, leave the old files, log it)" (S11 brief). Guarded by "does not [yet
   * hold any prompt file]" rather than mere directory existence, so a server restarted
   * after `init()` already created the (now-empty-of-.md) `prompts/` directory doesn't
   * re-trigger — and re-running migration is otherwise harmless (it would just re-derive
   * the same prompts), this guard exists to avoid the log noise and duplicate writes. */
  private async migrateIfNeeded(): Promise<void> {
    const workOrdersExist = await pathExists(this.paths.workOrders);
    if (!workOrdersExist) return;
    if (await this.hasAnyPromptFile()) return;

    const entries = await readdir(this.paths.workOrders);
    let migrated = 0;
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      try {
        const wo = parseWorkOrder(await readFile(join(this.paths.workOrders, entry), 'utf8'));
        const prompt = migrateWorkOrder(wo);
        await atomicWriteFile(this.filePathFor(prompt), serializePrompt(prompt));
        migrated++;
      } catch (err) {
        const error = String(err);
        this.migrationSkips.push({ entry, error });
        logger.warn(`S11 migration: work order ${entry} failed to migrate to a prompt; skipping it`, error);
      }
    }
    if (migrated > 0) {
      logger.info(
        `S11 migration: ${migrated} work order(s) under .jig/work-orders/ migrated into .jig/prompts/ — the old files were left in place`,
        { repoRoot: this.repoRoot },
      );
    }
  }

  private async loadAll(): Promise<Prompt[]> {
    if (!(await pathExists(this.paths.prompts))) return [];
    const entries = await readdir(this.paths.prompts);
    const prompts: Prompt[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      try {
        prompts.push(parsePrompt(await readFile(join(this.paths.prompts, entry), 'utf8')));
      } catch (err) {
        logger.warn(`prompt ${entry} failed to parse; skipping it`, String(err));
      }
    }
    prompts.sort((a, b) => a.id.localeCompare(b.id));
    return prompts;
  }

  private filePathFor(prompt: Pick<Prompt, 'id' | 'slug'>): string {
    return join(this.paths.prompts, `${prompt.id}-${prompt.slug}.md`);
  }

  list(state?: PromptState): Prompt[] {
    const all = [...this.prompts];
    return state ? all.filter((p) => p.state === state) : all;
  }

  get(id: string): Prompt | undefined {
    return this.prompts.find((p) => p.id === id);
  }

  require(id: string): Prompt {
    const prompt = this.get(id);
    if (!prompt) throw new PromptNotFoundError(id);
    return prompt;
  }

  async create(input: CreatePromptInput): Promise<Prompt> {
    const id = nextPromptId(this.prompts.map((p) => p.id));
    const slug = slugify(input.requirement);
    const now = new Date().toISOString();
    const prompt: Prompt = {
      jigFormat: JIG_FORMAT,
      id,
      slug,
      state: 'draft',
      requirement: input.requirement,
      acceptance: input.acceptance ?? [],
      target: input.target ?? { kind: 'none' },
      context: input.context ?? emptyPromptContext(),
      builds: [],
      createdAt: now,
      updatedAt: now,
    };
    await atomicWriteFile(this.filePathFor(prompt), serializePrompt(prompt));
    this.prompts.push(prompt);
    return prompt;
  }

  /** Read-modify-write for a prompt already on disk — same contract as `store.ts`'s
   * `writeWorkOrder`: the caller (`PromptService`) owns every rule about when a mutation is
   * legal; this just persists whatever `Prompt` it is handed, atomically, and keeps the
   * in-memory index in sync. A rename (the file's `<id>-<slug>.md` name is derived from
   * `slug`, which never changes after creation in this slice) never happens here. */
  async write(prompt: Prompt): Promise<Prompt> {
    const idx = this.prompts.findIndex((p) => p.id === prompt.id);
    if (idx === -1) throw new PromptNotFoundError(prompt.id);
    await atomicWriteFile(this.filePathFor(prompt), serializePrompt(prompt));
    this.prompts[idx] = prompt;
    return prompt;
  }
}
