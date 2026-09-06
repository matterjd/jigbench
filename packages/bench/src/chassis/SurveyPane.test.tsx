import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Survey } from '@jigbench/core';
import { SurveyPane } from './SurveyPane.js';

afterEach(cleanup);

const survey: Survey = {
  jigFormat: 1,
  stack: ['angular', 'dotnet'],
  components: [
    {
      name: 'InvoiceListComponent',
      selector: 'app-invoice-list',
      file: 'src/app/invoices/invoice-list/invoice-list.ts',
      standalone: true,
      inline: false,
      inputs: [{ name: 'rows', required: true }],
      outputs: [{ name: 'select', required: false }],
      styleUrls: ['src/app/invoices/invoice-list/invoice-list.scss'],
    },
  ],
  routes: [{ path: '/invoices', component: 'InvoiceListComponent', file: 'src/app/app.routes.ts' }],
  endpoints: [
    { method: 'GET', path: '/api/invoices' },
    { method: 'POST', path: '/api/invoices', stub: true },
  ],
  schemas: [],
  docs: [],
  generatedAt: 'now',
};

describe('SurveyPane', () => {
  it('shows an honest empty state before a survey has run', () => {
    render(<SurveyPane survey={undefined} docsCount={0} />);
    expect(screen.getByText(/no survey yet/i)).toBeTruthy();
  });

  it('lists the stack', () => {
    render(<SurveyPane survey={survey} docsCount={0} />);
    expect(screen.getByText(/angular/)).toBeTruthy();
    expect(screen.getByText(/dotnet/)).toBeTruthy();
  });

  it('lists every component with its selector, file, inputs, and outputs', () => {
    render(<SurveyPane survey={survey} docsCount={0} />);
    expect(screen.getAllByText('InvoiceListComponent').length).toBeGreaterThan(0);
    expect(screen.getByText('app-invoice-list')).toBeTruthy();
    expect(screen.getByText('src/app/invoices/invoice-list/invoice-list.ts')).toBeTruthy();
    expect(screen.getByText(/rows/)).toBeTruthy();
    expect(screen.getByText(/select/)).toBeTruthy();
  });

  it('says honestly when instance counts are not available (S2 does not compute them)', () => {
    render(<SurveyPane survey={survey} docsCount={0} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('lists every route', () => {
    render(<SurveyPane survey={survey} docsCount={0} />);
    expect(screen.getByText('/invoices')).toBeTruthy();
    expect(screen.getAllByText('InvoiceListComponent').length).toBeGreaterThan(0);
  });

  it('lists every endpoint with method + path, and badges the stub one', () => {
    render(<SurveyPane survey={survey} docsCount={0} />);
    expect(screen.getByText('GET')).toBeTruthy();
    expect(screen.getAllByText('/api/invoices').length).toBe(2);
    expect(screen.getByText(/stub/i)).toBeTruthy();
  });

  it('shows the clamped docs count from GET /api/docs', () => {
    render(<SurveyPane survey={survey} docsCount={5} />);
    expect(screen.getByText(/5/)).toBeTruthy();
  });
});
