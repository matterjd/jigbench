import { join } from 'node:path';
import { jigPaths, stubSurvey, type Survey } from '@jigbench/core';
import { mkdir } from 'node:fs/promises';
import { atomicWriteFile } from './atomic-write.js';

export interface RunSurveyResult {
  survey: Survey;
  file: string;
}

/**
 * `jigbench survey`. S1 registers no SurveyAdapter for any stack, so this always writes an
 * honest stub (`stub: true`, every array empty) rather than guessing at a repo it never
 * read. S2 registers real adapters and this function tries them, in order, before falling
 * back to the same stub.
 */
export async function runSurvey(repoRoot: string): Promise<RunSurveyResult> {
  const paths = jigPaths(repoRoot);
  await mkdir(paths.survey, { recursive: true });
  const survey = stubSurvey();
  const file = join(paths.survey, 'survey.json');
  await atomicWriteFile(file, JSON.stringify(survey, null, 2) + '\n');
  return { survey, file };
}
