import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SurveySchema } from '@jigbench/core';
import { runSurvey } from './run-survey.js';

describe('runSurvey (S1: no adapters registered)', () => {
  it('writes an honest stub survey and says so', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-survey-'));

    const { survey, file } = await runSurvey(repoRoot);

    expect(survey.stub).toBe(true);
    expect(survey.components).toEqual([]);
    expect(() => SurveySchema.parse(survey)).not.toThrow();

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk.stub).toBe(true);
  });
});
