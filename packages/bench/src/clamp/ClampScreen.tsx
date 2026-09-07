import { useEffect, useRef, useState } from 'react';
import type { BenchState, Survey, TargetState } from '@jigbench/core';
import { Pairing } from '../components/Pairing.js';
import { SetupSteps, startCommand } from '../setup/SetupSteps.js';
import { clamp, getSetup, unclamp, type ClampResult, type SetupChecklist } from './api.js';
import { FolderBrowser } from './FolderBrowser.js';
import { useFolderBrowser } from './useFolderBrowser.js';
import './ClampScreen.css';

export interface ClampScreenProps {
  state: BenchState | null;
  targetLogTail: string[];
  fetchImpl?: typeof fetch;
  onToBench(): void;
  onLog?(actor: 'human' | 'bench', event: string, ref: string, note?: string): void;
}

/** "2h ago" / "3m ago" / "just now" — an age is provenance, kept short. */
export function ageWords(iso: string, now: number = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** The last path segment, on either separator — the name a person knows the repo by. */
function lastSegment(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function devServerGuessOf(survey: Survey | undefined): string | undefined {
  return survey?.adapters?.find((a) => a.devServer)?.devServer;
}

const NONE: TargetState = { status: 'none' };

type Phase = 'pick' | 'clamping' | 'clamped';

/** The Clamp screen (AMENDMENT-1 §7, A6 — S17b): what the bench opens on when nothing is
 * clamped. Recent benches first (one click re-clamps), Jig's own folder browser or a pasted
 * path, ONE ember act — Clamp — then what the survey found, the three setup steps, and the
 * second ember act, "go to the bench →". Never two embers at once. */
export function ClampScreen({ state, targetLogTail, fetchImpl = fetch, onToBench, onLog }: ClampScreenProps) {
  const browser = useFolderBrowser({ fetchImpl });
  const [path, setPath] = useState('');
  const [phase, setPhase] = useState<Phase>('pick');
  const [result, setResult] = useState<ClampResult | null>(null);
  const [message, setMessage] = useState('');
  const [checklist, setChecklist] = useState<SetupChecklist | null>(null);
  const [docs, setDocs] = useState<{ wired: boolean; folder?: string }>({ wired: false });
  const [mcpWritten, setMcpWritten] = useState(false);
  const [desktopWritten, setDesktopWritten] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function clampNow(repoRoot: string): Promise<void> {
    const trimmed = repoRoot.trim();
    if (phase === 'clamping' || trimmed === '') return;
    setPhase('clamping');
    setMessage('');
    const answer = await clamp(trimmed, fetchImpl);
    if (!mounted.current) return;
    if (!answer.ok) {
      setPhase('pick');
      setMessage(`not clamped · ${answer.message}`);
      return;
    }
    const data = answer.data;
    setResult(data);
    setPhase('clamped');
    setChecklist(null);
    setMcpWritten(false);
    setDesktopWritten(false);
    setDocs({ wired: data.docsClamped || state?.wiring.docs === 'wired', folder: data.docsClamped ? './docs' : undefined });
    onLog?.('human', `clamp · ${data.repoRoot}`, 'bench');
    const s = data.survey;
    onLog?.('bench', `survey · ${s.components.length} components · ${s.routes.length} routes · ${s.endpoints.length} endpoints`, 'survey');
    const setup = await getSetup(fetchImpl);
    if (mounted.current && setup.ok) setChecklist(setup.data);
  }

  async function unclampNow(): Promise<void> {
    const answer = await unclamp(fetchImpl);
    if (!mounted.current) return;
    if (!answer.ok) {
      setMessage(`still clamped · ${answer.message}`);
      return;
    }
    onLog?.('human', 'unclamp', 'bench');
    setResult(null);
    setChecklist(null);
    setPhase('pick');
    setMessage('');
  }

  const recent = state?.recent ?? [];
  const canClamp = phase !== 'clamping' && path.trim() !== '';

  return (
    <div className="jig-clamp">
      <div className="jig-clamp__column">
        <div className="jig-clamp__top">
          <span className="jig-clamp__wordmark">
            <Pairing word="Jig" plain="a benchtop for shaping a feature before Claude builds it" sessionKey="clamp-jig" />
          </span>
        </div>
        <h1 className="jig-clamp__heading">
          <Pairing word="Clamp" plain="attach a repo; the survey reads it" sessionKey="clamp-heading" />
        </h1>

        {phase !== 'clamped' || !result ? (
          <>
            {state?.bench?.repoRoot && (
              <section className="jig-clamp__section" aria-label="clamped already">
                <div className="jig-clamp__acts">
                  <span className="jig-clamp__say">
                    clamped already · <span className="jig-clamp__repo-inline">{state.bench.repoRoot}</span> — by another tab, or at boot
                  </span>
                  <button type="button" className="jig-clamp__hair" onClick={onToBench}>
                    go to the bench
                  </button>
                </div>
              </section>
            )}
            <section className="jig-clamp__section" aria-label="recent benches — repos clamped before">
              <p className="jig-clamp__title">recent benches</p>
              {recent.length === 0 ? (
                <p className="jig-clamp__say">No recent benches yet — pick a folder below.</p>
              ) : (
                <div className="jig-clamp__recent">
                  {recent.map((entry) => (
                    <button
                      key={entry.repoRoot}
                      type="button"
                      className="jig-clamp__recent-row"
                      aria-label={`clamp ${entry.repoRoot} again`}
                      onClick={() => void clampNow(entry.repoRoot)}
                    >
                      <span className="jig-clamp__recent-name">{lastSegment(entry.repoRoot)}</span>
                      <span className="jig-clamp__recent-path">{entry.repoRoot}</span>
                      <span className="jig-clamp__recent-age">{ageWords(entry.clampedAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="jig-clamp__section" aria-label="pick the repo folder">
              <p className="jig-clamp__title">pick the repo folder</p>
              <FolderBrowser browser={browser} onPick={setPath} />
              <div className="jig-clamp__pick">
                <input
                  className="jig-clamp__path"
                  aria-label="the repo folder — picked above or pasted"
                  placeholder="or paste a path — C:\Users\you\repo or /home/you/repo"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canClamp) void clampNow(path);
                  }}
                />
                <div className="jig-clamp__acts">
                  <button
                    type="button"
                    className={'jig-clamp__clamp' + (canClamp ? ' jig-clamp__clamp--ember' : '')}
                    disabled={!canClamp}
                    onClick={() => void clampNow(path)}
                  >
                    Clamp
                  </button>
                  {phase === 'clamping' ? (
                    <span className="jig-clamp__say">clamping · the survey reads the repo — a few seconds</span>
                  ) : (
                    path.trim() === '' && <span className="jig-clamp__say">· pick a folder or paste a path</span>
                  )}
                </div>
                {message && <p className="jig-clamp__say">{message}</p>}
              </div>
            </section>
          </>
        ) : (
          <ClampedPhase
            result={result}
            state={state}
            checklist={checklist}
            docs={docs}
            mcpWritten={mcpWritten}
            desktopWritten={desktopWritten}
            targetLogTail={targetLogTail}
            fetchImpl={fetchImpl}
            message={message}
            onLog={onLog}
            onToBench={onToBench}
            onUnclamp={() => void unclampNow()}
            onDocsClamped={() => setDocs((d) => ({ ...d, wired: true }))}
            onMcpWritten={() => setMcpWritten(true)}
            onDesktopWritten={() => setDesktopWritten(true)}
          />
        )}
      </div>
    </div>
  );
}

interface ClampedPhaseProps {
  result: ClampResult;
  state: BenchState | null;
  checklist: SetupChecklist | null;
  docs: { wired: boolean; folder?: string };
  mcpWritten: boolean;
  desktopWritten: boolean;
  targetLogTail: string[];
  fetchImpl: typeof fetch;
  message: string;
  onLog?: ClampScreenProps['onLog'];
  onToBench(): void;
  onUnclamp(): void;
  onDocsClamped(): void;
  onMcpWritten(): void;
  onDesktopWritten(): void;
}

function ClampedPhase({
  result,
  state,
  checklist,
  docs,
  mcpWritten,
  desktopWritten,
  targetLogTail,
  fetchImpl,
  message,
  onLog,
  onToBench,
  onUnclamp,
  onDocsClamped,
  onMcpWritten,
  onDesktopWritten,
}: ClampedPhaseProps) {
  const survey = result.survey;
  const detected = result.detected ?? null;
  const devServerGuess = devServerGuessOf(survey);
  const adapters = survey.adapters ?? [];
  const cannotListComponents = adapters.length > 0 && adapters.every((a) => a.unknown === true);

  const stackWords = survey.stack.length > 0 ? survey.stack.join(' · ') : 'unknown — no adapter matched; the loop still runs';
  const componentsWords = cannotListComponents ? 'unknown — this adapter cannot list them' : String(survey.components.length);
  const gaugesWords = state?.bench && state.gauges ? String(state.gauges.gauges.length) : 'reading …';
  const docsWords = docs.wired ? (docs.folder ? `clamped ${docs.folder}` : 'clamped') : 'none yet — below';
  const appWords = detected ? `${startCommand(detected)} · port ${detected.port}` : (devServerGuess ?? 'no guess — paste a URL below');
  const claudeInstalled = (checklist?.claude ?? state?.wiring.claude) === 'installed';

  return (
    <>
      <section className="jig-clamp__block" aria-label="clamped — what the survey found">
        <p className="jig-clamp__title">clamped</p>
        <p className="jig-clamp__repo">{result.repoRoot}</p>
        <p className="jig-clamp__title">what the survey found</p>
        <dl className="jig-clamp__kv">
          <dt>stack</dt>
          <dd>{stackWords}</dd>
          <dt>components</dt>
          <dd>{componentsWords}</dd>
          <dt>routes</dt>
          <dd>{String(survey.routes.length)}</dd>
          <dt>endpoints</dt>
          <dd>{String(survey.endpoints.length)}</dd>
          <dt>gauges</dt>
          <dd>{gaugesWords}</dd>
          <dt>docs</dt>
          <dd>{docsWords}</dd>
          <dt>the app</dt>
          <dd>{appWords}</dd>
        </dl>
      </section>

      <SetupSteps
        repoRoot={result.repoRoot}
        target={state?.target ?? NONE}
        targetLogTail={targetLogTail}
        detected={detected}
        devServerGuess={devServerGuess}
        docs={docs}
        mcp={{ written: mcpWritten || (checklist?.mcp.written ?? false), path: checklist?.mcp.path }}
        desktop={{ written: desktopWritten || (checklist?.desktop.written ?? false), path: checklist?.desktop.path }}
        claudeInstalled={claudeInstalled}
        fetchImpl={fetchImpl}
        onLog={onLog}
        onDocsClamped={onDocsClamped}
        onMcpWritten={onMcpWritten}
        onDesktopWritten={onDesktopWritten}
      />

      <div className="jig-clamp__go">
        <button
          type="button"
          className="jig-clamp__bench jig-clamp__bench--ember"
          aria-label="go to the bench — the plate, Point, Prompts"
          onClick={onToBench}
        >
          go to the bench →
        </button>
        <button type="button" className="jig-clamp__hair" onClick={onUnclamp}>
          clamp a different repo
        </button>
      </div>
      {message && <p className="jig-clamp__say">{message}</p>}
    </>
  );
}
