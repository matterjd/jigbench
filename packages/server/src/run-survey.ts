import type { GaugeSet, Survey } from '@jigbench/core';
import { runSurveyAndWrite } from './survey/run.js';
import type { AdapterSurveyResult } from './survey/merge.js';

export interface RunSurveyResult {
  survey: Survey;
  /** `.jig/survey/survey.json` — kept as `file` (not folded into `files`) for the callers
   * that only ever needed the merged survey's own path. */
  file: string;
  gauges: GaugeSet;
  gaugesFile: string;
  perAdapter: AdapterSurveyResult[];
  /** adapter name -> its own `.jig/survey/<adapter>.json` path (only adapters that detected
   * the repo get an entry) — the CLI's human summary lists these. */
  perAdapterFiles: Record<string, string>;
}

/**
 * `jigbench survey`. S2 registers real adapters (`survey/registry.ts`) — this runs every
 * adapter whose `detect()` is true, merges their output, and writes it under `.jig/`
 * (`survey/run.ts` does the actual work); falls back to an honest stub (`stub: true`, every
 * array empty) when nothing detects the repo, rather than guessing at a repo it never read.
 */
export async function runSurvey(repoRoot: string): Promise<RunSurveyResult> {
  const result = await runSurveyAndWrite(repoRoot);
  return {
    survey: result.survey,
    file: result.files.survey,
    gauges: result.gauges,
    gaugesFile: result.files.gauges,
    perAdapter: result.perAdapter,
    perAdapterFiles: result.files.perAdapter,
  };
}
