import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { atomicWriteFile } from '../atomic-write.js';
import { pathExists } from '../fs-util.js';
import { logger } from '../logger.js';

/**
 * S17a (AMENDMENT-1 §7, A6): "records the repo in recent benches (`~/.jig/recent.json` under
 * `os.homedir()`, atomic, max 10, most recent first, with the last-used target URL and docs
 * folder)". Deliberately under the user's home, not the clamped repo's own `.jig/` — recent
 * benches is a JIG-INSTALL-wide list of repos you have clamped before, not per-repo state.
 */

const MAX_RECENT = 10;

// S17b: the entry shape lives in `@jigbench/core` (bench-state.ts) — it rides on `/api/state`
// as `recent` and the Clamp screen renders it — re-exported here for every existing import.
export type { RecentBenchEntry } from '@jigbench/core';
import type { RecentBenchEntry } from '@jigbench/core';

export function defaultRecentBenchesFile(): string {
  return join(homedir(), '.jig', 'recent.json');
}

/** Never throws — a missing or corrupt file both read as "no recent benches yet", the same
 * honest-empty-default convention every other `.jig/*.json` reader in this codebase uses. */
export async function readRecentBenches(file: string = defaultRecentBenchesFile()): Promise<RecentBenchEntry[]> {
  if (!(await pathExists(file))) return [];
  try {
    const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
    return Array.isArray(raw) ? (raw as RecentBenchEntry[]) : [];
  } catch (err) {
    logger.warn('recent benches file failed to parse; starting empty', String(err));
    return [];
  }
}

/** Moves `entry.repoRoot` to the front (replacing any prior entry for the same repo — never a
 * duplicate), keeps at most `MAX_RECENT`, and writes atomically. Returns the new list so the
 * caller (the clamp route) can fold it straight into its response without a second read. */
export async function recordRecentBench(
  entry: RecentBenchEntry,
  file: string = defaultRecentBenchesFile(),
): Promise<RecentBenchEntry[]> {
  const existing = await readRecentBenches(file);
  const next = [entry, ...existing.filter((e) => e.repoRoot !== entry.repoRoot)].slice(0, MAX_RECENT);
  await atomicWriteFile(file, JSON.stringify(next, null, 2) + '\n');
  return next;
}

/** S17b: the fields a bench learns AFTER its clamp — the target URL the human started or
 * pointed at, the docs folder they clamped — patched onto that repo's entry in place. */
export type RecentBenchPatch = Partial<Pick<RecentBenchEntry, 'lastUsedTargetUrl' | 'docsFolder'>>;

/** Patches ONE entry (matched by `repoRoot`) in place: never reorders the list, never bumps
 * `clampedAt` — only a clamp does that (`recordRecentBench`). A no-op — nothing written, not
 * even an empty file — when the repo is not in the list at all. Returns the resulting list
 * (unchanged in the no-op case) so a caller can broadcast it without a second read. */
export async function updateRecentBench(
  repoRoot: string,
  patch: RecentBenchPatch,
  file: string = defaultRecentBenchesFile(),
): Promise<RecentBenchEntry[]> {
  const existing = await readRecentBenches(file);
  if (!existing.some((e) => e.repoRoot === repoRoot)) return existing;
  const next = existing.map((e) => (e.repoRoot === repoRoot ? { ...e, ...patch } : e));
  await atomicWriteFile(file, JSON.stringify(next, null, 2) + '\n');
  return next;
}
