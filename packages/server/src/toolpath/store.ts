import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { jigPaths, nextToolpathId, JIG_FORMAT, type Toolpath, type ToolpathStep, type ToolpathSummary } from '@jigbench/core';
import { atomicWriteFile } from '../atomic-write.js';
import { pathExists } from '../fs-util.js';
import { logger } from '../logger.js';

export type ToolpathWiringStatus = 'wired' | 'none';

/** The bridge to `JigStore`, the same shape `fixtures/store.ts`'s `FixtureWiringSink` uses —
 * this store owns toolpath data/persistence; `JigStore` only needs the wiring status for
 * `GET /api/state`. A narrow interface, not the concrete `JigStore` class, so tests here
 * never need a real one. */
export interface ToolpathWiringSink {
  setToolpathWiring(status: ToolpathWiringStatus): void;
}

const noopSink: ToolpathWiringSink = {
  setToolpathWiring() {},
};

export interface CreateToolpathInput {
  name: string;
  startUrl?: string;
  steps: ToolpathStep[];
}

export class ToolpathNotFoundError extends Error {
  constructor(id: string) {
    super(`no toolpath with id "${id}"`);
    this.name = 'ToolpathNotFoundError';
  }
}

function summaryOf(toolpath: Toolpath): ToolpathSummary {
  const { id, name, createdAt, startUrl, steps, scrapped, scrappedAt } = toolpath;
  return { id, name, createdAt, startUrl, stepCount: steps.length, scrapped, scrappedAt };
}

/**
 * F11 / CHASSIS.md's toolpath scrubber, Law II ("scrapped, never deleted"): the on-disk
 * index of everything under `.jig/toolpaths/<id>.json`. Recording/replay pacing lives
 * entirely in `packages/bench/src/toolpath/*` (the bench is the one place that can see the
 * plate's postMessage traffic) — this class is purely persistence + lifecycle, the exact
 * same shape as `fixtures/store.ts`'s `FixtureStore`.
 */
export class ToolpathStore {
  private readonly dir: string;
  private readonly toolpaths = new Map<string, Toolpath>();

  constructor(
    private readonly repoRoot: string,
    private readonly sink: ToolpathWiringSink = noopSink,
  ) {
    this.dir = jigPaths(repoRoot).toolpaths;
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    this.toolpaths.clear();
    const entries = (await pathExists(this.dir)) ? await readdir(this.dir) : [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(await readFile(join(this.dir, entry), 'utf8')) as Toolpath;
        this.toolpaths.set(raw.id, raw);
      } catch (err) {
        logger.warn(`toolpath ${entry} failed to parse; skipping it`, String(err));
      }
    }
    this.recomputeWiring();
  }

  list(): ToolpathSummary[] {
    return [...this.toolpaths.values()].map(summaryOf).sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): Toolpath | undefined {
    return this.toolpaths.get(id);
  }

  async create(input: CreateToolpathInput): Promise<Toolpath> {
    const name = input.name.trim();
    if (!name) throw new Error('a toolpath name is required');
    const id = nextToolpathId([...this.toolpaths.keys()]);

    const toolpath: Toolpath = {
      jigFormat: JIG_FORMAT,
      id,
      name,
      createdAt: new Date().toISOString(),
      ...(input.startUrl ? { startUrl: input.startUrl } : {}),
      steps: input.steps,
    };

    await this.persist(toolpath);
    this.toolpaths.set(id, toolpath);
    this.recomputeWiring();
    return toolpath;
  }

  async scrap(id: string): Promise<Toolpath> {
    const updated: Toolpath = { ...this.require(id), scrapped: true, scrappedAt: new Date().toISOString() };
    await this.persist(updated);
    this.toolpaths.set(id, updated);
    return updated;
  }

  async restore(id: string): Promise<Toolpath> {
    const current = this.require(id);
    const updated: Toolpath = { ...current };
    delete updated.scrapped;
    delete updated.scrappedAt;
    await this.persist(updated);
    this.toolpaths.set(id, updated);
    return updated;
  }

  private require(id: string): Toolpath {
    const toolpath = this.toolpaths.get(id);
    if (!toolpath) throw new ToolpathNotFoundError(id);
    return toolpath;
  }

  private async persist(toolpath: Toolpath): Promise<void> {
    await atomicWriteFile(join(this.dir, `${toolpath.id}.json`), JSON.stringify(toolpath, null, 2) + '\n');
  }

  private recomputeWiring(): void {
    this.sink.setToolpathWiring(this.toolpaths.size > 0 ? 'wired' : 'none');
  }
}
