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

describe('StatusLine — the setup trigger (AMENDMENT-1 A6: "a setup checklist lives one click from the status line")', () => {
  const SETUP_TITLE = 'setup — the checklist: the repo, the app, docs, Claude Code';

  it('renders a second button, "setup", at the right end of the line when onToggleSetup is given', () => {
    render(<StatusLine wired status={{ state: 'idle' }} logbookOpen={false} onToggleLogbook={vi.fn()} onToggleSetup={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    const setup = buttons[1]!;
    expect(setup.className).toContain('jig-status-line__setup');
    expect(setup.textContent?.trim()).toBe('setup');
    expect(setup.getAttribute('aria-controls')).toBe('setup');
    expect(setup.getAttribute('title')).toBe(SETUP_TITLE);
    // the Claude button is still first, still the logbook's trigger
    expect(buttons[0]!.getAttribute('aria-controls')).toBe('logbook');
  });

  it('clicking the setup button calls onToggleSetup — and not onToggleLogbook', () => {
    const onToggleSetup = vi.fn();
    const onToggleLogbook = vi.fn();
    render(<StatusLine wired status={{ state: 'idle' }} logbookOpen={false} onToggleLogbook={onToggleLogbook} onToggleSetup={onToggleSetup} />);
    fireEvent.click(screen.getByTitle(SETUP_TITLE));
    expect(onToggleSetup).toHaveBeenCalledTimes(1);
    expect(onToggleLogbook).not.toHaveBeenCalled();
  });

  it('shows the setup word after a separator in the mono style: "setup · 3 of 5"', () => {
    render(<StatusLine wired status={{ state: 'idle' }} logbookOpen={false} onToggleLogbook={vi.fn()} onToggleSetup={vi.fn()} setupWord="3 of 5" />);
    const setup = screen.getByTitle(SETUP_TITLE);
    expect(setup.textContent?.replace(/\s+/g, ' ').trim()).toBe('setup · 3 of 5');
    expect(screen.getByText('· 3 of 5').className).toContain('jig-status-line__mono');
  });

  it('aria-expanded reflects setupOpen, and is false when setupOpen is omitted', () => {
    const { rerender } = render(
      <StatusLine wired status={{ state: 'idle' }} logbookOpen={false} onToggleLogbook={vi.fn()} onToggleSetup={vi.fn()} setupOpen />,
    );
    expect(screen.getByTitle(SETUP_TITLE).getAttribute('aria-expanded')).toBe('true');
    rerender(<StatusLine wired status={{ state: 'idle' }} logbookOpen={false} onToggleLogbook={vi.fn()} onToggleSetup={vi.fn()} setupOpen={false} />);
    expect(screen.getByTitle(SETUP_TITLE).getAttribute('aria-expanded')).toBe('false');
    rerender(<StatusLine wired status={{ state: 'idle' }} logbookOpen={false} onToggleLogbook={vi.fn()} onToggleSetup={vi.fn()} />);
    expect(screen.getByTitle(SETUP_TITLE).getAttribute('aria-expanded')).toBe('false');
  });

  it('with no onToggleSetup, no setup button appears even if setupOpen/setupWord are passed', () => {
    render(<StatusLine wired status={{ state: 'idle' }} logbookOpen={false} onToggleLogbook={vi.fn()} setupOpen setupWord="3 of 5" />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByTitle(SETUP_TITLE)).toBeNull();
  });
});
