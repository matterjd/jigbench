import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Component, Gauge, Survey } from '@jigbench/core';
import { GaugesPanel } from './GaugesPanel.js';

function gauge(overrides: Partial<Gauge> = {}): Gauge {
  return {
    name: '--lg-primary',
    $type: 'color',
    $value: '#1a56db',
    category: 'colour',
    source: { file: 'src/styles/_tokens.scss', line: 1 },
    usages: [{ file: 'src/app/invoices/invoice-list/invoice-list.scss', count: 3 }],
    ...overrides,
  };
}

function component(overrides: Partial<Component> = {}): Component {
  return {
    name: 'InvoiceListComponent',
    selector: 'app-invoice-list',
    file: 'src/app/invoices/invoice-list/invoice-list.ts',
    standalone: true,
    inline: false,
    inputs: [],
    outputs: [],
    // Angular's own convention (adapter-angular reads `styleUrls` verbatim from the
    // decorator): relative to the component file's OWN directory, never repo-relative —
    // confirmed against a live `jigbench survey` of examples/ledger-angular. resolveGaugeUsage
    // joins this against `file` before comparing to a gauge's (repo-relative) usages.
    styleUrls: ['./invoice-list.scss'],
    ...overrides,
  };
}

const survey: Survey = {
  jigFormat: 1,
  stack: ['angular'],
  components: [component()],
  routes: [],
  endpoints: [],
  schemas: [],
  docs: [],
  generatedAt: 'now',
};

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(cleanup);

describe('GaugesPanel', () => {
  it('groups gauges into their categories with a count each', () => {
    const gauges = [
      gauge({ name: '--a', category: 'colour' }),
      gauge({ name: '--b', category: 'colour' }),
      gauge({ name: '--space-4', category: 'space', $type: 'dimension', $value: '16px' }),
    ];
    render(<GaugesPanel gauges={gauges} survey={survey} onHighlight={() => {}} onClearHighlight={() => {}} />);
    expect(screen.getByText('colour')).toBeTruthy();
    expect(screen.getByText('space')).toBeTruthy();
    // category counts
    const colourSection = screen.getByText('colour').closest('section')!;
    expect(within(colourSection).getByText('2')).toBeTruthy();
  });

  it('shows every gauge\'s value, token name, and usage count', () => {
    render(
      <GaugesPanel
        gauges={[gauge({ name: '--lg-primary', $value: '#1a56db', usages: [{ file: 'x.scss', count: 3 }] })]}
        survey={survey}
        onHighlight={() => {}}
        onClearHighlight={() => {}}
      />,
    );
    expect(screen.getByText('--lg-primary')).toBeTruthy();
    expect(screen.getByText(/#1a56db/)).toBeTruthy();
    expect(screen.getByText('3×')).toBeTruthy();
  });

  it('a category collapses and expands on click, and the row list disappears while collapsed', () => {
    render(<GaugesPanel gauges={[gauge()]} survey={survey} onHighlight={() => {}} onClearHighlight={() => {}} />);
    expect(screen.getByText('--lg-primary')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /colour/i }));
    expect(screen.queryByText('--lg-primary')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /colour/i }));
    expect(screen.getByText('--lg-primary')).toBeTruthy();
  });

  it('remembers a collapsed category across remounts in the same session', () => {
    const { unmount } = render(
      <GaugesPanel gauges={[gauge()]} survey={survey} onHighlight={() => {}} onClearHighlight={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /colour/i }));
    expect(screen.queryByText('--lg-primary')).toBeNull();
    unmount();

    render(<GaugesPanel gauges={[gauge()]} survey={survey} onHighlight={() => {}} onClearHighlight={() => {}} />);
    expect(screen.queryByText('--lg-primary')).toBeNull();
  });

  it('clicking a gauge lights it and posts jig:highlight selectors for every component that uses it', () => {
    const onHighlight = vi.fn();
    render(<GaugesPanel gauges={[gauge()]} survey={survey} onHighlight={onHighlight} onClearHighlight={() => {}} />);
    const row = screen.getByRole('button', { name: /--lg-primary/ });
    fireEvent.click(row);
    expect(onHighlight).toHaveBeenCalledWith(['app-invoice-list']);
    expect(row.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking a lit gauge again unlights it and clears the plate highlight', () => {
    const onHighlight = vi.fn();
    const onClearHighlight = vi.fn();
    render(<GaugesPanel gauges={[gauge()]} survey={survey} onHighlight={onHighlight} onClearHighlight={onClearHighlight} />);
    const row = screen.getByRole('button', { name: /--lg-primary/ });
    fireEvent.click(row);
    fireEvent.click(row);
    expect(onClearHighlight).toHaveBeenCalled();
    expect(row.getAttribute('aria-pressed')).toBe('false');
  });

  it('the printed affordance appears only once a gauge is lit, and clears it', () => {
    const onClearHighlight = vi.fn();
    render(<GaugesPanel gauges={[gauge()]} survey={survey} onHighlight={() => {}} onClearHighlight={onClearHighlight} />);
    expect(screen.queryByRole('button', { name: /^printed$/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /--lg-primary/ }));
    const printed = screen.getByRole('button', { name: /^printed$/i });
    fireEvent.click(printed);
    expect(onClearHighlight).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^printed$/i })).toBeNull();
  });

  it('lights the gauges a picked component uses, without posting anything back to the plate', () => {
    const onHighlight = vi.fn();
    render(
      <GaugesPanel
        gauges={[gauge({ name: '--lg-primary' })]}
        survey={survey}
        pickedComponent={component()}
        onHighlight={onHighlight}
        onClearHighlight={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /--lg-primary/ }).className).toContain('lit');
    expect(onHighlight).not.toHaveBeenCalled();
  });

  it('filters gauges by name or value, with its own printed to clear the filter', () => {
    const gauges = [gauge({ name: '--lg-primary', $value: '#1a56db' }), gauge({ name: '--lg-danger', $value: '#b42318' })];
    render(<GaugesPanel gauges={gauges} survey={survey} onHighlight={() => {}} onClearHighlight={() => {}} />);
    const filterBox = screen.getByRole('searchbox', { name: /filter gauges/i });
    fireEvent.change(filterBox, { target: { value: 'danger' } });
    expect(screen.queryByText('--lg-primary')).toBeNull();
    expect(screen.getByText('--lg-danger')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /printed — clear the filter/i }));
    expect((filterBox as HTMLInputElement).value).toBe('');
    expect(screen.getByText('--lg-primary')).toBeTruthy();
  });

  it('says honestly when nothing matches the filter', () => {
    render(<GaugesPanel gauges={[gauge()]} survey={survey} onHighlight={() => {}} onClearHighlight={() => {}} />);
    fireEvent.change(screen.getByRole('searchbox', { name: /filter gauges/i }), { target: { value: 'zzz-nope' } });
    expect(screen.getByText(/no gauges match/i)).toBeTruthy();
  });
});
