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
    expect(screen.queryByRole('button', { name: /printed/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /--lg-primary/ }));
    const printed = screen.getByRole('button', { name: /printed/i });
    fireEvent.click(printed);
    expect(onClearHighlight).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /printed/i })).toBeNull();
  });

  // Finding 7 (wave-3 council, spec medium): CHASSIS.md's floor list says "every filtered
  // or resized surface has one `printed` affordance" — singular. This panel used to render
  // TWO independent ones (a filter-row one clearing only the filter, a footer one clearing
  // only the lit gauge) — with both a filter typed AND a gauge lit, both were on screen at
  // once. There must be exactly one, and it must clear both bits of state together.
  it('renders exactly one printed affordance even when the filter is set AND a gauge is lit — and it clears both', () => {
    const onClearHighlight = vi.fn();
    const gauges = [gauge({ name: '--lg-primary', $value: '#1a56db' }), gauge({ name: '--lg-danger', $value: '#b42318' })];
    render(<GaugesPanel gauges={gauges} survey={survey} onHighlight={() => {}} onClearHighlight={onClearHighlight} />);

    fireEvent.change(screen.getByRole('searchbox', { name: /filter gauges/i }), { target: { value: 'danger' } });
    fireEvent.click(screen.getByRole('button', { name: /--lg-danger/ }));

    expect(screen.getAllByRole('button', { name: /printed/i })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /printed/i }));

    expect(onClearHighlight).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /printed/i })).toBeNull();
    expect((screen.getByRole('searchbox', { name: /filter gauges/i }) as HTMLInputElement).value).toBe('');
    expect(screen.getByText('--lg-primary')).toBeTruthy(); // the filter is gone -- both gauges show again
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

  it('filters gauges by name or value, with the one panel-level printed clearing it', () => {
    const gauges = [gauge({ name: '--lg-primary', $value: '#1a56db' }), gauge({ name: '--lg-danger', $value: '#b42318' })];
    render(<GaugesPanel gauges={gauges} survey={survey} onHighlight={() => {}} onClearHighlight={() => {}} />);
    const filterBox = screen.getByRole('searchbox', { name: /filter gauges/i });
    fireEvent.change(filterBox, { target: { value: 'danger' } });
    expect(screen.queryByText('--lg-primary')).toBeNull();
    expect(screen.getByText('--lg-danger')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /printed/i }));
    expect((filterBox as HTMLInputElement).value).toBe('');
    expect(screen.getByText('--lg-primary')).toBeTruthy();
  });

  // Wave-4 fix (TEST-RUN.md's first live test, defect 4): "I did click on whats printed and
  // got stuck in that view." `printed` must return the surface to its default INCLUDING
  // scroll position — the properties column's tab body is the actual scrolling box
  // (PropertiesColumn.css's `.jig-properties__pane`, this panel's parent), not anything
  // inside GaugesPanel. It must never touch the active tab or the tool — GaugesPanel has no
  // way to do either (no onTabChange/onToolChange prop exists), so that half of the
  // requirement holds by construction; this asserts the scroll-reset half.
  it('the printed affordance scrolls the properties pane back to the top', () => {
    const onClearHighlight = vi.fn();
    // Rendered inside a real `.jig-properties__pane` ancestor — the actual scrolling box in
    // production (PropertiesColumn.css) — so `closest('.jig-properties__pane')` inside
    // GaugesPanel resolves to a real element, part of the SAME render tree (moving a node to
    // a detached container after the fact would put it outside React's event-delegation
    // root and break `fireEvent.click` on it).
    const { container } = render(
      <div className="jig-properties__pane">
        <GaugesPanel gauges={[gauge()]} survey={survey} onHighlight={() => {}} onClearHighlight={onClearHighlight} />
      </div>,
    );
    const pane = container.querySelector('.jig-properties__pane') as HTMLElement;
    const scrollTo = vi.fn();
    pane.scrollTo = scrollTo;

    fireEvent.click(screen.getByRole('button', { name: /--lg-primary/ })); // lights a gauge -> printed appears
    fireEvent.click(screen.getByRole('button', { name: /printed/i }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it('says honestly when nothing matches the filter', () => {
    render(<GaugesPanel gauges={[gauge()]} survey={survey} onHighlight={() => {}} onClearHighlight={() => {}} />);
    fireEvent.change(screen.getByRole('searchbox', { name: /filter gauges/i }), { target: { value: 'zzz-nope' } });
    expect(screen.getByText(/no gauges match/i)).toBeTruthy();
  });
});
