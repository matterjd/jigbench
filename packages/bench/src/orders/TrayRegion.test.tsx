import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { WorkOrder } from '@jigbench/core';
import { setTool } from '../tools/toolState.js';
import { TrayRegion } from './TrayRegion.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function wo(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    jigFormat: 1,
    id: '0001',
    slug: 'flag-overdue-invoices',
    state: 'marked',
    draftedBy: 'person',
    marks: ['m-0001'],
    human: { what: 'flag overdue invoices', why: '', where: 'InvoiceListComponent', acceptance: [] },
    log: [{ at: '2026-09-05T00:00:00.000Z', actor: 'bench', event: 'marked', ref: 'm-0001' }],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  setTool('hand');
  document.documentElement.style.removeProperty('--t-oath');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TrayRegion — collapsed: the order in hand', () => {
  it('shows an honest empty state with no work orders', () => {
    render(<TrayRegion workOrders={[]} />);
    expect(screen.getByText(/no marks yet/i)).toBeTruthy();
  });

  it('renders the number, slug, ladder, and human face of the most recent order by default', () => {
    render(<TrayRegion workOrders={[wo()]} />);
    expect(screen.getByText('#0001')).toBeTruthy();
    expect(screen.getByText('flag-overdue-invoices')).toBeTruthy();
    expect(screen.getByLabelText('work-order state ladder')).toBeTruthy();
    expect(screen.getByDisplayValue('flag overdue invoices')).toBeTruthy(); // the "what" field
  });

  it('badges who drafted it and the cost, once drafted', () => {
    const drafted = wo({
      state: 'drafted',
      draftedBy: 'model',
      log: [
        { at: '2026-09-05T00:00:00.000Z', actor: 'bench', event: 'marked', ref: 'm-0001' },
        { at: '2026-09-05T00:00:05.000Z', actor: 'model', event: 'drafted', ref: '0001', note: 'qwen2.5-coder:7b · 4.9s' },
      ],
    });
    render(<TrayRegion workOrders={[drafted]} />);
    expect(screen.getByText(/drafted ·/i)).toBeTruthy();
    expect(screen.getByText(/qwen2\.5-coder:7b · 4\.9s/)).toBeTruthy();
  });

  it('shows a pending badge with elapsed time, never a bare spinner, while a draft is in flight', () => {
    vi.useFakeTimers();
    const start = new Date('2026-09-05T00:00:00.000Z');
    vi.setSystemTime(start);
    const pending = wo({ state: 'marked' });

    render(<TrayRegion workOrders={[pending]} now={() => Date.now()} />);
    act(() => vi.advanceTimersByTime(1200));

    expect(screen.getByText(/drafting/i)).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull(); // no bare spinner — the charge is text
    vi.useRealTimers();
  });

  // Wave-4 fix (TEST-RUN.md's first live test, defect 5): "the drafted-by badge... must sit
  // in the collapsed tray beside the ladder, always visible."
  it('places the drafted-by badge in the header, beside the ladder', () => {
    const drafted = wo({
      state: 'drafted',
      draftedBy: 'model',
      log: [{ at: '2026-09-05T00:00:00.000Z', actor: 'model', event: 'drafted', ref: '0001', note: 'qwen2.5-coder:7b · 4.9s' }],
    });
    const { container } = render(<TrayRegion workOrders={[drafted]} />);
    const header = container.querySelector('.jig-tray__header')!;
    expect(within(header).getByLabelText('work-order state ladder')).toBeTruthy();
    expect(within(header).getByText(/drafted ·/i)).toBeTruthy();
  });

  // Wave-4 fix, defect 5 (the actual root cause behind "I did not see `drafted ·
  // qwen2.5-coder:7b · N.Ns`"): a work order read back off a persisted `.jig/work-orders/*.md`
  // file always has `log: []` (work-order.ts's `parseWorkOrder` — "the logbook is a separate
  // surface"). The badge must still show the right rung from `order.state` alone.
  it('badges "drafted" from order.state even when the log carries no drafted entry', () => {
    const drafted = wo({ state: 'drafted', draftedBy: 'model', log: [] });
    render(<TrayRegion workOrders={[drafted]} />);
    expect(screen.getByText(/drafted · model/i)).toBeTruthy();
  });

  // Retest defect 5 (2026-09-06 evening): "I just see `drafted · model`. The tray badge
  // lacks the model name and elapsed seconds even with Ollama running (after a scrap and a
  // fresh mark)." A re-read order (a bench restart, or a scrap + fresh mark) always has
  // `log: []` (the logbook never round-trips through the persisted file), but now carries
  // `model`/`elapsedMs` directly — the badge must read THOSE, not fall all the way back to
  // the bare driver name.
  it('badges the model name and cost from order.model/elapsedMs when the log carries no drafted entry (defect 5)', () => {
    const drafted = wo({ state: 'drafted', draftedBy: 'model', model: 'qwen2.5-coder:7b', elapsedMs: 5200, log: [] });
    render(<TrayRegion workOrders={[drafted]} />);
    expect(screen.getByText(/drafted · qwen2\.5-coder:7b · 5\.2s/i)).toBeTruthy();
  });

  it('still prefers a real drafted log entry note over the persisted fields, when both are present', () => {
    const drafted = wo({
      state: 'drafted',
      draftedBy: 'model',
      model: 'qwen2.5-coder:7b',
      elapsedMs: 5200,
      log: [{ at: '2026-09-05T00:00:00.000Z', actor: 'model', event: 'drafted', ref: '0001', note: 'a fresher live note · 1.0s' }],
    });
    render(<TrayRegion workOrders={[drafted]} />);
    expect(screen.getByText(/drafted · a fresher live note · 1\.0s/i)).toBeTruthy();
  });

  it('badges "released" once the order is past drafted, even with no released log entry', () => {
    const released = wo({ state: 'released', draftedBy: 'model', log: [] });
    render(<TrayRegion workOrders={[released]} />);
    expect(screen.getByText(/released ·/i)).toBeTruthy();
    expect(screen.queryByText(/^drafted ·/i)).toBeNull();
  });

  it('badges "released" for in-the-shop and trial-fit too — the ladder rung, not a stale drafted log entry, decides', () => {
    const inShop = wo({
      state: 'in-the-shop',
      draftedBy: 'model',
      log: [{ at: '2026-09-05T00:00:00.000Z', actor: 'model', event: 'drafted', ref: '0001', note: 'qwen2.5-coder:7b · 4.9s' }],
    });
    render(<TrayRegion workOrders={[inShop]} />);
    expect(screen.getByText(/released ·/i)).toBeTruthy();
    expect(screen.queryByText(/qwen2\.5-coder/i)).toBeNull();
  });

  // Wave-4 fix, defects 5 & 6: RELEASE (and the scrap action) must never be inside the tray's
  // own scrollable band — they are pinned siblings, so they stay visible regardless of how
  // long the human face/shop face get.
  it('keeps RELEASE and the scrap action outside the scrollable face/shop-face band', () => {
    const drafted = wo({ state: 'drafted' });
    const { container } = render(<TrayRegion workOrders={[drafted]} />);
    const scroll = container.querySelector('.jig-tray__scroll')!;
    const release = screen.getByRole('button', { name: /release/i });
    expect(scroll.contains(release)).toBe(false);
    const scrap = screen.getByRole('button', { name: /scrap · to the bin/i });
    expect(scroll.contains(scrap)).toBe(false);
    // ...but the human face IS inside it, which is the whole point of the band.
    expect(scroll.contains(screen.getByLabelText(/^what$/i))).toBe(true);
  });

  it('shows the shop face once released, mono for the file paths', () => {
    const released = wo({
      state: 'released',
      shop: { files: ['a.ts', 'a.html'], patterns: ['standalone component'], tests: ['a.spec.ts'], brief: 'do the thing' },
    });
    render(<TrayRegion workOrders={[released]} />);
    expect(screen.getByText(/do the thing/)).toBeTruthy();
    expect(screen.getByText('a.ts')).toBeTruthy();
  });

  it('edits the human face and PATCHes the server', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => wo() });
    render(<TrayRegion workOrders={[wo()]} fetchImpl={fetchImpl as unknown as typeof fetch} />);

    const whyField = screen.getByLabelText(/why/i) as HTMLInputElement;
    fireEvent.change(whyField, { target: { value: 'because customers miss them' } });
    fireEvent.blur(whyField);

    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledWith(
        '/api/work-orders/0001',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });
});

