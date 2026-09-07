import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { surveyGauges } from './gauges.js';

const PLAIN_SITE_ROOT = fileURLToPath(
  new URL('./__fixtures__/plain-html-css-site', import.meta.url),
);
const VITE_REACT_ROOT = fileURLToPath(new URL('./__fixtures__/vite-react-app', import.meta.url));

describe('surveyGauges (plain-html-css-site fixture, styles/site.css)', () => {
  it('finds every --harness-* custom property under styles/, categorized, with a source', async () => {
    const gaugeSet = await surveyGauges(PLAIN_SITE_ROOT);
    const byName = Object.fromEntries(gaugeSet.gauges.map((g) => [g.name, g]));

    expect(byName['--harness-storm']).toBeDefined();
    expect(byName['--harness-storm'].category).toBe('colour');
    expect(byName['--harness-storm'].$value).toBe('#5fc9e0');
    expect(byName['--harness-storm'].source.file).toBe('styles/site.css');

    expect(byName['--harness-space-2'].category).toBe('space');
  });

  it('records a usage for a custom property referenced via var()', async () => {
    const gaugeSet = await surveyGauges(PLAIN_SITE_ROOT);
    const storm = gaugeSet.gauges.find((g) => g.name === '--harness-storm');
    expect(storm?.usages?.length ?? 0).toBeGreaterThan(0);
    expect(storm?.usages?.[0]?.file).toBe('styles/site.css');
  });
});

describe('surveyGauges (vite-react-app fixture, src/index.css)', () => {
  it('finds custom properties under src/', async () => {
    const gaugeSet = await surveyGauges(VITE_REACT_ROOT);
    const names = gaugeSet.gauges.map((g) => g.name);
    expect(names).toContain('--app-accent');
    expect(names).toContain('--app-space-1');
  });
});

describe('surveyGauges — SCSS and Less variables', () => {
  it('finds $scss variables and @less variables, but never mistakes a Less at-rule for one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-web-gauges-'));
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(
      join(dir, 'src', 'tokens.scss'),
      '$brand-accent: #112233;\n.thing { color: $brand-accent; }\n',
    );
    await writeFile(
      join(dir, 'src', 'tokens.less'),
      '@import "reset.less";\n@media (max-width: 600px) { .thing { color: red; } }\n@brand-space: 4px;\n.thing2 { margin: @brand-space; }\n',
    );

    const gaugeSet = await surveyGauges(dir);
    const names = gaugeSet.gauges.map((g) => g.name);
    expect(names).toContain('$brand-accent');
    expect(names).toContain('@brand-space');
    // Neither the @import statement nor the @media at-rule is mistaken for a variable
    // declaration.
    expect(names).not.toContain('@import');
    expect(names).not.toContain('@media');

    const scssVar = gaugeSet.gauges.find((g) => g.name === '$brand-accent');
    expect(scssVar?.usages?.length ?? 0).toBeGreaterThan(0);
    const lessVar = gaugeSet.gauges.find((g) => g.name === '@brand-space');
    expect(lessVar?.usages?.length ?? 0).toBeGreaterThan(0);

    await rm(dir, { recursive: true, force: true });
  });
});

describe('surveyGauges — scans packages/*/ and apps/*/ subtrees too, not just src/app/public/styles', () => {
  it('finds a custom property declared under packages/some-lib/src', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-web-gauges-monorepo-'));
    await mkdir(join(dir, 'packages', 'some-lib', 'src'), { recursive: true });
    await writeFile(
      join(dir, 'packages', 'some-lib', 'src', 'tokens.css'),
      ':root { --lib-accent: #ff00ff; }',
    );

    const gaugeSet = await surveyGauges(dir);
    const names = gaugeSet.gauges.map((g) => g.name);
    expect(names).toContain('--lib-accent');

    await rm(dir, { recursive: true, force: true });
  });

  it('never descends into node_modules, dist, build, or target', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-web-gauges-skip-'));
    await mkdir(join(dir, 'src', 'node_modules'), { recursive: true });
    await writeFile(
      join(dir, 'src', 'node_modules', 'vendored.css'),
      ':root { --vendored-should-not-appear: #000; }',
    );
    await mkdir(join(dir, 'dist'), { recursive: true });
    await writeFile(join(dir, 'dist', 'bundled.css'), ':root { --bundled-should-not-appear: #000; }');

    const gaugeSet = await surveyGauges(dir);
    const names = gaugeSet.gauges.map((g) => g.name);
    expect(names).not.toContain('--vendored-should-not-appear');
    expect(names).not.toContain('--bundled-should-not-appear');

    await rm(dir, { recursive: true, force: true });
  });
});
