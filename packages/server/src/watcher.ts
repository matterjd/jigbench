import { watch, type FSWatcher } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { jigPaths } from '@jigbench/core';
import { logger } from './logger.js';

/**
 * S6 — the bench sees the shop's writes (EXECUTION-PLAN.md §4 S6): the MCP process is a
 * SEPARATE process from the bench server (ADR-001's whole design — the agent launches
 * `npx jigbench mcp` itself), so a `jig_draft`/`jig_claim`/`jig_report` tool call writes a
 * work order file this process never touched directly. `JigWatcher` notices that write and
 * calls `onChange` (debounced) so `http.ts` can reload the store and broadcast the new state
 * over WS — "a claim or report made over MCP appears on the bench within a second".
 *
 * `fs.watch` is the primary signal (near-instant); a low-frequency poll runs ALONGSIDE it,
 * not as a conditional fallback switched to only when `fs.watch` is detected as unreliable —
 * `fs.watch`'s behavior is genuinely platform-dependent (network drives, some Windows
 * configurations), and a silent one-time detection would itself be a thing to get wrong.
 * Belt and suspenders: either one noticing a change calls `onChange`.
 */

const DEFAULT_DEBOUNCE_MS = 200;
const DEFAULT_POLL_INTERVAL_MS = 2000;

export interface JigWatcherOptions {
  repoRoot: string;
  onChange: () => void;
  debounceMs?: number;
  pollIntervalMs?: number;
}

function watchedDirs(repoRoot: string): string[] {
  const paths = jigPaths(repoRoot);
  return [paths.workOrders, paths.fixtures, paths.cache];
}

export class JigWatcher {
  private readonly watchers: FSWatcher[] = [];
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private lastSnapshot = '';
  private hasPolledOnce = false;
  private readonly debounceMs: number;
  private readonly pollIntervalMs: number;

  constructor(private readonly options: JigWatcherOptions) {
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  start(): void {
    for (const dir of watchedDirs(this.options.repoRoot)) {
      try {
        const watcher = watch(dir, { persistent: false }, () => this.scheduleChange());
        watcher.on('error', (err) => logger.warn(`fs.watch failed for ${dir}; the polling fallback still covers it`, String(err)));
        this.watchers.push(watcher);
      } catch (err) {
        // The directory may not exist yet (a fresh .jig/ tree before init writes it) — the
        // poll loop below tolerates that the same way, so this is never fatal.
        logger.warn(`could not fs.watch ${dir} yet; the polling fallback still covers it`, String(err));
      }
    }

    this.pollTimer = setInterval(() => {
      this.pollOnce().catch((err) => logger.warn('jig watcher poll failed', String(err)));
    }, this.pollIntervalMs);
    this.pollTimer.unref?.();
  }

  private scheduleChange(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.options.onChange(), this.debounceMs);
    this.debounceTimer.unref?.();
  }

  private async pollOnce(): Promise<void> {
    const snapshot = await this.snapshot();
    if (!this.hasPolledOnce) {
      // The first poll only records a baseline — it never fires onChange for whatever was
      // already there when watching started (fs.watch's own first-change notification is
      // what covers "real" changes going forward; the poll is a safety net for drift).
      this.hasPolledOnce = true;
      this.lastSnapshot = snapshot;
      return;
    }
    if (snapshot !== this.lastSnapshot) {
      this.lastSnapshot = snapshot;
      this.scheduleChange();
    }
  }

  /** A cheap fingerprint of every watched directory's contents (name:mtime:size per entry,
   * sorted) — good enough to notice "something changed" without diffing file contents. */
  private async snapshot(): Promise<string> {
    const parts: string[] = [];
    for (const dir of watchedDirs(this.options.repoRoot)) {
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        continue; // doesn't exist yet — an empty contribution, not an error
      }
      for (const entry of entries.sort()) {
        const st = await stat(join(dir, entry)).catch(() => null);
        parts.push(`${dir}/${entry}:${st?.mtimeMs ?? 0}:${st?.size ?? 0}`);
      }
    }
    return parts.join('|');
  }

  stop(): void {
    for (const w of this.watchers.splice(0)) w.close();
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = undefined;
  }
}
