import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FolderBrowser } from './FolderBrowser.js';
import type { FolderBrowser as FolderBrowserState } from './useFolderBrowser.js';
import type { FsEntry } from './api.js';

afterEach(() => cleanup());

const HOME = '/home/you';

function entry(name: string, flags: Partial<Omit<FsEntry, 'name' | 'path'>> = {}): FsEntry {
  return {
    name,
    path: `${HOME}/${name}`,
    hasGit: false,
    hasPackageJson: false,
    hasAngularJson: false,
    hasCsproj: false,
    hasDocs: false,
    ...flags,
  };
}

function browser(overrides: Partial<FolderBrowserState> = {}): FolderBrowserState {
  return {
    roots: [
      { name: '/', path: '/' },
      { name: '~', path: HOME },
    ],
    path: HOME,
    parent: '/home',
    entries: [entry('repo', { hasGit: true, hasPackageJson: true }), entry('notes')],
    status: 'ready',
    message: '',
    pending: null,
    goTo: vi.fn(),
    up: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

describe('FolderBrowser', () => {
  it('renders the roots as pills, aria-pressed on the one the current path sits under (the longest match, so "/" never wins over "~")', () => {
    render(<FolderBrowser browser={browser()} onPick={vi.fn()} />);
    const home = screen.getByRole('button', { name: '~' });
    const slash = screen.getByRole('button', { name: '/' });
    expect(home.getAttribute('aria-pressed')).toBe('true');
    expect(slash.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking a root pill goes to that root', () => {
    const b = browser();
    render(<FolderBrowser browser={b} onPick={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '/' }));
    expect(b.goTo).toHaveBeenCalledWith('/');
  });

  it('shows the current path in mono with an "up" hairline that calls browser.up()', () => {
    const b = browser();
    render(<FolderBrowser browser={b} onPick={vi.fn()} />);
    expect(screen.getByText(HOME).className).toMatch(/path/);
    fireEvent.click(screen.getByRole('button', { name: /^up/ }));
    expect(b.up).toHaveBeenCalled();
  });

  it('at a filesystem root (parent null) "up" is disabled and says why in words', () => {
    render(<FolderBrowser browser={browser({ path: '/', parent: null })} onPick={vi.fn()} />);
    const up = screen.getByRole('button', { name: /^up/ }) as HTMLButtonElement;
    expect(up.disabled).toBe(true);
    expect(screen.getByText(/· at the top/)).toBeTruthy();
  });

  it('renders each entry as a full-width row carrying only the badges that are true', () => {
    const rows = [
      entry('repo', { hasGit: true, hasPackageJson: true, hasAngularJson: true, hasCsproj: true, hasDocs: true }),
      entry('notes'),
    ];
    render(<FolderBrowser browser={browser({ entries: rows })} onPick={vi.fn()} />);
    const repo = screen.getByRole('button', { name: /repo/ });
    for (const badge of ['git', 'package.json', 'angular.json', '.csproj', 'docs']) {
      expect(within(repo).getByText(badge)).toBeTruthy();
    }
    const notes = screen.getByRole('button', { name: /notes/ });
    expect(within(notes).queryByText('git')).toBeNull();
    expect(within(notes).queryByText('package.json')).toBeNull();
  });

  it('a row click goes INTO the folder and reports it as the pick', () => {
    const b = browser();
    const onPick = vi.fn();
    render(<FolderBrowser browser={b} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: /repo/ }));
    expect(b.goTo).toHaveBeenCalledWith(`${HOME}/repo`);
    expect(onPick).toHaveBeenCalledWith(`${HOME}/repo`);
  });

  it('an empty folder says so honestly, naming the badges a repo would carry', () => {
    render(<FolderBrowser browser={browser({ entries: [] })} onPick={vi.fn()} />);
    expect(screen.getByText(/nothing here but files — a repo folder carries a git, package\.json, angular\.json or \.csproj badge/)).toBeTruthy();
  });

  it('while reading, says "reading <path> …" — a sentence, no spinner', () => {
    const { container } = render(
      <FolderBrowser browser={browser({ status: 'reading', pending: `${HOME}/repo` })} onPick={vi.fn()} />,
    );
    expect(screen.getByText(`reading ${HOME}/repo …`)).toBeTruthy();
    expect(container.querySelector('[class*="spinner"]')).toBeNull();
  });

  it('after a failed read, shows the server\'s words and keeps the previous listing', () => {
    render(<FolderBrowser browser={browser({ status: 'failed', message: 'no such path: /nowhere' })} onPick={vi.fn()} />);
    expect(screen.getByText(/no such path: \/nowhere/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /repo/ })).toBeTruthy();
  });

  it('never shows an ember control — the Clamp act is the screen\'s, not the browser\'s', () => {
    render(<FolderBrowser browser={browser()} onPick={vi.fn()} />);
    expect(document.querySelector('[class*="ember"]')).toBeNull();
  });
});
