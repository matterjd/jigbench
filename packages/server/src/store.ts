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
  type WiringStatus,
  type WorkOrder,
} from '@jigbench/core';
import { atomicWriteFile } from './atomic-write.js';
import { pathExists } from './fs-util.js';
import { logger } from './logger.js';
import { isHeartbeatFresh, readShopHeartbeatRaw, type ShopHeartbeatFile } from './mcp/heartbeat.js';

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
  private docsWired = false;
  private proxyWired = false;
  // === S6 (EXECUTION-PLAN.md §4 S6): the shop wiring bridge — read-only from JigStore's
  // side. mcp/heartbeat.ts's ShopHeartbeat (a SEPARATE process, ADR-001) owns writing
  // .jig/cache/shop.json; reload() re-reads it, the same relationship docsWired already has
  // with .jig/survey/docs.json above. Wave-4 council finding 3 (HIGH): this caches the RAW
  // record (including lastSeen), UNFILTERED by freshness — getWiring()/getShopInfo() below
  // re-run isHeartbeatFresh() against it on every call, so "the agent crashed and never
  // wrote again" goes back to 'none' the moment something asks, not only the next time a
  // .jig/ file event happens to trigger another reload(). ===
  private shopHeartbeat: ShopHeartbeatFile | null = null;
  // === end S6 block ===
  // === S5 orders: drafter wiring (delimited block; owned by packages/server/src/orders/*) ===
  private drafterWiring: WiringStatus = 'stub';
  // === end S5 orders block ===
  // --- S7 (fixtures): activeFixture bridge --------------------------------------------
  // Fixture data (generation, persistence, scrap/restore) lives entirely in
  // packages/server/src/fixtures/* — this store never imports it (server's own store
  // stays fixture-shape-agnostic, same reasoning as gauges/survey). FixtureStore calls
  // these two setters on load/unload/create/scrap so getWiring() and GET /api/plate can
  // report the active fixture without owning any fixture logic themselves.
  private activeFixtureName: string | null = null;
  private fixtureWiring: WiringStatus = 'none';
  // --- S8 (toolpath): wiring bridge, same shape as the S7 fixture bridge above -----------
  // Toolpath data/persistence lives entirely in packages/server/src/toolpath/store.ts (this
  // store never imports it) — ToolpathStore calls this setter on init/create/scrap/restore
  // so GET /api/state can report wiring.toolpath without owning any toolpath logic itself.
  private toolpathWiring: WiringStatus = 'none';
  // --- end S8 toolpath block --------------------------------------------------------------

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
    this.docsWired = await this.loadDocsWiring();
    this.shopHeartbeat = await readShopHeartbeatRaw(this.repoRoot); // S6
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

  /** S2b — the docs clamp. `docs.json`'s existence alone is enough to say "wired": unlike
   * the survey there is no stub-vs-real distinction here, so this never reports 'stub'. */
  private async loadDocsWiring(): Promise<boolean> {
    return pathExists(join(this.paths.survey, 'docs.json'));
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

  /** Called once by `http.ts` when a real `PlateHost` (S3's proxy, not `StubPlateHost`) is
   * wired into the running server — flips `wiring.proxy` from S1's honest "none" to "wired"
   * so the bench's SIM strip reports it without this store needing to know anything about
   * the proxy itself. */
  setProxyWired(wired: boolean): void {
    this.proxyWired = wired;
  }

  // === S5 orders: drafter wiring + generic work-order mutation (delimited block) ===
  /** Called by `orders/service.ts` once it has actually asked whether a driver is
   * reachable — never eagerly at boot, so a server nobody has drafted through yet still
   * reports the honest S1 default ('stub': a human fills the face). */
  setDrafterWiring(status: WiringStatus): void {
    this.drafterWiring = status;
  }

  getWorkOrder(id: string): WorkOrder | undefined {
    return this.workOrders.find((w) => w.id === id);
  }

  getMark(id: string): Mark | undefined {
    return this.marks.find((m) => m.id === id);
  }

  /** Read-modify-write for a work order already on disk: replaces the in-memory copy and
   * rewrites its file atomically. `orders/service.ts` owns every rule about WHEN a
   * mutation is legal (ladder transitions, edit windows) — this just persists whatever
   * `WorkOrder` it is handed. */
  async writeWorkOrder(next: WorkOrder): Promise<void> {
    const idx = this.workOrders.findIndex((w) => w.id === next.id);
    if (idx === -1) throw new Error(`writeWorkOrder: no such work order ${next.id}`);
    await atomicWriteFile(join(this.paths.workOrders, `${next.id}-${next.slug}.md`), serializeWorkOrder(next));
    this.workOrders[idx] = next;
  }
  // === end S5 orders block ===
  // --- S7 (fixtures): activeFixture bridge --------------------------------------------
  // === S6 (EXECUTION-PLAN.md §4 S6): the shop's own name/connectedAt, when wired — exposed
  // for `http.ts` to fold into `GET /api/state`'s `shop` field so the bench's ShopLane can
  // show WHO is connected, not just whether `wiring.shop === 'wired'`. ===
  getShopInfo(): { client: string; connectedAt: string } | null {
    // Freshness is judged HERE, at call time, against the CURRENT clock — not baked in at
    // the last reload() (finding 3). A crashed agent's stale file still sits on disk until
    // something removes it, but it stops counting as "connected" the instant it goes stale,
    // with no further reload() required.
    if (!this.shopHeartbeat || !isHeartbeatFresh(this.shopHeartbeat.lastSeen)) return null;
    return { client: this.shopHeartbeat.client, connectedAt: this.shopHeartbeat.connectedAt };
  }
  // === end S6 block ===

  setActiveFixture(name: string | null): void {
    this.activeFixtureName = name;
  }

  getActiveFixture(): string | null {
    return this.activeFixtureName;
  }

  setFixtureWiring(status: WiringStatus): void {
    this.fixtureWiring = status;
  }
  // --- end S7 fixtures bridge ----------------------------------------------------------
  // --- S8 (toolpath): wiring setter, same shape as setFixtureWiring above ---------------
  setToolpathWiring(status: WiringStatus): void {
    this.toolpathWiring = status;
  }
  // --- end S8 toolpath bridge ------------------------------------------------------------

  getWiring(): Wiring {
    return {
      survey: this.survey.stub ? 'stub' : 'wired',
      proxy: this.proxyWired ? 'wired' : 'none',
      drafter: this.drafterWiring,
      shop: this.getShopInfo() ? 'wired' : 'none', // S6
      fixtures: this.fixtureWiring, // S7
      toolpath: this.toolpathWiring, // S8
      sketch: 'none',
      docs: this.docsWired ? 'wired' : 'none',
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
