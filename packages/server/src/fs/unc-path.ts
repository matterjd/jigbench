/**
 * #18 (the 0.2.0 review): a UNC value (`\\host\share`, or `//host/share`) handed to `stat`
 * makes Windows open an SMB connection to the named host — a network call the folder browser
 * and `POST /api/clamp` must never make on a caller's say-so. Judged by spelling alone, on the
 * RAW string and before `path.resolve` (which would turn `//host/share` into a plain
 * `/host/share` on POSIX and hide it), so the answer is the same on every OS.
 *
 * Three prefixes, one rule. All of them begin with two separators, in either slash direction:
 *
 *   - `\\host\share` · `//host/share` — the plain UNC spelling.
 *   - `\\?\UNC\host\share` — the extended-length spelling of the SAME share. Windows strips the
 *     `\\?\UNC\` and connects exactly as it would for `\\host\share`, so refusing one and not
 *     the other would be refusing a spelling rather than a share. `\\?\C:\Users\…` is the
 *     extended-length spelling of a LOCAL path and is refused with them: nobody types either
 *     into a folder picker, and a value that needs the extended-length escape to be expressed
 *     is not one Jig has any reason to accept.
 *   - `\\.\…` — the Windows device namespace (`\\.\PhysicalDrive0`, `\\.\pipe\…`). Same two
 *     separators, same refusal, and likewise nothing a folder picker produces.
 *
 * `\\?\unc\…` is as valid on Windows as `\\?\UNC\…`, so nothing here is case-sensitive — the
 * two-separator test never looks past the prefix, which is what makes that free.
 *
 * #81 item 2: this predicate is now asked three times per check (see `local-path.ts`) — on the
 * raw string, on `path.resolve`'s answer, and on what the same value resolves to under Windows
 * rules — so that a value which only BECOMES a share once resolved is refused before `realpath`
 * rather than after it.
 */
export function isUncPath(raw: string): boolean {
  return /^[\\/]{2}/.test(raw.trimStart());
}

/** The 400 body all three routes send — in words, the same for every spelling. */
export const UNC_REFUSED_MESSAGE = 'UNC paths are not supported — pick a folder on a local drive';
