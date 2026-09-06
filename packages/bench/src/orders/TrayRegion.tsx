import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { LadderState, LogEntry, Mark, WorkOrder, WorkOrderHuman } from '@jigbench/core';
import { LADDER_STATES } from '@jigbench/core';
import { Ladder } from '../components/Ladder.js';
import { Chip } from '../components/Chip.js';
import { useTool } from '../tools/toolState.js';
import './TrayRegion.css';

/** The shape `usePlateBridge` reports for a loupe pick — declared locally (rather than
 * imported from `../plate/usePlateBridge.js`, S4's file) so TrayRegion never depends on
 * more of that module than this one field set. */
export interface TrayPick {
  path: string;
  component?: string;
  file?: string;
  text?: string;
}

export interface TrayRegionProps {
  workOrders: readonly WorkOrder[];
  /** The plate's last loupe pick, when the bench has one wired in (S4). Only acted on
   * while the current tool is `'mark'`. */
  lastPick?: TrayPick | null;
  /** `JigState.marks` — used only to look up the order-in-hand's own mark, so its DOM
   * path can be posted to the plate as `jig:highlight`. */
  marks?: readonly Mark[];
  /** The plate iframe + its origin (S3/S4), needed to post `jig:highlight`. Omit either
   * and TrayRegion simply never posts — it never assumes the plate is wired. */
  iframeRef?: RefObject<HTMLIFrameElement | null>;
  plateOrigin?: string | null;
  fetchImpl?: typeof fetch;
  /** Injection point for tests — defaults to `Date.now`. */
  now?: () => number;
}

const SPINE_STATES: readonly Exclude<LadderState, 'scrapped'>[] = LADDER_STATES.filter(
  (s): s is Exclude<LadderState, 'scrapped'> => s !== 'scrapped',
);

const RUNG_LABEL: Record<Exclude<LadderState, 'scrapped'>, string> = {
  marked: 'marked',
  drafted: 'drafted',
  released: 'released',
  'in-the-shop': 'in the shop',
  'trial-fit': 'trial fit',
};

function ageFrom(iso: string, nowMs: number): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '—';
  const deltaMs = Math.max(0, nowMs - then);
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function lastEventLog(order: WorkOrder, events: readonly string[]): LogEntry | undefined {
  for (let i = order.log.length - 1; i >= 0; i--) {
    const entry = order.log[i];
    if (entry && events.includes(entry.event)) return entry;
  }
  return undefined;
}

function markedAt(order: WorkOrder): string | undefined {
  return order.log.find((l) => l.event === 'marked')?.at;
}

/** Drafted-by badge text — always names WHO and, once known, the measured cost (Law III:
 * a process over 300ms shows its charge, never a bare spinner).
 *
 * Wave-4 fix (TEST-RUN.md's first live test, defect 5): "I did not see `drafted ·
 * qwen2.5-coder:7b · N.Ns`, where does that show?" Driving the real bench end to end
 * (mark -> a real model drafts it) surfaced two bugs, not one:
 *   1. `work-order.ts`'s `parseWorkOrder` never round-trips `log` through the persisted
 *      markdown file ("the logbook is a separate surface") — a work order read back off
 *      disk always has `log: []`, so the old code (which read the CHIP TEXT ENTIRELY from
 *      log entries) went silently blank the moment the order left `marked`, even though
 *      `order.state`/`order.draftedBy` were both right there. `order.state` is the ground
 *      truth for WHICH rung the badge is on; a log entry, when one exists, only enriches
 *      the text with its `note` (the model name + measured seconds).
 *   2. There was no branch at all for `released`/`in-the-shop`/`trial-fit` — a `drafted` log
 *      entry, once it existed, kept the "drafted · …" chip showing forever, so "after
 *      release, `released · …`" (the fix brief's own wording) was never reachable.
 */
