/**
 * #18 (the 0.2.0 review): a UNC value (`\\host\share`, or `//host/share`) handed to `stat`
 * makes Windows open an SMB connection to the named host — a network call the folder browser
 * and `POST /api/clamp` must never make on a caller's say-so. Judged by spelling alone, on the
 * RAW string and before `path.resolve` (which would turn `//host/share` into a plain
 * `/host/share` on POSIX and hide it), so the answer is the same on every OS. The Windows
 * device (`\\.\`) and long-path (`\\?\`) prefixes share the spelling and are refused with it;
 * nobody types those into a folder picker.
 */
export function isUncPath(raw: string): boolean {
  return /^[\\/]{2}/.test(raw.trimStart());
}

/** The 400 body both routes send — in words, the same for either spelling. */
export const UNC_REFUSED_MESSAGE = 'UNC paths are not supported — pick a folder on a local drive';
