import { useMemo } from 'react';
import type { LogEntry } from '@jigbench/core';
import { AppFrame } from './components/AppFrame.js';
import { Panel } from './components/Panel.js';
import { SimStrip } from './components/SimStrip.js';
import { Ladder } from './components/Ladder.js';
import { Logbook } from './components/Logbook.js';
import { useJigState } from './hooks/useJigState.js';
import { PlateBench } from './plate/PlateBench.js';
import './App.css';

export function App() {
  const { state, connected } = useJigState();

  const latestWorkOrder = state && state.workOrders.length > 0 ? state.workOrders[state.workOrders.length - 1] : null;

  const allLogEntries: LogEntry[] = useMemo(() => (state?.workOrders ?? []).flatMap((wo) => wo.log), [state]);

  return (
    <AppFrame
      rail={<div className="jig-rail__brand">JIG</div>}
      plate={<PlateBench survey={state?.survey} />}
      side={
        <Panel title="Sim">
          <SimStrip />
          <p className={`jig-side__connection jig-side__connection--${connected ? 'ok' : 'warn'}`}>
            <span aria-hidden="true" className="jig-side__connection-dot" />
            bench socket: {connected ? 'open' : 'reconnecting'}
          </p>
        </Panel>
      }
      tray={
        <Panel title="Work order">
          {latestWorkOrder ? (
            <Ladder current={latestWorkOrder.state} />
          ) : (
            <p>
              No marks yet. A mark — a highlighted spot with a request attached — becomes a work
              order once the plate is wired (S3).
            </p>
          )}
        </Panel>
      }
      logbook={
        <Panel title="Logbook">
          <Logbook entries={allLogEntries} />
        </Panel>
      }
    />
  );
}
