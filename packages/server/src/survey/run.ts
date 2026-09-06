import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { surveyGauges } from '@jigbench/adapter-angular';
import { jigPaths, JIG_FORMAT, type GaugeSet, type Survey } from '@jigbench/core';
import { atomicWriteFile } from '../atomic-write.js';
import { SURVEY_ADAPTERS } from './registry.js';
import { mergeSurveys, type AdapterSurveyResult } from './merge.js';

function emptyGaugeSet(): GaugeSet {
  return { jigFormat: JIG_FORMAT, gauges: [], generatedAt: new Date().toISOString() };
}

/** Only `adapter-angular` exposes a separate gauges reader today (S2). `server` may import
 * an adapter package directly for capability beyond the base `SurveyAdapter` seam — the
 * angular app root is read back off the survey it already produced (`adapters[0].appRoot`)
 * rather than re-resolved, so this never walks the filesystem twice. */
async function collectGauges(perAdapter: AdapterSurveyResult[]): Promise<GaugeSet> {
  const angularResult = perAdapter.find((r) => r.name === 'angular');
  const appRoot = angularResult?.survey.adapters?.find((a) => a.adapter === 'angular')?.appRoot;
  if (!appRoot) return emptyGaugeSet();
  return surveyGauges(appRoot);
}

export interface SurveyRunResult {
  survey: Survey;
  gauges: GaugeSet;
  perAdapter: AdapterSurveyResult[];
  files: {
    survey: string;
    gauges: string;
    /** adapter name -> its own `.jig/survey/<adapter>.json` path — only adapters that
     * actually detected the repo get an entry. */
    perAdapter: Record<string, string>;
  };
}

/**
 * Runs every registered `SurveyAdapter` whose `detect()` is true, merges their output into
 * one core `Survey`, collects gauges, and writes everything atomically under `.jig/`:
 * `survey/survey.json` (merged), `survey/<adapter>.json` (one per adapter that ran), and
 * `gauges.json`. Falls back to an honest stub — no per-adapter files, an empty gauge set —
 * when nothing detects the repo at all.
 */
export async function runSurveyAndWrite(repoRoot: string): Promise<SurveyRunResult> {
  const perAdapter: AdapterSurveyResult[] = [];
  for (const { name, adapter } of SURVEY_ADAPTERS) {
    if (await adapter.detect(repoRoot)) {
      perAdapter.push({ name, survey: await adapter.survey(repoRoot) });
    }
  }

  const survey = mergeSurveys(perAdapter);
  const gauges = await collectGauges(perAdapter);

  const paths = jigPaths(repoRoot);
  await mkdir(paths.survey, { recursive: true });

  const surveyFile = join(paths.survey, 'survey.json');
  await atomicWriteFile(surveyFile, JSON.stringify(survey, null, 2) + '\n');

  const gaugesFile = paths.gaugesFile;
  await atomicWriteFile(gaugesFile, JSON.stringify(gauges, null, 2) + '\n');

  const perAdapterFiles: Record<string, string> = {};
  for (const { name, survey: adapterSurvey } of perAdapter) {
    const file = join(paths.survey, `${name}.json`);
    await atomicWriteFile(file, JSON.stringify(adapterSurvey, null, 2) + '\n');
    perAdapterFiles[name] = file;
  }

  return { survey, gauges, perAdapter, files: { survey: surveyFile, gauges: gaugesFile, perAdapter: perAdapterFiles } };
}
