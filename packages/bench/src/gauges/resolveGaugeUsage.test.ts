import { describe, expect, it } from 'vitest';
import type { Component, Gauge } from '@jigbench/core';
import { gaugesForComponent, selectorsForGauge } from './resolveGaugeUsage.js';

function component(overrides: Partial<Component> = {}): Component {
  return {
    name: 'InvoiceListComponent',
    selector: 'app-invoice-list',
    file: 'src/app/invoices/invoice-list/invoice-list.ts',
    standalone: true,
    inline: false,
    inputs: [],
    outputs: [],
    styleUrls: ['src/app/invoices/invoice-list/invoice-list.scss'],
    ...overrides,
  };
}

function gauge(overrides: Partial<Gauge> = {}): Gauge {
  return {
    name: '--lg-primary',
    $type: 'color',
    $value: '#1a56db',
    category: 'colour',
    source: { file: 'src/styles/_tokens.scss', line: 1 },
    usages: [],
    ...overrides,
  };
}

describe('gaugesForComponent', () => {
  it('returns gauges whose usages include one of the component\'s styleUrls', () => {
    const c = component();
    const g1 = gauge({ name: '--lg-primary', usages: [{ file: 'src/app/invoices/invoice-list/invoice-list.scss', count: 3 }] });
    const g2 = gauge({ name: '--lg-line', usages: [{ file: 'src/app/customers/customer-list.scss', count: 1 }] });
    expect(gaugesForComponent(c, [g1, g2])).toEqual([g1]);
  });

  it('returns an empty array for a component with no matching gauge usages', () => {
    const c = component({ styleUrls: ['src/app/orphan.scss'] });
    const g1 = gauge({ usages: [{ file: 'src/app/other.scss', count: 1 }] });
    expect(gaugesForComponent(c, [g1])).toEqual([]);
  });

  it('returns an empty array when the component is undefined (nothing picked)', () => {
    expect(gaugesForComponent(undefined, [gauge()])).toEqual([]);
  });

  it('treats a gauge with no usages field as matching nothing', () => {
    const c = component();
    const g1 = gauge({ usages: undefined });
    expect(gaugesForComponent(c, [g1])).toEqual([]);
  });

  it('never returns the same gauge twice even if it matches more than one styleUrl', () => {
    const c = component({ styleUrls: ['a.scss', 'b.scss'] });
    const g1 = gauge({
      name: '--dup',
      usages: [
        { file: 'a.scss', count: 1 },
        { file: 'b.scss', count: 2 },
      ],
    });
    expect(gaugesForComponent(c, [g1])).toEqual([g1]);
  });
});

describe('selectorsForGauge', () => {
  it('returns the selectors of every component whose styleUrls include one of the gauge\'s usage files', () => {
    const g = gauge({
      usages: [
        { file: 'src/app/invoices/invoice-list/invoice-list.scss', count: 3 },
        { file: 'src/app/customers/customer-list.scss', count: 1 },
      ],
    });
    const c1 = component({ selector: 'app-invoice-list', styleUrls: ['src/app/invoices/invoice-list/invoice-list.scss'] });
    const c2 = component({ name: 'CustomerListComponent', selector: 'app-customer-list', styleUrls: ['src/app/customers/customer-list.scss'] });
    const c3 = component({ name: 'PaymentsComponent', selector: 'app-payments', styleUrls: ['src/app/payments.scss'] });
    expect(selectorsForGauge(g, [c1, c2, c3]).sort()).toEqual(['app-customer-list', 'app-invoice-list']);
  });

  it('returns an empty array for a gauge with no usages', () => {
    expect(selectorsForGauge(gauge({ usages: [] }), [component()])).toEqual([]);
  });

  it('returns an empty array for a gauge with no usages field at all', () => {
    expect(selectorsForGauge(gauge({ usages: undefined }), [component()])).toEqual([]);
  });

  it('never returns the same selector twice', () => {
    const g = gauge({
      usages: [
        { file: 'a.scss', count: 1 },
        { file: 'b.scss', count: 1 },
      ],
    });
    const c = component({ styleUrls: ['a.scss', 'b.scss'] });
    expect(selectorsForGauge(g, [c])).toEqual(['app-invoice-list']);
  });
});
