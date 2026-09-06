import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SurveySchema, type Survey } from '@jigbench/core';
import { buildShopFace } from './shop-face.js';

const FIXTURE_PATH = fileURLToPath(new URL('./__fixtures__/ledger-survey.json', import.meta.url));

async function ledgerSurvey(): Promise<Survey> {
  const raw = await readFile(FIXTURE_PATH, 'utf8');
  const substituted = raw.replace('GENERATED_AT', '2026-09-05T00:00:00.000Z').replace('APP_ROOT', '/repo');
  return SurveySchema.parse(JSON.parse(substituted));
}

describe('buildShopFace — deterministic, from the real ledger-angular survey', () => {
  it('names the component file, template, styles and spec for a pick on app-invoice-list', async () => {
    const survey = await ledgerSurvey();

    const shop = buildShopFace({
      survey,
      componentName: 'InvoiceListComponent',
      human: { what: 'flag overdue invoices', why: 'nothing calls out overdue rows today', where: 'InvoiceListComponent', acceptance: [] },
      promptText: 'flag overdue invoices',
    });

    expect(shop.files).toEqual([
      'src/app/invoices/invoice-list/invoice-list.html',
      'src/app/invoices/invoice-list/invoice-list.scss',
      'src/app/invoices/invoice-list/invoice-list.spec.ts',
      'src/app/invoices/invoice-list/invoice-list.ts',
    ]);
  });

  it('names standalone-component and input/output patterns the survey actually proves', async () => {
    const survey = await ledgerSurvey();

    const shop = buildShopFace({
      survey,
      componentName: 'StatusChipComponent',
      human: { what: 'x', why: 'y', where: 'StatusChipComponent', acceptance: [] },
      promptText: 'x',
    });

    expect(shop.patterns).toContain('standalone component');
    expect(shop.patterns).toContain('1 typed input');
  });

  it('lists a spec file to extend under tests', async () => {
    const survey = await ledgerSurvey();

    const shop = buildShopFace({
      survey,
      componentName: 'InvoiceListComponent',
      human: { what: 'flag overdue invoices', why: '', where: 'InvoiceListComponent', acceptance: [] },
      promptText: 'flag overdue invoices',
    });

    expect(shop.tests.some((t) => t.startsWith('src/app/invoices/invoice-list/invoice-list.spec.ts'))).toBe(true);
  });

  it('adds the route file when the prompt names navigation and a route matches the component', async () => {
    const survey = await ledgerSurvey();

    const shop = buildShopFace({
      survey,
      componentName: 'InvoiceDetailComponent',
      human: { what: 'add a link back to the list', why: '', where: 'InvoiceDetailComponent', acceptance: [] },
      promptText: 'add a link back to the list — navigate to invoices',
    });

    expect(shop.patterns.some((p) => /route/i.test(p))).toBe(true);
  });

  it('is a pure function of its input — same survey and pick, same output, every call', async () => {
    const survey = await ledgerSurvey();
    const input = {
      survey,
      componentName: 'InvoiceListComponent',
      human: { what: 'flag overdue invoices', why: '', where: 'InvoiceListComponent', acceptance: [] },
      promptText: 'flag overdue invoices',
    };

    expect(buildShopFace(input)).toEqual(buildShopFace(input));
  });

  it('degrades honestly — no invented files — when no surveyed component matches the pick', async () => {
    const survey = await ledgerSurvey();

    const shop = buildShopFace({
      survey,
      componentName: 'NoSuchComponent',
      file: 'src/app/nowhere.ts',
      human: { what: 'x', why: '', where: 'nowhere', acceptance: [] },
      promptText: 'x',
    });

    expect(shop.files).toEqual([]);
    expect(shop.patterns.some((p) => /no surveyed component/i.test(p))).toBe(true);
  });

  it('writes a non-empty brief that mentions the human "what"', async () => {
    const survey = await ledgerSurvey();

    const shop = buildShopFace({
      survey,
      componentName: 'InvoiceListComponent',
      human: { what: 'flag overdue invoices', why: 'nothing calls out overdue rows today', where: 'InvoiceListComponent', acceptance: [] },
      promptText: 'flag overdue invoices',
    });

    expect(shop.brief.length).toBeGreaterThan(0);
    expect(shop.brief).toContain('flag overdue invoices');
  });
});