function DraftBadge({ order, nowMs }: { order: WorkOrder; nowMs: number }) {
  const drafted = lastEventLog(order, ['drafted']);
  const failed = lastEventLog(order, ['draft-failed']);
  const queued = lastEventLog(order, ['queued-to-shop']);
  const released = lastEventLog(order, ['released']);

  switch (order.state) {
    case 'released':
    case 'in-the-shop':
    case 'trial-fit':
      return (
        <Chip tone="ok" glyph="●">
          released · {released?.note ?? order.draftedBy}
        </Chip>
      );
    case 'drafted':
      return (
        <Chip tone={order.draftedBy === 'model' ? 'wyrd' : 'ok'} glyph="●">
          drafted · {drafted?.note ?? order.draftedBy}
        </Chip>
      );
    case 'marked': {
      if (queued) {
        return (
          <Chip tone="wyrd" glyph="●">
            queued for the shop
          </Chip>
        );
      }
      if (failed) {
        return (
          <Chip tone="alert" glyph="!">
            no drafter reached — fill the human face yourself, or try again
          </Chip>
        );
      }
      const startedAt = markedAt(order);
      const elapsedS = startedAt ? Math.max(0, (nowMs - Date.parse(startedAt)) / 1000) : 0;
      return (
        <Chip tone="warn" glyph="●">
          drafting · local model · {elapsedS.toFixed(1)}s
        </Chip>
      );
    }
    default:
      return null; // 'scrapped' — no badge, matching the ladder's own terminal-state treatment.
  }
}

function oathMs(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--t-oath').trim();
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 800;
}

function ReleaseControl({ enabled, onRelease }: { enabled: boolean; onRelease: () => void }) {
  const [holding, setHolding] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer(): void {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function start(e: ReactPointerEvent<HTMLButtonElement>): void {
    if (!enabled) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Some test/JSDOM environments don't implement pointer capture — holding still
      // works via the timer alone.
    }
    setCancelled(false);
    setHolding(true);
    clearTimer();
    timerRef.current = setTimeout(() => {
      setHolding(false);
      onRelease();
    }, oathMs());
  }

  function stop(): void {
    if (timerRef.current) {
      clearTimer();
      if (holding) setCancelled(true);
    }
    setHolding(false);
  }

  useEffect(() => () => clearTimer(), []);

  return (
    <div className="jig-tray__actions">
      <button
        type="button"
        className={'jig-release' + (holding ? ' jig-release--holding' : '')}
        disabled={!enabled}
        aria-label="release — hold for about 800 milliseconds"
        onPointerDown={start}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
      >
        <svg className="jig-release__ring" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="jig-release__track" cx="12" cy="12" r="10" />
          <circle className="jig-release__fill" cx="12" cy="12" r="10" />
        </svg>
        release · hold
      </button>
      <span className={'jig-tray__hint' + (cancelled ? ' jig-tray__hint--said' : '')}>
        {cancelled
          ? 'released before the weight — nothing written'
          : enabled
            ? 'release = approve: the shop face is filled and the file is written under .jig/. Hold ~800 ms; let go early and nothing happens.'
            : 'release needs a drafted order first.'}
      </span>
    </div>
  );
}

function HumanField({
  id,
  label,
  value,
  editable,
  multiline,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  editable: boolean;
  multiline?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <div className="jig-tray__field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          id={id}
          value={draft}
          disabled={!editable}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => editable && onCommit(draft)}
          rows={2}
        />
      ) : (
        <input
          id={id}
          value={draft}
          disabled={!editable}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => editable && onCommit(draft)}
        />
      )}
    </div>
  );
}

