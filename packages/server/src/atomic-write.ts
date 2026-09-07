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

// The same class of transient Windows filesystem lag can strike the OTHER end of this
// function: `mkdir(dirname(path), { recursive: true })` resolves without error, yet the very
// next `writeFile(tmp, ...)` into that just-created directory reports ENOENT — reproduced
// live only on GitHub's windows-latest CI runner (CI run 34148382041, never on a dev desk):
// "S11 migration: work order ... failed to migrate to a prompt; skipping it Error: ENOENT ...
// open '...\.jig\prompts\...md.tmp-...'", an instant after `PromptStore.init()`'s own mkdir of
// that exact directory had already completed. `.jig/prompts/` (and every sibling `.jig/*`
// subfolder every store here writes into) is frequently created for the very first time in
// the same breath as the first file inside it, which is exactly the shape that exposes this
// lag. EPERM/EACCES/EBUSY are included too, on the same "we just created this ourselves an
// instant ago" logic as the rename retry above.
const TRANSIENT_WRITE_CODES = new Set(['ENOENT', 'EPERM', 'EBUSY', 'EACCES']);
const WRITE_RETRY_ATTEMPTS = 5;
const WRITE_RETRY_BASE_MS = 15;

function isTransientError(err: unknown, codes: Set<string>): boolean {
  return codes.has((err as NodeJS.ErrnoException)?.code ?? '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Write a file atomically: write to a sibling temp file, then rename over the target. A
 * reader never sees a partially-written file — `.jig/` is the store of record, and a crash
 * mid-write must never corrupt it.
 *
 * Both halves — the initial `mkdir` + temp-file `writeFile`, and the final `rename` — are
 * retried a handful of times, with a short linear backoff, on their respective transient
 * error codes above. A REAL problem (a read-only file, a genuinely missing/locked
 * destination, a full disk) reproduces on every attempt just the same, so retrying never
 * masks one; it only survives the instant something else collided with this write. */
export async function atomicWriteFile(path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  for (let attempt = 1; ; attempt++) {
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(tmp, contents, 'utf8');
      break;
    } catch (err) {
      if (!isTransientError(err, TRANSIENT_WRITE_CODES) || attempt >= WRITE_RETRY_ATTEMPTS) throw err;
      await sleep(WRITE_RETRY_BASE_MS * attempt);
    }
  }

  for (let attempt = 1; ; attempt++) {
    try {
      await rename(tmp, path);
      return;
    } catch (err) {
      if (!isTransientError(err, TRANSIENT_RENAME_CODES) || attempt >= RENAME_RETRY_ATTEMPTS) {
        await unlink(tmp).catch(() => {});
        throw err;
      }
      await sleep(RENAME_RETRY_BASE_MS * attempt);
    }
  }
}
