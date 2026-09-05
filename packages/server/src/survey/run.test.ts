import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SurveySchema, GaugeSetSchema } from '@jigbench/core';
import { runSurveyAndWrite } from './run.js';

const EXAMPLES_SOURCE = fileURLToPath(new URL('../../../../examples', import.meta.url));

// `runSurveyAndWrite` WRITES `.jig/` into the repo it surveys — examples/ is a read-only
// fixture (AGENTS.md), so every test here runs against a throwaway COPY, never the tracked
// examples/ directory itself.
let examplesCopy: string;

beforeAll(async () => {
  examplesCopy = await mkdtemp(join(tmpdir(), 'jig-survey-run-'));
  await cp(EXAMPLES_SOURCE, examplesCopy, {
    recursive: true,
    filter: (source) => !/[\\/](node_modules|bin|obj|\.angular|dist)(?:[\\/]|$)/.test(source),
  });
}, 30000);

afterAll(async () => {
  await rm(examplesCopy, { recursive: true, force: true });
});

describe('runSurveyAndWrite — angular only (examples/ledger-angular)', () => {
  it('writes survey.json + angular.json + gauges.json, no dotnet.json', async () => {
    const repoRoot = join(examplesCopy, 'ledger-angular');
    const result = await runSurveyAndWrite(repoRoot);

    expect(result.survey.stub).toBe(false);
    expect(result.survey.components.length).toBe(7);
    expect(() => SurveySchema.parse(result.survey)).not.toThrow();

    const onDisk = JSON.parse(await readFile(result.files.survey, 'utf8'));
    expect(SurveySchema.parse(onDisk).components.length).toBe(7);

    expect(result.files.perAdapter.angular).toBeDefined();
    expect(result.files.perAdapter.dotnet).toBeUndefined();

    const gaugesOnDisk = JSON.parse(await readFile(result.files.gauges, 'utf8'));
    expect(() => GaugeSetSchema.parse(gaugesOnDisk)).not.toThrow();
    expect(gaugesOnDisk.gauges.length).toBeGreaterThan(0);
  }, 20000);
});

describe('runSurveyAndWrite — dotnet only (examples/ledger-api)', () => {
  it('writes survey.json + dotnet.json, an empty gauges.json, no angular.json', async () => {
    const repoRoot = join(examplesCopy, 'ledger-api');
    const result = await runSurveyAndWrite(repoRoot);

    expect(result.survey.stub).toBe(false);
    expect(result.survey.endpoints.length).toBe(7);
    expect(result.files.perAdapter.dotnet).toBeDefined();
    expect(result.files.perAdapter.angular).toBeUndefined();

    const gaugesOnDisk = JSON.parse(await readFile(result.files.gauges, 'utf8'));
    expect(gaugesOnDisk.gauges).toEqual([]);
  }, 20000);
});

describe('runSurveyAndWrite — one root, both stacks (examples/)', () => {
  it('detects both adapters one level down and merges into one survey', async () => {
    const result = await runSurveyAndWrite(examplesCopy);

    expect(result.survey.stub).toBe(false);
    expect(result.survey.stack.slice().sort()).toEqual(['angular', 'dotnet']);
    expect(result.survey.components.length).toBe(7);
    expect(result.survey.endpoints.length).toBe(7);
    expect(result.files.perAdapter.angular).toBeDefined();
    expect(result.files.perAdapter.dotnet).toBeDefined();
  }, 20000);
});

describe('runSurveyAndWrite — nothing detected', () => {
  it('writes an honest stub survey (no per-adapter files)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-run-none-'));
    const result = await runSurveyAndWrite(dir);

    expect(result.survey.stub).toBe(true);
    expect(result.survey.components).toEqual([]);
    expect(Object.keys(result.files.perAdapter)).toEqual([]);

    await rm(dir, { recursive: true, force: true });
  });
});
