import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// A directory that something else holds a handle on (Node's own `fs.watch` — JigWatcher
// watches `.jig/work-orders`, `.jig/fixtures`, `.jig/cache`, the exact directories this
// writes into — a virus scanner, a search indexer) can make Windows' rename-over-existing-
// file fail with EPERM/EBUSY even though nothing is actually wrong: the destination isn't
// locked in any way that would make a RETRY fail too, just transiently busy for the instant
// the OS took the snapshot. Observed live under a loaded suite as "shop heartbeat refresh
// failed EPERM ... rename ... shop.json.tmp-... -> shop.json" and, unretried, as a work-order
// mutation that silently never lands (the caller's next read still sees the OLD state).
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_RETRY_ATTEMPTS = 8;
const RENAME_RETRY_BASE_MS = 15;

function isTransientRenameError(err: unknown): boolean {
  return TRANSIENT_RENAME_CODES.has((err as NodeJS.ErrnoException)?.code ?? '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Write a file atomically: write to a sibling temp file, then rename over the target. A
 * reader never sees a partially-written file — `.jig/` is the store of record, and a crash
 * mid-write must never corrupt it.
 *
 * The rename is retried a handful of times, with a short linear backoff, on the transient
 * error codes above — a REAL permission problem (a read-only file, a genuinely locked
 * destination) reproduces on every attempt just the same, so retrying never masks one; it
 * only survives the instant that made this rename collide with something else. */
export async function atomicWriteFile(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await writeFile(tmp, contents, 'utf8');
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(tmp, path);
      return;
    } catch (err) {
      if (!isTransientRenameError(err) || attempt >= RENAME_RETRY_ATTEMPTS) {
        await unlink(tmp).catch(() => {});
        throw err;
      }
      await sleep(RENAME_RETRY_BASE_MS * attempt);
    }
  }
}
