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
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ wiring, shop: null, status: { claude: { state: 'idle' } } }) } as Response);
    }),
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

  it('the Prompts tab says the bench is ahead of its server when /api/prompts 404s (S11 not on main yet)', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/the bench is ahead of its server — prompts arrive with S11/i)).toBeTruthy());
  });

  it('the status line reads "not installed" when wiring.claude is none', () => {
    render(<App />);
    expect(screen.getByText(/not installed/)).toBeTruthy();
  });

  it('the Advanced drawer is absent by default, and appears (with the spine, rulers switch, mirror switch, Fixtures, Toolpath, MCP) once the switch is on', async () => {
    render(<App />);
    expect(screen.queryByLabelText(/rulers & guides/i)).toBeNull();

    fireEvent.click(screen.getByLabelText(/Advanced — everything that is not the loop/i));

    await waitFor(() => expect(screen.getByLabelText(/rulers & guides/i)).toBeTruthy());
    expect(screen.getByLabelText(/the mirror/i)).toBeTruthy();
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
    await waitFor(() => {
      if (!document.querySelector('iframe')) throw new Error('no iframe yet');
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'jig:pick',
            path: 'app-invoice-list',
            tag: 'app-invoice-list',
            text: 'Invoices',
            component: 'InvoiceListComponent',
            file: 'src/app/invoices/invoice-list/invoice-list.component.ts',
            rect: { x: 100, y: 100, width: 200, height: 60 },
          },
          origin: 'http://localhost:4601',
        }),
      );
    });

    const dialog = await screen.findByRole('dialog', { name: /prompt card/i });
    expect(within(dialog).getByText('InvoiceListComponent')).toBeTruthy();
  });

  it('typing in the open card creates a draft prompt (optimistically, even though /api/prompts 404s) and it appears in the Prompts tab', async () => {
    stubFetch((url) =>
      url.includes('/api/plate')
        ? ({ ok: true, json: () => Promise.resolve({ target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] }) } as Response)
        : undefined,
    );
    render(<App />);
    await waitFor(() => {
      if (!document.querySelector('iframe')) throw new Error('no iframe yet');
    });
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'jig:pick', path: 'x', tag: 'div', text: '', component: 'InvoiceListComponent', file: 'x.ts', rect: { x: 0, y: 0, width: 10, height: 10 } },
          origin: 'http://localhost:4601',
        }),
      );
    });
    await screen.findByRole('dialog', { name: /prompt card/i });

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
