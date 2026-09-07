import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PromptStore } from '@jigbench/server';
import { runPromptsCommand } from './prompts.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));
});

async function tmp(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe('runPromptsCommand', () => {
  it('reports "no prompts yet" for an empty .jig/prompts/', async () => {
    const repoRoot = await tmp('jig-prompts-cmd-');
    const { message, prompts } = await runPromptsCommand({ repo: repoRoot });
    expect(message).toContain('No prompts yet');
    expect(prompts).toEqual([]);
  });

  it('lists every prompt with its id, state, and a one-line requirement summary', async () => {
    const repoRoot = await tmp('jig-prompts-cmd-');
    const store = new PromptStore(repoRoot);
    await store.init();
    const a = await store.create({ requirement: 'Show days overdue beside the due date' });
    const b = await store.create({ requirement: 'Add a search box' });
    await store.write({ ...b, state: 'ready' });

    const { message, prompts } = await runPromptsCommand({ repo: repoRoot });
    expect(prompts.map((p) => p.id)).toEqual([a.id, b.id]);
    expect(message).toContain(a.id);
    expect(message).toContain('draft');
    expect(message).toContain('Show days overdue beside the due date');
    expect(message).toContain(b.id);
    expect(message).toContain('ready');
  });
});
