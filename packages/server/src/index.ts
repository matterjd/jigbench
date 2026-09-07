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
// Exported so a caller (the CLI's own mcp.test.ts) can assert the shop heartbeat file is
// actually gone once a clean shutdown's promise resolves, without reaching into ./mcp/*.
export { readShopHeartbeat, shopHeartbeatFile } from './mcp/heartbeat.js';

// S7 (fixtures) — exported here for the same reason: `jigbench mcp` constructs its own
// FixtureStore (jig_fixture reads it) the same way `createJigServer` already does.
export { FixtureStore, FixtureNameConflictError, FixtureNotFoundError, FixtureScrappedError } from './fixtures/store.js';
export type { CreateFixtureInput, FixtureWiringSink, FixtureWiringStatus } from './fixtures/store.js';

// === S11 prompts + build runner — exported for the CLI's `build`/`prompts` commands, which
// (like `mcp.ts` already does for JigStore/OrdersService/FixtureStore) construct their own
// PromptStore/PromptService/BuildRunner rather than reaching into packages/server/src/* ===
export { PromptStore, PromptNotFoundError } from './prompts/store.js';
export type { CreatePromptInput } from './prompts/store.js';
export { PromptService, PromptEditSchema } from './prompts/service.js';
export type { PolishResult, PromptServiceOptions } from './prompts/service.js';
export { ClaudeNotInstalledError, PolishUnavailableError, PromptBuildConflictError, PromptConflictError } from './prompts/errors.js';
export { BuildRunner } from './build/runner.js';
export type { BuildRunnerOptions } from './build/runner.js';
export type { BuildOutcome, BuildRunnerLike, BuildStreamEvent, ClaudeStatus, StartBuildInput } from './build/types.js';
// === end S11 block ===

// === S17a — setup happens in the app: the server side (AMENDMENT-1 §7, A6) ===
// `bench/host.ts`'s `createBenchHost` is reached through `createJigServer` (repoRoot
// omitted) for the CLI; exported directly here too for a caller (S17b, or a test) that wants
// the host-specific option/handle shapes without going through that indirection.
export { createBenchHost } from './bench/host.js';
export type { BenchHostHandle, CreateBenchHostOptions } from './bench/host.js';
export { createBench } from './bench/bench.js';
export type { Bench, CreateBenchOptions } from './bench/bench.js';
export { validateClampPath } from './bench/validate-clamp-path.js';
export type { ClampPathValidation } from './bench/validate-clamp-path.js';
export { defaultRecentBenchesFile, readRecentBenches, recordRecentBench, updateRecentBench } from './bench/recent.js';
export type { RecentBenchEntry, RecentBenchPatch } from './bench/recent.js';
export { attachFsRoute } from './fs/route.js';
export type { FsListEntry, FsRootEntry } from './fs/route.js';
export { detectDevScript } from './target/detect.js';
export type { DetectedTarget } from './target/detect.js';
export { TargetRunner } from './target/runner.js';
export type { StartTargetInput, TargetRunnerLike, TargetRunnerOptions, TargetState } from './target/runner.js';
export { attachTargetRoute } from './target/route.js';
export type { TargetBenchView, TargetRouteContext } from './target/route.js';
export { attachSetupRoute } from './setup/route.js';
export type { SetupBenchView, SetupRouteContext } from './setup/route.js';
export { mergeMcpJson, formatMcpJsonDiff } from './setup/mcp-json.js';
export { claudeDesktopConfigPath, mergeClaudeDesktopConfig, formatClaudeDesktopConfigDiff } from './setup/desktop-config.js';
export { isSameOriginOrAbsent } from './same-origin.js';
// === end S17a block ===
