import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PromptStore } from '@jigbench/server';
import { runBuildCommand } from './build.js';

const here = dirname(fileURLToPath(import.meta.url));
// The same fake claude the server package's own runner.test.ts uses — resolved relative to
// @jigbench/server's checked-out source, not this package's own dist, since it's a fixture
// script, not a compiled export.
const FAKE_CLAUDE = join(here, '..', '..', '..', 'server', 'src', 'build', '__fixtures__', 'fake-claude.mjs');

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));
  delete process.env.FAKE_CLAUDE_MODE;
  delete process.env.FAKE_CLAUDE_FILES;
});

async function tmp(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe('runBuildCommand', () => {
  it('exits 0 on a successful build and moves the prompt to built', async () => {
    const repoRoot = await tmp('jig-build-cmd-');
    const store = new PromptStore(repoRoot);
    await store.init();
    const prompt = await store.create({ requirement: 'add a comment' });
    await store.write({ ...prompt, state: 'ready' });

    process.env.FAKE_CLAUDE_FILES = 'README.md';
    const result = await runBuildCommand({ repo: repoRoot, id: prompt.id, claude: { command: process.execPath, commandArgsPrefix: [FAKE_CLAUDE] } });
    expect(result.exitCode).toBe(0);

    const reloaded = new PromptStore(repoRoot);
    await reloaded.init();
    expect(reloaded.get(prompt.id)?.state).toBe('built');
  });

  it('exits with Claude\'s own non-zero exit code on a failed build', async () => {
    const repoRoot = await tmp('jig-build-cmd-');
    const store = new PromptStore(repoRoot);
    await store.init();
    const prompt = await store.create({ requirement: 'add a comment' });
    await store.write({ ...prompt, state: 'ready' });

    process.env.FAKE_CLAUDE_MODE = 'fail';
    const result = await runBuildCommand({ repo: repoRoot, id: prompt.id, claude: { command: process.execPath, commandArgsPrefix: [FAKE_CLAUDE] } });
    expect(result.exitCode).toBe(1);

    const reloaded = new PromptStore(repoRoot);
    await reloaded.init();
    expect(reloaded.get(prompt.id)?.state).toBe('ready'); // back to ready, per the ladder
  });

  it('exits 1 for an unknown prompt id, without spawning anything', async () => {
    const repoRoot = await tmp('jig-build-cmd-');
    const store = new PromptStore(repoRoot);
    await store.init();

    const result = await runBuildCommand({ repo: repoRoot, id: '9999', claude: { command: process.execPath, commandArgsPrefix: [FAKE_CLAUDE] } });
    expect(result.exitCode).toBe(1);
  });

  it('exits 1 with the not-installed message when claude is not on PATH', async () => {
    const repoRoot = await tmp('jig-build-cmd-');
    const store = new PromptStore(repoRoot);
    await store.init();
    const prompt = await store.create({ requirement: 'x' });
    await store.write({ ...prompt, state: 'ready' });

    const result = await runBuildCommand({ repo: repoRoot, id: prompt.id, claude: { command: 'jig-test-no-such-claude-binary' } });
    expect(result.exitCode).toBe(1);
  });
});
