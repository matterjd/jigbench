import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { stubSurvey, type BenchState } from '@jigbench/core';
import { SetupDrawer, type SetupDrawerProps } from './SetupDrawer.js';
import type { SetupChecklist } from '../clamp/api.js';

afterEach(() => cleanup());

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

type Answer = { status: number; body: unknown };

function routeStub(routes: Record<string, Answer>): { fetchImpl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    const answer = routes[`${method} ${url}`] ?? { status: 404, body: { error: `no route ${method} ${url}` } };
    return { ok: answer.status < 300, status: answer.status, json: async () => answer.body } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function benchState(overrides: Partial<BenchState> = {}): BenchState {
  return {
    survey: {
      ...stubSurvey('2026-09-07T00:00:00.000Z'),
      stub: false,
      stack: ['angular'],
      adapters: [{ adapter: 'angular', stub: false, devServer: 'http://localhost:4200' }],
    },
    gauges: { jigFormat: 1, gauges: [], generatedAt: '2026-09-07T00:00:00.000Z' },
    marks: [],
    workOrders: [],
    wiring: {
      survey: 'wired',
      proxy: 'none',
      drafter: 'none',
      shop: 'none',
      fixtures: 'none',
      toolpath: 'none',
      sketch: 'none',
      docs: 'none',
      claude: 'installed',
    },
    bench: { repoRoot: '/home/you/repo' },
    target: { status: 'none' },
    recent: [],
    ...overrides,
  };
}

const checklist: SetupChecklist = {
  survey: true,
  docs: false,
  target: { status: 'none' },
  mcp: { written: false, path: '/home/you/repo/.mcp.json' },
  desktop: { written: false, path: '/home/you/.config/Claude/claude_desktop_config.json' },
  claude: 'installed',
};

function props(overrides: Partial<SetupDrawerProps> = {}): SetupDrawerProps {
  return {
    open: true,
    onClose: vi.fn(),
    state: benchState(),
    targetLogTail: [],
    canUnclamp: true,
    fetchImpl: routeStub({ 'GET /api/setup': { status: 200, body: checklist } }).fetchImpl,
    ...overrides,
  };
}

describe('SetupDrawer — the checklist one click from the status line', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<SetupDrawer {...props({ open: false })} />);
    expect(container.innerHTML).toBe('');
    expect(document.getElementById('setup')).toBeNull();
  });

  it('when open, is a labelled drawer with the word "setup" in its head, and GETs /api/setup once', async () => {
    const { fetchImpl, calls } = routeStub({ 'GET /api/setup': { status: 200, body: checklist } });
    render(<SetupDrawer {...props({ fetchImpl })} />);
    const drawer = document.getElementById('setup')!;
    expect(drawer).toBeTruthy();
    expect(drawer.getAttribute('aria-label')).toBe('setup — the checklist');
    expect(screen.getByText('setup')).toBeTruthy();
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/setup')).toHaveLength(1));
    expect(calls[0]).toEqual({ url: '/api/setup', method: 'GET', body: undefined });
  });

  it('renders the checklist words from the stubbed GET /api/setup', async () => {
    render(<SetupDrawer {...props()} />);
    expect(await screen.findByText('read')).toBeTruthy(); // survey
    expect(screen.getAllByText('not running').length).toBeGreaterThanOrEqual(1); // the app, from state.target (SetupSteps repeats it)
    expect(screen.getByText('none')).toBeTruthy(); // docs
    expect(screen.getAllByText('not yet')).toHaveLength(2); // .mcp.json, Claude Desktop
    expect(screen.getByText('installed')).toBeTruthy(); // Claude Code
  });

  it('says "written" for both files once they are, and "no known path" when Desktop has none', async () => {
    const written: SetupChecklist = {
      ...checklist,
      docs: true,
      mcp: { written: true, path: '/home/you/repo/.mcp.json' },
      desktop: { written: true, path: '/x' },
    };
    const { unmount } = render(<SetupDrawer {...props({ fetchImpl: routeStub({ 'GET /api/setup': { status: 200, body: written } }).fetchImpl })} />);
    expect(await screen.findAllByText('written')).toHaveLength(2);
    expect(screen.getByText('clamped')).toBeTruthy();
    unmount();

    const noPath: SetupChecklist = { ...checklist, desktop: { written: false } };
    render(<SetupDrawer {...props({ fetchImpl: routeStub({ 'GET /api/setup': { status: 200, body: noPath } }).fetchImpl })} />);
    expect(await screen.findByText('no known path')).toBeTruthy();
  });

  it('on an empty host: "not yet — clamp a repo", "not found", the nothing-clamped sentence, no unclamp', async () => {
    const empty: SetupChecklist = {
      survey: false,
      docs: false,
      target: { status: 'none' },
      mcp: { written: false },
      desktop: { written: false },
      claude: 'none',
    };
    render(
      <SetupDrawer
        {...props({
          state: benchState({ bench: null, wiring: { ...benchState().wiring, survey: 'none', claude: 'none' } }),
          canUnclamp: false,
          fetchImpl: routeStub({ 'GET /api/setup': { status: 200, body: empty } }).fetchImpl,
        })}
      />,
    );
    expect(await screen.findByText('not yet — clamp a repo')).toBeTruthy();
    expect(screen.getByText('not found')).toBeTruthy();
    expect(screen.getByText('nothing clamped — the Clamp screen is where a repo gets picked')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'clamp another repo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'use this URL' })).toBeNull();
  });

  it('with a repo clamped, carries the SetupSteps beneath the checklist (detected unknown → the paste-a-URL path)', async () => {
    render(<SetupDrawer {...props()} />);
    await screen.findByText('read');
    expect(screen.getByText('no dev script found — start the app yourself and paste its URL')).toBeTruthy();
    expect((screen.getByPlaceholderText('http://localhost:4200') as HTMLInputElement).value).toBe('http://localhost:4200');
    expect(screen.getByRole('button', { name: 'use this URL' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Register with Claude Code' })).toBeTruthy();
  });

  it('says the words while the checklist is still being read — never a blank drawer', () => {
    const never = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    render(<SetupDrawer {...props({ fetchImpl: never })} />);
    expect(screen.getByText(/reading the checklist/)).toBeTruthy();
  });

  it('"close" calls onClose', () => {
    const onClose = vi.fn();
    render(<SetupDrawer {...props({ onClose })} />);
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape (on the window, while open) calls onClose; not when closed', () => {
    const onClose = vi.fn();
    const { unmount } = render(<SetupDrawer {...props({ onClose })} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    const onCloseClosed = vi.fn();
    render(<SetupDrawer {...props({ open: false, onClose: onCloseClosed })} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCloseClosed).not.toHaveBeenCalled();
  });

  it('"clamp another repo" POSTs /api/unclamp and then calls onUnclamp', async () => {
    const { fetchImpl, calls } = routeStub({
      'GET /api/setup': { status: 200, body: checklist },
      'POST /api/unclamp': { status: 200, body: { ok: true } },
    });
    const onUnclamp = vi.fn();
    render(<SetupDrawer {...props({ fetchImpl, onUnclamp })} />);
    fireEvent.click(screen.getByRole('button', { name: 'clamp another repo' }));
    await waitFor(() => expect(calls.find((c) => c.url === '/api/unclamp')).toMatchObject({ method: 'POST' }));
    await waitFor(() => expect(onUnclamp).toHaveBeenCalledTimes(1));
  });

  it('never shows an ember control — the drawer is a checklist, not a demand', async () => {
    render(<SetupDrawer {...props()} />);
    await screen.findByText('read');
    expect(document.querySelector('[class*="ember"]')).toBeNull();
  });
});
