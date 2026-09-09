import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from './App.js';
import { setTool } from './tools/toolState.js';
import { setAdvanced } from './chassis/advancedState.js';

// A minimal fake — App composes the whole chassis with no injection point of its own (unlike
// SimStrip's `fetchImpl` prop), so this is the one place exercising them together needs to
// stub the two things App reaches for globally: the WebSocket useJigState opens, and the
// fetch calls SimStrip/the plate poll/the prompts list issue.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send() {}
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const wiring = {
  survey: 'stub' as const,
  proxy: 'none' as const,
  drafter: 'stub' as const,
  shop: 'none' as const,
  fixtures: 'none' as const,
  toolpath: 'none' as const,
  sketch: 'none' as const,
  docs: 'none' as const,
  claude: 'none' as const,
};

function stubFetch(extra?: (url: string) => Response | undefined): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const extraResponse = extra?.(url);
      if (extraResponse) return Promise.resolve(extraResponse);
      if (url.includes('/api/prompts')) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: 'not found' }) } as Response);
      // S17b: the Clamp screen's folder browser and the setup drawer's checklist.
      if (url.includes('/api/fs/roots')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ roots: [{ name: '~', path: '/home/you' }] }) } as Response);
      if (url.includes('/api/fs/list')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ path: '/home/you', parent: '/home', entries: [] }) } as Response);
      if (url.includes('/api/setup'))
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ survey: false, docs: false, target: { status: 'none' }, mcp: { written: false }, desktop: { written: false }, claude: 'none' }),
        } as Response);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ wiring, shop: null, status: { claude: { state: 'idle' } } }) } as Response);
    }),
  );
}

/** The empty-host state the Bench host broadcasts before any clamp (S17a): `bench: null`. */
const clampScreenState = {
  bench: null,
  survey: { jigFormat: 1, stack: [], components: [], routes: [], endpoints: [], schemas: [], docs: [], generatedAt: 'now', stub: true },
  gauges: { jigFormat: 1, gauges: [], generatedAt: 'now' },
  marks: [],
  workOrders: [],
  shop: null,
  wiring,
  target: { status: 'none' },
  status: { claude: { state: 'idle' } },
  recent: [{ repoRoot: '/home/you/ledger-angular', clampedAt: new Date().toISOString() }],
};

/** A clamped host: the same frame with a real `bench`. #24 gates the bench's own polls on it —
 * `GET /api/plate` and `GET /api/prompts` exist only once a repo is clamped — so a test that
 * expects either to be asked for says so by sending this first. */
const clampedState = { ...clampScreenState, bench: { repoRoot: '/home/you/ledger-angular' } };

function sendState(state: unknown): void {
  act(() => {
    FakeWebSocket.instances[0]!.onmessage?.({ data: JSON.stringify({ type: 'state', state }) });
  });
}

/** Points at something on the plate and waits for the prompt card. The plate bridge attaches
 * its `message` listener in an effect AFTER the iframe first renders, so ONE dispatch right after
 * "the iframe exists" can land before the listener does and is simply lost — CI run 34161356867
 * (windows-latest) did exactly that. The pick is re-dispatched on every retry until the card is
 * open; a repeated identical pick re-opens the same card, so the retries are idempotent. */
async function pickOnPlate(pick: Record<string, unknown>): Promise<HTMLElement> {
  await waitFor(() => {
    if (!document.querySelector('iframe')) throw new Error('no iframe yet');
  });
  return waitFor(
    () => {
      act(() => {
        window.dispatchEvent(new MessageEvent('message', { data: { type: 'jig:pick', ...pick }, origin: 'http://localhost:4601' }));
      });
      return screen.getByRole('dialog', { name: /prompt card/i });
    },
    { timeout: 4000 },
  );
}

