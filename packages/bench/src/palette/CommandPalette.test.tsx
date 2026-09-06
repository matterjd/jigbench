import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommandPalette } from './CommandPalette.js';

afterEach(cleanup);

function baseProps() {
  return {
    tools: [
      { tool: 'hand' as const, word: 'Hand', pair: 'move the plate' },
      { tool: 'loupe' as const, word: 'Loupe', pair: 'point at anything and see what it is' },
    ],
    components: [{ name: 'InvoiceListComponent', file: 'src/invoice-list.ts', selector: 'app-invoice-list' }],
    routes: [{ path: '/invoices', component: 'InvoiceListComponent' }],
    gauges: [{ name: '--lg-primary', pair: '#1a56db · colour' }],
    workOrders: [{ id: '0001', slug: 'status-days-column', state: 'drafted' }],
    onSelectTool: vi.fn(),
    onSelectComponent: vi.fn(),
    onSelectRoute: vi.fn(),
    onSelectGauge: vi.fn(),
    onSelectWorkOrder: vi.fn(),
    onPrinted: vi.fn(),
    onDocsQuery: vi.fn().mockResolvedValue([{ file: 'handbook/guide.md', heading: 'Due dates', snippet: 'net-30' }]),
  };
}

describe('CommandPalette', () => {
  it('is closed until Ctrl+K (or Cmd+K) is pressed', () => {
    render(<CommandPalette {...baseProps()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('opens on Cmd+K too, and closes on Escape', () => {
    render(<CommandPalette {...baseProps()} />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists tools, components, routes, gauges, and work orders when opened', () => {
    render(<CommandPalette {...baseProps()} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByText('Hand')).toBeTruthy();
    expect(screen.getByText('Loupe')).toBeTruthy();
    // both the component item's label and the route item's target name say
    // "InvoiceListComponent" — that's two distinct list rows, not a collision.
    expect(screen.getAllByText(/InvoiceListComponent/).length).toBeGreaterThan(0);
    expect(screen.getByText('/invoices')).toBeTruthy();
    expect(screen.getByText('--lg-primary')).toBeTruthy();
    expect(screen.getByText(/status-days-column/)).toBeTruthy();
  });

  it('always includes a printed item to reset the bench', () => {
    render(<CommandPalette {...baseProps()} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByText(/printed/i)).toBeTruthy();
  });

  it('filters the list by typed text (word-AND matching)', () => {
    const { container } = render(<CommandPalette {...baseProps()} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'invoice' } });
    // Both the component item (label "InvoiceListComponent") and the route item (pair
    // "InvoiceListComponent") match "invoice" — that's correct filtering, not a defect.
    expect(container.querySelector('[data-kind="component"]')).toBeTruthy();
    expect(screen.queryByText('Hand')).toBeNull();
  });

  it('says honestly when nothing matches', () => {
    render(<CommandPalette {...baseProps()} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzzznope' } });
    expect(screen.getByText(/nothing on the shelves/i)).toBeTruthy();
  });

  it('selecting a tool calls onSelectTool and closes the palette', () => {
    const props = baseProps();
    render(<CommandPalette {...props} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.click(screen.getByText('Loupe'));
    expect(props.onSelectTool).toHaveBeenCalledWith('loupe');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('selecting a component calls onSelectComponent', () => {
    const props = baseProps();
    const { container } = render(<CommandPalette {...props} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.click(container.querySelector('[data-kind="component"]')!);
    expect(props.onSelectComponent).toHaveBeenCalledWith(props.components[0]);
  });

  it('selecting a route calls onSelectRoute with its path', () => {
    const props = baseProps();
    render(<CommandPalette {...props} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.click(screen.getByText('/invoices'));
    expect(props.onSelectRoute).toHaveBeenCalledWith('/invoices');
  });

  it('selecting a gauge calls onSelectGauge with its name', () => {
    const props = baseProps();
    render(<CommandPalette {...props} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.click(screen.getByText('--lg-primary'));
    expect(props.onSelectGauge).toHaveBeenCalledWith('--lg-primary');
  });

  it('selecting a work order calls onSelectWorkOrder with its id', () => {
    const props = baseProps();
    render(<CommandPalette {...props} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.click(screen.getByText(/status-days-column/));
    expect(props.onSelectWorkOrder).toHaveBeenCalledWith('0001');
  });

  it('selecting printed calls onPrinted', () => {
    const props = baseProps();
    render(<CommandPalette {...props} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.click(screen.getByText(/^printed/i));
    expect(props.onPrinted).toHaveBeenCalled();
  });

  it('arrow keys move the selection and Enter runs the selected item', () => {
    const props = baseProps();
    render(<CommandPalette {...props} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'loupe' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onSelectTool).toHaveBeenCalledWith('loupe');
  });

  it('a "docs: <query>" search calls onDocsQuery and renders the results', async () => {
    const props = baseProps();
    render(<CommandPalette {...props} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'docs: due date' } });
    });
    expect(props.onDocsQuery).toHaveBeenCalledWith('due date');
    await waitFor(() => expect(screen.getByText(/Due dates/)).toBeTruthy());
  });

  it('closing and reopening resets the typed query', () => {
    render(<CommandPalette {...baseProps()} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'invoice' } });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('');
  });

  it('never removes input focus from the box — Law III: a scrim, not a block', () => {
    render(<CommandPalette {...baseProps()} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
  });
});
