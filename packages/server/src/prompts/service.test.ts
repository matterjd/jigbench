import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stubSurvey, type GaugeSet, type Mark, type Survey, type WorkOrderHuman } from '@jigbench/core';
import type { OllamaLike } from '../orders/drafters/ollama.js';
import type { BuildOutcome, BuildRunnerLike, ClaudeStatus, StartBuildInput } from '../build/types.js';
import { PromptStore } from './store.js';
import { PromptService } from './service.js';
import { ClaudeNotInstalledError, PolishUnavailableError, PromptBuildConflictError, PromptConflictError } from './errors.js';
import { PromptNotFoundError } from './store.js';

function emptyGauges(): GaugeSet {
  return { jigFormat: 1, gauges: [], generatedAt: new Date().toISOString() };
}

class FakeOllama implements OllamaLike {
  readonly model = 'fake-model';
  availableValue = true;
  rewriteImpl: (text: string, instruction: string) => string = (text) => text;
  readonly rewriteCalls: string[] = [];

  async available(): Promise<boolean> {
    return this.availableValue;
  }

  async draft(_mark: Mark): Promise<WorkOrderHuman> {
    return { what: '', why: '', where: '', acceptance: [] };
  }

  async rewrite(text: string, instruction: string): Promise<string> {
    this.rewriteCalls.push(instruction);
    return this.rewriteImpl(text, instruction);
  }
}

class FakeRunner implements BuildRunnerLike {
  claudeAvailable = true;
  running: { promptId: string; buildId: string } | null = null;
  nextOutcome: BuildOutcome = { exitCode: 0, filesTouched: ['a.ts'], summary: 'done', transcriptPath: 't.jsonl', cancelled: false };
  starts: StartBuildInput[] = [];
  cancelled: string[] = [];
  private resolveStart?: (outcome: BuildOutcome) => void;
  /** When true, `start()` returns a promise this test controls the resolution of (via
   * `resolveNow`) — lets a test observe the `building` state BEFORE the outcome lands. */
  holdUntilResolved = false;

  async isClaudeAvailable(): Promise<boolean> {
    return this.claudeAvailable;
  }

  currentBuild() {
    return this.running;
  }

  status(): ClaudeStatus {
    return this.running ? { state: 'building', id: this.running.promptId, elapsed: 0 } : { state: 'idle' };
  }

  async start(input: StartBuildInput): Promise<BuildOutcome> {
    this.starts.push(input);
    this.running = { promptId: input.promptId, buildId: input.buildId };
    input.onEvent({ kind: 'init', sessionId: 'sess-1' }, 0);
    if (this.holdUntilResolved) {
      return new Promise<BuildOutcome>((resolve) => {
        this.resolveStart = (outcome) => {
          this.running = null;
          resolve(outcome);
        };
      });
    }
    this.running = null;
    return this.nextOutcome;
  }

  resolveNow(outcome: BuildOutcome = this.nextOutcome): void {
    this.resolveStart?.(outcome);
  }

  cancel(promptId: string): boolean {
    this.cancelled.push(promptId);
    if (this.running?.promptId === promptId) {
      this.running = null;
      return true;
    }
    return false;
  }
}

let repoRoot: string;
let store: PromptStore;
let runner: FakeRunner;
let ollama: FakeOllama;
let survey: Survey;
let service: PromptService;

// This suite deliberately exercises the "model available" path against `FakeOllama` — it
// must not inherit `JIG_NO_MODEL=1` from the ambient CI/S10 command
// (`JIG_NO_MODEL=1 npm test`), same isolation `http.test.ts` already documents and needs for
// exactly the same reason (its own "model" driver tests).
let priorJigNoModel: string | undefined;

beforeEach(async () => {
  priorJigNoModel = process.env.JIG_NO_MODEL;
  delete process.env.JIG_NO_MODEL;
  repoRoot = await mkdtemp(join(tmpdir(), 'jig-prompt-service-'));
  store = new PromptStore(repoRoot);
  await store.init();
  runner = new FakeRunner();
  ollama = new FakeOllama();
  survey = stubSurvey();
  service = new PromptService({
    store,
    survey: () => survey,
    gauges: () => emptyGauges(),
    ollama,
    runner,
  });
});

