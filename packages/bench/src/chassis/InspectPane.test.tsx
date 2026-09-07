import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { InspectPane } from './InspectPane.js';

afterEach(() => {
  cleanup();
});
import type { Survey } from '@jigbench/core';
import type { Gauge } from '@jigbench/core';

const survey: Survey = {
  jigFormat: 1,
  stack: ['angular'],
  components: [
    {
      name: 'InvoiceListComponent',
      selector: 'app-invoice-list',
      file: 'src/app/invoices/invoice-list/invoice-list.component.ts',
      standalone: true,
      inline: false,
      inputs: [],
      outputs: [],
      styleUrls: ['invoice-list.component.css'],
    },
  ],
  routes: [{ path: '/invoices', component: 'InvoiceListComponent', file: 'src/app/app.routes.ts' }],
  endpoints: [{ method: 'GET', path: '/api/invoices' }],
  schemas: [],
  docs: [],
  generatedAt: '2026-09-07T00:00:00.000Z',
} as unknown as Survey;

const gauges: Gauge[] = [
  {
    name: 'color.line',
    category: 'colour',
    $value: '#d9dee5',
    usages: [{ file: 'src/app/invoices/invoice-list/invoice-list.component.css', property: 'border-color' }],
  },
] as unknown as Gauge[];

describe('InspectPane', () => {
  it('renders an honest empty state when nothing is picked (Point at the plate)', () => {
    render(<InspectPane lastPick={null} />);
    expect(screen.getByText((_, el) => !!el?.textContent?.match(/Point at the plate and click/i) && el.tagName === 'P')).toBeTruthy();
  });

  it('shows component, file, tag, and text for the last pick', () => {
    render(
      <InspectPane
        lastPick={{ type: 'jig:pick', path: 'div', tag: 'div', text: 'Invoices', component: 'InvoiceListComponent', file: survey.components[0].file, rect: { x: 0, y: 0, width: 10, height: 10 } }}
      />,
    );
    expect(screen.getByText('InvoiceListComponent')).toBeTruthy();
    expect(screen.getByText(survey.components[0].file)).toBeTruthy();
    expect(screen.getByText('Invoices')).toBeTruthy();
  });

  it('lists the gauges the picked component uses, and its routes by name-match, when a survey and gauge set are given', () => {
    render(
      <InspectPane
        lastPick={{ type: 'jig:pick', path: 'div', tag: 'div', text: '', component: 'InvoiceListComponent', file: survey.components[0].file, rect: { x: 0, y: 0, width: 10, height: 10 } }}
        survey={survey}
        gauges={gauges}
      />,
    );
    expect(screen.getByText('color.line')).toBeTruthy();
    expect(screen.getByText('/invoices')).toBeTruthy();
  });

  it('calls onGaugeSelect when a gauge chip is clicked', () => {
    const onGaugeSelect = vi.fn();
    render(
      <InspectPane
        lastPick={{ type: 'jig:pick', path: 'div', tag: 'div', text: '', component: 'InvoiceListComponent', file: survey.components[0].file, rect: { x: 0, y: 0, width: 10, height: 10 } }}
        survey={survey}
        gauges={gauges}
        onGaugeSelect={onGaugeSelect}
      />,
    );
    screen.getByText('color.line').click();
    expect(onGaugeSelect).toHaveBeenCalledWith('color.line');
  });
});
