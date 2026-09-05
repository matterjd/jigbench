// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { PlateBench } from './PlateBench.js';
import type { Survey } from '@jigbench/core';

afterEach(() => cleanup());

function fakeFetch(result: unknown, ok = true): typeof fetch {
  return (() => Promise.resolve({ ok, json: () => Promise.resolve(result) } as Response)) as unknown as typeof fetch;
}

const survey: Survey = {
  jigFormat: 1,
  stack: ['angular'],
  components: [
    { name: 'InvoiceListComponent', selector: 'app-invoice-list', file: 'x.ts', inputs: [], outputs: [], styleUrls: [] },
  ],
  routes: [],
  endpoints: [],
  schemas: [],
  docs: [],
  generatedAt: 'now',
};

describe('PlateBench', () => {
  it('shows the honest "no target" state and the loupe readout together when nothing is wired', async () => {
    render(<PlateBench fetchImpl={fakeFetch({ target: null, port: 0, status: 'none', changes: [] })} />);
    await waitFor(() => expect(screen.getByText(/no target is set/i)).toBeTruthy());
    expect(screen.getByText(/point at anything/i)).toBeTruthy();
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
});
