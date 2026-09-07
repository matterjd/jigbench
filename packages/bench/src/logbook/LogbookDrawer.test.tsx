import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { LogEntry } from '@jigbench/core';
import { LogbookDrawer } from './LogbookDrawer.js';

afterEach(() => cleanup());

const T = Date.parse('2026-09-07T12:00:00.000Z');
const now = () => T;

function entry(actor: string, event: string, agoMs: number, note?: string): LogEntry {
  return { at: new Date(T - agoMs).toISOString(), actor, event, ref: 'r', ...(note ? { note } : {}) };
}

const LABEL = 'logbook — the record of everything that happened on the bench';

describe('LogbookDrawer', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(<LogbookDrawer open={false} entries={[entry('human', 'x', 0)]} onClose={vi.fn()} now={now} />);
    expect(container.firstChild).toBeNull();
  });

  it('is the #logbook the status line points at (aria-controls="logbook"), with the paired aria-label', () => {
    render(<LogbookDrawer open entries={[]} onClose={vi.fn()} now={now} />);
    expect(screen.getByLabelText(LABEL).id).toBe('logbook');
  });

  it('says the honest empty sentence when there are no rows at all', () => {
    render(<LogbookDrawer open entries={[]} onClose={vi.fn()} now={now} />);
    expect(screen.getByText('The logbook — the record of everything that happened on the bench — is empty so far.')).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('renders rows newest first, each with its event, its actor, and its note when it has one', () => {
    render(
      <LogbookDrawer
        open
        entries={[entry('human', 'clamped ledger-angular', 60_000), entry('Claude', 'Edit · invoice-list.component.html', 2_000, '00:42')]}
        onClose={vi.fn()}
        now={now}
      />,
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Edit · invoice-list.component.html')).toBeTruthy();
    expect(within(rows[0]!).getByText('Claude')).toBeTruthy();
    expect(within(rows[0]!).getByText('00:42')).toBeTruthy();
    expect(within(rows[1]!).getByText('clamped ledger-angular')).toBeTruthy();
    expect(within(rows[1]!).getByText('human')).toBeTruthy();
  });

  it('shows each row\'s age against now(): "now" under 5s, then seconds, minutes, hours', () => {
    render(
      <LogbookDrawer
        open
        entries={[entry('bench', 'two hours', 2 * 3_600_000), entry('bench', 'three minutes', 3 * 60_000 + 10_000), entry('bench', 'twelve seconds', 12_000), entry('bench', 'just now', 2_000)]}
        onClose={vi.fn()}
        now={now}
      />,
    );
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]!).getByText('now')).toBeTruthy();
    expect(within(rows[1]!).getByText('12s')).toBeTruthy();
    expect(within(rows[2]!).getByText('3m')).toBeTruthy();
    expect(within(rows[3]!).getByText('2h')).toBeTruthy();
  });

  it('colours each row\'s left edge per actor: human → ink, Claude → wyrd, model → dim, bench/app → the hairline', () => {
    render(
      <LogbookDrawer
        open
        entries={[entry('app', 'a', 4000), entry('bench', 'b', 3000), entry('model', 'm', 2000), entry('Claude', 'c', 1000), entry('human', 'h', 0)]}
        onClose={vi.fn()}
        now={now}
      />,
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]!.className).toContain('jig-logbook-drawer__row--human');
    expect(rows[1]!.className).toContain('jig-logbook-drawer__row--claude');
    expect(rows[2]!.className).toContain('jig-logbook-drawer__row--model');
    expect(rows[3]!.className).not.toMatch(/__row--(human|claude|model)/);
    expect(rows[4]!.className).not.toMatch(/__row--(human|claude|model)/);
  });

  it('filter pills: "all" first, then only the actors that have rows in house order (human · Claude · bench · app · model), then others alphabetically', () => {
    render(
      <LogbookDrawer
        open
        entries={[entry('zed', 'z', 0), entry('app', 'a', 0), entry('human', 'h', 0), entry('alpha', 'a', 0), entry('Claude', 'c', 0)]}
        onClose={vi.fn()}
        now={now}
      />,
    );
    const pills = screen.getAllByRole('button', { pressed: false }).concat(screen.getAllByRole('button', { pressed: true }));
    const names = pills.map((b) => b.textContent);
    expect(names.sort()).toEqual(['Claude', 'all', 'alpha', 'app', 'human', 'zed']);
    const ordered = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed')).map((b) => b.textContent);
    expect(ordered).toEqual(['all', 'human', 'Claude', 'app', 'alpha', 'zed']);
    expect(screen.getByRole('button', { name: 'all', pressed: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'model' })).toBeNull();
  });

  it('a pill narrows the rows to that actor and "printed" restores everything', () => {
    render(
      <LogbookDrawer
        open
        entries={[entry('human', 'clamped', 3000), entry('Claude', 'Edit · a.ts', 2000), entry('app', 'ng serve', 1000)]}
        onClose={vi.fn()}
        now={now}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByTitle('printed — show everything')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Claude' }));
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText('Edit · a.ts')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Claude', pressed: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'all', pressed: false })).toBeTruthy();

    fireEvent.click(screen.getByTitle('printed — show everything'));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'all', pressed: true })).toBeTruthy();
    expect(screen.queryByTitle('printed — show everything')).toBeNull();
  });

  it('a filter left on for an actor that no longer has rows says "nothing on the shelves for <actor>"', () => {
    const { rerender } = render(
      <LogbookDrawer open entries={[entry('app', 'ng serve', 1000), entry('human', 'clamped', 2000)]} onClose={vi.fn()} now={now} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'app' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);

    rerender(<LogbookDrawer open entries={[entry('human', 'clamped', 2000)]} onClose={vi.fn()} now={now} />);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    const empty = screen.getByText(/nothing on the shelves for/);
    expect(empty.textContent).toBe('nothing on the shelves for app');
    expect(screen.getByTitle('printed — show everything')).toBeTruthy(); // the way back is still there
  });

  it('Escape closes it while open', () => {
    const onClose = vi.fn();
    render(<LogbookDrawer open entries={[]} onClose={onClose} now={now} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape does nothing while closed (the listener is only on while open)', () => {
    const onClose = vi.fn();
    render(<LogbookDrawer open={false} entries={[]} onClose={onClose} now={now} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the close button closes it', () => {
    const onClose = vi.fn();
    render(<LogbookDrawer open entries={[]} onClose={onClose} now={now} />);
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('carries the provenance line: this session · nothing leaves the machine', () => {
    render(<LogbookDrawer open entries={[]} onClose={vi.fn()} now={now} />);
    expect(screen.getByText('this session · nothing leaves the machine')).toBeTruthy();
  });

  it('defaults now to Date.now (a fresh row reads "now")', () => {
    render(<LogbookDrawer open entries={[{ at: new Date().toISOString(), actor: 'bench', event: 'fresh', ref: 'r' }]} onClose={vi.fn()} />);
    expect(within(screen.getAllByRole('listitem')[0]!).getByText('now')).toBeTruthy();
  });
});
