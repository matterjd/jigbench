import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

// S16 (AMENDMENT-1 §6/A5): the web adapter is the generic fallback (registered last), so a
// repo shaped like a plain web app — no package.json, just a stylesheet — must still survey
// as stack:'web' with an honest gauge set and no invented components/routes.
describe('runSurveyAndWrite — web only (a plain stylesheet, no stack adapter matches)', () => {
  it('writes survey.json (stack: web, no components/routes) + web.json + gauges.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-run-web-only-'));
    await mkdir(join(dir, 'styles'), { recursive: true });
    await writeFile(join(dir, 'styles', 'tokens.css'), ':root { --only-web-token: 4px; }');

    const result = await runSurveyAndWrite(dir);

    expect(result.survey.stub).toBe(false);
    expect(result.survey.stack).toEqual(['web']);
    expect(result.survey.components).toEqual([]);
    expect(result.survey.routes).toEqual([]);
    expect(result.files.perAdapter.web).toBeDefined();
    expect(result.files.perAdapter.angular).toBeUndefined();
    expect(result.files.perAdapter.dotnet).toBeUndefined();

    const gaugesOnDisk = JSON.parse(await readFile(result.files.gauges, 'utf8'));
    expect(gaugesOnDisk.gauges.map((g: { name: string }) => g.name)).toContain('--only-web-token');

    await rm(dir, { recursive: true, force: true });
  });
});

// S16: when Angular (a real stack adapter) AND the generic web adapter both match the same
// repo, the merged gauges must be the UNION of both scans (angular's own src/-only scan finds
// what it always found; web's broader scan under styles/ fills in what angular's never
// looked at) — deduplicated by name, angular's declaration winning any collision.
describe('runSurveyAndWrite — angular + web both match: gauges are unioned, angular wins collisions', () => {
  it('merges web-only tokens (under styles/, outside angular\'s src/-only scan) into gauges.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-run-angular-web-'));
    await writeFile(join(dir, 'angular.json'), '{}');
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src', 'styles.scss'), '$shared-token: #123456;\n');
    await mkdir(join(dir, 'styles'), { recursive: true });
    await writeFile(join(dir, 'styles', 'extra.css'), ':root { --web-only-token: 10px; }');

    const result = await runSurveyAndWrite(dir);

    // angular is the real stack adapter — its stack/components contribution wins.
    expect(result.survey.stack).toEqual(['angular']);

    const names = result.gauges.gauges.map((g) => g.name);
    // angular's own src/-only scan finds this one.
    expect(names).toContain('$shared-token');
    // web's broader scan (styles/, which angular's own gauge scan never looks at) fills the gap.
    expect(names).toContain('--web-only-token');

    await rm(dir, { recursive: true, force: true });
  });
});