describe('App (S12: the quiet bench)', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    stubFetch();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    setTool('point');
    setAdvanced(false);
  });

  it('renders exactly the loop: the rail (Point/Sketch/Hand), the plate, the right column\'s three tabs, and the status line', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: /^Point —/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Sketch —/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Hand —/ })).toBeTruthy();

    // plate: no /api/plate shape in this fixture's fetch mock, so it degrades to the honest
    // "no target" state rather than an iframe.
    expect(screen.getByText(/Plate — where the app renders/)).toBeTruthy();
    expect(screen.getByText(/No target is set/)).toBeTruthy();

    expect(screen.getByRole('tab', { name: /Prompts/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Inspect/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Design system/ })).toBeTruthy();

    expect(screen.getByRole('button', { name: /Claude/ })).toBeTruthy();
  });

  it('the Prompts tab says so in words when /api/prompts 404s (no repo clamped on this server)', async () => {
    render(<App />);
    sendState(clampedState); // #24: the list is asked for only once the host reports a bench
    await waitFor(() => expect(screen.getByText(/no prompts route on this server — clamp a repo first/i)).toBeTruthy());
  });

  it('the status line reads "not installed" when wiring.claude is none', () => {
    render(<App />);
    sendState(clampedState); // #24: "not installed" is the claude-on-PATH probe, and it only runs at a clamp
    expect(screen.getByText(/not installed/)).toBeTruthy();
  });

  // #24: before a clamp the probe has not run, so the line must not report its answer.
  it('#24: the status line says nothing about Claude on the Clamp screen', () => {
    render(<App />);
    sendState(clampScreenState);
    expect(screen.queryByText(/not installed/)).toBeNull();
    expect(screen.getByText(/nothing clamped/)).toBeTruthy();
  });

  it('the Advanced drawer is absent by default, and appears (with the spine, rulers switch, Fixtures, Toolpath, MCP — and no mirror switch, #8) once the switch is on', async () => {
    render(<App />);
    expect(screen.queryByLabelText(/rulers & guides/i)).toBeNull();

    fireEvent.click(screen.getByLabelText(/Advanced — everything that is not the loop/i));

    await waitFor(() => expect(screen.getByLabelText(/rulers & guides/i)).toBeTruthy());
    expect(screen.queryByLabelText(/the mirror/i)).toBeNull(); // #8: no control that does nothing
    expect(await screen.findByText(/no fixtures yet/i)).toBeTruthy();
    expect(await screen.findByText(/no toolpaths yet/i)).toBeTruthy();
    expect(screen.getByText(/none connected/i)).toBeTruthy();
  });

  it('switching to Sketch swaps the plate for the sketch sheet', async () => {
    stubFetch((url) => (url.includes('/api/sketches') ? ({ ok: true, json: () => Promise.resolve({ sketches: [] }) } as Response) : undefined));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^Sketch —/ }));
    expect(await screen.findByText(/no sketches yet/i)).toBeTruthy();
    expect(screen.queryByText(/Plate — where the app renders/)).toBeNull();
  });

  it('the command palette opens on Ctrl+K and lists the rail\'s tools', () => {
    render(<App />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getAllByText('Point').length).toBeGreaterThan(0);
  });

  it('Point selects a component on the plate and opens the prompt card anchored to it', async () => {
    stubFetch((url) =>
      url.includes('/api/plate')
        ? ({ ok: true, json: () => Promise.resolve({ target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] }) } as Response)
        : undefined,
    );
    render(<App />);
    sendState(clampedState); // #24: the plate poll runs only once the host reports a bench
    const dialog = await pickOnPlate({
      path: 'app-invoice-list',
      tag: 'app-invoice-list',
      text: 'Invoices',
      component: 'InvoiceListComponent',
      file: 'src/app/invoices/invoice-list/invoice-list.component.ts',
      rect: { x: 100, y: 100, width: 200, height: 60 },
    });
    expect(within(dialog).getByText('InvoiceListComponent')).toBeTruthy();
  });

  it('typing in the open card creates a draft prompt (optimistically, even though /api/prompts 404s) and it appears in the Prompts tab', async () => {
    stubFetch((url) =>
      url.includes('/api/plate')
        ? ({ ok: true, json: () => Promise.resolve({ target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] }) } as Response)
        : undefined,
    );
    render(<App />);
    sendState(clampedState); // #24: the plate poll runs only once the host reports a bench
    await pickOnPlate({ path: 'x', tag: 'div', text: '', component: 'InvoiceListComponent', file: 'x.ts', rect: { x: 0, y: 0, width: 10, height: 10 } });

    fireEvent.change(screen.getByPlaceholderText(/what should change here/i), { target: { value: 'show days overdue' } });

    expect(screen.getByPlaceholderText(/what should change here/i)).toHaveProperty('value', 'show days overdue');

    // The real bug a live-browser check caught: with no /api/prompts on this server, the typed
    // text never becomes a real Prompt, but it must still count as a draft for the CARD's own
    // ember rule — Ready has to light up once there are words, whether or not anything persisted.
    const ready = screen.getByRole('button', { name: /Ready — hold/i });
    expect(ready.className).toMatch(/ember/);
    expect(ready.hasAttribute('disabled')).toBe(false);
  });
});

