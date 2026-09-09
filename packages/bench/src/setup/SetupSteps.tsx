import { useState } from 'react';
import type { DetectedTargetSummary, TargetState } from '@jigbench/core';
import { docsClamp, setupDesktop, setupMcp, targetStart, targetStop, targetUrl } from '../clamp/api.js';
import './SetupSteps.css';

/** The logbook's actor for an act made from these steps — a person clicked, or the bench did. */
export type SetupLogActor = 'human' | 'bench';

export interface SetupStepsProps {
  repoRoot: string;
  target: TargetState;
  /** The target app's own stdout/stderr lines, oldest first; only the last 12 are shown. */
  targetLogTail: string[];
  /** What "Start the app" would run — `null`/absent when the server found no dev script, in
   * which case the step asks for a URL instead. */
  detected?: DetectedTargetSummary | null;
  /** A dev-server URL the survey guessed (adapter-web) — seeds the URL field. */
  devServerGuess?: string;
  docs: { wired: boolean; folder?: string };
  mcp: { written: boolean; path?: string };
  desktop: { written: boolean; path?: string };
  claudeInstalled: boolean;
  fetchImpl?: typeof fetch;
  onLog?(actor: 'human' | 'bench', event: string, ref: string, note?: string): void;
  onDocsClamped?(result: { files: number; chunks: number }): void;
  onMcpWritten?(): void;
  onDesktopWritten?(): void;
}

/** The target app's state in words — shared with the checklist drawer so both say the same. */
export function targetWords(target: TargetState): string {
  switch (target.status) {
    case 'none':
      return 'not running';
    case 'starting':
      return 'starting · waiting for the port to answer';
    case 'up':
      return `up · ${target.url}${target.pid !== undefined ? ` · pid ${target.pid}` : ''}`;
    case 'down':
      return `down · exit ${target.exitCode ?? 'unknown'}`;
  }
}

/** What "Start the app" runs, said up front: the npm script when there is one; the
 * `angular.json` tier has none and the server runs `npx ng serve` itself. */
export function startCommand(detected: DetectedTargetSummary): string {
  return detected.script ? `npm run ${detected.script}` : 'npx ng serve';
}

type Busy = null | 'start' | 'stop' | 'url' | 'docs' | 'mcp' | 'desktop';
type WritePhase = 'idle' | 'shown' | 'written' | 'already';

const TAIL_LINES = 12;

/** The three steps after a clamp (AMENDMENT-1 §7, A6) — the app, docs, Claude Code — reused by
 * the Clamp screen and the status line's checklist drawer. Every act is a hairline: the demand
 * act (ember) belongs to the screen that hosts these steps, never to a step itself. */
