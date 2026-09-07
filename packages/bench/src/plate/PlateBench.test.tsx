// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { PlateBench, type PlateBenchHandle } from './PlateBench.js';
import type { Survey } from '@jigbench/core';

const HERE = dirname(fileURLToPath(import.meta.url));

afterEach(() => cleanup());

function fakeFetch(result: unknown, ok = true): typeof fetch {
  return (() => Promise.resolve({ ok, json: () => Promise.resolve(result) } as Response)) as unknown as typeof fetch;
}

const survey: Survey = {
  jigFormat: 1,
  stack: ['angular'],
  components: [
    { name: 'InvoiceListComponent', selector: 'app-invoice-list', file: 'x.ts', standalone: true, inline: false, inputs: [], outputs: [], styleUrls: [] },
  ],
  routes: [],
  endpoints: [],
  schemas: [],
  docs: [],
  generatedAt: 'now',
};

describe('PlateBench', () => {
  it('shows the honest "no target" state when nothing is wired', async () => {
    render(<PlateBench fetchImpl={fakeFetch({ target: null, port: 0, status: 'none', changes: [] })} />);
    await waitFor(() => expect(screen.getByText(/no target is set/i)).toBeTruthy());
  });

  it('renders the plate iframe once the proxy reports "up"', async () => {
    render(
      <PlateBench
        survey={survey}
        fetchImpl={fakeFetch({ target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] })}
      />,
    );
    await waitFor(() => expect(document.querySelector('iframe')).toBeTruthy());
    expect(document.querySelector('iframe')?.getAttribute('src')).toBe('http://localhost:4601/');
  });

  it('renders the top and left rulers reading the plate\'s CSS pixels', async () => {
    const { container } = render(<PlateBench fetchImpl={fakeFetch({ target: null, port: 0, status: 'none', changes: [] })} />);
    await waitFor(() => expect(container.querySelector('.jig-plate-rulers__top canvas')).toBeTruthy());
    expect(container.querySelector('.jig-plate-rulers__left canvas')).toBeTruthy();
  });

  it('shows no guides when nothing has been picked', async () => {
    const { container } = render(<PlateBench fetchImpl={fakeFetch({ target: null, port: 0, status: 'none', changes: [] })} />);
    await waitFor(() => expect(container.querySelector('.jig-plate-rulers')).toBeTruthy());
    expect(container.querySelector('.jig-plate-guides__line')).toBeNull();
  });

  it('calls onPick when the bridge records a jig:pick, and onModeChange when the mode changes', async () => {
    const onPick = vi.fn();
    const onModeChange = vi.fn();
    render(
      <PlateBench
        fetchImpl={fakeFetch({ target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] })}
        onPick={onPick}
        onModeChange={onModeChange}
      />,
    );
    await waitFor(() => expect(document.querySelector('iframe')).toBeTruthy());
    // The bridge starts in hand mode with no pick — the mount itself fires both callbacks once
    // with their initial values, which is the honest starting state, not a bug.
    expect(onModeChange).toHaveBeenCalledWith('hand');
    expect(onPick).toHaveBeenCalledWith(null);
  });

  it('exposes highlight/clearHighlight/navigate/setMode/post via the ref for the chassis to drive', async () => {
    const ref = createRef<PlateBenchHandle>();
    const iframe = document.createElement('iframe');
    render(
      <PlateBench
        ref={ref}
        fetchImpl={fakeFetch({ target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] })}
      />,
    );
    await waitFor(() => expect(document.querySelector('iframe')).toBeTruthy());
    expect(typeof ref.current?.highlight).toBe('function');
    expect(typeof ref.current?.clearHighlight).toBe('function');
    expect(typeof ref.current?.navigate).toBe('function');
    expect(typeof ref.current?.setMode).toBe('function');
    expect(typeof ref.current?.post).toBe('function');
    void iframe;
  });

  // S8 — the toolpath recorder needs the raw jig:event stream (click/input with a DOM path);
  // onPick/onModeChange already mirror the bridge's other state up, this is the same pattern.
  it('calls onEvent with every jig:event the bridge records, in order', async () => {
    const onEvent = vi.fn();
    render(
      <PlateBench
        fetchImpl={fakeFetch({ target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] })}
        onEvent={onEvent}
      />,
    );
    const iframe = await waitFor(() => {
      const el = document.querySelector('iframe');
      if (!el) throw new Error('no iframe yet');
      return el as HTMLIFrameElement;
    });
    const plateOrigin = 'http://localhost:4601';

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'jig:event', kind: 'click', path: 'a' }, origin: plateOrigin }),
      );
    });
    await waitFor(() => expect(onEvent).toHaveBeenCalledWith({ type: 'jig:event', kind: 'click', path: 'a' }));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'jig:event', kind: 'input', path: 'b', value: 'x' }, origin: plateOrigin }),
      );
    });
    await waitFor(() =>
      expect(onEvent).toHaveBeenLastCalledWith({ type: 'jig:event', kind: 'input', path: 'b', value: 'x' }),
    );
    void iframe;
  });

  describe('integration seam 3: the plate frame shows the loaded fixture', () => {
    it('shows no fixture chip at rest', async () => {
      render(<PlateBench fetchImpl={fakeFetch({ target: null, port: 0, status: 'none', changes: [] })} />);
      await waitFor(() => expect(screen.getByText(/no target is set/i)).toBeTruthy());
      expect(screen.queryByText(/fixture ·/)).toBeNull();
    });

    it('shows a storm chip naming the fixture, with the CONFIRMED x-jig-fixture value, once FixturePanel (S7) dispatches jig:fixture-loaded with a proof', async () => {
      render(<PlateBench fetchImpl={fakeFetch({ target: null, port: 0, status: 'none', changes: [] })} />);
      await waitFor(() => expect(screen.getByText(/no target is set/i)).toBeTruthy());

      act(() => {
        window.dispatchEvent(
          new CustomEvent('jig:fixture-loaded', {
            detail: { name: 'ledger-basic', proof: { ok: true, header: 'x-jig-fixture', value: 'ledger-basic' } },
          }),
        );
      });

      expect(
        await screen.findByText('fixture · ledger-basic · loaded — the plate answers from it — x-jig-fixture: ledger-basic'),
      ).toBeTruthy();
    });

    // Matter's retest-18: this chip used to claim "the plate answers from it" the moment ANY
    // jig:fixture-loaded event named a fixture, with no proof at all — exactly the unverified
    // claim Matter's report caught. `loadedMessage` (shared with FixturePanel's own chip, so
    // the two can never say different things) makes no such claim without one.
    it('shows only the neutral "loaded" wording when jig:fixture-loaded carries no proof at all', async () => {
      render(<PlateBench fetchImpl={fakeFetch({ target: null, port: 0, status: 'none', changes: [] })} />);
      await waitFor(() => expect(screen.getByText(/no target is set/i)).toBeTruthy());

      act(() => {
        window.dispatchEvent(new CustomEvent('jig:fixture-loaded', { detail: { name: 'ledger-basic' } }));
      });

      expect(await screen.findByText('fixture · ledger-basic · loaded')).toBeTruthy();
      expect(screen.queryByText(/answers from it/i)).toBeNull();
    });

    it('clears the chip when jig:fixture-loaded fires with name: null (unload)', async () => {
      render(<PlateBench fetchImpl={fakeFetch({ target: null, port: 0, status: 'none', changes: [] })} />);
      await waitFor(() => expect(screen.getByText(/no target is set/i)).toBeTruthy());

      act(() => window.dispatchEvent(new CustomEvent('jig:fixture-loaded', { detail: { name: 'ledger-basic' } })));
      await screen.findByText(/fixture ·/);
      act(() => window.dispatchEvent(new CustomEvent('jig:fixture-loaded', { detail: { name: null } })));

      await waitFor(() => expect(screen.queryByText(/fixture ·/)).toBeNull());
    });
  });

  // Wave-4 fix: CHASSIS.md's "the plate never shrinks below a usable size (min ~560x400)" —
  // matches Chassis.css's `grid-template-rows: minmax(400px, 1fr)`.
  it('never shrinks its frame below the 400px usable floor', () => {
    const css = readFileSync(join(HERE, 'PlateBench.css'), 'utf8');
    const frameRule = css.match(/\.jig-plate-bench__frame\s*\{[^}]*\}/)![0];
    expect(frameRule).toMatch(/min-height:\s*400px/);
  });
});
