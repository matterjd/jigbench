import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { logger } from '../logger.js';

/**
 * #24 (the 0.2.0 review): "the folder browser lists Windows hidden and system folders at a drive
 * root (`$Recycle.Bin`, `$WINDOWS.~BT`, `System Volume Information`, `Recovery`). The filter is
 * dot-prefix only; honour the hidden and system attributes on win32."
 *
 * None of those names starts with a dot — a dot prefix is a POSIX convention and Windows carries
 * the same idea as two bits on the directory entry instead (FILE_ATTRIBUTE_HIDDEN,
 * FILE_ATTRIBUTE_SYSTEM). Node surfaces neither: `fs.Stats` on win32 carries `mode` (read-only
 * folded into the write bits) and nothing else — libuv fills `st_flags` from the attributes but
 * Node exposes no field for it, and `fs.Dirent` carries only the entry type. So this reads them
 * the way the pure-JS ecosystem does: one `attrib` per listing, parsed.
 *
 * Two deliberate choices:
 *   - **one process per listing, not per entry** — `attrib /d <dir>\*` reports every match at
 *     once, so a folder browser click costs one spawn regardless of how many folders are inside.
 *   - **fail open** — every failure (attrib missing, denied, timed out, output past the buffer,
 *     a name the console codepage mangled) returns an empty set, so the browser shows too much
 *     rather than hiding a repo the human is trying to reach. Hiding a real folder is the worse
 *     of the two, and silent.
 *
 * Off win32 this never spawns anything: there is no such attribute to read.
 */

const execFileAsync = promisify(execFile);

/** Generous enough for a slow disk, short enough that a wedged `attrib` cannot hold a GET open. */
const ATTRIB_TIMEOUT_MS = 5_000;
/** ~150 bytes a line; a directory with more entries than this fits falls back to showing all. */
const ATTRIB_MAX_BUFFER = 8 * 1024 * 1024;

/** `attrib` only ever runs on win32, so its output always spells paths with a backslash — a
 * literal, not `path.sep`, so `parseAttribOutput` can be read (and tested) on any platform. */
const WIN32_SEP = '\\';

/**
 * The subset of `names` that `attrib`'s output marks hidden or system. Pure — separated from the
 * spawn so the parse itself is provable off Windows, where the route test below it must skip.
 */
export function parseAttribOutput(dirPath: string, names: string[], stdout: string): Set<string> {
  const flagged = new Set<string>();
  // `readdir` spells the name; `attrib` echoes the whole path back, in whatever case the volume
  // stores it. Windows paths are case-insensitive, so match on the lowered name and answer with
  // the caller's own spelling.
  const byLowered = new Map(names.map((name) => [name.toLowerCase(), name]));
  const prefix = (dirPath.endsWith(WIN32_SEP) ? dirPath : dirPath + WIN32_SEP).toLowerCase();

  for (const line of stdout.split(/\r?\n/)) {
    // `A  SH        C:\dir\name` — the attribute letters, then the path. The first colon on the
    // line is the drive's, so everything before the letter in front of it is the attribute field
    // and cannot contain a stray H or S from the name itself.
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const attributes = line.slice(0, colon - 1);
    if (!attributes.includes('H') && !attributes.includes('S')) continue;

    const full = line.slice(colon - 1).trimEnd();
    const lowered = full.toLowerCase();
    if (!lowered.startsWith(prefix)) continue;
    const name = lowered.slice(prefix.length);
    if (name.length === 0 || name.includes(WIN32_SEP)) continue; // never recursive: no `/s`

    const original = byLowered.get(name);
    if (original !== undefined) flagged.add(original);
  }

  return flagged;
}

/**
 * The names in `dirPath` (as `readdir` spelled them) that carry the hidden or the system
 * attribute. Empty off win32, empty on any failure.
 */
export async function hiddenOrSystemNames(dirPath: string, names: string[]): Promise<Set<string>> {
  if (platform() !== 'win32' || names.length === 0) return new Set<string>();

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync('attrib', ['/d', join(dirPath, '*')], {
      windowsHide: true,
      timeout: ATTRIB_TIMEOUT_MS,
      maxBuffer: ATTRIB_MAX_BUFFER,
    }));
  } catch (err) {
    logger.warn(`fs/list: attrib failed for ${dirPath}, listing without the attribute filter`, String(err));
    return new Set<string>();
  }

  return parseAttribOutput(dirPath, names, stdout);
}
