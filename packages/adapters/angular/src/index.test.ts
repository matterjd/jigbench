import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { angularAdapter } from './index.js';

function forwardSlashes(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

const LEDGER_ANGULAR_ROOT = fileURLToPath(
  new URL('../../../../examples/ledger-angular', import.meta.url),
);
const EXAMPLES_ROOT = fileURLToPath(new URL('../../../../examples', import.meta.url));

describe('angularAdapter.detect', () => {
  it('is true when angular.json exists at the repo root', async () => {
    expect(await angularAdapter.detect(LEDGER_ANGULAR_ROOT)).toBe(true);
  });

  it('is true when angular.json is one level down (--repo pointed at examples/)', async () => {
    expect(await angularAdapter.detect(EXAMPLES_ROOT)).toBe(true);
  });

  it('is false on a temp dir with no Angular project in it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-ng-detect-'));
    expect(await angularAdapter.detect(dir)).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });
});

describe('angularAdapter.survey', () => {
  it('produces a schema-shaped, non-stub Survey with components, routes, and schemas', async () => {
    const survey = await angularAdapter.survey(LEDGER_ANGULAR_ROOT);

    expect(survey.stub).toBe(false);
    expect(survey.stack).toEqual(['angular']);
    expect(survey.components.length).toBe(7);
    expect(survey.routes.length).toBe(5);
    expect(survey.schemas.length).toBe(5);
    expect(survey.endpoints).toEqual([]);
    expect(survey.adapters).toEqual([
      {
        adapter: 'angular',
        appRoot: forwardSlashes(LEDGER_ANGULAR_ROOT),
        source: 'ts-morph',
        stub: false,
      },
    ]);
  });

  it('resolves its own app root one level down when repoRoot is the examples/ parent', async () => {
    const survey = await angularAdapter.survey(EXAMPLES_ROOT);
    expect(survey.components.length).toBe(7);
    expect(survey.adapters?.[0]?.appRoot).toBe(`${forwardSlashes(EXAMPLES_ROOT)}/ledger-angular`);
  });
});
