import { realpath as fsRealpath } from 'node:fs/promises';
import { resolve as resolvePath, win32 as win32Path } from 'node:path';
import { isUncPath, UNC_REFUSED_MESSAGE } from './unc-path.js';

/**
 * #37: the one place a caller-supplied path is turned into something Jig is willing to touch.
 *
 * #18 refused a UNC path by its SPELLING, on the raw string, before `path.resolve` — the right
 * check, and the same answer on every OS. But spelling is all it ever saw: a symlink inside the
 * home, pointing at `\\attacker\share`, is spelled like any other local path, and the `stat`
 * that came next follows it — which on Windows is the SMB connection the guard exists to
 * prevent, made on a caller's say-so after the guard said yes. Both call sites had the same
 * shape: `resolve()`, then `stat()`, with nothing in between that could see where the path
 * really went.
 *
 * So: refuse the spelling, resolve, refuse THAT spelling, then `realpath` (which follows every
 * link and returns what the path REALLY is), then judge that with the same spelling test, and
 * only then let the rest of the filesystem calls happen — against the real path, so nothing can
 * be re-pointed between the check and the use.
 *
 * ## Where the refusal lands, exactly — #81 item 2
 *
 * Two different things are refused here, and they are refused at two different moments. Saying
 * so is the whole point of this section: the code used to claim, in this comment and in three
 * others, that no filesystem call could happen before the guard answered. That was true of one
 * half and false of the other.
 *
 *   1. **A UNC SPELLING never reaches a filesystem call at all.** `\\host\share`, `//host/share`
 *      and the extended-length `\\?\UNC\host\share` are refused lexically — on the raw string,
 *      on `path.resolve`'s answer, and on what that same value would resolve to under WINDOWS
 *      rules (see `resolvesOntoUncPath` below). All three happen before `realpath`.
 *
 *   2. **A LOCAL spelling that points at a share is refused only AFTER `realpath` — and on
 *      Windows that call is itself the SMB open.** Nothing can change that: what a link points
 *      at is not in the string, and the only way to ask is to follow it. The guard therefore
 *      fails CLOSED after one connection rather than open, and nothing Jig does reads, lists or
 *      stats through it. That is the honest claim, and it is the only one made here now.
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
  /** Test-only override — the win32 shapes that make this matter (a symlink onto a UNC share)
   * cannot be planted on either CI leg without actually opening an SMB connection, so the rule
   * is proved against an injected answer. Production passes nothing. */
  realpath?: (path: string) => Promise<string>;
}

/**
 * #81 item 2: does this raw value land on a share once it is RESOLVED, rather than merely being
 * spelled like one?
 *
 * `path.resolve(raw)` takes a relative — or a root-relative — value against `process.cwd()`, so
 * a bench started FROM a share turns `sub` into `\\host\share\dir\sub` and `\repo` into
 * `\\host\share\repo`. Neither raw string is UNC-spelled; both land on the share; and before
 * this check the value that reached `realpath` was the resolved one, which nothing had judged.
 *
 * The question is asked the WIN32 way as well as the host's own way, and that is deliberate: on
 * POSIX `path.resolve` collapses `//host/share` to a plain `/host/share`, so the POSIX answer
 * alone would call a shape safe on the ubuntu leg and unsafe on the windows one — the exact
 * split #18 introduced the raw-string check to avoid. `path.win32.resolve` is pure string work
 * (no I/O, no platform calls), so asking it costs nothing and makes the two legs agree.
 */
function resolvesOntoUncPath(raw: string, resolved: string, cwd: string): boolean {
  if (isUncPath(resolved)) return true;
  return isUncPath(win32Path.resolve(cwd, raw));
}

export async function checkLocalPath(raw: string, deps: CheckLocalPathDeps = {}): Promise<LocalPathCheck> {
  // #18, unchanged: judged on the RAW string, before `resolve` turns `//host/share` into a plain
  // `/host/share` on POSIX and hides it.
  if (isUncPath(raw)) return { ok: false, error: UNC_REFUSED_MESSAGE };

  const resolved = resolvePath(raw);

  // #81 item 2: and on what it resolves to, still before `realpath` — the call that IS the SMB
  // open on Windows when it is handed a share.
  if (resolvesOntoUncPath(raw, resolved, process.cwd())) return { ok: false, error: UNC_REFUSED_MESSAGE };

  const realpath = deps.realpath ?? fsRealpath;

  let real: string;
  try {
    real = await realpath(resolved);
  } catch {
    // `realpath` fails for exactly the reasons `stat` used to: nothing there, a broken link, a
    // symlink loop, a component that is not a directory. Same words as before.
    return { ok: false, error: `no such path: ${resolved}` };
  }

  // The one refusal that cannot come earlier — see "Where the refusal lands, exactly" above. A
  // local spelling whose target is a share is only knowable by following it, so this fails
  // closed after that one call, and nothing is read, listed or stat-ed through it.
  if (isUncPath(real)) return { ok: false, error: UNC_REFUSED_MESSAGE };

  return { ok: true, resolved, real };
}