afterEach(async () => {
  if (priorJigNoModel === undefined) delete process.env.JIG_NO_MODEL;
  else process.env.JIG_NO_MODEL = priorJigNoModel;
  await rm(repoRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('PromptService.create/edit', () => {
  it('creates a draft prompt with an empty context', async () => {
    const prompt = await service.create({ requirement: 'Show days overdue' });
    expect(prompt.state).toBe('draft');
    expect(prompt.context.files).toEqual([]);
  });

  it('edit() merges requirement/acceptance while draft or ready', async () => {
    const prompt = await service.create({ requirement: 'v1' });
    const edited = await service.edit(prompt.id, { requirement: 'v2', acceptance: ['a'] });
    expect(edited.requirement).toBe('v2');
    expect(edited.acceptance).toEqual(['a']);
  });

  it('edit() rejects unknown keys (strict schema)', async () => {
    const prompt = await service.create({ requirement: 'v1' });
    await expect(service.edit(prompt.id, { nope: true })).rejects.toThrow();
  });

  it('edit() throws PromptConflictError once the prompt is building or built', async () => {
    const prompt = await service.create({ requirement: 'v1' });
    await service.ready(prompt.id);
    runner.holdUntilResolved = true;
    await service.build(prompt.id);
    await expect(service.edit(prompt.id, { requirement: 'v2' })).rejects.toBeInstanceOf(PromptConflictError);
  });

  it('unknown id throws PromptNotFoundError', async () => {
    await expect(service.edit('9999', { requirement: 'x' })).rejects.toBeInstanceOf(PromptNotFoundError);
  });
});

describe('PromptService.ready', () => {
  it('draft -> ready, regenerating context from the current survey', async () => {
    survey = {
      ...stubSurvey(),
      stub: false,
      components: [{ name: 'InvoiceListComponent', selector: 'app-invoice-list', file: 'src/invoice-list.ts', standalone: true, inline: false, inputs: [], outputs: [], styleUrls: [] }],
    };
    const prompt = await service.create({ requirement: 'Show days overdue', target: { kind: 'element', component: 'InvoiceListComponent' } });
    const ready = await service.ready(prompt.id);
    expect(ready.state).toBe('ready');
    expect(ready.context.components[0]?.name).toBe('InvoiceListComponent');
  });

  it('throws PromptConflictError when the prompt is not draft', async () => {
    const prompt = await service.create({ requirement: 'x' });
    await service.ready(prompt.id);
    await expect(service.ready(prompt.id)).rejects.toBeInstanceOf(PromptConflictError);
  });
});

describe('PromptService.scrap/restore', () => {
  it('scrap records scrappedFrom; restore puts it back', async () => {
    const prompt = await service.create({ requirement: 'x' });
    await service.ready(prompt.id);
    const scrapped = await service.scrap(prompt.id);
    expect(scrapped.state).toBe('scrapped');
    expect(scrapped.scrappedFrom).toBe('ready');

    const restored = await service.restore(prompt.id);
    expect(restored.state).toBe('ready');
    expect(restored.scrappedFrom).toBeUndefined();
  });

  it('restore throws PromptConflictError on a non-scrapped prompt', async () => {
    const prompt = await service.create({ requirement: 'x' });
    await expect(service.restore(prompt.id)).rejects.toBeInstanceOf(PromptConflictError);
  });
});

describe('PromptService.polish', () => {
  it('returns a rewritten requirement and parsed acceptance bullets, without persisting anything', async () => {
    ollama.rewriteImpl = (_text, instruction) =>
      instruction.includes('Suggest') ? '- Overdue shows a badge\n- On-time shows nothing' : 'A tighter requirement.';
    const prompt = await service.create({ requirement: 'raw ask' });
    const result = await service.polish(prompt.id);
    expect(result.requirement).toBe('A tighter requirement.');
    expect(result.acceptance).toEqual(['Overdue shows a badge', 'On-time shows nothing']);

    // never automatic — the prompt on disk is untouched by polish() itself.
    expect(store.get(prompt.id)?.requirement).toBe('raw ask');
  });

  it('throws PolishUnavailableError (404-style honest error) when no model is reachable', async () => {
    ollama.availableValue = false;
    const prompt = await service.create({ requirement: 'x' });
    await expect(service.polish(prompt.id)).rejects.toBeInstanceOf(PolishUnavailableError);
  });

  it('throws PolishUnavailableError when JIG_NO_MODEL=1, even though the fake reports available', async () => {
    const prior = process.env.JIG_NO_MODEL;
    process.env.JIG_NO_MODEL = '1';
    try {
      const prompt = await service.create({ requirement: 'x' });
      await expect(service.polish(prompt.id)).rejects.toBeInstanceOf(PolishUnavailableError);
    } finally {
      if (prior === undefined) delete process.env.JIG_NO_MODEL;
      else process.env.JIG_NO_MODEL = prior;
    }
  });

  it('throws PolishUnavailableError when no ollama was configured at all', async () => {
    const noModelService = new PromptService({ store, survey: () => survey, gauges: () => emptyGauges(), runner });
    const prompt = await noModelService.create({ requirement: 'x' });
    await expect(noModelService.polish(prompt.id)).rejects.toBeInstanceOf(PolishUnavailableError);
  });
});

describe('PromptService.build', () => {
  it('ready -> building immediately, then -> built on a successful outcome', async () => {
    const prompt = await service.create({ requirement: 'x' });
    await service.ready(prompt.id);
    runner.holdUntilResolved = true;

    const { buildId } = await service.build(prompt.id);
    expect(store.get(prompt.id)?.state).toBe('building');

    runner.resolveNow({ exitCode: 0, filesTouched: ['x.ts'], summary: 'ok', transcriptPath: 't.jsonl', cancelled: false });
    await service.close();

    const built = store.get(prompt.id)!;
    expect(built.state).toBe('built');
    expect(built.builds).toHaveLength(1);
    expect(built.builds[0]!.id).toBe(buildId);
    expect(built.builds[0]!.filesTouched).toEqual(['x.ts']);
  });

  it('a non-zero exit code goes back to ready, with the failed build recorded', async () => {
    const prompt = await service.create({ requirement: 'x' });
    await service.ready(prompt.id);
    runner.nextOutcome = { exitCode: 1, filesTouched: [], summary: 'compile error', transcriptPath: 't.jsonl', cancelled: false };

    await service.build(prompt.id);
    await service.close();

    const failed = store.get(prompt.id)!;
    expect(failed.state).toBe('ready');
    expect(failed.builds).toHaveLength(1);
    expect(failed.builds[0]!.exitCode).toBe(1);
  });

  it('throws PromptConflictError when the prompt is not ready', async () => {
    const prompt = await service.create({ requirement: 'x' });
    await expect(service.build(prompt.id)).rejects.toBeInstanceOf(PromptConflictError);
  });

  it('a second build call while one is running throws PromptBuildConflictError naming the running id', async () => {
    const a = await service.create({ requirement: 'a' });
    await service.ready(a.id);
    const b = await service.create({ requirement: 'b' });
    await service.ready(b.id);

    runner.holdUntilResolved = true;
    const { buildId } = await service.build(a.id);

    const err = await service.build(b.id).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PromptBuildConflictError);
    expect((err as PromptBuildConflictError).runningPromptId).toBe(a.id);
    expect((err as PromptBuildConflictError).runningBuildId).toBe(buildId);
  });

  it('throws ClaudeNotInstalledError when the runner reports claude is not on PATH', async () => {
    runner.claudeAvailable = false;
    const prompt = await service.create({ requirement: 'x' });
    await service.ready(prompt.id);
    await expect(service.build(prompt.id)).rejects.toBeInstanceOf(ClaudeNotInstalledError);
    expect(store.get(prompt.id)?.state).toBe('ready'); // never flipped to building
  });

  it('cancel() requests the runner cancel the running build for this id', async () => {
    const prompt = await service.create({ requirement: 'x' });
    await service.ready(prompt.id);
    runner.holdUntilResolved = true;
    await service.build(prompt.id);

    service.cancel(prompt.id);
    expect(runner.cancelled).toEqual([prompt.id]);
  });

  it('cancel() throws PromptConflictError when nothing is running for this id', async () => {
    const prompt = await service.create({ requirement: 'x' });
    await service.ready(prompt.id);
    expect(() => service.cancel(prompt.id)).toThrow(PromptConflictError);
  });

  it('forwards build-stream events via onBuildEvent', async () => {
    const onBuildEvent = vi.fn();
    const withEvents = new PromptService({ store, survey: () => survey, gauges: () => emptyGauges(), ollama, runner, onBuildEvent });
    const prompt = await withEvents.create({ requirement: 'x' });
    await withEvents.ready(prompt.id);
    await withEvents.build(prompt.id);
    await withEvents.close();
    expect(onBuildEvent).toHaveBeenCalledWith(prompt.id, { kind: 'init', sessionId: 'sess-1' }, 0);
  });
});

describe('PromptService.markBuiltExternally', () => {
  it('moves a ready prompt straight to built with the reported files/summary', async () => {
    const prompt = await service.create({ requirement: 'x' });
    await service.ready(prompt.id);
    const built = await service.markBuiltExternally(prompt.id, { summary: 'agent did it', files: ['z.ts'] });
    expect(built.state).toBe('built');
    expect(built.builds[0]!.summary).toBe('agent did it');
    expect(built.builds[0]!.filesTouched).toEqual(['z.ts']);
  });

  it('throws PromptConflictError from draft/built/scrapped', async () => {
    const prompt = await service.create({ requirement: 'x' });
    await expect(service.markBuiltExternally(prompt.id, { summary: 's', files: [] })).rejects.toBeInstanceOf(PromptConflictError);
  });
});

describe('PromptService.claudeStatus', () => {
  it('passes through the runner status', () => {
    expect(service.claudeStatus()).toEqual({ state: 'idle' });
  });
});
