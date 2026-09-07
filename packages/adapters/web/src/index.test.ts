import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webAdapter } from './index.js';

const PLAIN_SITE_ROOT = fileURLToPath(
  new URL('./__fixtures__/plain-html-css-site', import.meta.url),
);
const VITE_REACT_ROOT = fileURLToPath(new URL('./__fixtures__/vite-react-app', import.meta.url));
const EMPTY_REPO_ROOT = fileURLToPath(new URL('./__fixtures__/empty-repo', import.meta.url));

function forwardSlashes(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

describe('webAdapter.detect', () => {
  it('is true for a plain HTML+CSS site with no package.json', async () => {
    expect(await webAdapter.detect(PLAIN_SITE_ROOT)).toBe(true);
  });

  it('is true for a package.json-only repo (Vite+React)', async () => {
    expect(await webAdapter.detect(VITE_REACT_ROOT)).toBe(true);
  });

  it('is false for a repo with neither a package.json nor a stylesheet', async () => {
    expect(await webAdapter.detect(EMPTY_REPO_ROOT)).toBe(false);
  });

  it('is false on a fresh empty temp dir', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-web-detect-'));
    expect(await webAdapter.detect(dir)).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });
});

describe('webAdapter.survey', () => {
  it('never invents components or routes — always empty, flagged unknown', async () => {
    const survey = await webAdapter.survey(PLAIN_SITE_ROOT);
    expect(survey.stack).toEqual(['web']);
    expect(survey.components).toEqual([]);
    expect(survey.routes).toEqual([]);
    expect(survey.endpoints).toEqual([]);
    expect(survey.stub).toBe(false);
    expect(survey.adapters).toHaveLength(1);
    expect(survey.adapters?.[0]).toMatchObject({
      adapter: 'web',
      appRoot: forwardSlashes(PLAIN_SITE_ROOT),
      source: 'css/scss scan',
      stub: false,
      unknown: true,
    });
  });

  it('reports a devServer guess and frameworks hint for the Vite+React fixture', async () => {
    const survey = await webAdapter.survey(VITE_REACT_ROOT);
    const meta = survey.adapters?.[0];
    expect(meta?.devServer).toBe('http://localhost:5173');
    expect(meta?.frameworks).toEqual(['react']);
  });

  it('carries no devServer/frameworks fields at all when there is no package.json to read', async () => {
    const survey = await webAdapter.survey(PLAIN_SITE_ROOT);
    const meta = survey.adapters?.[0];
    expect(meta?.devServer).toBeUndefined();
    expect(meta?.frameworks).toBeUndefined();
  });

  it('returns an honest stub when nothing detects', async () => {
    const survey = await webAdapter.survey(EMPTY_REPO_ROOT);
    expect(survey.stub).toBe(true);
    expect(survey.stack).toEqual([]);
    expect(survey.adapters).toEqual([{ adapter: 'web', stub: true }]);
  });
});
