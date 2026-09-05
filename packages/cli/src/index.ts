// Programmatic surface, mostly for tests — `bin.ts` is the real entry point end users hit.
export { runServeCommand } from './commands/serve.js';
export type { ServeCommandOptions, ServeCommandResult } from './commands/serve.js';

export { runInitCommand } from './commands/init.js';
export type { InitCommandOptions, InitCommandResult } from './commands/init.js';

export { runSurveyCommand } from './commands/survey.js';
export type { SurveyCommandOptions, SurveyCommandResult } from './commands/survey.js';

export { runMcpCommand } from './commands/mcp.js';
export type { McpCommandOptions } from './commands/mcp.js';

export { resolveRepoRoot, findRepoRoot } from './repo-root.js';
export { printHuman } from './human-output.js';
