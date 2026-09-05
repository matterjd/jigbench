import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createJigServer, createPlateProxy, initJigTree } from '@jigbench/server';
import { resolveRepoRoot } from '../repo-root.js';

export interface ServeCommandOptions {
  repo?: string;
  port?: number;
  /** Interface to bind to — defaults to loopback-only inside `createJigServer`. Exposed here
   * so `--host` can opt into LAN exposure deliberately; nothing sets it implicitly. */
  host?: string;
  open?: boolean;
  /** The target app's own dev server, e.g. `http://localhost:4200`. Always wins over
   * auto-detection. */
  target?: string;
  /** The plate proxy's own listening port (S3). Defaults to 4601. */
  platePort?: number;
}

export interface ServeCommandResult {
  message: string;
  url: string;
  close: () => Promise<void>;
}

const DEFAULT_PORT = 4600;
const DEFAULT_ANGULAR_SERVE_PORT = 4200;

interface AngularJsonShape {
  defaultProject?: string;
  projects?: Record<string, { architect?: { serve?: { options?: { port?: number } } } }>;
}

/** `--target` always wins. Otherwise, if the clamped repo has an `angular.json`, guess its
 * dev-server URL from the default project's configured serve port, falling back to
 * Angular's own default (4200) when no port is set. Cheap and often right — never a
 * substitute for `--target` when it's wrong, and silently absent (no target) for anything
 * that isn't an Angular repo; a future adapter can extend this per stack. */
function detectTarget(repoRoot: string): string | undefined {
  const angularJsonPath = join(repoRoot, 'angular.json');
  if (!existsSync(angularJsonPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(angularJsonPath, 'utf8')) as AngularJsonShape;
    const projectName = parsed.defaultProject ?? Object.keys(parsed.projects ?? {})[0];
    const port = projectName ? parsed.projects?.[projectName]?.architect?.serve?.options?.port : undefined;
    return `http://localhost:${typeof port === 'number' ? port : DEFAULT_ANGULAR_SERVE_PORT}`;
  } catch {
    return undefined;
  }
}

/** `jigbench` with no subcommand. Detects the repo root, ensures `.jig/` exists (the same
 * skeleton `init` writes), starts the S3 plate proxy in front of the target's own dev server
 * (when one is known), and starts the bench server. */
export async function runServeCommand(options: ServeCommandOptions): Promise<ServeCommandResult> {
  const repoRoot = resolveRepoRoot(options.repo);
  await initJigTree(repoRoot);

  const port = options.port ?? DEFAULT_PORT;
  const benchOrigin = `http://localhost:${port}`;
  const target = options.target ?? detectTarget(repoRoot);

  const plate = createPlateProxy({
    target,
    benchOrigin,
    port: options.platePort,
  });

  const handle = await createJigServer({
    repoRoot,
    port,
    host: options.host,
    openBrowser: options.open ?? true,
    plate,
  });

  const message = [
    `Jig is on the bench: ${handle.url}`,
    `Clamped: ${repoRoot}`,
    target
      ? `Plate: ${plate.url} -> ${target}`
      : `Plate: ${plate.url} (no target set — pass --target <url> to clamp a running app)`,
  ].join('\n');

  return {
    message,
    url: handle.url,
    async close() {
      await handle.close();
      await plate.close();
    },
  };
}
