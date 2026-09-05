/** The `.jig/` layout inside a clamped repo, as plain strings. No `node:fs`, no `node:path`
 * — core has zero I/O, so this only ever describes where things belong; the caller (server)
 * is the one that touches disk. Forward slashes throughout: these are logical paths, not
 * OS paths, and every consumer (Windows or not) treats a forward slash as a separator. */
export interface JigPaths {
  root: string;
  survey: string;
  gaugesFile: string;
  fixtures: string;
  workOrders: string;
  toolpaths: string;
  sketches: string;
  cache: string;
}

export function jigPaths(repoRoot: string): JigPaths {
  const base = repoRoot.replace(/[\\/]+$/, '');
  const root = `${base}/.jig`;
  return {
    root,
    survey: `${root}/survey`,
    gaugesFile: `${root}/gauges.json`,
    fixtures: `${root}/fixtures`,
    workOrders: `${root}/work-orders`,
    toolpaths: `${root}/toolpaths`,
    sketches: `${root}/sketches`,
    cache: `${root}/cache`,
  };
}
