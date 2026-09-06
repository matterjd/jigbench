import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SurveySchema, type Survey } from '@jigbench/core';
import { runSurveyAndWrite } from './run.js';

const here = dirname(fileURLToPath(import.meta.url));
const goldenPath = join(here, '__fixtures__', 'survey.golden.json');
const LEDGER_ANGULAR_SOURCE = fileURLToPath(
  new URL('../../../../examples/ledger-angular', import.meta.url),
);

// `generatedAt` and the discovered `appRoot` are both real, but neither is REPRODUCIBLE
// (timestamp; a fresh temp-dir path every run) — normalized to fixed placeholders so the
// rest of the merged survey's shape can still be pinned byte-exact. If you change the
// angular adapter's output shape on purpose, regenerate with:
//   UPDATE_GOLDEN=1 vitest run survey.golden --project server
function normalize(survey: Survey): Survey {
  return {
    ...survey,
    generatedAt: 'GENERATED_AT',
    adapters: survey.adapters?.map((a) => ({
      ...a,
      appRoot: a.appRoot ? 'APP_ROOT' : a.appRoot,
    })),
  };
}

async function surveyLedgerAngularCopy(): Promise<Survey> {
  // examples/ is read-only (AGENTS.md) — runSurveyAndWrite writes `.jig/` into whatever
  // root it's given, so this always runs against a throwaway copy, never the tracked fixture.
  const dir = await mkdtemp(join(tmpdir(), 'jig-survey-golden-'));
  try {
    await cp(LEDGER_ANGULAR_SOURCE, dir, { recursive: true });
    const result = await runSurveyAndWrite(dir);
    return result.survey;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('survey.json golden (examples/ledger-angular, merged through S2 wiring)', () => {
  if (process.env.UPDATE_GOLDEN === '1') {
    it('regenerates the golden fixture', async () => {
      const survey = await surveyLedgerAngularCopy();
      writeFileSync(goldenPath, JSON.stringify(normalize(survey), null, 2) + '\n', 'utf8');
      expect(existsSync(goldenPath)).toBe(true);
    }, 20000);
    return;
  }

  it('the golden fixture exists', () => {
    expect(existsSync(goldenPath)).toBe(true);
  });

  it('is byte-exact against the golden fixture once generatedAt/appRoot are normalized', async () => {
    const survey = await surveyLedgerAngularCopy();
    const actual = JSON.stringify(normalize(survey), null, 2) + '\n';
    const golden = readFileSync(goldenPath, 'utf8');
    expect(actual).toBe(golden);
  }, 20000);

  it('the golden fixture itself parses as a valid core Survey', () => {
    const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as unknown;
    const withRealGeneratedAt = { ...(golden as Survey), generatedAt: new Date().toISOString() };
    expect(() => SurveySchema.parse(withRealGeneratedAt)).not.toThrow();
  });
});
