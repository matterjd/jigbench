// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
});
