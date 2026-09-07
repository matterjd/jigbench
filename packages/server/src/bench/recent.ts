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

export interface RecentBenchEntry {
  repoRoot: string;
  clampedAt: string;
  lastUsedTargetUrl?: string;
  docsFolder?: string;
}

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
