import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSurveyCommand } from './survey.js';

const EXAMPLES_SOURCE = fileURLToPath(new URL('../../../../examples', import.meta.url));

describe('runSurveyCommand — nothing detected (S2: adapters are registered but this repo matches neither)', () => {
  it('says so honestly (not the old S1 "no adapter registered" wording) and writes a stub survey', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-survey-cmd-none-'));

    const { message } = await runSurveyCommand({ repo: repoRoot });

    expect(message).toContain('No survey adapter detected a matching repo');
    expect(message).toContain('.jig');

    const file = join(repoRoot, '.jig', 'survey', 'survey.json');
    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk.stub).toBe(true);

    await rm(repoRoot, { recursive: true, force: true });
  });
});

describe('runSurveyCommand — a real clamp (examples/, both stacks)', () => {
  let examplesCopy: string;

  beforeAll(async () => {
    examplesCopy = await mkdtemp(join(tmpdir(), 'jig-survey-cmd-both-'));
    await cp(EXAMPLES_SOURCE, examplesCopy, {
      recursive: true,
      filter: (source) => !/[\\/](node_modules|bin|obj|\.angular|dist)(?:[\\/]|$)/.test(source),
    });
  }, 30000);

  afterAll(async () => {
    await rm(examplesCopy, { recursive: true, force: true });
  });

  it('prints a one-screen summary with counts per kind, the dotnet tier, and the app roots found', async () => {
    const { message, survey } = await runSurveyCommand({ repo: examplesCopy });

    expect(survey.stub).toBe(false);
    expect(message).toContain('7 component');
    expect(message).toContain('5 route');
    expect(message).toContain('7 endpoint');
    expect(message).toContain('angular');
    expect(message).toContain('dotnet');
    expect(message).toContain('openapi-file');
    expect(message).toContain('ledger-angular');
    expect(message).toContain('ledger-api');
  }, 20000);

  it('--json mode: returns the same survey object the human summary was built from', async () => {
    const { survey } = await runSurveyCommand({ repo: examplesCopy, json: true });
    expect(survey.components.length).toBe(7);
    expect(survey.stack.slice().sort()).toEqual(['angular', 'dotnet']);
  }, 20000);
});
