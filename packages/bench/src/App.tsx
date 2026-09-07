import { useEffect, useMemo, useRef, useState } from 'react';
import { Chassis } from './chassis/Chassis.js';
import { Rail } from './chassis/Rail.js';
import { RightColumn, type RightColumnTab } from './chassis/RightColumn.js';
import { InspectPane } from './chassis/InspectPane.js';
import { StatusLine } from './chassis/StatusLine.js';
import { AdvancedDrawer } from './chassis/AdvancedDrawer.js';
import { useAdvanced } from './chassis/advancedState.js';
import { GaugesPanel } from './gauges/GaugesPanel.js';
import { selectorsForGauge } from './gauges/resolveGaugeUsage.js';
import { PlateBench, type PlateBenchHandle } from './plate/PlateBench.js';
import type { PlateEvent, PlatePick } from './plate/usePlateBridge.js';
import { CommandPalette, type PaletteDocsResult } from './palette/CommandPalette.js';
import { FixturePanel } from './fixtures/index.js';
import { ToolpathBar } from './toolpath/ToolpathBar.js';
import { SketchSheet } from './sketch/SketchSheet.js';
import { Logbook } from './components/Logbook.js';
import { useJigState } from './hooks/useJigState.js';
import { useTool } from './tools/toolState.js';
import { usePrompts } from './prompts/usePrompts.js';
import { PromptsPane } from './prompts/PromptsPane.js';
import { PromptCard } from './prompts/PromptCard.js';
import { composedExtras, type BuildStreamEvent, type Prompt, type PromptTarget } from './prompts/types.js';
import './App.css';

interface DocsSearchResult {
  file?: string;
  heading?: string;
  text?: string;
  snippet?: string;
}

interface CardTarget {
  kind: 'element' | 'sketch';
  title: string;
  file?: string;
  promptTarget: PromptTarget;
  anchorRect: { x: number; y: number; w: number; h: number };
}

/** True when `prompt.target` names the same thing `target` does — element targets match by
 * component name (the survey's own identity for a component); a sketch target matches any
 * other sketch target (this build has one sketch open at a time — CONCERN: multi-sketch
 * disambiguation is a later slice's problem). */
function targetsMatch(a: PromptTarget, b: PromptTarget): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'element') return !!a.component && a.component === b.component;
  if (a.kind === 'sketch') return true;
  return false;
}

