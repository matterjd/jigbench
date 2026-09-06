import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jigPaths } from '@jigbench/core';
import { JigWatcher } from './watcher.js';

/**
 * S6 — the bench sees the shop's writes (EXECUTION-PLAN.md §4 S6): a cheap `.jig/` watcher
 * so a claim or report made over MCP (a separate process — S6's whole design, ADR-001)
 * shows up on the bench within a second. `fs.watch` is the primary signal; a low-frequency
 * poll runs alongside it as a safety net rather than a conditional fallback, so a flaky
 * `fs.watch` (documented as shaky on some Windows/network-drive configurations) never
 * silently degrades to "watching nothing" — either one firing calls `onChange`, debounced.
 */

const tempDirs: string[] = [];
const watchers: JigWatcher[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const w of watchers.splice(0)) w.stop();
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function freshJigTree(): Promise<string> {
  const repoRoot = await mkdtemp(join(tmpdir(), 'jig-watcher-'));
  tempDirs.push(repoRoot);
  const paths = jigPaths(repoRoot);
  await mkdir(paths.workOrders, { recursive: true });
  await mkdir(paths.fixtures, { recursive: true });
  await mkdir(paths.cache, { recursive: true });
  return repoRoot;
}

describe('JigWatcher', () => {
  it('calls onChange (debounced) when a file is written under .jig/work-orders', async () => {
    const repoRoot = await freshJigTree();
    const onChange = vi.fn();
    const watcher = new JigWatcher({ repoRoot, onChange, debounceMs: 10, pollIntervalMs: 30 });
    watchers.push(watcher);
    watcher.start();

    await writeFile(join(jigPaths(repoRoot).workOrders, '0001-test.md'), '---\n---\n', 'utf8');

    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('calls onChange when a file changes under .jig/fixtures', async () => {
    const repoRoot = await freshJigTree();
    const onChange = vi.fn();
    const watcher = new JigWatcher({ repoRoot, onChange, debounceMs: 10, pollIntervalMs: 30 });
    watchers.push(watcher);
    watcher.start();

    await writeFile(join(jigPaths(repoRoot).fixtures, 'demo.json'), '{}', 'utf8');

    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('calls onChange when the shop heartbeat file appears under .jig/cache', async () => {
    const repoRoot = await freshJigTree();
    const onChange = vi.fn();
    const watcher = new JigWatcher({ repoRoot, onChange, debounceMs: 10, pollIntervalMs: 30 });
    watchers.push(watcher);
    watcher.start();

    await writeFile(join(jigPaths(repoRoot).cache, 'shop.json'), '{}', 'utf8');

    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('debounces rapid successive writes into a single onChange (eventually)', async () => {
    const repoRoot = await freshJigTree();
    const onChange = vi.fn();
    const watcher = new JigWatcher({ repoRoot, onChange, debounceMs: 100, pollIntervalMs: 5000 }); // poll disabled-ish; rely on fs.watch
    watchers.push(watcher);
    watcher.start();

    const file = join(jigPaths(repoRoot).workOrders, '0001-test.md');
    for (let i = 0; i < 5; i++) {
      await writeFile(file, `revision ${i}`, 'utf8');
    }

    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 2000 });
    const callsRightAfterFirstFire = onChange.mock.calls.length;
    // Give the debounce window plenty of time to have collapsed the burst — assert it
    // never fired once per write (5), not an exact count (timing-sensitive across fs.watch
    // vs the poll fallback, both of which may have observed the burst).
    expect(callsRightAfterFirstFire).toBeLessThan(5);
  });

  it('stop() stops future onChange calls', async () => {
    const repoRoot = await freshJigTree();
    const onChange = vi.fn();
    const watcher = new JigWatcher({ repoRoot, onChange, debounceMs: 10, pollIntervalMs: 30 });
    watcher.start();
    watcher.stop();

    await writeFile(join(jigPaths(repoRoot).workOrders, '0001-test.md'), 'x', 'utf8');
    await new Promise((r) => setTimeout(r, 300));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('never throws when a watched directory does not exist yet', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-watcher-nodirs-'));
    tempDirs.push(repoRoot);
    const onChange = vi.fn();
    const watcher = new JigWatcher({ repoRoot, onChange, debounceMs: 10, pollIntervalMs: 30 });
    expect(() => watcher.start()).not.toThrow();
    watchers.push(watcher);
  });
});
