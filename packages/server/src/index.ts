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

export { logger } from './logger.js';
export type { Logger, LogLevel } from './logger.js';