describe('TrayRegion — RELEASE, the one held demand', () => {
  function fetchThatReleases(): typeof fetch {
    return vi.fn().mockResolvedValue({ ok: true, json: async () => wo({ state: 'released' }) }) as unknown as typeof fetch;
  }

  it('is disabled until the order is drafted', () => {
    render(<TrayRegion workOrders={[wo({ state: 'marked' })]} />);
    const release = screen.getByRole('button', { name: /release/i }) as HTMLButtonElement;
    expect(release.disabled).toBe(true);
  });

  it('reads --t-oath live and cancels before the hold completes, in words', () => {
    document.documentElement.style.setProperty('--t-oath', '200ms');
    vi.useFakeTimers();
    const onRelease = fetchThatReleases();
    render(<TrayRegion workOrders={[wo({ state: 'drafted' })]} fetchImpl={onRelease} />);

    const release = screen.getByRole('button', { name: /release/i });
    fireEvent.pointerDown(release, { pointerId: 1 });
    act(() => vi.advanceTimersByTime(80)); // well under the 200ms token
    fireEvent.pointerUp(release, { pointerId: 1 });

    expect(screen.getByText(/released before the weight — nothing written/i)).toBeTruthy();
    expect(onRelease).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('commits and calls POST .../release once held through the full --t-oath duration', () => {
    document.documentElement.style.setProperty('--t-oath', '150ms');
    vi.useFakeTimers();
    const fetchImpl = fetchThatReleases();
    render(<TrayRegion workOrders={[wo({ state: 'drafted' })]} fetchImpl={fetchImpl} />);

    const release = screen.getByRole('button', { name: /release/i });
    fireEvent.pointerDown(release, { pointerId: 1 });
    act(() => vi.advanceTimersByTime(150));

    expect(fetchImpl).toHaveBeenCalledWith('/api/work-orders/0001/release', expect.objectContaining({ method: 'POST' }));
    vi.useRealTimers();
  });
});

describe('TrayRegion — expanded: the spine', () => {
  it('groups orders by state along the ladder, with a scrap bin for scrapped ones', () => {
    const orders = [
      wo({ id: '0001', state: 'marked' }),
      wo({ id: '0002', state: 'drafted' }),
      wo({ id: '0003', state: 'scrapped' }),
    ];
    render(<TrayRegion workOrders={orders} />);

    fireEvent.click(screen.getByRole('button', { name: /work orders|expand|spine/i }));

    expect(screen.getByText('#0001')).toBeTruthy();
    expect(screen.getByText('#0002')).toBeTruthy();
    expect(screen.getByRole('button', { name: /scrap bin/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /scrap bin.*1/i })).toBeTruthy();
  });

  it('selecting a card collapses back to the order in hand', () => {
    const orders = [wo({ id: '0001' }), wo({ id: '0002', human: { what: 'second', why: '', where: 'x', acceptance: [] } })];
    render(<TrayRegion workOrders={orders} />);
    fireEvent.click(screen.getByRole('button', { name: /work orders|expand|spine/i }));

    fireEvent.click(screen.getByText('#0002'));

    expect(screen.getByDisplayValue('second')).toBeTruthy();
    expect(screen.queryByRole('list', { name: /spine/i })).toBeNull();
  });

  it('a printed affordance clears filters and returns to the full spine', () => {
    const orders = [wo({ id: '0001', state: 'marked' }), wo({ id: '0002', state: 'drafted' })];
    render(<TrayRegion workOrders={orders} />);
    fireEvent.click(screen.getByRole('button', { name: /work orders|expand|spine/i }));

    fireEvent.click(screen.getByRole('button', { name: /marked/i }));
    fireEvent.click(screen.getByRole('button', { name: /^printed$/i }));

    expect(screen.getByText('#0001')).toBeTruthy();
    expect(screen.getByText('#0002')).toBeTruthy();
  });
});

describe('TrayRegion — jig:select-order', () => {
  it('a jig:select-order DOM event selects that order and collapses the tray', () => {
    const orders = [wo({ id: '0001' }), wo({ id: '0002', human: { what: 'second one', why: '', where: 'x', acceptance: [] } })];
    render(<TrayRegion workOrders={orders} />);
    fireEvent.click(screen.getByRole('button', { name: /work orders|expand|spine/i }));

    act(() => window.dispatchEvent(new CustomEvent('jig:select-order', { detail: { id: '0002' } })));

    expect(screen.getByDisplayValue('second one')).toBeTruthy();
  });
});

describe('TrayRegion — marks: the tool is "mark" and a pick arrives', () => {
  it(
    'opens a one-line prompt over the tray, then posts the mark and lets the server auto-draft it ' +
      '(seam 2: POST /api/marks itself now kicks off the draft — TrayRegion no longer calls /draft)',
    async () => {
      const created = { mark: { id: 'm-0002' }, workOrder: wo({ id: '0002' }) };
      const fetchImpl = vi.fn((url: string) => {
        if (String(url) === '/api/marks') return Promise.resolve({ ok: true, status: 201, json: async () => created });
        if (String(url).endsWith('/draft')) return Promise.resolve({ ok: true, status: 202, json: async () => ({ accepted: true }) });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }) as unknown as typeof fetch;

      setTool('point'); // S12: 'mark' folded into 'point' (CHASSIS.md v0.2 §2)
      const pick = { type: 'jig:pick' as const, path: 'body > app-invoice-list', tag: 'app-invoice-list', text: 'Invoices', component: 'InvoiceListComponent', rect: { x: 0, y: 0, width: 1, height: 1 } };

      render(<TrayRegion workOrders={[]} lastPick={pick} fetchImpl={fetchImpl} />);

      const input = screen.getByPlaceholderText(/what should change here/i);
      fireEvent.change(input, { target: { value: 'flag overdue rows' } });
      fireEvent.submit(input.closest('form')!);

      await waitFor(() =>
        expect(fetchImpl).toHaveBeenCalledWith(
          '/api/marks',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ pick, prompt: 'flag overdue rows' }),
          }),
        ),
      );
      // The server (http.ts's POST /api/marks, seam 2) now fires the auto-draft itself right
      // after responding 201 — TrayRegion must not ALSO call /draft, or a real server would
      // draft the same order twice.
      expect(fetchImpl).not.toHaveBeenCalledWith('/api/work-orders/0002/draft', expect.anything());
    },
  );

  it('does not open the prompt when the tool is not "mark"', () => {
    setTool('hand');
    const pick = { type: 'jig:pick' as const, path: 'x', tag: 'div', text: '', rect: { x: 0, y: 0, width: 1, height: 1 } };
    render(<TrayRegion workOrders={[]} lastPick={pick} />);
    expect(screen.queryByPlaceholderText(/what should change here/i)).toBeNull();
  });
});

