// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Component, Gauge } from '@jigbench/core';
import { LoupeReadout } from './LoupeReadout.js';
import type { PlatePick } from './usePlateBridge.js';

afterEach(() => cleanup());

const pick: PlatePick = {
  type: 'jig:pick',
  path: 'app-invoice-list:nth-of-type(1)',
  tag: 'app-invoice-list',
  text: 'Invoices',
  component: 'InvoiceListComponent',
  file: 'src/app/invoices/invoice-list/invoice-list.ts',
  rect: { x: 0, y: 0, width: 10, height: 10 },
};

describe('LoupeReadout', () => {
  it('shows an honest empty state before anything has been picked', () => {
    render(<LoupeReadout lastPick={null} mode="hand" onModeChange={() => {}} />);
    expect(screen.getByText(/point at anything/i)).toBeTruthy();
  });

  it('renders a pick — component, file, tag, text', () => {
    render(<LoupeReadout lastPick={pick} mode="loupe" onModeChange={() => {}} />);
    expect(screen.getByText('InvoiceListComponent')).toBeTruthy();
    expect(screen.getByText('src/app/invoices/invoice-list/invoice-list.ts')).toBeTruthy();
    expect(screen.getByText('app-invoice-list')).toBeTruthy();
    expect(screen.getByText('Invoices')).toBeTruthy();
  });

  it('falls back to the tag when there is no component name', () => {
    render(<LoupeReadout lastPick={{ ...pick, component: undefined, file: undefined }} mode="loupe" onModeChange={() => {}} />);
    expect(screen.getAllByText('app-invoice-list').length).toBeGreaterThan(0);
  });

  it('the mode toggle calls onModeChange and reflects the current mode', () => {
    const onModeChange = vi.fn();
    render(<LoupeReadout lastPick={null} mode="hand" onModeChange={onModeChange} />);

    const loupeButton = screen.getByRole('button', { name: /loupe/i });
    expect(loupeButton.getAttribute('aria-pressed')).toBe('false');
    loupeButton.click();
    expect(onModeChange).toHaveBeenCalledWith('loupe');

    const handButton = screen.getByRole('button', { name: /hand/i });
    expect(handButton.getAttribute('aria-pressed')).toBe('true');
  });

  describe('gauges the picked component uses (S4 extension)', () => {
    const component: Component = {
      name: 'InvoiceListComponent',
      selector: 'app-invoice-list',
      file: 'src/app/invoices/invoice-list/invoice-list.ts',
      standalone: true,
      inline: false,
      inputs: [],
      outputs: [],
      styleUrls: ['src/app/invoices/invoice-list/invoice-list.scss'],
    };
    const usedGauge: Gauge = {
      name: '--lg-primary',
      $type: 'color',
      $value: '#1a56db',
      category: 'colour',
      source: { file: 'src/styles/_tokens.scss', line: 1 },
      usages: [{ file: 'src/app/invoices/invoice-list/invoice-list.scss', count: 2 }],
    };
    const unusedGauge: Gauge = {
      name: '--lg-danger',
      $type: 'color',
      $value: '#b42318',
      category: 'colour',
      source: { file: 'src/styles/_tokens.scss', line: 1 },
      usages: [{ file: 'src/app/customers/customer-list.scss', count: 1 }],
    };

    it('says honestly when there is no pick, no survey, or no gauges given', () => {
      render(<LoupeReadout lastPick={null} mode="loupe" onModeChange={() => {}} />);
      expect(screen.queryByText(/gauges it uses/i)).toBeNull();
    });

    it('lists only the gauges whose usages include the picked component\'s styleUrls', () => {
      render(
        <LoupeReadout
          lastPick={pick}
          mode="loupe"
          onModeChange={() => {}}
          survey={{
            jigFormat: 1,
            stack: [],
            components: [component],
            routes: [],
            endpoints: [],
            schemas: [],
            docs: [],
            generatedAt: 'now',
          }}
          gauges={[usedGauge, unusedGauge]}
        />,
      );
      expect(screen.getByText('--lg-primary')).toBeTruthy();
      expect(screen.queryByText('--lg-danger')).toBeNull();
    });

    it('clicking a gauge chip calls onGaugeSelect with that gauge\'s name', () => {
      const onGaugeSelect = vi.fn();
      render(
        <LoupeReadout
          lastPick={pick}
          mode="loupe"
          onModeChange={() => {}}
          survey={{
            jigFormat: 1,
            stack: [],
            components: [component],
            routes: [],
            endpoints: [],
            schemas: [],
            docs: [],
            generatedAt: 'now',
          }}
          gauges={[usedGauge]}
          onGaugeSelect={onGaugeSelect}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /--lg-primary/ }));
      expect(onGaugeSelect).toHaveBeenCalledWith('--lg-primary');
    });

    it('says honestly when the picked component uses no surveyed gauges', () => {
      render(
        <LoupeReadout
          lastPick={pick}
          mode="loupe"
          onModeChange={() => {}}
          survey={{
            jigFormat: 1,
            stack: [],
            components: [component],
            routes: [],
            endpoints: [],
            schemas: [],
            docs: [],
            generatedAt: 'now',
          }}
          gauges={[unusedGauge]}
        />,
      );
      expect(screen.getByText(/no gauges on this element/i)).toBeTruthy();
    });
  });
});
