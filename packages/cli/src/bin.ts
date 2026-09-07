#!/usr/bin/env node
import { Command } from 'commander';
import { runServeCommand } from './commands/serve.js';
import { runInitCommand } from './commands/init.js';
import { runSurveyCommand } from './commands/survey.js';
import { runClampCommand } from './commands/clamp.js';
import { runMcpCommand } from './commands/mcp.js';
import { runMcpInstallCommand } from './commands/mcp-install.js';
import { runBuildCommand } from './commands/build.js'; // S11
import { runPromptsCommand } from './commands/prompts.js'; // S11
import { printHuman, printSummary } from './human-output.js';
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
  .option('--host <host>', 'interface to bind to (default: loopback-only, 127.0.0.1)')
  .option('--no-open', 'do not open the browser automatically')
  .option('--target <url>', 'the target app\'s own dev server, e.g. http://localhost:4200 (S3 plate)')
  .option('--plate-port <port>', 'port the plate proxy listens on (S3)', '4601')
  .action(
    async (opts: { repo?: string; port: string; host?: string; open: boolean; target?: string; platePort: string }) => {
      try {
        const result = await runServeCommand({
          repo: opts.repo,
          port: Number.parseInt(opts.port, 10),
          host: opts.host,
          open: opts.open,
          target: opts.target,
          platePort: Number.parseInt(opts.platePort, 10),
        });
        printHuman(result.message);
      } catch (err) {
        logger.error('jigbench serve failed', String(err));
        process.exitCode = 1;
      }
    },
  );

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
  .option('--json', 'print the merged survey as JSON to stdout instead of the human summary')
  .action(async (opts: { json?: boolean }, command: Command) => {
    try {
      const { repo } = command.optsWithGlobals<{ repo?: string }>();
      const result = await runSurveyCommand({ repo, json: opts.json });
      if (opts.json) {
        printHuman(JSON.stringify(result.survey, null, 2));
      } else {
        printSummary(result.message);
      }
    } catch (err) {
      logger.error('jigbench survey failed', String(err));
      process.exitCode = 1;
    }
  });

program
  .command('clamp')
  .description('clamp a docs folder (markdown/text/PDF) into .jig/survey/docs.json')
  .requiredOption('--docs <folder>', 'the folder of docs to clamp')
  .action(async (opts: { docs: string }, command: Command) => {
    try {
      const { repo } = command.optsWithGlobals<{ repo?: string }>();
      const result = await runClampCommand({ repo, docs: opts.docs });
      printHuman(result.message);
    } catch (err) {
      logger.error('jigbench clamp failed', String(err));
      process.exitCode = 1;
    }
  });

const mcpCommand = program
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

mcpCommand
  .command('install')
  .description('write the jig MCP server entry into a host app\'s own config (today: --claude-desktop)')
  .option('--claude-desktop', 'install into Claude Desktop\'s claude_desktop_config.json')
  .option('--yes', 'actually write the file — otherwise only the diff is printed')
  .action(async (opts: { claudeDesktop?: boolean; yes?: boolean }, command: Command) => {
    // commands/mcp-install.ts, not commands/mcp.ts — a deliberate separate module (see its
    // own comment) so this subcommand can print a human-readable diff without dragging
    // human-output.ts into the stdio mcp command's own import graph.
    try {
      if (!opts.claudeDesktop) {
        logger.error('jigbench mcp install: pass --claude-desktop (the only supported target today)');
        process.exitCode = 1;
        return;
      }
      const { repo } = command.optsWithGlobals<{ repo?: string }>();
      const result = await runMcpInstallCommand({ repo, yes: opts.yes });
      printHuman(result.message);
    } catch (err) {
      logger.error('jigbench mcp install failed', String(err));
      process.exitCode = 1;
    }
  });

// === S11: `build`/`prompts` commands (delimited block) ===
program
  .command('build <id>')
  .description('run Claude Code against a ready prompt (.jig/prompts/) — streams the run to stderr, exits with Claude\'s own exit code')
  .action(async (id: string, _opts: unknown, command: Command) => {
    try {
      const { repo } = command.optsWithGlobals<{ repo?: string }>();
      const result = await runBuildCommand({ repo, id });
      process.exitCode = result.exitCode;
    } catch (err) {
      logger.error('jigbench build failed', String(err));
      process.exitCode = 1;
    }
  });

program
  .command('prompts')
  .description('list every prompt under .jig/prompts/')
  .action(async (_opts: unknown, command: Command) => {
    try {
      const { repo } = command.optsWithGlobals<{ repo?: string }>();
      const result = await runPromptsCommand({ repo });
      printHuman(result.message);
    } catch (err) {
      logger.error('jigbench prompts failed', String(err));
      process.exitCode = 1;
    }
  });
// === end S11 block ===

await program.parseAsync(process.argv);
