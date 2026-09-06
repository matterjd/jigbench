import { useEffect, useMemo, useRef, useState } from 'react';
import type { LogEntry } from '@jigbench/core';
import { Chassis } from './chassis/Chassis.js';
import { Rail } from './chassis/Rail.js';
import { PropertiesColumn, type PropertiesTab } from './chassis/PropertiesColumn.js';
import { SurveyPane } from './chassis/SurveyPane.js';
import { GaugesPanel } from './gauges/GaugesPanel.js';
import { selectorsForGauge } from './gauges/resolveGaugeUsage.js';
import { LoupeReadout } from './plate/LoupeReadout.js';
import { PlateBench, type PlateBenchHandle } from './plate/PlateBench.js';
import type { PlateEvent, PlatePick } from './plate/usePlateBridge.js';
import { CommandPalette, type PaletteDocsResult } from './palette/CommandPalette.js';
import { FixturePanel } from './fixtures/index.js';
import { ToolpathBar } from './toolpath/ToolpathBar.js';
import { TrialFitMirror } from './trialfit/TrialFitMirror.js';
import { TrayRegion } from './orders/TrayRegion.js';
import { ShopLane } from './shop/ShopLane.js';
import { Logbook } from './components/Logbook.js';
import { SimStrip } from './components/SimStrip.js';
import { useJigState } from './hooks/useJigState.js';
import { useTool } from './tools/toolState.js';
import './App.css';

interface DocsSearchResult {
  file?: string;
  heading?: string;
  text?: string;
  snippet?: string;
}

