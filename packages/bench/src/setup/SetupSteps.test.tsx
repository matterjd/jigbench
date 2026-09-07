import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DetectedTargetSummary, TargetState } from '@jigbench/core';
import { SetupSteps, targetWords, type SetupStepsProps } from './SetupSteps.js';

afterEach(() => cleanup());

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

type Answer = { status: number; body: unknown };

/** Routes on `METHOD url`; anything unrouted answers 404. Records every call with its body. */
function routeStub(routes: Record<string, Answer | ((body: unknown) => Answer)>): { fetchImpl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    const route = routes[`${method} ${url}`];
    const answer = typeof route === 'function' ? route(body) : (route ?? { status: 404, body: { error: `no route ${method} ${url}` } });
    return { ok: answer.status < 300, status: answer.status, json: async () => answer.body } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const detected: DetectedTargetSummary = { script: 'start', port: 4200, source: 'package.json' };

function props(overrides: Partial<SetupStepsProps> = {}): SetupStepsProps {
  return {
    repoRoot: '/home/you/repo',
    target: { status: 'none' },
    targetLogTail: [],
    detected,
    docs: { wired: false },
    mcp: { written: false },
    desktop: { written: false },
    claudeInstalled: true,
    ...overrides,
  };
}

describe('SetupSteps — the three steps after a clamp', () => {
  describe('the app', () => {
    it('says up front what "Start the app" will run, then POSTs /api/target/start with {} and logs the human act on 202', async () => {
      const { fetchImpl, calls } = routeStub({ 'POST /api/target/start': { status: 202, body: { accepted: true, port: 4200 } } });
      const onLog = vi.fn();
      render(<SetupSteps {...props({ fetchImpl, onLog })} />);
      expect(screen.getByText(/Start the app runs/).textContent).toBe('Start the app runs npm run start · port 4200 · from package.json');
      fireEvent.click(screen.getByRole('button', { name: 'Start the app' }));
      await waitFor(() => expect(calls).toEqual([{ url: '/api/target/start', method: 'POST', body: {} }]));
      await waitFor(() => expect(onLog).toHaveBeenCalledWith('human', 'start the app · npm run start', 'the app'));
    });

    it('names the angular.json tier honestly when there is no npm script', () => {
      render(<SetupSteps {...props({ detected: { port: 4300, source: 'angular.json' } })} />);
      expect(screen.getByText(/Start the app runs/).textContent).toBe('Start the app runs npx ng serve · port 4300 · from angular.json');
    });

    it('shows a 400\'s words under the button, prefixed "not started ·"', async () => {
      const { fetchImpl } = routeStub({
        'POST /api/target/start': { status: 400, body: { error: 'could not detect a dev script for this repo' } },
      });
      render(<SetupSteps {...props({ fetchImpl })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Start the app' }));
      expect(await screen.findByText('not started · could not detect a dev script for this repo')).toBeTruthy();
    });

    it('shows a 409\'s words the same way', async () => {
      const { fetchImpl } = routeStub({ 'POST /api/target/start': { status: 409, body: { error: 'target is already up' } } });
      render(<SetupSteps {...props({ fetchImpl })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Start the app' }));
      expect(await screen.findByText('not started · target is already up')).toBeTruthy();
    });

    it('with nothing detected, says so and asks for a URL instead — no Start button', () => {
      render(<SetupSteps {...props({ detected: null })} />);
      expect(screen.getByText('no dev script found — start the app yourself and paste its URL')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Start the app' })).toBeNull();
    });

    it('the URL field starts from devServerGuess, else the detected port, else empty', () => {
      const { unmount } = render(<SetupSteps {...props({ devServerGuess: 'http://localhost:5173' })} />);
      expect((screen.getByPlaceholderText('http://localhost:4200') as HTMLInputElement).value).toBe('http://localhost:5173');
      unmount();
      const second = render(<SetupSteps {...props()} />);
      expect((screen.getByPlaceholderText('http://localhost:4200') as HTMLInputElement).value).toBe('http://localhost:4200');
      second.unmount();
      render(<SetupSteps {...props({ detected: null })} />);
      expect((screen.getByPlaceholderText('http://localhost:4200') as HTMLInputElement).value).toBe('');
    });

    it('"use this URL" POSTs {url} to /api/target/url and logs the pointing', async () => {
      const { fetchImpl, calls } = routeStub({ 'POST /api/target/url': { status: 200, body: { ok: true } } });
      const onLog = vi.fn();
      render(<SetupSteps {...props({ fetchImpl, onLog, detected: null })} />);
      fireEvent.change(screen.getByPlaceholderText('http://localhost:4200'), { target: { value: 'http://localhost:3000' } });
      fireEvent.click(screen.getByRole('button', { name: 'use this URL' }));
      await waitFor(() => expect(calls).toEqual([{ url: '/api/target/url', method: 'POST', body: { url: 'http://localhost:3000' } }]));
      await waitFor(() => expect(onLog).toHaveBeenCalledWith('human', 'the app · pointed at http://localhost:3000', 'the app'));
    });

    it('"use this URL" shows a 400\'s words', async () => {
      const { fetchImpl } = routeStub({ 'POST /api/target/url': { status: 400, body: { error: 'url is required' } } });
      render(<SetupSteps {...props({ fetchImpl, detected: null })} />);
      fireEvent.click(screen.getByRole('button', { name: 'use this URL' }));
      expect(await screen.findByText(/url is required/)).toBeTruthy();
    });

    it.each<[TargetState, string]>([
      [{ status: 'none' }, 'not running'],
      [{ status: 'starting' }, 'starting · waiting for the port to answer'],
      [{ status: 'up', url: 'http://localhost:4200', pid: 4321 }, 'up · http://localhost:4200 · pid 4321'],
      [{ status: 'up', url: 'http://localhost:4200' }, 'up · http://localhost:4200'],
      [{ status: 'down', exitCode: 1 }, 'down · exit 1'],
      [{ status: 'down', exitCode: null }, 'down · exit unknown'],
    ])('says the state %j in words: "%s"', (target, words) => {
      render(<SetupSteps {...props({ target })} />);
      expect(screen.getByText(words)).toBeTruthy();
      expect(targetWords(target)).toBe(words);
    });

    it('offers "stop" only when Jig started the app (a pid), and POSTs /api/target/stop', async () => {
      const { fetchImpl, calls } = routeStub({ 'POST /api/target/stop': { status: 200, body: { ok: true } } });
      render(<SetupSteps {...props({ fetchImpl, target: { status: 'up', url: 'http://localhost:4200', pid: 4321 } })} />);
      fireEvent.click(screen.getByRole('button', { name: 'stop' }));
      await waitFor(() => expect(calls[0]).toMatchObject({ url: '/api/target/stop', method: 'POST' }));
    });

    it('a pasted URL is not Jig\'s to stop — says so instead of a stop button', () => {
      render(<SetupSteps {...props({ target: { status: 'up', url: 'http://localhost:4200' } })} />);
      expect(screen.queryByRole('button', { name: 'stop' })).toBeNull();
      expect(screen.getByText('pointed at a running app — nothing for Jig to stop')).toBeTruthy();
    });

    it('shows only the LAST 12 lines of the app\'s own log, labelled', () => {
      const tail = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
      render(<SetupSteps {...props({ targetLogTail: tail })} />);
      expect(screen.getByText("the app's own log")).toBeTruthy();
      const pre = document.querySelector('pre') as HTMLPreElement;
      const shown = pre.textContent!.split('\n');
      expect(shown).toHaveLength(12);
      expect(shown[0]).toBe('line 19');
      expect(shown[11]).toBe('line 30');
    });

    it('shows no log block when there are no lines', () => {
      render(<SetupSteps {...props({ targetLogTail: [] })} />);
      expect(screen.queryByText("the app's own log")).toBeNull();
    });
  });

  describe('docs', () => {
    it('not wired: "clamp docs" POSTs {folder} (default ./docs), then shows the counts and logs', async () => {
      const { fetchImpl, calls } = routeStub({
        'POST /api/docs/clamp': { status: 200, body: { files: 3, chunks: 12, ignoredExtensions: [], file: 'x' } },
      });
      const onLog = vi.fn();
      const onDocsClamped = vi.fn();
      render(<SetupSteps {...props({ fetchImpl, onLog, onDocsClamped })} />);
      expect((screen.getByLabelText(/docs folder/) as HTMLInputElement).value).toBe('./docs');
      fireEvent.click(screen.getByRole('button', { name: 'clamp docs' }));
      await waitFor(() => expect(calls).toEqual([{ url: '/api/docs/clamp', method: 'POST', body: { folder: './docs' } }]));
      expect(await screen.findByText('3 files · 12 chunks')).toBeTruthy();
      expect(onDocsClamped).toHaveBeenCalledWith({ files: 3, chunks: 12 });
      expect(onLog).toHaveBeenCalledWith('human', 'docs clamped · ./docs', 'docs');
    });

    it('shows a 400\'s words prefixed "not clamped ·"', async () => {
      const { fetchImpl } = routeStub({ 'POST /api/docs/clamp': { status: 400, body: { error: 'folder is required' } } });
      render(<SetupSteps {...props({ fetchImpl })} />);
      fireEvent.change(screen.getByLabelText(/docs folder/), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'clamp docs' }));
      expect(await screen.findByText('not clamped · folder is required')).toBeTruthy();
    });

    it('wired: says "docs clamped · <folder>" and "clamp another folder" reveals the field', () => {
      render(<SetupSteps {...props({ docs: { wired: true, folder: './docs' } })} />);
      expect(screen.getByText('docs clamped · ./docs')).toBeTruthy();
      expect(screen.queryByLabelText(/docs folder/)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'clamp another folder' }));
      expect(screen.getByLabelText(/docs folder/)).toBeTruthy();
    });

    it('wired with no known folder: just "docs clamped"', () => {
      render(<SetupSteps {...props({ docs: { wired: true } })} />);
      expect(screen.getByText('docs clamped')).toBeTruthy();
    });
  });

  describe('Claude Code', () => {
    it('says what Build does and what MCP is for', () => {
      render(<SetupSteps {...props()} />);
      expect(screen.getByText('Build runs Claude Code itself in the repo; MCP stays for other agents.')).toBeTruthy();
    });

    it('says in words when claude is not on PATH', () => {
      render(<SetupSteps {...props({ claudeInstalled: false })} />);
      expect(screen.getByText(/not found · claude is not on PATH — Build needs it; install Claude Code, then restart jigbench/)).toBeTruthy();
    });

    it('already written: "registered · .mcp.json" and no Register button', () => {
      render(<SetupSteps {...props({ mcp: { written: true, path: '/home/you/repo/.mcp.json' } })} />);
      expect(screen.getByText('registered · .mcp.json')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Register with Claude Code' })).toBeNull();
    });

    it('Register → what-will-change first ({apply:false}), then "write .mcp.json" ({apply:true}) → written + callbacks', async () => {
      const { fetchImpl, calls } = routeStub({
        'POST /api/setup/mcp': (body) =>
          (body as { apply: boolean }).apply
            ? { status: 200, body: { diff: '+ jig entry', changed: true, wrote: true } }
            : { status: 200, body: { diff: '+ jig entry', changed: true, wrote: false } },
      });
      const onLog = vi.fn();
      const onMcpWritten = vi.fn();
      render(<SetupSteps {...props({ fetchImpl, onLog, onMcpWritten })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Register with Claude Code' }));
      await waitFor(() => expect(calls[0]).toEqual({ url: '/api/setup/mcp', method: 'POST', body: { apply: false } }));
      expect(await screen.findByText('what .mcp.json will say')).toBeTruthy();
      expect(screen.getByText('+ jig entry')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'write .mcp.json' }));
      await waitFor(() => expect(calls[1]).toEqual({ url: '/api/setup/mcp', method: 'POST', body: { apply: true } }));
      expect(await screen.findByText('written · .mcp.json')).toBeTruthy();
      expect(onMcpWritten).toHaveBeenCalled();
      expect(onLog).toHaveBeenCalledWith('human', '.mcp.json written', 'setup');
    });

    it('Register with changed:false says "already registered · .mcp.json"', async () => {
      const { fetchImpl } = routeStub({ 'POST /api/setup/mcp': { status: 200, body: { diff: '', changed: false, wrote: false } } });
      render(<SetupSteps {...props({ fetchImpl })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Register with Claude Code' }));
      expect(await screen.findByText('already registered · .mcp.json')).toBeTruthy();
    });

    it('Register with a 409 shows the words', async () => {
      const { fetchImpl } = routeStub({ 'POST /api/setup/mcp': { status: 409, body: { error: 'no repo is clamped' } } });
      render(<SetupSteps {...props({ fetchImpl })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Register with Claude Code' }));
      expect(await screen.findByText(/no repo is clamped/)).toBeTruthy();
    });

    it('Claude Desktop: the smaller line → what-will-change → "write the Desktop entry" → written', async () => {
      const { fetchImpl, calls } = routeStub({
        'POST /api/setup/desktop': (body) =>
          (body as { apply: boolean }).apply
            ? { status: 200, body: { diff: '+ desktop entry', changed: true, wrote: true } }
            : { status: 200, body: { diff: '+ desktop entry', changed: true, wrote: false } },
      });
      const onDesktopWritten = vi.fn();
      render(<SetupSteps {...props({ fetchImpl, onDesktopWritten })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Claude Desktop — also add the entry' }));
      await waitFor(() => expect(calls[0]).toEqual({ url: '/api/setup/desktop', method: 'POST', body: { apply: false } }));
      expect(await screen.findByText('+ desktop entry')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'write the Desktop entry' }));
      await waitFor(() => expect(calls[1]).toEqual({ url: '/api/setup/desktop', method: 'POST', body: { apply: true } }));
      expect(await screen.findByText('written · Claude Desktop')).toBeTruthy();
      expect(onDesktopWritten).toHaveBeenCalled();
    });

    it('Claude Desktop 404 shows the server\'s words about where the config was not found', async () => {
      const { fetchImpl } = routeStub({
        'POST /api/setup/desktop': { status: 404, body: { error: 'claude_desktop_config.json location not found — is Claude Desktop installed?' } },
      });
      render(<SetupSteps {...props({ fetchImpl })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Claude Desktop — also add the entry' }));
      expect(await screen.findByText(/claude_desktop_config\.json location not found/)).toBeTruthy();
    });

    it('Claude Desktop already written says so and offers nothing to add', () => {
      render(<SetupSteps {...props({ desktop: { written: true, path: '/x' } })} />);
      expect(screen.getByText('registered · Claude Desktop')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Claude Desktop — also add the entry' })).toBeNull();
    });
  });

  describe('the floor', () => {
    it('NEVER has an ember-coloured control — the demand act belongs to the screen, not the steps', async () => {
      const { fetchImpl } = routeStub({
        'POST /api/setup/mcp': { status: 200, body: { diff: '+ x', changed: true, wrote: false } },
      });
      render(
        <SetupSteps
          {...props({ fetchImpl, target: { status: 'up', url: 'http://localhost:4200', pid: 1 }, targetLogTail: ['a'], docs: { wired: true, folder: './docs' } })}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Register with Claude Code' }));
      await screen.findByText('what .mcp.json will say');
      expect(document.querySelector('[class*="ember"]')).toBeNull();
    });

    it('never says the bare word "diff" on the surface', async () => {
      const { fetchImpl } = routeStub({
        'POST /api/setup/mcp': { status: 200, body: { diff: '+ x', changed: true, wrote: false } },
      });
      const { container } = render(<SetupSteps {...props({ fetchImpl })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Register with Claude Code' }));
      await screen.findByText('what .mcp.json will say');
      expect(container.textContent).not.toMatch(/\bdiff\b/i);
    });
  });
});
