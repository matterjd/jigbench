import { sep } from 'node:path';
import { stat } from 'node:fs/promises';
import { checkLocalPath, type CheckLocalPathDeps } from '../fs/local-path.js';

/**
 * S17a (AMENDMENT-1 §7, A6): "`POST /api/clamp {repoRoot}` validates the path (exists, is a
 * directory, is not inside `.jig/`)". Kept as its own tiny pure-ish function (one `stat` call)
 * so `bench/host.ts`'s clamp handler and any test can exercise every rejection path without
 * booting a server.
 *
 * #37: the UNC refusal and the existence check now come from `fs/local-path.ts`, shared with the
 * folder browser — a symlink or junction spelled like a local path used to carry both guards
 * past a `stat` that followed it. Every rejection keeps its exact words.
 */

export type ClampPathValidation = { ok: true; resolved: string } | { ok: false; error: string };

/** A path segment check, against both spellings of the same directory (#37): `.jig` in what the
 * caller typed, and `.jig` in what it really is — a link is spelled like anything else. */
function namesJigDirectory(path: string): boolean {
  return path.split(sep).includes('.jig') || path.split('/').includes('.jig');
}

export async function validateClampPath(rawPath: string, deps: CheckLocalPathDeps = {}): Promise<ClampPathValidation> {
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    return { ok: false, error: 'repoRoot is required' };
  }

  // #18/#37: the UNC spelling, on the raw string AND on what the path really resolves to; then
  // existence, by `realpath` rather than by a `stat` that would follow a link to a UNC host.
  const checked = await checkLocalPath(rawPath, deps);
  if (!checked.ok) {
    return { ok: false, error: checked.error };
  }
  const { resolved, real } = checked;

  // Against the REAL path — a link that is a directory is not proof its target is one.
  const stats = await stat(real).catch(() => null);
  if (!stats) {
    return { ok: false, error: `no such path: ${resolved}` };
  }
  if (!stats.isDirectory()) {
    return { ok: false, error: `not a directory: ${resolved}` };
  }

  if (namesJigDirectory(resolved) || namesJigDirectory(real)) {
    return { ok: false, error: `refusing to clamp inside a .jig/ directory: ${resolved}` };
  }

  // The spelling the human picked, not the canonical one: that is what the Clamp screen shows and
  // what `recent.json` records, and on win32 `realpath` also expands an 8.3 alias.
  return { ok: true, resolved };
}
