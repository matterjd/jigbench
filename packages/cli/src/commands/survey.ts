import { runSurvey, type RunSurveyResult } from '@jigbench/server';
import type { Survey } from '@jigbench/core';
import { resolveRepoRoot } from '../repo-root.js';

export interface SurveyCommandOptions {
  repo?: string;
  /** `jigbench survey --json`: print the merged Survey to stdout instead of the human
   * summary — stdout carries JSON only on this path, never mixed with prose. */
  json?: boolean;
}

export interface SurveyCommandResult {
  /** The human summary (or the honest "nothing detected" notice) — always built, even in
   * `--json` mode, so a caller inspecting the result programmatically still gets it. */
  message: string;
  survey: Survey;
}

const REGISTERED_ADAPTERS = ['angular', 'dotnet'];

function countLine(label: string, n: number): string {
  return `${n} ${label}${n === 1 ? '' : 's'}`;
}

/** One screen: counts per kind, then one line per adapter that actually ran (its app root,
 * and — for dotnet — which of the three tiers answered), then the files written. */
function formatSummary(result: RunSurveyResult): string {
  const { survey, gauges } = result;
  const lines: string[] = [];

  lines.push(
    [
      'Survey —',
      countLine('component', survey.components.length),
      countLine('route', survey.routes.length),
      countLine('endpoint', survey.endpoints.length),
      countLine('schema', survey.schemas.length),
      countLine('gauge', gauges.gauges.length),
    ].join(' '),
  );

  for (const meta of survey.adapters ?? []) {
    const parts = [`  ${meta.adapter}:`, meta.appRoot ?? '(not detected)'];
    if (meta.source) parts.push(`(${meta.source}${meta.stub ? ', stub' : ''})`);
    lines.push(parts.join(' '));
  }

  const written = [result.file, result.gaugesFile, ...Object.values(result.perAdapterFiles)];
  lines.push(`Wrote: ${written.join(', ')}`);

  if (survey.stub) {
    lines.push(
      'Note: every adapter that ran only produced a stub-tier read — treat this survey as approximate.',
    );
  }

  return lines.join('\n');
}

function formatNoneDetected(result: RunSurveyResult): string {
  return [
    `No survey adapter detected a matching repo (registered: ${REGISTERED_ADAPTERS.join(', ')}).`,
    `Wrote an honest stub survey: ${result.file}`,
  ].join('\n');
}

/** `jigbench survey`. Runs every registered adapter whose `detect()` is true (S2:
 * angular, dotnet), merges their output, and writes it under `.jig/`. Prints a one-screen
 * human summary — nothing to stdout unless `--json` is passed, in which case the merged
 * Survey (and only the Survey) goes there instead. */
export async function runSurveyCommand(options: SurveyCommandOptions): Promise<SurveyCommandResult> {
  const repoRoot = resolveRepoRoot(options.repo);
  const result = await runSurvey(repoRoot);

  const message = result.perAdapter.length === 0 ? formatNoneDetected(result) : formatSummary(result);

  return { message, survey: result.survey };
}