export function SetupSteps({
  target,
  targetLogTail,
  detected,
  devServerGuess,
  docs,
  mcp,
  desktop,
  claudeInstalled,
  fetchImpl = fetch,
  onLog,
  onDocsClamped,
  onMcpWritten,
  onDesktopWritten,
}: SetupStepsProps) {
  const [busy, setBusy] = useState<Busy>(null);

  // the app
  const [startMessage, setStartMessage] = useState('');
  const [url, setUrl] = useState(() => devServerGuess ?? (detected ? `http://localhost:${detected.port}` : ''));
  const [urlMessage, setUrlMessage] = useState('');

  // docs
  const [docsOpen, setDocsOpen] = useState(false);
  const [folder, setFolder] = useState(docs.folder ?? './docs');
  const [clampedFolder, setClampedFolder] = useState<string | null>(null);
  const [docsResult, setDocsResult] = useState<{ files: number; chunks: number } | null>(null);
  const [docsMessage, setDocsMessage] = useState('');

  // Claude Code
  const [mcpPhase, setMcpPhase] = useState<WritePhase>('idle');
  const [mcpText, setMcpText] = useState('');
  const [mcpMessage, setMcpMessage] = useState('');
  const [desktopPhase, setDesktopPhase] = useState<WritePhase>('idle');
  const [desktopText, setDesktopText] = useState('');
  const [desktopMessage, setDesktopMessage] = useState('');

  async function start(): Promise<void> {
    if (!detected) return;
    setBusy('start');
    setStartMessage('');
    const result = await targetStart({}, fetchImpl);
    setBusy(null);
    if (result.ok) onLog?.('human', `start the app · ${startCommand(detected)}`, 'the app');
    else setStartMessage(`not started · ${result.message}`);
  }

  async function stop(): Promise<void> {
    setBusy('stop');
    const result = await targetStop(fetchImpl);
    setBusy(null);
    if (result.ok) onLog?.('human', 'stop the app', 'the app');
    else setStartMessage(`not stopped · ${result.message}`);
  }

  async function pointAt(): Promise<void> {
    setBusy('url');
    setUrlMessage('');
    const result = await targetUrl(url, fetchImpl);
    setBusy(null);
    if (result.ok) onLog?.('human', `the app · pointed at ${url}`, 'the app');
    else setUrlMessage(`not pointed · ${result.message}`);
  }

  async function clampDocsNow(): Promise<void> {
    setBusy('docs');
    setDocsMessage('');
    const result = await docsClamp(folder, fetchImpl);
    setBusy(null);
    if (result.ok) {
      const counts = { files: result.data.files, chunks: result.data.chunks };
      setDocsResult(counts);
      setClampedFolder(folder);
      setDocsOpen(false);
      onDocsClamped?.(counts);
      onLog?.('human', `docs clamped · ${folder}`, 'docs');
    } else {
      setDocsMessage(`not clamped · ${result.message}`);
    }
  }

  async function showMcp(): Promise<void> {
    setBusy('mcp');
    setMcpMessage('');
    const result = await setupMcp(false, fetchImpl);
    setBusy(null);
    if (!result.ok) {
      setMcpMessage(`not registered · ${result.message}`);
      return;
    }
    if (!result.data.changed) {
      setMcpPhase('already');
      return;
    }
    setMcpText(result.data.diff);
    setMcpPhase('shown');
  }

  async function writeMcp(): Promise<void> {
    setBusy('mcp');
    setMcpMessage('');
    const result = await setupMcp(true, fetchImpl);
    setBusy(null);
    if (!result.ok) {
      setMcpMessage(`not written · ${result.message}`);
      return;
    }
    setMcpPhase(result.data.changed ? 'written' : 'already');
    if (result.data.wrote) {
      onMcpWritten?.();
      onLog?.('human', '.mcp.json written', 'setup');
    }
  }

  async function showDesktop(): Promise<void> {
    setBusy('desktop');
    setDesktopMessage('');
    const result = await setupDesktop(false, fetchImpl);
    setBusy(null);
    if (!result.ok) {
      setDesktopMessage(result.message);
      return;
    }
    if (!result.data.changed) {
      setDesktopPhase('already');
      return;
    }
    setDesktopText(result.data.diff);
    setDesktopPhase('shown');
  }

  async function writeDesktop(): Promise<void> {
    setBusy('desktop');
    setDesktopMessage('');
    const result = await setupDesktop(true, fetchImpl);
    setBusy(null);
    if (!result.ok) {
      setDesktopMessage(result.message);
      return;
    }
    setDesktopPhase(result.data.changed ? 'written' : 'already');
    if (result.data.wrote) {
      onDesktopWritten?.();
      onLog?.('human', 'Claude Desktop entry written', 'setup');
    }
  }

  const tail = targetLogTail.slice(-TAIL_LINES);
  const docsWired = docs.wired || clampedFolder !== null;
  const docsFolderKnown = clampedFolder ?? docs.folder;
  const jigStartedIt = target.status === 'up' && target.pid !== undefined;

  return (
    <div className="jig-setup">
      <section className="jig-setup__block" aria-label="the app — the repo's dev server">
        <p className="jig-setup__title">the app</p>

        {detected ? (
          <>
            <p className="jig-setup__say">
              Start the app runs <b>{startCommand(detected)}</b> · port {detected.port} · from {detected.source}
            </p>
            <div className="jig-setup__acts">
              <button type="button" className="jig-setup__hair" disabled={busy === 'start'} onClick={() => void start()}>
                Start the app
              </button>
              {busy === 'start' && <span className="jig-setup__say">asking the bench to start it …</span>}
            </div>
          </>
        ) : (
          <p className="jig-setup__say">no dev script found — start the app yourself and paste its URL</p>
        )}
        {startMessage && <p className="jig-setup__say">{startMessage}</p>}

        <div className="jig-setup__acts">
          <input
            className="jig-setup__input"
            aria-label="the app's URL — where it is already running"
            placeholder="http://localhost:4200"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="button" className="jig-setup__hair" disabled={busy === 'url'} onClick={() => void pointAt()}>
            use this URL
          </button>
          {busy === 'url' && <span className="jig-setup__say">pointing …</span>}
        </div>
        {urlMessage && <p className="jig-setup__say">{urlMessage}</p>}

        <div className="jig-setup__acts">
          <span className="jig-setup__word">{targetWords(target)}</span>
          {target.status === 'up' &&
            (jigStartedIt ? (
              <>
                {/* #24: it said only "stop", beside a status word, with nothing to say what it
                    stopped. Every other control in this step names its object — "Start the app",
                    "use this URL", "clamp docs" — and this is that button's other half. */}
                <button type="button" className="jig-setup__hair" disabled={busy === 'stop'} onClick={() => void stop()}>
                  Stop the app
                </button>
                {busy === 'stop' && <span className="jig-setup__say">asking the bench to stop it …</span>}
              </>
            ) : (
              <span className="jig-setup__say">pointed at a running app — nothing for Jig to stop</span>
            ))}
        </div>

        {tail.length > 0 && (
          <div>
            <p className="jig-setup__title">the app's own log</p>
            <pre className="jig-setup__tail">{tail.join('\n')}</pre>
          </div>
        )}
      </section>

      <section className="jig-setup__block" aria-label="docs — the folder the survey reads for prose">
        <p className="jig-setup__title">docs</p>

        {docsWired && !docsOpen ? (
          <div className="jig-setup__acts">
            <span className="jig-setup__word">{docsFolderKnown ? `docs clamped · ${docsFolderKnown}` : 'docs clamped'}</span>
            <button type="button" className="jig-setup__hair" onClick={() => setDocsOpen(true)}>
              clamp another folder
            </button>
          </div>
        ) : (
          <div className="jig-setup__acts">
            <input
              className="jig-setup__input"
              aria-label="the docs folder — a path inside the repo"
              placeholder="./docs"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
            />
            <button type="button" className="jig-setup__hair" disabled={busy === 'docs'} onClick={() => void clampDocsNow()}>
              clamp docs
            </button>
            {busy === 'docs' && <span className="jig-setup__say">{`clamping · reading ${folder} — a moment`}</span>}
          </div>
        )}
        {docsResult && <span className="jig-setup__word">{`${docsResult.files} files · ${docsResult.chunks} chunks`}</span>}
        {docsMessage && <p className="jig-setup__say">{docsMessage}</p>}
      </section>

      <section className="jig-setup__block" aria-label="Claude Code — the builder">
        <p className="jig-setup__title">Claude Code</p>
        <p className="jig-setup__say">Build runs Claude Code itself in the repo; MCP stays for other agents.</p>
        {!claudeInstalled && (
          <p className="jig-setup__say jig-setup__say--warn">
            not found · claude is not on PATH — Build needs it; install Claude Code, then restart jigbench
          </p>
        )}

        {mcpPhase === 'written' ? (
          <span className="jig-setup__word">written · .mcp.json</span>
        ) : mcp.written ? (
          <span className="jig-setup__word">registered · .mcp.json</span>
        ) : mcpPhase === 'already' ? (
          <span className="jig-setup__word">already registered · .mcp.json</span>
        ) : mcpPhase === 'idle' ? (
          <div className="jig-setup__acts">
            <button type="button" className="jig-setup__hair" disabled={busy === 'mcp'} onClick={() => void showMcp()}>
              Register with Claude Code
            </button>
            {busy === 'mcp' && <span className="jig-setup__say">reading .mcp.json …</span>}
          </div>
        ) : (
          <div className="jig-setup__will">
            <p className="jig-setup__title">what .mcp.json will say</p>
            <pre className="jig-setup__pre">{mcpText}</pre>
            <div className="jig-setup__acts">
              <button type="button" className="jig-setup__hair" disabled={busy === 'mcp'} onClick={() => void writeMcp()}>
                write .mcp.json
              </button>
              {busy === 'mcp' && <span className="jig-setup__say">writing …</span>}
            </div>
          </div>
        )}
        {mcpMessage && <p className="jig-setup__say">{mcpMessage}</p>}

        <div className="jig-setup__desktop">
          {desktopPhase === 'written' ? (
            <span className="jig-setup__word">written · Claude Desktop</span>
          ) : desktop.written ? (
            <span className="jig-setup__word">registered · Claude Desktop</span>
          ) : desktopPhase === 'already' ? (
            <span className="jig-setup__word">already registered · Claude Desktop</span>
          ) : desktopPhase === 'idle' ? (
            <div className="jig-setup__acts">
              <button
                type="button"
                className="jig-setup__hair jig-setup__hair--small"
                disabled={busy === 'desktop'}
                onClick={() => void showDesktop()}
              >
                Claude Desktop — also add the entry
              </button>
              {busy === 'desktop' && <span className="jig-setup__say">reading the Desktop config …</span>}
            </div>
          ) : (
            <div className="jig-setup__will">
              <p className="jig-setup__title">what the Desktop config will say</p>
              <pre className="jig-setup__pre">{desktopText}</pre>
              <div className="jig-setup__acts">
                <button
                  type="button"
                  className="jig-setup__hair jig-setup__hair--small"
                  disabled={busy === 'desktop'}
                  onClick={() => void writeDesktop()}
                >
                  write the Desktop entry
                </button>
                {busy === 'desktop' && <span className="jig-setup__say">writing …</span>}
              </div>
            </div>
          )}
          {desktopMessage && <p className="jig-setup__say">{desktopMessage}</p>}
        </div>
      </section>
    </div>
  );
}