describe('App (S17b: the Clamp screen, the logbook drawer, the setup drawer)', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    stubFetch();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    setTool('point');
    setAdvanced(false);
  });

  it('opens on the Clamp screen — recent benches, the folder browser, no rail — when the host says bench: null', async () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /^Point —/ })).toBeTruthy(); // the bench, before any state arrives

    sendState(clampScreenState);

    expect(await screen.findByRole('heading', { name: /Clamp/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /clamp \/home\/you\/ledger-angular again/ })).toBeTruthy();
    expect(screen.getByLabelText(/the repo folder — picked above or pasted/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Point —/ })).toBeNull();
    // the status line stays — it is the one line on every screen
    expect(screen.getByRole('button', { name: /Claude/ })).toBeTruthy();
  });

  // #24 (the 0.2.0 review): "before a clamp the bench polls GET /api/plate and GET /api/prompts
  // and logs two 404s to the console. Gate those hooks on state.bench." Neither route exists on
  // an empty host — there is no bench to answer for — so both wait for one.
  it('#24: asks for neither /api/plate nor /api/prompts while the host reports bench: null', async () => {
    render(<App />);
    sendState(clampScreenState);
    await screen.findByRole('heading', { name: /Clamp/ });

    // Both hooks fire once the moment their effect runs — that is the 404 pair the review saw —
    // and neither even installs its interval while the gate is shut, so the mount is the whole
    // question. One flush past the state frame is enough to see it.
    await act(async () => {
      await Promise.resolve();
    });

    const asked = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(asked.filter((url) => url.includes('/api/plate'))).toEqual([]);
    expect(asked.filter((url) => url.includes('/api/prompts'))).toEqual([]);
    // The Clamp screen's own reads still happen — this gates the bench's polls, not the screen.
    expect(asked.some((url) => url.includes('/api/fs/roots'))).toBe(true);
  });

  it('a repo clamped elsewhere while the screen is up offers "go to the bench", and the bench comes back', async () => {
    render(<App />);
    sendState(clampScreenState);
    await screen.findByRole('heading', { name: /Clamp/ });

    sendState({ ...clampScreenState, bench: { repoRoot: '/home/you/ledger-angular' } });
    fireEvent.click(await screen.findByRole('button', { name: /^go to the bench$/ }));

    expect(await screen.findByRole('button', { name: /^Point —/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Clamp/ })).toBeNull();
  });

  it('the status line opens the logbook drawer, and a build frame lands in it as a Claude row (#9)', async () => {
    render(<App />);
    act(() => {
      FakeWebSocket.instances[0]!.onmessage?.({
        data: JSON.stringify({ type: 'build', id: '0003', event: { kind: 'tool', name: 'editing', target: 'invoice-list.component.html' }, elapsedMs: 42_000 }),
      });
    });
    fireEvent.click(screen.getByRole('button', { name: /Claude/ }));

    const drawer = await screen.findByLabelText(/logbook — the record of everything that happened on the bench/);
    expect(within(drawer).getByText('editing · invoice-list.component.html')).toBeTruthy();
    expect(within(drawer).getByText('00:42')).toBeTruthy();
  });

  it('a target-log frame lands in the logbook as an app row', async () => {
    render(<App />);
    act(() => {
      FakeWebSocket.instances[0]!.onmessage?.({ data: JSON.stringify({ type: 'target-log', line: '** Angular Live Development Server is listening on localhost:4200 **' }) });
    });
    fireEvent.click(screen.getByRole('button', { name: /Claude/ }));
    const drawer = await screen.findByLabelText(/logbook — the record/);
    expect(within(drawer).getByText(/Angular Live Development Server/)).toBeTruthy();
    expect(within(drawer).getByRole('button', { name: 'app' })).toBeTruthy();
  });

  it('"setup" on the status line opens the checklist drawer (A6), and only one drawer is open at a time', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Claude/ }));
    await screen.findByLabelText(/logbook — the record/);

    fireEvent.click(screen.getByRole('button', { name: /^setup/ }));
    expect(await screen.findByLabelText(/setup — the checklist/)).toBeTruthy();
    expect(screen.queryByLabelText(/logbook — the record/)).toBeNull();
  });
});
