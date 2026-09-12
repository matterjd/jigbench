import { realpath as fsRealpath } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { isUncPath, UNC_REFUSED_MESSAGE } from './unc-path.js';

/**
 * #37: the one place a caller-supplied path is turned into something Jig is willing to touch.
 *
 * #18 refused a UNC path by its SPELLING, on the raw string, before `path.resolve` — the right
 * check, and the same answer on every OS. But spelling is all it ever saw: a symlink (or an NTFS
 * junction) inside the home, pointing at `\\attacker\share`, is spelled like any other local
 * path, and the `stat` that came next follows it — which on Windows is the SMB connection the
 * guard exists to prevent, made on a caller's say-so after the guard said yes. Both call sites
 * had the same shape: `resolve()`, then `stat()`, with nothing in between that could see where
 * the path really went.
 *
 * So: resolve, then `realpath` (which follows every link and returns what the path REALLY is),
 * then judge THAT with the same spelling test, and only then let the filesystem calls happen —
 * against the real path, so nothing can be re-pointed between the check and the use.
 *
 * What the caller reports is deliberately NOT the real path. `resolved` is what the human typed
 * or clicked, and it stays the spelling in every message, every `entries[].path`, and the
 * `repoRoot` a clamp records — a folder browser that silently jumped out of symlink space would
 * be a different (and unasked-for) change, and on Windows `realpath` also expands an 8.3 alias
 * (`C:\Users\RUNNER~1\…` → `C:\Users\runneradmin\…`), which `build/git-diff.ts` already documents
 * as a real difference between two spellings of one directory.
 */

export interface CheckedLocalPath {
  /** What the caller asked for, `path.resolve`d: the spelling to report and to navigate with. */
  resolved: string;
  /** What it really is, every link followed: the spelling to judge and to call the filesystem
   * with. */
  real: string;
}

export type LocalPathCheck = ({ ok: true } & CheckedLocalPath) | { ok: false; error: string };

export interface CheckLocalPathDeps {
  /** Test-only override — the win32 shapes that make this matter (a junction onto a UNC share)
   * cannot be planted on either CI leg without actually opening an SMB connection, so the rule
   * is proved against an injected answer instead. Production passes nothing. */
  realpath?: (path: string) => Promise<string>;
}

export async function checkLocalPath(raw: string, deps: CheckLocalPathDeps = {}): Promise<LocalPathCheck> {
  // #18, unchanged: judged on the RAW string, before `resolve` turns `//host/share` into a plain
  // `/host/share` on POSIX and hides it.
  if (isUncPath(raw)) return { ok: false, error: UNC_REFUSED_MESSAGE };

  const resolved = resolvePath(raw);
  const realpath = deps.realpath ?? fsRealpath;

  let real: string;
  try {
    real = await realpath(resolved);
  } catch {
    // `realpath` fails for exactly the reasons `stat` used to: nothing there, a broken link, a
    // symlink loop, a component that is not a directory. Same words as before.
    return { ok: false, error: `no such path: ${resolved}` };
  }

  if (isUncPath(real)) return { ok: false, error: UNC_REFUSED_MESSAGE };

  return { ok: true, resolved, real };
}
