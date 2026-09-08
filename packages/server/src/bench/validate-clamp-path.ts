import { sep } from 'node:path';
import { resolve as resolvePath } from 'node:path';
import { stat } from 'node:fs/promises';
import { isUncPath, UNC_REFUSED_MESSAGE } from '../fs/unc-path.js';

/**
 * S17a (AMENDMENT-1 §7, A6): "`POST /api/clamp {repoRoot}` validates the path (exists, is a
 * directory, is not inside `.jig/`)". Kept as its own tiny pure-ish function (one `stat` call)
 * so `bench/host.ts`'s clamp handler and any test can exercise every rejection path without
 * booting a server.
 */

export type ClampPathValidation = { ok: true; resolved: string } | { ok: false; error: string };

export async function validateClampPath(rawPath: string): Promise<ClampPathValidation> {
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    return { ok: false, error: 'repoRoot is required' };
  }

  // #18: a UNC value would make Windows open an SMB connection to the named host on the
  // `stat` below — refused by its spelling, before any filesystem call.
  if (isUncPath(rawPath)) {
    return { ok: false, error: UNC_REFUSED_MESSAGE };
  }

  const resolved = resolvePath(rawPath);

  let stats;
  try {
    stats = await stat(resolved);
  } catch {
    return { ok: false, error: `no such path: ${resolved}` };
  }
  if (!stats.isDirectory()) {
    return { ok: false, error: `not a directory: ${resolved}` };
  }

  const segments = resolved.split(sep);
  if (segments.includes('.jig')) {
    return { ok: false, error: `refusing to clamp inside a .jig/ directory: ${resolved}` };
  }

  return { ok: true, resolved };
}
