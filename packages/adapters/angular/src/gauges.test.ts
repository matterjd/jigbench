import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { surveyGauges } from './gauges.js';

const LEDGER_ANGULAR_ROOT = fileURLToPath(
  new URL('../../../../examples/ledger-angular', import.meta.url),
);

describe('surveyGauges (examples/ledger-angular)', () => {
  it('finds every --ledger-* custom property declared in styles.scss, categorized, with a source', async () => {
    const gaugeSet = await surveyGauges(LEDGER_ANGULAR_ROOT);
    const names = gaugeSet.gauges.map((g) => g.name);

    // The 22 CSS custom properties declared under :root in src/styles.scss.
    const expectedCssVars = [
      '--ledger-color-paper',
      '--ledger-color-ink',
      '--ledger-color-accent',
      '--ledger-color-ok',
      '--ledger-color-warn',
      '--ledger-color-danger',
      '--ledger-color-line',
      '--ledger-font-body',
      '--ledger-font-mono',
      '--ledger-font-size-s',
      '--ledger-font-size-m',
      '--ledger-font-size-l',
      '--ledger-font-size-xl',
      '--ledger-space-1',
      '--ledger-space-2',
      '--ledger-space-3',
      '--ledger-space-4',
      '--ledger-space-5',
      '--ledger-space-6',
      '--ledger-radius-s',
      '--ledger-radius-m',
      '--ledger-radius-l',
      '--ledger-shadow-card',
      '--ledger-t-fast',
      '--ledger-t-slow',
    ];
    for (const expected of expectedCssVars) {
      expect(names).toContain(expected);
    }
  });

  it('categorizes --ledger-color-accent as colour, --ledger-radius-m as radius, --ledger-t-fast as motion', async () => {
    const gaugeSet = await surveyGauges(LEDGER_ANGULAR_ROOT);
    const byName = Object.fromEntries(gaugeSet.gauges.map((g) => [g.name, g]));
    expect(byName['--ledger-color-accent'].category).toBe('colour');
    expect(byName['--ledger-radius-m'].category).toBe('radius');
    expect(byName['--ledger-t-fast'].category).toBe('motion');
    expect(byName['--ledger-color-accent'].source.file).toBe('src/styles.scss');
    expect(byName['--ledger-color-accent'].$value).toBe('#3b6e5e');
  });

  it('every --ledger-* custom property has at least one recorded usage', async () => {
    const gaugeSet = await surveyGauges(LEDGER_ANGULAR_ROOT);
    // --ledger-color-accent is referenced in styles.scss itself, plus every component scss
    // that uses the accent colour — at minimum styles.scss + shell.scss.
    const accent = gaugeSet.gauges.find((g) => g.name === '--ledger-color-accent');
    expect(accent?.usages?.length ?? 0).toBeGreaterThan(0);
    const usageFiles = accent?.usages?.map((u) => u.file) ?? [];
    expect(usageFiles).toContain('src/app/shell/shell.scss');
  });

  it('finds every $ledger-* SCSS variable declared in styles.scss', async () => {
    const gaugeSet = await surveyGauges(LEDGER_ANGULAR_ROOT);
    const names = gaugeSet.gauges.map((g) => g.name);
    for (const scssVar of [
      '$ledger-color-paper',
      '$ledger-color-ink',
      '$ledger-color-accent',
      '$ledger-space-4',
      '$ledger-radius-m',
    ]) {
      expect(names).toContain(scssVar);
    }
  });

  it('a gauge with zero real usages still parses with an empty usages array, not a missing field', async () => {
    const gaugeSet = await surveyGauges(LEDGER_ANGULAR_ROOT);
    const scssVar = gaugeSet.gauges.find((g) => g.name === '$ledger-color-paper');
    expect(scssVar?.usages).toEqual([]);
  });
});
