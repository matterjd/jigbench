import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { cp, mkdtemp, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dotnetAdapter } from './index.js';

const LEDGER_API_ROOT = fileURLToPath(new URL('../../../../examples/ledger-api', import.meta.url));
const EXAMPLES_ROOT = fileURLToPath(new URL('../../../../examples', import.meta.url));

describe('dotnetAdapter.detect', () => {
  it('is true when a *.csproj exists at the repo root', async () => {
    expect(await dotnetAdapter.detect(LEDGER_API_ROOT)).toBe(true);
  });

  it('is true when the project is one level down (--repo pointed at examples/)', async () => {
    expect(await dotnetAdapter.detect(EXAMPLES_ROOT)).toBe(true);
  });

  it('is false on a temp dir with no .NET project in it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-dn-detect-'));
    expect(await dotnetAdapter.detect(dir)).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });
});

describe('dotnetAdapter.survey — tier (a): the recorded openapi.v1.json', () => {
  it('reads the real fixture via the openapi-file tier, not stub', async () => {
    const survey = await dotnetAdapter.survey(LEDGER_API_ROOT);

    expect(survey.stack).toEqual(['dotnet']);
    expect(survey.stub).toBe(false);
    expect(survey.endpoints).toHaveLength(7);
    expect(survey.schemas).toHaveLength(8);
    expect(survey.endpoints.every((e) => e.stub !== true)).toBe(true);
    expect(survey.adapters).toEqual([
      {
        adapter: 'dotnet',
        appRoot: LEDGER_API_ROOT.replace(/\\/g, '/').replace(/\/+$/, ''),
        source: 'openapi-file',
        stub: false,
      },
    ]);
  });
});

describe('dotnetAdapter.survey — tier (c): recorded doc removed, no server running', () => {
  it('falls all the way to the regex-lite fallback and badges everything stub:true', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-dn-copy-'));
    await cp(LEDGER_API_ROOT, dir, {
      recursive: true,
      filter: (source) => !/[\\/](bin|obj)(?:[\\/]|$)/.test(source),
    });
    await unlink(join(dir, 'openapi.v1.json'));
    // launchSettings.json still names http://localhost:5210, but nothing is listening there
    // in this test run — tier (b) fails honestly and falls through to (c).

    const survey = await dotnetAdapter.survey(dir);

    expect(survey.stub).toBe(true);
    expect(survey.endpoints.length).toBeGreaterThan(0);
    expect(survey.endpoints.every((e) => e.stub === true)).toBe(true);
    expect(survey.adapters).toEqual([
      { adapter: 'dotnet', appRoot: dir.replace(/\\/g, '/').replace(/\/+$/, ''), source: 'regex-stub', stub: true },
    ]);

    // Same paths+methods as tier (a) found from the untouched fixture.
    const tierAKeys = (await dotnetAdapter.survey(LEDGER_API_ROOT)).endpoints
      .map((e) => `${e.method} ${e.path}`)
      .sort();
    const tierCKeys = survey.endpoints.map((e) => `${e.method} ${e.path}`).sort();
    expect(tierCKeys).toEqual(tierAKeys);

    await rm(dir, { recursive: true, force: true });
  }, 15000);
});
