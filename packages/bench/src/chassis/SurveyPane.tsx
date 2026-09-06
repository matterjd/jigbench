import type { Survey } from '@jigbench/core';
import './SurveyPane.css';

export interface SurveyPaneProps {
  survey?: Survey;
  /** From `GET /api/docs` (S2b) — the number of clamped files. Undefined while that fetch is
   * still in flight; the pane shows nothing rather than a wrong zero. */
  docsCount?: number;
}

/** "Survey — the read of the repo: stack, screens, components, gauges, data shapes"
 * (COMMISSION.md §3). The properties column's third tab (S4 brief): components with their
 * selector/file/inputs/outputs (instance counts only when the survey actually has them — S2
 * does not compute those yet, so this says so rather than guessing), routes, endpoints, and
 * the clamped docs count. */
export function SurveyPane({ survey, docsCount }: SurveyPaneProps) {
  if (!survey) {
    return <p className="jig-survey-pane__empty">No survey yet — the survey: the read of the repo.</p>;
  }

  return (
    <div className="jig-survey-pane">
      <section className="jig-survey-pane__block">
        <h3 className="jig-survey-pane__title">stack</h3>
        <p className="jig-survey-pane__stack">{survey.stack.join(' · ') || '—'}</p>
      </section>

      <section className="jig-survey-pane__block">
        <h3 className="jig-survey-pane__title">
          components <span className="jig-survey-pane__count">{survey.components.length}</span>
        </h3>
        {survey.components.length === 0 ? (
          <p className="jig-survey-pane__empty-inline">none surveyed yet</p>
        ) : (
          <ul className="jig-survey-pane__list">
            {survey.components.map((c) => (
              <li key={c.file + c.selector} className="jig-survey-pane__component">
                <div className="jig-survey-pane__component-head">
                  <span className="jig-survey-pane__component-name">{c.name}</span>
                  <span className="jig-survey-pane__mono">{c.selector}</span>
                  {/* Instance counts: only when a future adapter fills them in — an honest
                      dash, never a guessed number, when it hasn't (this S2 has none). */}
                  <span className="jig-survey-pane__instances" title="instance count">
                    —
                  </span>
                </div>
                <div className="jig-survey-pane__mono jig-survey-pane__file">{c.file}</div>
                <div className="jig-survey-pane__io">
                  <span>inputs: {c.inputs.length ? c.inputs.map((i) => i.name).join(', ') : '—'}</span>
                  <span>outputs: {c.outputs.length ? c.outputs.map((o) => o.name).join(', ') : '—'}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="jig-survey-pane__block">
        <h3 className="jig-survey-pane__title">
          routes <span className="jig-survey-pane__count">{survey.routes.length}</span>
        </h3>
        {survey.routes.length === 0 ? (
          <p className="jig-survey-pane__empty-inline">none surveyed yet</p>
        ) : (
          <ul className="jig-survey-pane__list">
            {survey.routes.map((r) => (
              <li key={r.path} className="jig-survey-pane__route">
                <span className="jig-survey-pane__mono">{r.path}</span>
                <span>{r.component}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="jig-survey-pane__block">
        <h3 className="jig-survey-pane__title">
          endpoints <span className="jig-survey-pane__count">{survey.endpoints.length}</span>
        </h3>
        {survey.endpoints.length === 0 ? (
          <p className="jig-survey-pane__empty-inline">none surveyed yet</p>
        ) : (
          <ul className="jig-survey-pane__list">
            {survey.endpoints.map((e, i) => (
              <li key={`${e.method}-${e.path}-${i}`} className="jig-survey-pane__endpoint">
                <span className="jig-survey-pane__mono">{e.method}</span>
                <span className="jig-survey-pane__mono">{e.path}</span>
                {e.stub && <span className="jig-survey-pane__stub">stub</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="jig-survey-pane__block">
        <h3 className="jig-survey-pane__title">clamped docs</h3>
        <p className="jig-survey-pane__stack">{docsCount === undefined ? 'reading…' : `${docsCount} file(s)`}</p>
      </section>

      <p className="jig-survey-pane__prov">.jig/survey/ · {survey.generatedAt}</p>
    </div>
  );
}