export function TrayRegion({ workOrders, lastPick, marks, iframeRef, plateOrigin, fetchImpl = fetch, now = Date.now }: TrayRegionProps) {
  const { tool } = useTool();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<LadderState | null>(null);
  const [scrapOpen, setScrapOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptValue, setPromptValue] = useState('');
  const [nowMs, setNowMs] = useState(now());
  const handledPick = useRef<TrayPick | null | undefined>(undefined);

  const selected = useMemo(() => {
    if (selectedId) {
      const found = workOrders.find((w) => w.id === selectedId);
      if (found) return found;
    }
    return workOrders.length > 0 ? workOrders[workOrders.length - 1] : undefined;
  }, [workOrders, selectedId]);

  // The plate outline itself is S4's concern — this only posts WHICH path is in hand,
  // whenever the order-in-hand (or its mark data) changes, so the plate can light it.
  useEffect(() => {
    if (!selected || !plateOrigin || !iframeRef?.current) return;
    const mark = marks?.find((m) => selected.marks.includes(m.id));
    if (!mark) return;
    iframeRef.current.contentWindow?.postMessage({ type: 'jig:highlight', path: mark.target.path }, plateOrigin);
  }, [selected, marks, plateOrigin, iframeRef]);

  // A live tick, only while some order is still waiting on a draft — Law III's "shows its
  // charge" needs a moving number, never a bare spinner, and only for a live process.
  const anyPending = workOrders.some((w) => w.state === 'marked' && !lastEventLog(w, ['drafted', 'draft-failed', 'queued-to-shop']));
  useEffect(() => {
    if (!anyPending) return;
    const id = setInterval(() => setNowMs(now()), 250);
    return () => clearInterval(id);
  }, [anyPending, now]);

  useEffect(() => {
    function onSelect(e: Event): void {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id) {
        setSelectedId(detail.id);
        setExpanded(false);
      }
    }
    window.addEventListener('jig:select-order', onSelect);
    return () => window.removeEventListener('jig:select-order', onSelect);
  }, []);

  useEffect(() => {
    if (tool === 'mark' && lastPick && lastPick !== handledPick.current) {
      setPromptOpen(true);
      setPromptValue('');
    }
  }, [tool, lastPick]);

  async function patchHuman(id: string, patch: Partial<WorkOrderHuman>): Promise<void> {
    await fetchImpl(`/api/work-orders/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
  }

  async function doRelease(id: string): Promise<void> {
    await fetchImpl(`/api/work-orders/${id}/release`, { method: 'POST' });
  }

  async function doScrap(id: string): Promise<void> {
    await fetchImpl(`/api/work-orders/${id}/scrap`, { method: 'POST' });
  }

  async function doRestore(id: string): Promise<void> {
    await fetchImpl(`/api/work-orders/${id}/restore`, { method: 'POST' });
  }

  async function submitMark(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!lastPick || !promptValue.trim()) return;
    handledPick.current = lastPick;
    setPromptOpen(false);
    const res = await fetchImpl('/api/marks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pick: lastPick, prompt: promptValue }),
    });
    const created = (await res.json()) as { workOrder: WorkOrder };
    setSelectedId(created.workOrder.id);
    // Integration seam 2 (wave-3 merge): POST /api/marks now kicks off the draft itself
    // (server-side, fire-and-forget) right after it responds — the bench no longer calls
    // /draft here, or a real server would draft the same order twice.
  }

  function cancelMark(): void {
    handledPick.current = lastPick ?? null;
    setPromptOpen(false);
  }

  const scrapped = workOrders.filter((w) => w.state === 'scrapped');

  if (promptOpen && lastPick) {
    return (
      <div className="jig-tray">
        <form className="jig-tray__prompt" onSubmit={submitMark}>
          <input
            autoFocus
            placeholder="what should change here?"
            value={promptValue}
            onChange={(e) => setPromptValue(e.target.value)}
          />
          <button type="submit">mark</button>
          <button type="button" onClick={cancelMark}>
            cancel
          </button>
        </form>
      </div>
    );
  }

  if (workOrders.length === 0) {
    return (
      <div className="jig-tray">
        <p className="jig-tray__empty">
          No marks yet. A mark — a highlighted spot with a request attached — becomes a work order
          once you pick the Mark tool and click the plate.
        </p>
      </div>
    );
  }

  if (expanded) {
    const visibleStates = filter ? SPINE_STATES.filter((s) => s === filter) : SPINE_STATES;
    return (
      <div className="jig-tray">
        <div className="jig-tray__filters">
          {SPINE_STATES.map((s) => (
            <button
              key={s}
              type="button"
              className="jig-tray__expand"
              aria-pressed={filter === s}
              onClick={() => setFilter(filter === s ? null : s)}
            >
              {RUNG_LABEL[s]}
            </button>
          ))}
          <button type="button" className="jig-tray__expand jig-tray__printed" onClick={() => setFilter(null)}>
            printed
          </button>
        </div>

        <div className="jig-tray__spine" role="list" aria-label="the spine — every work order by state">
          {visibleStates.map((state) => {
            const cards = workOrders.filter((w) => w.state === state);
            return (
              <div className="jig-tray__rung" key={state}>
                <div className="jig-tray__rung-head">
                  <span>{RUNG_LABEL[state]}</span>
                  <span className="jig-tray__count">{cards.length}</span>
                </div>
                {cards.length === 0 ? (
                  <p className="jig-tray__rung-empty">nothing here</p>
                ) : (
                  cards.map((card) => (
                    <div
                      key={card.id}
                      className="jig-tray__card"
                      data-state={card.state}
                      role="button"
                      tabIndex={0}
                      aria-selected={card.id === selected?.id}
                      onClick={() => {
                        setSelectedId(card.id);
                        setExpanded(false);
                      }}
                    >
                      <div className="jig-tray__card-top">
                        <span className="jig-tray__num">#{card.id}</span>
                        <span className="jig-tray__age">{ageFrom(markedAt(card) ?? new Date(nowMs).toISOString(), nowMs)}</span>
                      </div>
                      <p className="jig-tray__card-what">{card.human.what || 'no what yet'}</p>
                      <DraftBadge order={card} nowMs={nowMs} />
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>

        <div className="jig-tray__scrap">
          <button type="button" className="jig-tray__scrap-btn" onClick={() => setScrapOpen((o) => !o)} aria-expanded={scrapOpen}>
            scrap bin · <span>{scrapped.length}</span>
          </button>
          {scrapOpen &&
            (scrapped.length === 0 ? (
              <p className="jig-tray__rung-empty">empty — nothing has been scrapped</p>
            ) : (
              scrapped.map((s) => (
                <div className="jig-tray__scrap-row" key={s.id}>
                  <span className="jig-tray__num">#{s.id}</span>
                  <span className="jig-tray__what">{s.human.what || 'no what'}</span>
                  <button type="button" onClick={() => doRestore(s.id)}>
                    regenerate
                  </button>
                </div>
              ))
            ))}
        </div>
      </div>
    );
  }

  if (!selected) return null;

  const editable = selected.state === 'marked' || selected.state === 'drafted';
  const oathHeld = selected.state !== 'marked' && selected.state !== 'drafted';

  // Wave-4 fix (TEST-RUN.md's first live test, defects 5 & 6): the collapsed tray used to be
  // a fixed 56px with everything below the header simply clipped — the drafted-by badge and
  // the RELEASE button were both permanently below the fold, not just when the human face got
  // long. `.jig-tray` now fills its chassis-given height (Chassis.css's 260px collapsed
  // track) as a flex column with three bands: the header (pinned, badge now beside the
  // ladder per the fix brief), a middle band that owns ALL of its own scrolling (`.jig-tray__
  // scroll` — the human face + shop face, `min-height: 0` so it is the thing that shrinks
  // first), and a pinned footer (RELEASE + scrap) that is never inside that scroller and so
  // is always on screen regardless of how long the human face gets.
  return (
    <div className="jig-tray">
      <div className="jig-tray__header">
        <span className={'jig-tray__num' + (oathHeld ? ' jig-tray__num--oath' : '')}>#{selected.id}</span>
        <span className="jig-tray__slug">{selected.slug}</span>
        <Ladder current={selected.state} />
        <DraftBadge order={selected} nowMs={nowMs} />
        <button type="button" className="jig-tray__expand" onClick={() => setExpanded(true)}>
          work orders · {workOrders.length}
        </button>
      </div>

      <div className="jig-tray__scroll">
        <div className="jig-tray__face">
          <HumanField id="tray-what" label="what" value={selected.human.what} editable={editable} onCommit={(v) => patchHuman(selected.id, { what: v })} />
          <HumanField id="tray-why" label="why" value={selected.human.why} editable={editable} onCommit={(v) => patchHuman(selected.id, { why: v })} />
          <HumanField id="tray-where" label="where" value={selected.human.where} editable={editable} onCommit={(v) => patchHuman(selected.id, { where: v })} />
          <HumanField
            id="tray-acceptance"
            label="acceptance"
            multiline
            value={selected.human.acceptance.join('\n')}
            editable={editable}
            onCommit={(v) => patchHuman(selected.id, { acceptance: v.split('\n').filter((l) => l.trim().length > 0) })}
          />
          <HumanField
            id="tray-fixture"
            label="fixture"
            value={selected.human.fixture ?? ''}
            editable={editable}
            onCommit={(v) => patchHuman(selected.id, { fixture: v || undefined })}
          />
        </div>

        {selected.shop && (
          <div className="jig-tray__shopface">
            <span className="jig-tray__shopface-title">shop face</span>
            <pre>{selected.shop.brief}</pre>
            <ul className="jig-tray__shopface-files">
              {selected.shop.files.map((f) => (
                <li key={f}>
                  <code>{f}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ReleaseControl enabled={selected.state === 'drafted'} onRelease={() => doRelease(selected.id)} />

      <div className="jig-tray__actions">
        <button type="button" className="jig-tray__expand" onClick={() => doScrap(selected.id)}>
          scrap · to the bin
        </button>
      </div>
    </div>
  );
}
