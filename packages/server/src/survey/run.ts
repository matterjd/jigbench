import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { surveyGauges as surveyAngularGauges } from '@jigbench/adapter-angular';
import { surveyGauges as surveyWebGauges } from '@jigbench/adapter-web';
import { jigPaths, JIG_FORMAT, type Gauge, type GaugeSet, type Survey } from '@jigbench/core';
import { atomicWriteFile } from '../atomic-write.js';
import { SURVEY_ADAPTERS } from './registry.js';
import { mergeSurveys, type AdapterSurveyResult } from './merge.js';

function emptyGaugeSet(): GaugeSet {
  return { jigFormat: JIG_FORMAT, gauges: [], generatedAt: new Date().toISOString() };
}

/** Only `adapter-angular` and `adapter-web` expose a separate gauges reader today (S2, S16).
 * `server` may import an adapter package directly for capability beyond the base
 * `SurveyAdapter` seam — each app root is read back off the survey it already produced
 * (`adapters[].appRoot`) rather than re-resolved, so this never walks the filesystem twice. */
function appRootFor(perAdapter: AdapterSurveyResult[], name: string): string | undefined {
  return perAdapter.find((r) => r.name === name)?.survey.adapters?.find((a) => a.adapter === name)?.appRoot;
}

/** Adds `extra`'s gauges to `primary`'s, skipping any name `primary` already declared — the
 * merge rule AMENDMENT-1 §6/A5 asks for: "merge only the web adapter's gauges not already
 * present". `primary` (Angular's own `src/`-only scan) always wins a name collision; `extra`
 * (the web adapter's broader scan — `src/`, `app/`, `public/`, `styles/`, `packages/`, `apps/`)
 * only ever fills gaps Angular's narrower scan never looked at. */
function mergeGaugeSets(primary: GaugeSet, extra: GaugeSet): GaugeSet {
  const known = new Set(primary.gauges.map((g) => g.name));
  const additional: Gauge[] = extra.gauges.filter((g) => !known.has(g.name));
  return {
    jigFormat: JIG_FORMAT,
    gauges: [...primary.gauges, ...additional],
    generatedAt: new Date().toISOString(),
  };
}

/** Angular's own gauge scan when it ran, unioned with the web adapter's (S16) when IT ran too
 * — either alone when only one detected, an honest empty set when neither did. */
async function collectGauges(perAdapter: AdapterSurveyResult[]): Promise<GaugeSet> {
  const angularAppRoot = appRootFor(perAdapter, 'angular');
  const webAppRoot = appRootFor(perAdapter, 'web');

  if (!angularAppRoot && !webAppRoot) return emptyGaugeSet();
  if (!angularAppRoot) return surveyWebGauges(webAppRoot!);
  if (!webAppRoot) return surveyAngularGauges(angularAppRoot);

  return mergeGaugeSets(await surveyAngularGauges(angularAppRoot), await surveyWebGauges(webAppRoot));
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
