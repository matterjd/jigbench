import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  GaugeSetSchema,
  SurveySchema,
  jigPaths,
  nextWorkOrderId,
  parseWorkOrder,
  serializeWorkOrder,
  slugify,
  stubSurvey,
  type GaugeSet,
  type JigState,
  type Mark,
  type MarkTarget,
  type Survey,
  type Wiring,
  type WorkOrder,
} from '@jigbench/core';
import { atomicWriteFile } from './atomic-write.js';
import { pathExists } from './fs-util.js';
import { logger } from './logger.js';

// JigState/Wiring/WiringStatus are defined in @jigbench/core (jig-state.ts), not here —
// bench needs this exact shape and may only import core's types, never server's.
export type { JigState, Wiring, WiringStatus } from '@jigbench/core';

function emptyGaugeSet(): GaugeSet {
  return { jigFormat: 1, gauges: [], generatedAt: new Date().toISOString() };
}

/**
 * The one place `server` touches `.jig/` on disk. Files are the state (commission §5); this
 * store holds an in-memory index it rebuilds from disk on `init()`, and every write goes
 * through `atomicWriteFile` — a reader never observes a half-written work order.
 *
 * The `marks/*.json` cache under `.jig/cache/` is exactly that — a cache, not the store of
 * record. Losing it loses a mark's original DOM target/prompt provenance, never the work
 * order it produced (that file is the durable artifact).
 */
export class JigStore {
  readonly repoRoot: string;
  readonly paths: ReturnType<typeof jigPaths>;

  private survey: Survey = stubSurvey();
  private gauges: GaugeSet = emptyGaugeSet();
  private marks: Mark[] = [];
  private workOrders: WorkOrder[] = [];

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.paths = jigPaths(repoRoot);
  }

  async init(): Promise<void> {
    for (const dir of [
      this.paths.survey,
      this.paths.fixtures,
      this.paths.workOrders,
      this.paths.toolpaths,
      this.paths.sketches,
      this.paths.cache,
    ]) {
      await mkdir(dir, { recursive: true });
    }
    await this.reload();
  }

  /** Rebuild every in-memory index from what is actually on disk right now. */
  async reload(): Promise<void> {
    this.survey = await this.loadSurvey();
    this.gauges = await this.loadGauges();
    this.workOrders = await this.loadWorkOrders();
    this.marks = await this.loadMarksCache();
  }

  private async loadSurvey(): Promise<Survey> {
    const file = join(this.paths.survey, 'survey.json');
    if (!(await pathExists(file))) return stubSurvey();
    try {
      return SurveySchema.parse(JSON.parse(await readFile(file, 'utf8')));
    } catch (err) {
      logger.warn('survey.json failed to parse; falling back to a stub survey', String(err));
      return stubSurvey();
    }
  }

  private async loadGauges(): Promise<GaugeSet> {
    if (!(await pathExists(this.paths.gaugesFile))) return emptyGaugeSet();
    try {
      return GaugeSetSchema.parse(JSON.parse(await readFile(this.paths.gaugesFile, 'utf8')));
    } catch (err) {
      logger.warn('gauges.json failed to parse; falling back to an empty gauge set', String(err));
      return emptyGaugeSet();
    }
  }

  private async loadWorkOrders(): Promise<WorkOrder[]> {
    if (!(await pathExists(this.paths.workOrders))) return [];
    const entries = await readdir(this.paths.workOrders);
    const orders: WorkOrder[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      try {
        orders.push(parseWorkOrder(await readFile(join(this.paths.workOrders, entry), 'utf8')));
      } catch (err) {
        logger.warn(`work order ${entry} failed to parse; skipping it`, String(err));
      }
    }
    orders.sort((a, b) => a.id.localeCompare(b.id));
    return orders;
  }

  private marksCacheFile(): string {
    return join(this.paths.cache, 'marks.json');
  }

  private async loadMarksCache(): Promise<Mark[]> {
    const file = this.marksCacheFile();
    if (!(await pathExists(file))) return [];
    try {
      const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
      return Array.isArray(raw) ? (raw as Mark[]) : [];
    } catch (err) {
      logger.warn('marks cache failed to parse; starting empty — it is a cache, not the store of record', String(err));
      return [];
    }
  }

  private async writeMarksCache(): Promise<void> {
    await atomicWriteFile(this.marksCacheFile(), JSON.stringify(this.marks, null, 2) + '\n');
  }

  getWiring(): Wiring {
    return {
      survey: this.survey.stub ? 'stub' : 'wired',
      proxy: 'none',
      drafter: 'stub',
      shop: 'none',
      fixtures: 'none',
      toolpath: 'none',
      sketch: 'none',
    };
  }

  getState(): JigState {
    return {
      survey: this.survey,
      gauges: this.gauges,
      marks: [...this.marks],
      workOrders: [...this.workOrders],
      wiring: this.getWiring(),
    };
  }

  /** Creates a mark and its work order (state `marked`), writes the work-order file
   * atomically, and refreshes the marks cache. This is the one write path `POST
   * /api/marks` uses. */
  async createMarkAndWorkOrder(input: { target: MarkTarget; prompt: string }): Promise<{
    mark: Mark;
    workOrder: WorkOrder;
  }> {
    const markNumber = this.marks.length + 1;
    const mark: Mark = {
      id: `m-${String(markNumber).padStart(4, '0')}`,
      number: markNumber,
      target: input.target,
      prompt: input.prompt,
      createdAt: new Date().toISOString(),
    };

    const id = nextWorkOrderId(this.workOrders.map((w) => w.id));
    const slug = slugify(input.prompt);
    const workOrder: WorkOrder = {
      jigFormat: 1,
      id,
      slug,
      state: 'marked',
      draftedBy: 'person',
      marks: [mark.id],
      human: {
        what: input.prompt,
        why: '',
        where: input.target.component ?? input.target.file ?? input.target.path,
        acceptance: [],
      },
      log: [{ at: mark.createdAt, actor: 'bench', event: 'marked', ref: mark.id }],
    };
    mark.workOrderId = workOrder.id;

    await atomicWriteFile(join(this.paths.workOrders, `${id}-${slug}.md`), serializeWorkOrder(workOrder));

    this.marks.push(mark);
    this.workOrders.push(workOrder);
    await this.writeMarksCache();

    return { mark, workOrder };
  }
}
