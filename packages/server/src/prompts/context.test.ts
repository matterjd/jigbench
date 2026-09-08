import { describe, expect, it } from 'vitest';
import { JIG_FORMAT, stubSurvey, type Component, type GaugeSet, type Survey } from '@jigbench/core';
import { buildPromptContext } from './context.js';

// #19 (the 0.2.0 review): the prompt's Context read "nothing surveyed yet" for a pick that
// named `_InvoiceListComponent` — Angular's dev build decorates the class name, and this
// module matched `c.name === target.component` exactly. The loupe now reports the survey's
// own name when a selector matched; the decorated runtime name is still matched here, with
// the underscore stripped, as the last resort.

const invoiceList: Component = {
  name: 'InvoiceListComponent',
  selector: 'app-invoice-list',
  file: 'src/app/invoices/invoice-list.ts',
  standalone: true,
  inline: false,
  inputs: [],
  outputs: [],
  templateUrl: './invoice-list.html',
  styleUrls: ['./invoice-list.scss'],
};

function surveyWith(...components: Component[]): Survey {
  return { ...stubSurvey(), stub: false, components };
}

const gauges: GaugeSet = { jigFormat: JIG_FORMAT, gauges: [], generatedAt: new Date().toISOString() };

describe('buildPromptContext — finding the picked component', () => {
  it('matches the survey by the exact name the loupe reports', () => {
    const context = buildPromptContext({
      survey: surveyWith(invoiceList),
      gauges,
      target: { kind: 'element', path: 'app-invoice-list', component: 'InvoiceListComponent' },
      queryText: 'show days overdue',
    });
    expect(context.components.map((c) => c.name)).toEqual(['InvoiceListComponent']);
    expect(context.files).toContain('src/app/invoices/invoice-list.ts');
  });

  it("matches a runtime class name carrying Angular's dev-build underscore — the last resort (#19)", () => {
    const context = buildPromptContext({
      survey: surveyWith(invoiceList),
      gauges,
      target: { kind: 'element', path: 'app-invoice-list', component: '_InvoiceListComponent' },
      queryText: 'show days overdue',
    });
    expect(context.components.map((c) => c.name)).toEqual(['InvoiceListComponent']);
    expect(context.files).toContain('src/app/invoices/invoice-list.ts');
  });

  it('a file match still comes before the stripped-name fallback', () => {
    const other: Component = { ...invoiceList, name: 'InvoiceListComponent', file: 'src/other/invoice-list.ts' };
    const context = buildPromptContext({
      survey: surveyWith(other, invoiceList),
      gauges,
      target: { kind: 'element', path: 'x', component: '_Nope', file: 'src/app/invoices/invoice-list.ts' },
      queryText: 'x',
    });
    expect(context.files).toContain('src/app/invoices/invoice-list.ts');
    expect(context.files).not.toContain('src/other/invoice-list.ts');
  });

  it('an unmatched target yields an honest, thinner context — never a throw', () => {
    const context = buildPromptContext({
      survey: surveyWith(invoiceList),
      gauges,
      target: { kind: 'element', path: 'div', component: 'Nothing' },
      queryText: 'x',
    });
    expect(context.components).toEqual([]);
    expect(context.files).toEqual([]);
  });
});
