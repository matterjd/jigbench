import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StatusLine } from './StatusLine.js';

afterEach(() => cleanup());

describe('StatusLine', () => {
  it('shows "Claude · not installed" when wiring.claude is none', () => {
    render(<StatusLine wired={false} status={undefined} logbookOpen={false} onToggleLogbook={vi.fn()} />);
    expect(screen.getByText(/not installed/)).toBeTruthy();
  });

  it('shows "Claude · idle" at rest when installed', () => {
    render(<StatusLine wired status={{ state: 'idle' }} logbookOpen={false} onToggleLogbook={vi.fn()} />);
    expect(screen.getByText(/idle/)).toBeTruthy();
  });

  it('shows building with elapsed mm:ss and the latest event text', () => {
    render(
      <StatusLine
        wired
        status={{ state: 'building', id: '0003', elapsed: 62_000 }}
        lastEventText="editing invoice-list.component.html"
        logbookOpen={false}
        onToggleLogbook={vi.fn()}
      />,
    );
    expect(screen.getByText(/building/)).toBeTruthy();
    expect(screen.getByText(/01:02/)).toBeTruthy();
    expect(screen.getByText(/editing invoice-list.component.html/)).toBeTruthy();
  });

  it('shows built with file count and duration', () => {
    render(
      <StatusLine wired status={{ state: 'built', id: '0003', files: ['a.ts', 'b.ts', 'c.ts'], elapsed: 72_000 }} logbookOpen={false} onToggleLogbook={vi.fn()} />,
    );
    expect(screen.getByText(/built/)).toBeTruthy();
    expect(screen.getByText(/3 files/)).toBeTruthy();
  });

  it('clicking the status button toggles the logbook', () => {
    const onToggleLogbook = vi.fn();
    render(<StatusLine wired status={{ state: 'idle' }} logbookOpen={false} onToggleLogbook={onToggleLogbook} />);
    fireEvent.click(screen.getByRole('button', { name: /Claude/ }));
    expect(onToggleLogbook).toHaveBeenCalled();
  });

  it('renders nothing else on the line besides Claude\'s status and (in this build) a link to nothing extraneous', () => {
    render(<StatusLine wired status={{ state: 'idle' }} logbookOpen={false} onToggleLogbook={vi.fn()} />);
    // Exactly one button (the Claude status trigger) — "nothing else on that line" (AMENDMENT-1 §4).
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
