import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  jigPaths,
  nextSketchId,
  JIG_FORMAT,
  type Sketch,
  type SketchLink,
  type SketchElement,
  type SketchSummary,
} from '@jigbench/core';
import { atomicWriteFile } from '../atomic-write.js';
import { pathExists } from '../fs-util.js';
import { logger } from '../logger.js';

export type SketchWiringStatus = 'wired' | 'none';

/** The bridge to `JigStore`, the same narrow-interface shape `fixtures/store.ts`'s
 * `FixtureWiringSink` and `toolpath/store.ts`'s `ToolpathWiringSink` already use — this store
 * owns sketch data/persistence entirely; `JigStore` only needs the wiring status for `GET
 * /api/state`. Kept as its own interface (not the concrete `JigStore` class) so tests here
 * never need a real one. */
export interface SketchWiringSink {
  setSketchWiring(status: SketchWiringStatus): void;
}

const noopSink: SketchWiringSink = {
  setSketchWiring() {},
};

export interface CreateSketchInput {
  name: string;
  size: { w: number; h: number };
}

export interface UpdateSketchInput {
  name: string;
  size: { w: number; h: number };
  elements: SketchElement[];
  links: SketchLink[];
}

export class SketchNotFoundError extends Error {
  constructor(id: string) {
    super(`no sketch with id "${id}"`);
    this.name = 'SketchNotFoundError';
  }
}

function summaryOf(sketch: Sketch): SketchSummary {
  const { id, name, createdAt, updatedAt, size, elements, scrapped, scrappedAt } = sketch;
  return { id, name, createdAt, updatedAt, size, elementCount: elements.length, scrapped, scrappedAt };
}

/**
 * F9 / CHASSIS.md's Sketch tool, Law II ("scrapped, never deleted"): the on-disk index of
 * everything under `.jig/sketches/<id>.json`. The exact same shape as `FixtureStore`/
 * `ToolpathStore` (init rebuilds from disk, every write is atomic), plus `update` — a sketch
 * is the one of the three whose OWN content changes after creation (dragging an element,
 * adding a hotspot), not just its lifecycle state.
 */
export class SketchStore {
  private readonly dir: string;
  private readonly sketches = new Map<string, Sketch>();

  constructor(
    private readonly repoRoot: string,
    private readonly sink: SketchWiringSink = noopSink,
  ) {
    this.dir = jigPaths(repoRoot).sketches;
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    this.sketches.clear();
    const entries = (await pathExists(this.dir)) ? await readdir(this.dir) : [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(await readFile(join(this.dir, entry), 'utf8')) as Sketch;
        this.sketches.set(raw.id, raw);
      } catch (err) {
        logger.warn(`sketch ${entry} failed to parse; skipping it`, String(err));
      }
    }
    this.recomputeWiring();
  }

  list(): SketchSummary[] {
    return [...this.sketches.values()].map(summaryOf).sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): Sketch | undefined {
    return this.sketches.get(id);
  }

  async create(input: CreateSketchInput): Promise<Sketch> {
    const name = input.name.trim();
    if (!name) throw new Error('a sketch name is required');
    const id = nextSketchId([...this.sketches.keys()]);
    const now = new Date().toISOString();

    const sketch: Sketch = {
      jigFormat: JIG_FORMAT,
      id,
      name,
      createdAt: now,
      updatedAt: now,
      size: input.size,
      elements: [],
      links: [],
    };

    await this.persist(sketch);
    this.sketches.set(id, sketch);
    this.recomputeWiring();
    return sketch;
  }

  async update(id: string, input: UpdateSketchInput): Promise<Sketch> {
    const current = this.require(id);
    const updated: Sketch = {
      ...current,
      name: input.name.trim() || current.name,
      size: input.size,
      elements: input.elements,
      links: input.links,
      updatedAt: new Date().toISOString(),
    };
    await this.persist(updated);
    this.sketches.set(id, updated);
    return updated;
  }

  async scrap(id: string): Promise<Sketch> {
    const updated: Sketch = { ...this.require(id), scrapped: true, scrappedAt: new Date().toISOString() };
    await this.persist(updated);
    this.sketches.set(id, updated);
    return updated;
  }

  async restore(id: string): Promise<Sketch> {
    const current = this.require(id);
    const updated: Sketch = { ...current };
    delete updated.scrapped;
    delete updated.scrappedAt;
    await this.persist(updated);
    this.sketches.set(id, updated);
    return updated;
  }

  private require(id: string): Sketch {
    const sketch = this.sketches.get(id);
    if (!sketch) throw new SketchNotFoundError(id);
    return sketch;
  }

  private async persist(sketch: Sketch): Promise<void> {
    await atomicWriteFile(join(this.dir, `${sketch.id}.json`), JSON.stringify(sketch, null, 2) + '\n');
  }

  private recomputeWiring(): void {
    this.sink.setSketchWiring(this.sketches.size > 0 ? 'wired' : 'none');
  }
}
