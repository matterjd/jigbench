export { createJigServer } from './http.js';
export type { CreateJigServerOptions, JigServerHandle } from './http.js';

export { JigStore } from './store.js';
export type { JigState, Wiring, WiringStatus } from './store.js';

export { initJigTree } from './init-tree.js';
export type { InitJigTreeResult } from './init-tree.js';

export { runSurvey } from './run-survey.js';
export type { RunSurveyResult } from './run-survey.js';

export { clampDocs } from './docs/clamp.js';
export type { ClampDocsOptions, ClampDocsResult } from './docs/clamp.js';

export { contextForPrompt } from './docs/context.js';
export type { DocsContext, DocsContextChunk } from './docs/context.js';

export { createDocsRoute } from './docs/route.js';

export { extractPdfText } from './docs/pdf.js';

export { atomicWriteFile } from './atomic-write.js';

export { chooseBenchServeMode, attachBenchServing } from './bench-serve.js';
export type { BenchServeMode } from './bench-serve.js';

export {
  HumanDrafter,
  NullDrafter,
  StubPlateHost,
} from './seams.js';
export type { Drafter, DrafterContext, PlateHost, SurveyAdapter } from './seams.js';

export { createPlateProxy } from './plate/proxy.js';
export type { CreatePlateProxyOptions, PlateInterceptor, PlateProxyHandle, PlateStatus } from './plate/proxy.js';
export type { PlateHeaderChange } from './plate/rewrite.js';

export { logger } from './logger.js';
export type { Logger, LogLevel } from './logger.js';

// S8: OrdersService.reportDone/claim are the exact methods S6's `jig_report`/`jig_claim` MCP
// tools call — exported here so the MCP layer never has to reimplement the ladder rules
// `http.ts`'s own `/report`/`/claim` routes already delegate to.
export { OrdersService } from './orders/service.js';
export type { DrafterInfo, OrdersServiceOptions, PickInput } from './orders/service.js';
export { OrderConflictError, OrderNotFoundError } from './orders/errors.js';

export { ToolpathStore, ToolpathNotFoundError } from './toolpath/store.js';
export type { CreateToolpathInput, ToolpathWiringSink, ToolpathWiringStatus } from './toolpath/store.js';

// S6: the MCP stdio server — `packages/cli/src/commands/mcp.ts` is the only external
// caller, wiring these onto the same JigStore/OrdersService/FixtureStore the CLI's other
// commands (and, in `jigbench` with no subcommand, the bench server) already construct.
export { createJigMcpServer, formatClientLabel } from './mcp/server.js';
export type { CreateJigMcpServerOptions } from './mcp/server.js';

// S7 (fixtures) — exported here for the same reason: `jigbench mcp` constructs its own
// FixtureStore (jig_fixture reads it) the same way `createJigServer` already does.
export { FixtureStore, FixtureNameConflictError, FixtureNotFoundError, FixtureScrappedError } from './fixtures/store.js';
export type { CreateFixtureInput, FixtureWiringSink, FixtureWiringStatus } from './fixtures/store.js';
