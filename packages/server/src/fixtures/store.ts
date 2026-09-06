import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { jigPaths, slugify, type Fixture, type FixtureSummary, type Survey } from '@jigbench/core';
import { atomicWriteFile } from '../atomic-write.js';
import { pathExists } from '../fs-util.js';
import { logger } from '../logger.js';
import { generateFixture, hashSeed } from './generate.js';

export type FixtureWiringStatus = 'wired' | 'stub' | 'none';

/** The one bridge to `JigStore` (`packages/server/src/store.ts`'s small "S7 fixtures" block):
 * this store owns fixture data/persistence; `JigStore` only needs to know the active
 * fixture's NAME (for `GET /api/plate`) and the wiring status (for `GET /api/state`). Kept as
 * its own narrow interface — not the concrete `JigStore` class — so tests here never need a
 * real one. */
export interface FixtureWiringSink {
  setActiveFixture(name: string | null): void;
  setFixtureWiring(status: FixtureWiringStatus): void;
}

const noopSink: FixtureWiringSink = {
  setActiveFixture() {},
  setFixtureWiring() {},
};

export interface CreateFixtureInput {
  name: string;
  seed?: string | number;
}

export class FixtureNotFoundError extends Error {
  constructor(id: string) {
    super(`no fixture with id "${id}"`);
    this.name = 'FixtureNotFoundError';
  }
}

export class FixtureScrappedError extends Error {
  constructor(id: string) {
    super(`fixture "${id}" is scrapped — restore it before loading`);
    this.name = 'FixtureScrappedError';
  }
}

export class FixtureNameConflictError extends Error {
  constructor(name: string) {
    super(`a fixture named "${name}" already exists`);
    this.name = 'FixtureNameConflictError';
  }
}

function summaryOf(fixture: Fixture): FixtureSummary {
  const { id, name, seed, createdAt, scrapped, scrappedAt } = fixture;
  return { id, name, seed, createdAt, scrapped, scrappedAt };
}

/**
 * F10 / Law II ("fixtures are scrapped, not deleted"): the on-disk index of everything under
 * `.jig/fixtures/<id>.json`, plus which one (if any) is currently loaded. `generate.ts` does
 * the actual data generation; this class is purely persistence + lifecycle (create / load /
 * unload / scrap / restore) — there is deliberately no `delete`.
 */
export class FixtureStore {
  private readonly dir: string;
  private readonly fixtures = new Map<string, Fixture>();
  private activeId: string | null = null;

  constructor(
    private readonly repoRoot: string,
    private readonly sink: FixtureWiringSink = noopSink,
  ) {
    this.dir = jigPaths(repoRoot).fixtures;
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    this.fixtures.clear();
    this.activeId = null;
    const entries = (await pathExists(this.dir)) ? await readdir(this.dir) : [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(await readFile(join(this.dir, entry), 'utf8')) as Fixture;
        this.fixtures.set(raw.id, raw);
      } catch (err) {
        logger.warn(`fixture ${entry} failed to parse; skipping it`, String(err));
      }
    }
    this.sink.setActiveFixture(null);
    this.recomputeWiring();
  }

  list(): FixtureSummary[] {
    return [...this.fixtures.values()].map(summaryOf).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  get(id: string): Fixture | undefined {
    return this.fixtures.get(id);
  }

  getActive(): Fixture | undefined {
    return this.activeId ? this.fixtures.get(this.activeId) : undefined;
  }

  async create(input: CreateFixtureInput, survey: Survey): Promise<Fixture> {
    const name = input.name.trim();
    if (!name) throw new Error('a fixture name is required');
    const id = slugify(name);
    if (this.fixtures.has(id)) throw new FixtureNameConflictError(name);

    const seed = input.seed ?? hashSeed(name);
    const fixture = generateFixture({ survey, seed, name });
    await this.persist(fixture);
    this.fixtures.set(fixture.id, fixture);
    this.recomputeWiring();
    return fixture;
  }

  async scrap(id: string): Promise<Fixture> {
    const updated: Fixture = { ...this.requireFixture(id), scrapped: true, scrappedAt: new Date().toISOString() };
    await this.persist(updated);
    this.fixtures.set(id, updated);
    if (this.activeId === id) this.unload();
    else this.recomputeWiring();
    return updated;
  }

  async restore(id: string): Promise<Fixture> {
    const current = this.requireFixture(id);
    const updated: Fixture = { ...current };
    delete updated.scrapped;
    delete updated.scrappedAt;
    await this.persist(updated);
    this.fixtures.set(id, updated);
    this.recomputeWiring();
    return updated;
  }

  load(id: string): Fixture {
    const fixture = this.requireFixture(id);
    if (fixture.scrapped) throw new FixtureScrappedError(id);
    this.activeId = id;
    this.sink.setActiveFixture(fixture.name);
    this.recomputeWiring();
    return fixture;
  }

  unload(): void {
    this.activeId = null;
    this.sink.setActiveFixture(null);
    this.recomputeWiring();
  }

  private requireFixture(id: string): Fixture {
    const fixture = this.fixtures.get(id);
    if (!fixture) throw new FixtureNotFoundError(id);
    return fixture;
  }

  private async persist(fixture: Fixture): Promise<void> {
    await atomicWriteFile(join(this.dir, `${fixture.id}.json`), JSON.stringify(fixture, null, 2) + '\n');
  }

  private recomputeWiring(): void {
    if (this.activeId) {
      this.sink.setFixtureWiring('wired');
      return;
    }
    this.sink.setFixtureWiring(this.fixtures.size > 0 ? 'stub' : 'none');
  }
}
