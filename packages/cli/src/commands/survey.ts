import { runSurvey } from '@jigbench/server';
import { resolveRepoRoot } from '../repo-root.js';

export interface SurveyCommandOptions {
  repo?: string;
}

export interface SurveyCommandResult {
  message: string;
}

/** `jigbench survey`. S1 has no SurveyAdapter registered for any stack, so this always
 * writes an honest stub and says so — never a guess dressed up as a real read. */
export async function runSurveyCommand(options: SurveyCommandOptions): Promise<SurveyCommandResult> {
  const repoRoot = resolveRepoRoot(options.repo);
  const { survey, file } = await runSurvey(repoRoot);

  const message = survey.stub
    ? [
        'No survey adapter is registered yet (S2 adds Angular + .NET 10).',
        `Wrote an honest stub survey: ${file}`,
      ].join('\n')
    : `Survey written: ${file}`;

  return { message };
}
