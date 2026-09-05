import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSurveyCommand } from './survey.js';

describe('runSurveyCommand (S1: no adapters registered)', () => {
  it('writes an honest stub survey and says so in the message', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-survey-cmd-'));

    const { message } = await runSurveyCommand({ repo: repoRoot });

    expect(message).toContain('No survey adapter is registered yet');
    expect(message).toContain('.jig');

    const file = join(repoRoot, '.jig', 'survey', 'survey.json');
    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk.stub).toBe(true);
  });
});