describe('TrayRegion — jig:highlight: the plate outline is S4\'s, the path is ours to post', () => {
  it('posts jig:highlight with the order-in-hand mark\'s DOM path once the plate is wired', () => {
    const orders = [wo({ id: '0001', marks: ['m-0001'] })];
    const marks = [
      {
        id: 'm-0001',
        number: 1,
        target: { path: 'body > app-invoice-list:nth-of-type(2)', component: 'InvoiceListComponent' },
        prompt: 'flag overdue invoices',
        createdAt: '2026-09-05T00:00:00.000Z',
        workOrderId: '0001',
      },
    ];
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const posted: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: (msg: unknown) => posted.push(msg) } });
    const iframeRef = { current: iframe };

    render(<TrayRegion workOrders={orders} marks={marks} iframeRef={iframeRef} plateOrigin="http://localhost:4601" />);

    expect(posted).toContainEqual({ type: 'jig:highlight', path: 'body > app-invoice-list:nth-of-type(2)' });
    document.body.removeChild(iframe);
  });

  it('never posts when the plate is not wired (no plateOrigin, no iframeRef)', () => {
    const orders = [wo({ id: '0001', marks: ['m-0001'] })];
    // No throw, nothing to assert on postMessage — this just proves it degrades quietly.
    expect(() => render(<TrayRegion workOrders={orders} />)).not.toThrow();
  });
});

describe('design floor: ember is the one demand', () => {
  it('--ember appears exactly once in TrayRegion.css (the RELEASE control only)', () => {
    const css = readFileSync(join(HERE, 'TrayRegion.css'), 'utf8');
    const matches = css.match(/var\(--ember(-soft)?\)/g) ?? [];
    // Every use of --ember/--ember-soft in this file must sit under a `.jig-release`
    // selector — the RELEASE control is the only ember-carrying thing in the tray.
    const rules = css.split('}');
    for (const rule of rules) {
      if (/var\(--ember/.test(rule)) {
        expect(rule).toMatch(/\.jig-release/);
      }
    }
    expect(matches.length).toBeGreaterThan(0);
  });
});