export function App() {
  const { state, connected } = useJigState();
  const { tool, setTool } = useTool();
  const plateRef = useRef<PlateBenchHandle>(null);
  const plateIframeRef = useRef<HTMLIFrameElement>(null);
  const [plateOrigin, setPlateOrigin] = useState<string | null>(null);
  const [lastPick, setLastPick] = useState<PlatePick | null>(null);
  const [propertiesTab, setPropertiesTab] = useState<PropertiesTab>('loupe');
  const [docsCount, setDocsCount] = useState<number | undefined>(undefined);
  // S8: the toolpath recorder's own seam (PlateBench's onEvent) and the trial-fit mirror's
  // "one printed affordance returns to a single frame" override.
  const [lastEvent, setLastEvent] = useState<PlateEvent | null>(null);
  const [forceSinglePlate, setForceSinglePlate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/docs')
      .then((res) => res.json())
      .then((data: { files: unknown[] }) => {
        if (!cancelled) setDocsCount(Array.isArray(data.files) ? data.files.length : 0);
      })
      .catch(() => {
        if (!cancelled) setDocsCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // One source of truth for "what mode is the plate in": the rail's tool (toolState is a
  // shared external store, so this fires whether the tool changed via the rail, a keyboard
  // shortcut, or the command palette). Loupe and Mark both put the plate in loupe mode; Hand
  // returns it to hand — Fixture/Toolpath/Sketch leave the plate's mode alone (S4 brief).
  useEffect(() => {
    if (tool === 'hand') plateRef.current?.setMode('hand');
    else if (tool === 'loupe' || tool === 'mark') plateRef.current?.setMode('loupe');
  }, [tool]);

  // Integration seam 1: the rail's Fixture tool switches the properties column to the
  // Fixture tab (S7 built FixturePanel but never touched App.tsx/the rail — CHASSIS.md
  // names Fixture as one properties-column tab alongside Loupe/Gauges/Survey).
  useEffect(() => {
    if (tool === 'fixture') setPropertiesTab('fixture');
  }, [tool]);

  // Integration seam (S8): the rail's Toolpath tool switches the properties column to the
  // Toolpath tab, the exact same pattern as Fixture above.
  useEffect(() => {
    if (tool === 'toolpath') setPropertiesTab('toolpath');
  }, [tool]);

  // S8 (CHASSIS.md's trial-fit mode): "the plate region splits into two frames" once the
  // order in hand reaches trial-fit — swaps PlateBench out for TrialFitMirror in the exact
  // same layout slot below, rather than editing PlateBench.tsx itself (a restricted,
  // delimited-block-only file). `forceSinglePlate` is the "one printed affordance" override;
  // it clears itself once no order is at trial-fit any more, so a LATER trial-fit still shows.
  const workOrders = state?.workOrders ?? [];
  const anyOrderAtTrialFit = workOrders.some((w) => w.state === 'trial-fit');
  useEffect(() => {
    if (!anyOrderAtTrialFit) setForceSinglePlate(false);
  }, [anyOrderAtTrialFit]);
  const showTrialFitMirror = anyOrderAtTrialFit && !forceSinglePlate;

  const survey = state?.survey;
  const gauges = state?.gauges.gauges;

  const pickedComponent = useMemo(
    () => (lastPick && survey ? survey.components.find((c) => c.file === lastPick.file || c.name === lastPick.component) : undefined),
    [lastPick, survey],
  );

  const allLogEntries: LogEntry[] = useMemo(() => (state?.workOrders ?? []).flatMap((wo) => wo.log), [state]);

  function lightGauge(name: string): void {
    const gauge = gauges?.find((g) => g.name === name);
    if (gauge) plateRef.current?.highlight(selectorsForGauge(gauge, survey?.components ?? []));
  }

  return (
    <>
      <Chassis
        rail={<Rail />}
        plate={
          showTrialFitMirror ? (
            <TrialFitMirror workOrders={workOrders} onPrinted={() => setForceSinglePlate(true)} />
          ) : (
            <PlateBench
              ref={plateRef}
              survey={survey}
              gauges={gauges}
              onPick={setLastPick}
              onEvent={setLastEvent}
              iframeRef={plateIframeRef}
              onPlateOriginChange={setPlateOrigin}
            />
          )
        }
        properties={
          <PropertiesColumn
            activeTab={propertiesTab}
            onTabChange={setPropertiesTab}
            gaugesCount={gauges?.length}
            surveyCount={survey?.components.length}
            loupe={
              <LoupeReadout
                lastPick={lastPick}
                mode={tool === 'loupe' || tool === 'mark' ? 'loupe' : 'hand'}
                onModeChange={(m) => setTool(m === 'loupe' ? 'loupe' : 'hand')}
                survey={survey}
                gauges={gauges}
                onGaugeSelect={(name) => {
                  setPropertiesTab('gauges');
                  lightGauge(name);
                }}
              />
            }
            gauges={
              <GaugesPanel
                gauges={gauges ?? []}
                survey={survey}
                pickedComponent={pickedComponent}
                onHighlight={(selectors) => plateRef.current?.highlight(selectors)}
                onClearHighlight={() => plateRef.current?.clearHighlight()}
              />
            }
            survey={<SurveyPane survey={survey} docsCount={docsCount} />}
            fixture={
              <FixturePanel iframeRef={plateIframeRef} plateOrigin={plateOrigin} lastPickPath={lastPick?.path ?? null} />
            }
            toolpath={<ToolpathBar lastEvent={lastEvent} post={(message) => plateRef.current?.post(message)} />}
          />
        }
        tray={
          <TrayRegion
            workOrders={state?.workOrders ?? []}
            lastPick={lastPick}
            marks={state?.marks}
            iframeRef={plateIframeRef}
            plateOrigin={plateOrigin}
          />
        }
        bottomBar={
          <>
            <SimStrip />
            <p className={`jig-appbar__connection jig-appbar__connection--${connected ? 'ok' : 'warn'}`}>
              <span aria-hidden="true" className="jig-appbar__connection-dot" />
              bench socket: {connected ? 'open' : 'reconnecting'}
            </p>
            <Logbook entries={allLogEntries} />
            <ShopLane workOrders={state?.workOrders ?? []} />
          </>
        }
      />
      <CommandPalette
        tools={[
          { tool: 'hand', word: 'Hand', pair: 'move the plate' },
          { tool: 'loupe', word: 'Loupe', pair: 'point at anything and see what it is' },
          { tool: 'mark', word: 'Mark', pair: 'a highlighted spot with a request attached' },
          { tool: 'fixture', word: 'Fixture', pair: 'a reproducible set of test data' },
          { tool: 'toolpath', word: 'Toolpath', pair: 'a recorded click sequence, replayable' },
          { tool: 'sketch', word: 'Sketch', pair: 'a screen that does not exist yet' },
        ]}
        components={(survey?.components ?? []).map((c) => ({ name: c.name, file: c.file, selector: c.selector }))}
        routes={survey?.routes ?? []}
        gauges={(gauges ?? []).map((g) => ({ name: g.name, pair: `${String(g.$value)} · ${g.category}` }))}
        workOrders={(state?.workOrders ?? []).map((w) => ({ id: w.id, slug: w.slug, state: w.state }))}
        onSelectTool={setTool}
        onSelectComponent={(c) => {
          setPropertiesTab('loupe');
          plateRef.current?.highlight([c.selector]);
        }}
        onSelectRoute={(path) => plateRef.current?.navigate(path)}
        onSelectGauge={(name) => {
          setPropertiesTab('gauges');
          lightGauge(name);
        }}
        onSelectWorkOrder={(id) => window.dispatchEvent(new CustomEvent('jig:select-order', { detail: { id } }))}
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