export function App() {
  const { state, connected, lastBuildEvent } = useJigState();
  const { tool, setTool } = useTool();
  const { advanced } = useAdvanced();
  const plateRef = useRef<PlateBenchHandle>(null);
  const plateIframeRef = useRef<HTMLIFrameElement>(null);
  const plateBoxRef = useRef<HTMLDivElement>(null);
  const [plateOrigin, setPlateOrigin] = useState<string | null>(null);
  const [plateSize, setPlateSize] = useState({ w: 0, h: 0 });
  const [lastPick, setLastPick] = useState<PlatePick | null>(null);
  const [lastEvent, setLastEvent] = useState<PlateEvent | null>(null); // Toolpath's own seam
  const [rightTab, setRightTab] = useState<RightColumnTab>('prompts');
  const [rulersOn, setRulersOn] = useState(false);
  const [mirrorOn, setMirrorOn] = useState(false);
  const [logbookOpen, setLogbookOpen] = useState(false);
  const [cardTarget, setCardTarget] = useState<CardTarget | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [localText, setLocalText] = useState('');
  const [localAcceptance, setLocalAcceptance] = useState<string[]>([]);
  const [beforeIds, setBeforeIds] = useState<Set<string>>(new Set());

  const extras = composedExtras(state);
  const prompts = usePrompts({ buildEvent: lastBuildEvent, claudeStatus: extras.status?.claude });

  // Measures the plate's own box (the outer chassis region, not the cross-origin iframe inside
  // it) so the card can place itself against a plate-local rect it never had to walk the DOM
  // to get — see PromptCard.tsx's anchorRect path and CHASSIS.md v0.2 §2.
  useEffect(() => {
    const el = plateBoxRef.current;
    if (!el) return;
    function measure(): void {
      if (el) setPlateSize({ w: el.clientWidth, h: el.clientHeight });
    }
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // One source of truth for "what mode is the plate in" (AMENDMENT-1 A3): Point puts the plate
  // in loupe mode (it carries the old loupe's hover); Hand returns it to hand; Sketch leaves the
  // plate's mode alone (it isn't even the mounted component while Sketch is active).
  useEffect(() => {
    if (tool === 'hand') plateRef.current?.setMode('hand');
    else if (tool === 'point') plateRef.current?.setMode('loupe');
  }, [tool]);

  // A new Point pick opens the card, anchored to the pick's own rect (already plate-local —
  // usePlateBridge's PlatePick.rect, posted by the loupe script inside the cross-origin iframe).
  useEffect(() => {
    if (tool !== 'point' || !lastPick) return;
    setCardTarget({
      kind: 'element',
      title: lastPick.component ?? lastPick.tag,
      file: lastPick.file,
      promptTarget: { kind: 'element', path: lastPick.path, component: lastPick.component, file: lastPick.file },
      anchorRect: { x: lastPick.rect.x, y: lastPick.rect.y, w: lastPick.rect.width, h: lastPick.rect.height },
    });
    setCardOpen(true);
    setLocalText('');
    setLocalAcceptance([]);
  }, [lastPick, tool]);

  function openSketchCard(): void {
    setCardTarget({
      kind: 'sketch',
      title: 'build this screen',
      promptTarget: { kind: 'sketch' },
      anchorRect: { x: 0, y: 0, w: plateSize.w, h: plateSize.h },
    });
    setCardOpen(true);
    setLocalText('');
    setLocalAcceptance([]);
  }

  const matchedPrompt: Prompt | null = cardTarget
    ? prompts.prompts.find((p) => p.state !== 'scrapped' && targetsMatch(p.target, cardTarget.promptTarget)) ?? null
    : null;

  const cardText = matchedPrompt?.requirement ?? localText;
  const cardAcceptance = matchedPrompt?.acceptance ?? localAcceptance;
  // "a draft is not saved until it has words" (concept D) — but once it HAS words, it is a
  // draft for the card's own purposes whether or not a real Prompt exists yet server-side.
  // Without this fallback, a server with no /api/prompts (S11 not on main) leaves cardState
  // stuck at 'none' forever, and Ready never lights up even though the words are right there —
  // a real bug a live-browser check against the actual (S11-less) main server caught.
  const cardState = matchedPrompt?.state ?? (cardText.trim() ? 'draft' : 'none');

  async function handleCardTextChange(text: string): Promise<void> {
    if (matchedPrompt) {
      await prompts.edit(matchedPrompt.id, { requirement: text });
      return;
    }
    setLocalText(text);
    if (text.trim() && cardTarget) {
      await prompts.create({ requirement: text, acceptance: localAcceptance, target: cardTarget.promptTarget });
    }
  }

  async function handleCardAcceptanceChange(lines: string[]): Promise<void> {
    if (matchedPrompt) {
      await prompts.edit(matchedPrompt.id, { acceptance: lines });
      return;
    }
    setLocalAcceptance(lines);
  }

  const survey = state?.survey;
  const gauges = state?.gauges.gauges;

  const pickedComponent = useMemo(
    () => (lastPick && survey ? survey.components.find((c) => c.file === lastPick.file || c.name === lastPick.component) : undefined),
    [lastPick, survey],
  );

  function lightGauge(name: string): void {
    const gauge = gauges?.find((g) => g.name === name);
    if (gauge) plateRef.current?.highlight(selectorsForGauge(gauge, survey?.components ?? []));
  }

  const buildingId = extras.status?.claude.state === 'building' ? extras.status.claude.id : null;
  const activeStream: BuildStreamEvent[] = buildingId ? (prompts.buildStreams[buildingId] ?? []) : [];
  const lastEventText =
    buildingId && activeStream.length > 0
      ? (() => {
          const last = activeStream[activeStream.length - 1];
          return last.kind === 'text' || last.kind === 'raw' ? last.text : last.kind === 'tool' ? `${last.name} · ${last.target}` : undefined;
        })()
      : undefined;

  const scrapCount = prompts.prompts.filter((p) => p.state === 'scrapped').length;
  const allLogEntries = useMemo(() => [], []); // CONCERN: the logbook has no event source yet in this slice — see report.

  return (
    <>
      <Chassis
        rail={<Rail postToPlate={(message) => plateRef.current?.post({ ...message })} />}
        plate={
          <div ref={plateBoxRef} style={{ position: 'absolute', inset: 0 }}>
            {tool === 'sketch' ? (
              <SketchSheet gauges={gauges} onBuildScreen={openSketchCard} />
            ) : (
              <PlateBench
                ref={plateRef}
                survey={survey}
                gauges={gauges}
                onPick={setLastPick}
                onEvent={setLastEvent}
                iframeRef={plateIframeRef}
                onPlateOriginChange={setPlateOrigin}
                showRulers={rulersOn}
              />
            )}
            {cardTarget && (
              <PromptCard
                open={cardOpen}
                title={cardTarget.title}
                file={cardTarget.file}
                anchorEl={null}
                plateEl={null}
                anchorRect={cardTarget.anchorRect}
                plateSize={plateSize}
                state={cardState}
                text={cardText}
                acceptance={cardAcceptance}
                drafterWired={state?.wiring.drafter === 'wired'}
                polishing={false}
                buildStream={matchedPrompt ? (prompts.buildStreams[matchedPrompt.id] ?? []) : []}
                builtSummary={matchedPrompt?.builds.length ? { files: matchedPrompt.builds[matchedPrompt.builds.length - 1].filesTouched.length, durationMs: 0 } : undefined}
                onTextChange={(text) => void handleCardTextChange(text)}
                onAcceptanceChange={(lines) => void handleCardAcceptanceChange(lines)}
                onPolish={() => matchedPrompt && void prompts.polish(matchedPrompt.id)}
                onReadyComplete={() => matchedPrompt && void prompts.ready(matchedPrompt.id)}
                onBuild={() => matchedPrompt && void prompts.build(matchedPrompt.id)}
                onClose={() => setCardOpen(false)}
              />
            )}
          </div>
        }
        advancedDrawer={
          advanced ? (
            <AdvancedDrawer
              wiring={state?.wiring ?? null}
              connected={connected}
              prompts={prompts.prompts}
              rulersOn={rulersOn}
              onRulersChange={setRulersOn}
              mirrorOn={mirrorOn}
              onMirrorChange={setMirrorOn}
              fixturePanel={<FixturePanel iframeRef={plateIframeRef} plateOrigin={plateOrigin} lastPickPath={lastPick?.path ?? null} />}
              toolpathBar={<ToolpathBar lastEvent={lastEvent} post={(message) => plateRef.current?.post(message)} />}
              shop={state?.shop ?? null}
              scrapCount={scrapCount}
            />
          ) : undefined
        }
        column={
          <RightColumn
            activeTab={rightTab}
            onTabChange={setRightTab}
            promptsCount={prompts.prompts.filter((p) => p.state !== 'scrapped').length}
            prompts={
              <PromptsPane
                status={prompts.status}
                message={prompts.message}
                prompts={prompts.prompts}
                hand={prompts.hand}
                buildStream={prompts.hand ? (prompts.buildStreams[prompts.hand.id] ?? []) : []}
                cardOpen={cardOpen}
                onSelect={prompts.selectHand}
                onBuild={(id) => void prompts.build(id)}
                onScrap={(id) => void prompts.scrap(id)}
                onRestore={(id) => void prompts.restore(id)}
                onBeforeToggle={(id, on) =>
                  setBeforeIds((prev) => {
                    const next = new Set(prev);
                    if (on) next.add(id);
                    else next.delete(id);
                    return next;
                  })
                }
                onRefine={(p) => {
                  setLocalText(p.requirement);
                  setLocalAcceptance(p.acceptance);
                }}
              />
            }
            inspect={<InspectPane lastPick={lastPick} survey={survey} gauges={gauges} onGaugeSelect={(name) => { setRightTab('design'); lightGauge(name); }} />}
            design={
              <GaugesPanel
                gauges={gauges ?? []}
                survey={survey}
                pickedComponent={pickedComponent}
                onHighlight={(selectors) => plateRef.current?.highlight(selectors)}
                onClearHighlight={() => plateRef.current?.clearHighlight()}
              />
            }
          />
        }
        statusLine={
          <StatusLine
            wired={extras.wiring?.claude === 'installed'}
            status={extras.status?.claude}
            lastEventText={lastEventText}
            logbookOpen={logbookOpen}
            onToggleLogbook={() => setLogbookOpen((v) => !v)}
          />
        }
      />
      {logbookOpen && <Logbook entries={allLogEntries} />}
      <CommandPalette
        tools={[
          { tool: 'point', word: 'Point', pair: 'click a component to open the prompt card' },
          { tool: 'sketch', word: 'Sketch', pair: 'a screen that does not exist yet' },
          { tool: 'hand', word: 'Hand', pair: 'the app takes your clicks' },
        ]}
        components={(survey?.components ?? []).map((c) => ({ name: c.name, file: c.file, selector: c.selector }))}
        routes={survey?.routes ?? []}
        gauges={(gauges ?? []).map((g) => ({ name: g.name, pair: `${String(g.$value)} · ${g.category}` }))}
        workOrders={[]}
        onSelectTool={setTool}
        onSelectComponent={(c) => {
          setRightTab('inspect');
          plateRef.current?.highlight([c.selector]);
        }}
        onSelectRoute={(path) => plateRef.current?.navigate(path)}
        onSelectGauge={(name) => {
          setRightTab('design');
          lightGauge(name);
        }}
        onSelectWorkOrder={() => {}}
        onPrinted={() => plateRef.current?.clearHighlight()}
        onDocsQuery={async (query): Promise<PaletteDocsResult[]> => {
          const res = await fetch(`/api/docs?q=${encodeURIComponent(query)}`);
          const data: { results?: DocsSearchResult[] } = await res.json();
          return (data.results ?? []).map((r) => ({
            file: r.file ?? '',
            heading: r.heading,
            snippet: r.snippet ?? r.text ?? '',
          }));
        }}
      />
    </>
  );
}
