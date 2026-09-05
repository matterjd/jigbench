import { createJigServer, initJigTree } from '@jigbench/server';
import { resolveRepoRoot } from '../repo-root.js';

export interface ServeCommandOptions {
  repo?: string;
  port?: number;
  /** Interface to bind to — defaults to loopback-only inside `createJigServer`. Exposed here
   * so `--host` can opt into LAN exposure deliberately; nothing sets it implicitly. */
  host?: string;
  open?: boolean;
}

export interface ServeCommandResult {
  message: string;
  url: string;
  close: () => Promise<void>;
}

/** `jigbench` with no subcommand. Detects the repo root, ensures `.jig/` exists (the same
 * skeleton `init` writes), and starts the server. */
export async function runServeCommand(options: ServeCommandOptions): Promise<ServeCommandResult> {
  const repoRoot = resolveRepoRoot(options.repo);
  await initJigTree(repoRoot);

  const handle = await createJigServer({
    repoRoot,
    port: options.port ?? 4600,
    host: options.host,
    openBrowser: options.open ?? true,
  });

  const message = [`Jig is on the bench: ${handle.url}`, `Clamped: ${repoRoot}`].join('\n');
  return { message, url: handle.url, close: handle.close };
}
