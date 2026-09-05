#!/usr/bin/env node
import { Command } from 'commander';
import { runServeCommand } from './commands/serve.js';
import { runInitCommand } from './commands/init.js';
import { runSurveyCommand } from './commands/survey.js';
import { runMcpCommand } from './commands/mcp.js';
import { printHuman } from './human-output.js';
import { logger } from '@jigbench/server';

// `--repo` is declared exactly once, on the root command, and every subcommand reads it
// back via `optsWithGlobals()`. Commander resolves a same-named option declared on both a
// parent and a child to the PARENT's opts — declaring it twice silently drops the value on
// the child's own `.opts()`, which is the bug this comment is here to stop someone
// reintroducing.
const program = new Command();
program
  .name('jigbench')
  .description('Jig — a local-first benchtop that clamps an app repo and surveys it')
  .version('0.1.0')
  .option('--repo <path>', 'the repo to clamp (default: cwd, walking up to a .git)');

program
  .option('--port <port>', 'port to serve the bench on', '4600')
  .option('--no-open', 'do not open the browser automatically')
  .option('--target <url>', 'the target app\'s own dev server, e.g. http://localhost:4200 (S3 plate)')
  .option('--plate-port <port>', 'port the plate proxy listens on (S3)', '4601')
  .action(async (opts: { repo?: string; port: string; open: boolean; target?: string; platePort: string }) => {
    try {
      const result = await runServeCommand({
        repo: opts.repo,
        port: Number.parseInt(opts.port, 10),
        open: opts.open,
        target: opts.target,
        platePort: Number.parseInt(opts.platePort, 10),
      });
      printHuman(result.message);
    } catch (err) {
      logger.error('jigbench serve failed', String(err));
      process.exitCode = 1;
    }
  });

program
  .command('init')
  .description('write the .jig/ skeleton and register jig in .mcp.json')
  .action(async (_opts: unknown, command: Command) => {
    try {
      const { repo } = command.optsWithGlobals<{ repo?: string }>();
      const result = await runInitCommand({ repo });
      printHuman(result.message);
    } catch (err) {
      logger.error('jigbench init failed', String(err));
      process.exitCode = 1;
    }
  });

program
  .command('survey')
  .description('survey the clamped repo')
  .action(async (_opts: unknown, command: Command) => {
    try {
      const { repo } = command.optsWithGlobals<{ repo?: string }>();
      const result = await runSurveyCommand({ repo });
      printHuman(result.message);
    } catch (err) {
      logger.error('jigbench survey failed', String(err));
      process.exitCode = 1;
    }
  });

program
  .command('mcp')
  .description('start the MCP stdio server')
  .action(async (_opts: unknown, command: Command) => {
    // No printHuman here on purpose — see commands/mcp.ts for why.
    try {
      const { repo } = command.optsWithGlobals<{ repo?: string }>();
      await runMcpCommand({ repo });
    } catch (err) {
      logger.error('jigbench mcp failed', String(err));
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);
