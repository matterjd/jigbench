import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runServeCommand, type ServeCommandResult } from './serve.js';

let result: ServeCommandResult | undefined;

afterEach(async () => {
  if (result) {
    await result.close();
    result = undefined;
  }
});

describe('runServeCommand', () => {
  it('ensures .jig/ exists and starts the server, reporting the url and clamped repo', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-serve-'));

    result = await runServeCommand({ repo: repoRoot, port: 0, open: false });

    expect(result.message).toContain('Jig is on the bench');
    expect(result.message).toContain(repoRoot);
    expect(result.url).toMatch(/^http:\/\/localhost:\d+$/);

    const jigDir = await stat(join(repoRoot, '.jig'));
    expect(jigDir.isDirectory()).toBe(true);
  });
});
