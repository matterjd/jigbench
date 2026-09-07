import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { stubSurvey, type BenchState, type Survey } from '@jigbench/core';
import { ageWords, ClampScreen, type ClampScreenProps } from './ClampScreen.js';
import { resetPairingsForTests } from '../components/Pairing.js';
import type { ClampResult, SetupChecklist } from './api.js';

afterEach(() => {
  cleanup();
  resetPairingsForTests();
});

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

type Answer = { status: number; body: unknown };
type Route = Answer | ((body: unknown) => Answer | Promise<Answer>);

function routeStub(routes: Record<string, Route>): { fetchImpl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    const route = routes[`${method} ${url}`];
    const answer = typeof route === 'function' ? await route(body) : (route ?? { status: 404, body: { error: `no route ${method} ${url}` } });
    return { ok: answer.status < 300, status: answer.status, json: async () => answer.body } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const HOME = '/home/you';
const REPO = `${HOME}/repo`;

function listing(path: string, parent: string | null, names: string[]) {
  return {
    path,
    parent,
    entries: names.map((name) => ({
      name,
      path: `${path}/${name}`,
      hasGit: name === 'repo',
      hasPackageJson: name === 'repo',
      hasAngularJson: false,
      hasCsproj: false,
      hasDocs: false,
    })),
  };
}

const fsRoutes: Record<string, Route> = {
  'GET /api/fs/roots': { status: 200, body: { roots: [{ name: '/', path: '/' }, { name: '~', path: HOME }] } },
  [`GET /api/fs/list?path=${encodeURIComponent(HOME)}`]: { status: 200, body: listing(HOME, '/home', ['repo', 'notes']) },
  [`GET /api/fs/list?path=${encodeURIComponent(REPO)}`]: { status: 200, body: listing(REPO, HOME, []) },
};

const checklist: SetupChecklist = {
  survey: true,
  docs: false,
  target: { status: 'none' },
  mcp: { written: false, path: `${REPO}/.mcp.json` },
  desktop: { written: false },
  claude: 'installed',
};

function survey(overrides: Partial<Survey> = {}): Survey {
  const component = (name: string) => ({
    name,
    selector: `app-${name.toLowerCase()}`,
    file: `src/${name}.ts`,
    standalone: true,
    inline: false,
    inputs: [],
    outputs: [],
    styleUrls: [],
  });
  return {
    ...stubSurvey('2026-09-07T00:00:00.000Z'),
    stub: false,
    stack: ['angular', 'dotnet'],
    components: [component('A'), component('B'), component('C')],
    routes: [
      { path: '', component: 'A', file: 'src/routes.ts' },
      { path: 'b', component: 'B', file: 'src/routes.ts' },
    ],
    endpoints: [{ method: 'GET', path: '/api/x' }],
    adapters: [{ adapter: 'angular', stub: false, devServer: 'http://localhost:4200' }],
    ...overrides,
  };
}

function clampResult(overrides: Partial<ClampResult> = {}): ClampResult {
  return {
    ok: true,
    repoRoot: REPO,
    survey: survey(),
    docsClamped: false,
    recent: [{ repoRoot: REPO, clampedAt: new Date().toISOString() }],
    detected: { script: 'start', port: 4200, source: 'package.json' },
    ...overrides,
  };
}

function benchState(overrides: Partial<BenchState> = {}): BenchState {
  return {
    survey: stubSurvey('2026-09-07T00:00:00.000Z'),
    gauges: { jigFormat: 1, gauges: [], generatedAt: '2026-09-07T00:00:00.000Z' },
    marks: [],
    workOrders: [],
    wiring: {
      survey: 'none',
      proxy: 'none',
      drafter: 'none',
      shop: 'none',
      fixtures: 'none',
      toolpath: 'none',
      sketch: 'none',
      docs: 'none',
      claude: 'installed',
    },
    bench: null,
    target: { status: 'none' },
    recent: [],
    ...overrides,
  };
}

function props(overrides: Partial<ClampScreenProps> = {}): ClampScreenProps {
  return {
    state: benchState(),
    targetLogTail: [],
    onToBench: vi.fn(),
    fetchImpl: routeStub(fsRoutes).fetchImpl,
    ...overrides,
  };
}

const HOURS_2 = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

describe('ClampScreen', () => {
  it('pairs Jig and Clamp with their plain words at first encounter', () => {
    render(<ClampScreen {...props()} />);
    expect(screen.getByText(/a benchtop for shaping a feature before Claude builds it/)).toBeTruthy();
    expect(screen.getByText(/attach a repo; the survey reads it/)).toBeTruthy();
  });

  it('says the honest empty sentence when there are no recent benches', () => {
    render(<ClampScreen {...props()} />);
    expect(screen.getByText('No recent benches yet — pick a folder below.')).toBeTruthy();
  });

  it('renders recent rows (name · path · age) and a click POSTs /api/clamp with that repoRoot', async () => {
    const { fetchImpl, calls } = routeStub({
      ...fsRoutes,
      'POST /api/clamp': { status: 200, body: clampResult({ repoRoot: `${HOME}/ledger` }) },
      'GET /api/setup': { status: 200, body: checklist },
    });
    render(
      <ClampScreen {...props({ fetchImpl, state: benchState({ recent: [{ repoRoot: `${HOME}/ledger`, clampedAt: HOURS_2 }] }) })} />,
    );
    const row = screen.getByRole('button', { name: `clamp ${HOME}/ledger again` });
    expect(row.textContent).toContain('ledger');
    expect(row.textContent).toContain(`${HOME}/ledger`);
    expect(row.textContent).toContain('2h ago');
    fireEvent.click(row);
    await waitFor(() => expect(calls.find((c) => c.url === '/api/clamp')).toEqual({ url: '/api/clamp', method: 'POST', body: { repoRoot: `${HOME}/ledger` } }));
  });

  it('with nothing typed, Clamp is disabled and says why in words; there is no ember yet', async () => {
    render(<ClampScreen {...props()} />);
    const button = screen.getByRole('button', { name: 'Clamp' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText('· pick a folder or paste a path')).toBeTruthy();
    expect(document.querySelectorAll('[class*="ember"]')).toHaveLength(0);
  });

  it('typing a path and clicking Clamp POSTs it — and that button is the ONE ember on the screen', async () => {
    const { fetchImpl, calls } = routeStub({
      ...fsRoutes,
      'POST /api/clamp': { status: 200, body: clampResult() },
      'GET /api/setup': { status: 200, body: checklist },
    });
    render(<ClampScreen {...props({ fetchImpl })} />);
    fireEvent.change(screen.getByLabelText('the repo folder — picked above or pasted'), { target: { value: REPO } });
    const embers = document.querySelectorAll('[class*="ember"]');
    expect(embers).toHaveLength(1);
    expect(embers[0].textContent).toBe('Clamp');
    fireEvent.click(screen.getByRole('button', { name: 'Clamp' }));
    await waitFor(() => expect(calls.find((c) => c.url === '/api/clamp')).toEqual({ url: '/api/clamp', method: 'POST', body: { repoRoot: REPO } }));
  });

  it('a row picked in the browser fills the chosen-path field', async () => {
    render(<ClampScreen {...props()} />);
    const row = await screen.findByRole('button', { name: /^repo/ });
    fireEvent.click(row);
    expect((screen.getByLabelText('the repo folder — picked above or pasted') as HTMLInputElement).value).toBe(REPO);
  });

  it('while clamping, says the cost in a sentence and the button is no longer ember', async () => {
    let release: (a: Answer) => void = () => {};
    const { fetchImpl } = routeStub({
      ...fsRoutes,
      'POST /api/clamp': () => new Promise<Answer>((resolve) => (release = resolve)),
      'GET /api/setup': { status: 200, body: checklist },
    });
    render(<ClampScreen {...props({ fetchImpl })} />);
    fireEvent.change(screen.getByLabelText('the repo folder — picked above or pasted'), { target: { value: REPO } });
    fireEvent.click(screen.getByRole('button', { name: 'Clamp' }));
    expect(await screen.findByText('clamping · the survey reads the repo — a few seconds')).toBeTruthy();
    expect(document.querySelectorAll('[class*="ember"]')).toHaveLength(0);
    release({ status: 200, body: clampResult() });
    await screen.findByText('what the survey found');
  });

  it('shows a 400\'s words prefixed "not clamped ·"', async () => {
    const { fetchImpl } = routeStub({ ...fsRoutes, 'POST /api/clamp': { status: 400, body: { error: 'not a directory: /home/you/notes.txt' } } });
    render(<ClampScreen {...props({ fetchImpl })} />);
    fireEvent.change(screen.getByLabelText('the repo folder — picked above or pasted'), { target: { value: '/home/you/notes.txt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clamp' }));
    expect(await screen.findByText('not clamped · not a directory: /home/you/notes.txt')).toBeTruthy();
    expect(screen.queryByText('what the survey found')).toBeNull();
  });

  describe('after a 200', () => {
    async function clampIt(overrides: Partial<ClampResult> = {}, stateOverrides: Partial<BenchState> = {}) {
      const { fetchImpl, calls } = routeStub({
        ...fsRoutes,
        'POST /api/clamp': { status: 200, body: clampResult(overrides) },
        'GET /api/setup': { status: 200, body: checklist },
        'POST /api/unclamp': { status: 200, body: { ok: true } },
      });
      const onToBench = vi.fn();
      const onLog = vi.fn();
      const view = render(<ClampScreen {...props({ fetchImpl, onToBench, onLog, state: benchState(stateOverrides) })} />);
      fireEvent.change(screen.getByLabelText('the repo folder — picked above or pasted'), { target: { value: REPO } });
      fireEvent.click(screen.getByRole('button', { name: 'Clamp' }));
      await screen.findByText('what the survey found');
      return { calls, onToBench, onLog, view };
    }

    it('shows the repo, the stack, the counts, the dev-server line, and SetupSteps\' "Start the app"', async () => {
      await clampIt();
      expect(screen.getByText(REPO)).toBeTruthy();
      expect(screen.getByText('angular · dotnet')).toBeTruthy();
      expect(screen.getByText('3')).toBeTruthy(); // components
      expect(screen.getByText('2')).toBeTruthy(); // routes
      expect(screen.getByText('1')).toBeTruthy(); // endpoints
      expect(screen.getByText('npm run start · port 4200')).toBeTruthy();
      expect(screen.getByText('none yet — below')).toBeTruthy(); // docs
      expect(screen.getByRole('button', { name: 'Start the app' })).toBeTruthy();
    });

    it('logs the human clamp and the bench\'s survey line', async () => {
      const { onLog } = await clampIt();
      expect(onLog).toHaveBeenCalledWith('human', `clamp · ${REPO}`, 'bench');
      expect(onLog).toHaveBeenCalledWith('bench', 'survey · 3 components · 2 routes · 1 endpoints', 'survey');
    });

    it('asks for the setup checklist right after the clamp, so .mcp.json/Desktop words are real', async () => {
      const { calls } = await clampIt();
      await waitFor(() => expect(calls.find((c) => c.url === '/api/setup')).toBeTruthy());
    });

    it('"go to the bench →" is the ONE ember in phase 2 and calls onToBench', async () => {
      const { onToBench } = await clampIt();
      const embers = document.querySelectorAll('[class*="ember"]');
      expect(embers).toHaveLength(1);
      expect(embers[0].getAttribute('aria-label')).toBe('go to the bench — the plate, Point, Prompts');
      fireEvent.click(embers[0]);
      expect(onToBench).toHaveBeenCalledTimes(1);
    });

    it('"clamp a different repo" POSTs /api/unclamp and returns to phase 1', async () => {
      const { calls } = await clampIt();
      fireEvent.click(screen.getByRole('button', { name: 'clamp a different repo' }));
      await waitFor(() => expect(calls.find((c) => c.url === '/api/unclamp')).toMatchObject({ method: 'POST' }));
      expect(await screen.findByText('No recent benches yet — pick a folder below.')).toBeTruthy();
      expect(screen.queryByText('what the survey found')).toBeNull();
    });

    it('says "unknown" honestly when no adapter matched, and when the adapter cannot list components', async () => {
      await clampIt({
        survey: survey({ stack: [], components: [], adapters: [{ adapter: 'web', stub: false, unknown: true }] }),
        detected: null,
      });
      expect(screen.getByText('unknown — no adapter matched; the loop still runs')).toBeTruthy();
      expect(screen.getByText('unknown — this adapter cannot list them')).toBeTruthy();
      expect(screen.getByText('no guess — paste a URL below')).toBeTruthy();
    });

    it('uses the survey\'s dev-server guess for the app line when nothing was detected', async () => {
      await clampIt({ detected: null });
      expect(screen.getByText('http://localhost:4200')).toBeTruthy();
    });

    it('gauges read from the live state once the host says it is clamped; "reading …" until then', async () => {
      const { view } = await clampIt();
      expect(screen.getByText('reading …')).toBeTruthy();
      const gauge = { name: 'g', $type: 'dimension', $value: 4, category: 'spacing', source: { file: 'x', line: 1 } };
      view.rerender(
        <ClampScreen
          {...props({
            state: benchState({ bench: { repoRoot: REPO }, gauges: { jigFormat: 1, gauges: [gauge, gauge, gauge, gauge, gauge] as never, generatedAt: 'a' } }),
          })}
        />,
      );
      expect(screen.getByText('5')).toBeTruthy();
    });
  });

  describe('ageWords', () => {
    const now = new Date('2026-09-07T12:00:00.000Z').getTime();
    it.each([
      ['2026-09-07T11:59:40.000Z', 'just now'],
      ['2026-09-07T11:57:00.000Z', '3m ago'],
      ['2026-09-07T10:00:00.000Z', '2h ago'],
      ['2026-09-04T12:00:00.000Z', '3d ago'],
    ])('%s → %s', (iso, words) => {
      expect(ageWords(iso, now)).toBe(words);
    });
  });
});
