import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from './App.js';
import { setTool } from './tools/toolState.js';
import { setAdvanced } from './chassis/advancedState.js';
import { buildNoticeLine } from '@jigbench/core';

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

/** Points at something on the plate and waits for the prompt card.
 *
 * #81: this said the bridge attaches its listener after the iframe renders, so a dispatch could
 * "land before the listener does". It cannot — `usePlateBridge` adds the `message` listener
 * unconditionally on mount, so one has been attached since the first commit. The listener that
 * receives that dispatch is holding a closure over `plateOrigin`, which is `null` until
 * `usePlatePoll` reports the plate up, and its first line drops any message while that is so.
 * The iframe appears in the same commit that gives `plateOrigin` a value, but the passive effect
 * swapping in a listener that knows the new origin flushes after commit — and `waitFor` can see
 * the iframe first. So the dispatch IS received, by a listener that discards it. CI run
 * 34161356867 (windows-latest) did exactly that. The pick is re-dispatched on every retry until
 * the card is open; a repeated identical pick re-opens the same card, so the retries are
 * idempotent. */
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
    sendState(clampedState); // #24: the bench draws nothing until the host's first frame

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
    // #24, twice over: the bench draws nothing until the host's first frame, and "not installed"
    // is the claude-on-PATH probe, which only runs at a clamp.
    sendState(clampedState);
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
    sendState(clampedState); // #24: the bench draws nothing until the host's first frame
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
    sendState(clampedState); // #24: the bench draws nothing until the host's first frame
    fireEvent.click(screen.getByRole('button', { name: /^Sketch —/ }));
    expect(await screen.findByText(/no sketches yet/i)).toBeTruthy();
    expect(screen.queryByText(/Plate — where the app renders/)).toBeNull();
  });

  it('the command palette opens on Ctrl+K and lists the rail\'s tools', () => {
    render(<App />);
    sendState(clampedState); // #24: the bench draws nothing until the host's first frame
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getAllByText('Point').length).toBeGreaterThan(0);
  });

  // #68: the palette is the keyboard's way to the sheet's primitives strip. The entry has to be
  // WIRED, not merely renderable — `sketch button` from the bench's default view puts the rail
  // on Sketch, which is the half a CommandPalette unit test cannot see.
  it('#68: Ctrl+K, "sketch button", Enter arms the primitive and puts the rail on Sketch', async () => {
    stubFetch((url) => (url.includes('/api/sketches') ? ({ ok: true, json: () => Promise.resolve({ sketches: [] }) } as Response) : undefined));
    render(<App />);
    sendState(clampedState);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByText('sketch button')).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sketch button' } });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

    expect(await screen.findByText(/no sketches yet/i)).toBeTruthy(); // the sheet is on the plate
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

/**
 * #69 (the 0.2.0 desk retest, round 2): "the build-this-screen card opens off-screen behind the
 * rail." The plate box is measured in an effect with an empty dependency list — and that effect
 * runs once, after the FIRST commit, which is the `state === null` holding screen where none of
 * the chassis is rendered and the ref is null. It returns early and, with `[]`, never runs again:
 * `plateSize` stays `{ w: 0, h: 0 }` for the life of the page. Fed a 0x0 plate every clamp in
 * `placeCardPosition` inverts, and a sketch anchor (the whole plate, so `{0,0,0,0}`) falls
 * through to the corner at `0 - 340 - 8` = **-348** — 348px left of the plate, under the rail.
 *
 * jsdom computes no layout, so the plate's box has to be modelled: `clientWidth`/`clientHeight`
 * answer the way a browser would. That is the whole reason this was invisible to the suite.
 */
describe('App (#69: the plate is measured, so the card lands inside it)', () => {
  const saved: Record<string, PropertyDescriptor | undefined> = {};

  function stubBoxes(w: number, h: number): void {
    for (const [name, value] of [['clientWidth', w], ['clientHeight', h], ['offsetHeight', 320]] as const) {
      saved[name] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name);
      Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: () => value });
    }
  }

  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    stubFetch();
    stubBoxes(1045, 700); // the plate region at 1440x900, per docs/team/v0.2/CHASSIS.md
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    setTool('point');
    setAdvanced(false);
    for (const name of ['clientWidth', 'clientHeight', 'offsetHeight']) {
      const descriptor = saved[name];
      if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, name);
    }
  });

  it('a Point pick opens the card BESIDE the selection, not pinned to the plate\'s left edge', async () => {
    stubFetch((url) =>
      url.includes('/api/plate')
        ? ({ ok: true, json: () => Promise.resolve({ target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] }) } as Response)
        : undefined,
    );
    render(<App />);
    sendState(clampedState);
    const dialog = await pickOnPlate({
      path: 'app-invoice-list',
      tag: 'app-invoice-list',
      text: 'Invoices',
      component: 'InvoiceListComponent',
      file: 'x.ts',
      rect: { x: 100, y: 100, width: 200, height: 60 },
    });

    expect(dialog.dataset.where).toBe('beside');
    expect(dialog.style.left).toBe(100 + 200 + 12 + 'px'); // r.x + r.w + the 12px margin
  });

  it('"build this screen →" opens a card titled with the sketch\'s name, fully inside the plate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.includes('/api/sketches') && method === 'POST')
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ jigFormat: 1, id: '0001', name: 'Overdue invoices', createdAt: 'a', updatedAt: 'a', size: { w: 640, h: 480 }, elements: [], links: [] }),
          } as Response);
        if (url.includes('/api/sketches')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ sketches: [] }) } as Response);
        if (url.includes('/api/prompts')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ prompts: [] }) } as Response);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ wiring, shop: null, status: { claude: { state: 'idle' } } }) } as Response);
      }),
    );
    render(<App />);
    sendState(clampedState);
    fireEvent.click(screen.getByRole('button', { name: /^Sketch —/ }));
    await screen.findByText(/no sketches yet/i);
    fireEvent.change(screen.getByPlaceholderText(/name this sketch/i), { target: { value: 'Overdue invoices' } });
    fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
    await screen.findByLabelText('sketch sheet');

    fireEvent.click(screen.getByRole('button', { name: /build this screen/i }));

    const dialog = await screen.findByRole('dialog', { name: /prompt card/i });
    expect(within(dialog).getByText('Overdue invoices')).toBeTruthy();
    expect(parseFloat(dialog.style.left)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(dialog.style.top)).toBeGreaterThanOrEqual(0);
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

  // #24 (the 0.2.0 review): "App.tsx:147 shows the empty bench for a frame before the Clamp
  // screen. Gate on state === null." The gate below it is `state?.bench === null`, and a null
  // `state` is not that — so the whole chassis painted while the first WS frame was still in
  // the air, then vanished.
  it('#24: draws none of the bench until the host has said something', () => {
    render(<App />);

    expect(screen.queryByRole('button', { name: /^Point —/ })).toBeNull();
    expect(screen.queryByText(/Plate — where the app renders/)).toBeNull();
    expect(screen.queryByRole('tab', { name: /Prompts/ })).toBeNull();
    // Not a blank page either — if the socket never opens, this line is what there is to read.
    expect(screen.getByRole('status').textContent).toMatch(/Jig is starting/);
  });

  it('opens on the Clamp screen — recent benches, the folder browser, no rail — when the host says bench: null', async () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: /^Point —/ })).toBeNull(); // #24: nothing of the bench before the first frame

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
    sendState(clampedState); // #24: the bench draws nothing until the host's first frame
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
    sendState(clampedState); // #24: the bench draws nothing until the host's first frame
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
    sendState(clampedState); // #24: the bench draws nothing until the host's first frame
    fireEvent.click(screen.getByRole('button', { name: /Claude/ }));
    await screen.findByLabelText(/logbook — the record/);

    fireEvent.click(screen.getByRole('button', { name: /^setup/ }));
    expect(await screen.findByLabelText(/setup — the checklist/)).toBeTruthy();
    expect(screen.queryByLabelText(/logbook — the record/)).toBeNull();
  });
  // #103 (#98): a `notice` is the build saying something about ITSELF, and it was the one kind
  // the status line could not say. `lastEventText` answered `undefined` for anything but
  // text/raw/tool, so `StatusLine` fell through to its `?? 'starting claude -p'` and went on
  // claiming the build was starting — through a fifteen-second git stall, which is precisely
  // the stretch the notice exists to explain. `core/src/build.ts` says the line is shared "so
  // all four say the same thing about the same event"; three of the four were saying it.
  it('#103 (#98): a build notice reaches the status line instead of leaving it on "starting claude -p"', async () => {
    render(<App />);
    sendState({
      ...clampedState,
      wiring: { ...wiring, claude: 'installed' as const }, // the line only reports a build when the binary is there
      status: { claude: { state: 'building', id: '0003', elapsed: 12_000 } },
    });
    act(() => {
      FakeWebSocket.instances[0]!.onmessage?.({
        data: JSON.stringify({ type: 'build', id: '0003', event: { kind: 'notice', code: 'git-timed-out' }, elapsedMs: 12_000 }),
      });
    });

    const line = await screen.findByTitle(/Claude — click to open the logbook/);
    expect(line.textContent, 'the status line did not say what the build said about itself').toContain(
      buildNoticeLine('git-timed-out'),
    );
    expect(line.textContent, 'still claiming the build is starting, through the stall').not.toContain('starting claude -p');
  });
});
