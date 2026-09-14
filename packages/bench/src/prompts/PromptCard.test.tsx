import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { BuildStreamEvent } from '@jigbench/core';
import { PromptCard } from './PromptCard.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mockRect(el: Element, rect: Partial<DOMRect>): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect);
}

function baseProps(overrides: Partial<React.ComponentProps<typeof PromptCard>> = {}) {
  return {
    open: true,
    title: 'InvoiceListComponent',
    file: 'src/app/invoices/invoice-list/invoice-list.component.ts',
    anchorEl: null,
    plateEl: null,
    state: 'none' as const,
    text: '',
    acceptance: [] as string[],
    drafterWired: false,
    polishing: false,
    buildStream: [],
    onTextChange: vi.fn(),
    onAcceptanceChange: vi.fn(),
    onPolish: vi.fn(),
    onReadyComplete: vi.fn(),
    onBuild: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe('PromptCard', () => {
  it('renders the target title and file, and an empty-draft foot message', () => {
    render(<PromptCard {...baseProps()} />);
    expect(screen.getByText('InvoiceListComponent')).toBeTruthy();
    expect(screen.getByText('src/app/invoices/invoice-list/invoice-list.component.ts')).toBeTruthy();
    expect(screen.getByText(/a draft is not saved until it has words/i)).toBeTruthy();
  });

  it('calls onTextChange as the requirement textarea is typed', () => {
    const onTextChange = vi.fn();
    render(<PromptCard {...baseProps({ onTextChange })} />);
    fireEvent.change(screen.getByPlaceholderText(/what should change here/i), { target: { value: 'show days overdue' } });
    expect(onTextChange).toHaveBeenCalledWith('show days overdue');
  });

  it('Ready is not the ember act while the draft has no words', () => {
    render(<PromptCard {...baseProps({ text: '' })} />);
    const ready = screen.getByRole('button', { name: /Ready/ });
    expect(ready.className).not.toMatch(/ember/);
    expect(ready.hasAttribute('disabled')).toBe(true);
  });

  it('Ready becomes the ember act once the draft has words', () => {
    render(<PromptCard {...baseProps({ state: 'draft', text: 'show days overdue' })} />);
    const ready = screen.getByRole('button', { name: /Ready/ });
    expect(ready.className).toMatch(/ember/);
    expect(ready.hasAttribute('disabled')).toBe(false);
  });

  it('holding Ready through the full oath duration calls onReadyComplete', () => {
    vi.useFakeTimers();
    const onReadyComplete = vi.fn();
    render(<PromptCard {...baseProps({ state: 'draft', text: 'show days overdue', onReadyComplete })} />);
    const ready = screen.getByRole('button', { name: /Ready/ });
    act(() => {
      fireEvent.pointerDown(ready);
    });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(onReadyComplete).toHaveBeenCalledTimes(1);
  });

  it('releasing Ready early shows "let go early — still a draft" and never calls onReadyComplete', () => {
    vi.useFakeTimers();
    const onReadyComplete = vi.fn();
    render(<PromptCard {...baseProps({ state: 'draft', text: 'show days overdue', onReadyComplete })} />);
    const ready = screen.getByRole('button', { name: /Ready/ });
    act(() => fireEvent.pointerDown(ready));
    act(() => vi.advanceTimersByTime(300));
    act(() => fireEvent.pointerUp(ready));
    expect(screen.getByText(/let go early — still a draft/i)).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000));
    expect(onReadyComplete).not.toHaveBeenCalled();
  });

  it('Build is hidden until the prompt is ready, then becomes the ember act (never alongside Ready)', () => {
    const { rerender } = render(<PromptCard {...baseProps({ state: 'draft', text: 'x' })} />);
    expect(screen.queryByRole('button', { name: /^Build/ })).toBeNull();

    rerender(<PromptCard {...baseProps({ state: 'ready', text: 'x' })} />);
    const build = screen.getByRole('button', { name: /^Build/ });
    expect(build.className).toMatch(/ember/);
    const ready = screen.getByRole('button', { name: /Ready/ });
    expect(ready.className).not.toMatch(/ember/); // only one ember act on the card at a time
  });

  it('clicking Build calls onBuild', () => {
    const onBuild = vi.fn();
    render(<PromptCard {...baseProps({ state: 'ready', text: 'x', onBuild })} />);
    fireEvent.click(screen.getByRole('button', { name: /^Build/ }));
    expect(onBuild).toHaveBeenCalled();
  });

  it('Polish is absent when the drafter is not wired', () => {
    render(<PromptCard {...baseProps({ text: 'x', drafterWired: false })} />);
    expect(screen.queryByRole('button', { name: /Polish/ })).toBeNull();
  });

  it('Polish appears (and is clickable) once the drafter is wired and there are words', () => {
    const onPolish = vi.fn();
    render(<PromptCard {...baseProps({ text: 'x', drafterWired: true, onPolish })} />);
    const polish = screen.getByRole('button', { name: /Polish/ });
    fireEvent.click(polish);
    expect(onPolish).toHaveBeenCalled();
  });

  it('the requirement field is read-only while building or built', () => {
    const { rerender } = render(<PromptCard {...baseProps({ state: 'building', text: 'x' })} />);
    expect((screen.getByPlaceholderText(/what should change here/i) as HTMLTextAreaElement).readOnly).toBe(true);
    rerender(<PromptCard {...baseProps({ state: 'built', text: 'x' })} />);
    expect((screen.getByPlaceholderText(/what should change here/i) as HTMLTextAreaElement).readOnly).toBe(true);
  });

  it('shows the live Claude stream while building', () => {
    render(
      <PromptCard
        {...baseProps({
          state: 'building',
          text: 'x',
          buildStream: [{ kind: 'text', text: 'editing invoice-list.component.html' }],
        })}
      />,
    );
    expect(screen.getByText(/editing invoice-list.component.html/)).toBeTruthy();
  });

  it('the close button calls onClose', () => {
    const onClose = vi.fn();
    render(<PromptCard {...baseProps({ onClose })} />);
    fireEvent.click(screen.getByRole('button', { name: /close the card/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when not open', () => {
    const { container } = render(<PromptCard {...baseProps({ open: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it('anchors beside the selection when there is room, using the anchor/plate rects', () => {
    render(<PromptCard {...baseProps()} />);
    const anchor = document.createElement('div');
    const plate = document.createElement('div');
    document.body.append(anchor, plate);
    mockRect(anchor, { left: 100, top: 100, width: 100, height: 40 });
    mockRect(plate, { left: 0, top: 0, width: 1044, height: 872 });
    cleanup();
    const { container } = render(<PromptCard {...baseProps({ anchorEl: anchor, plateEl: plate })} />);
    const card = container.querySelector('.jig-prompt-card') as HTMLElement;
    expect(card.style.left).toBe((100 + 100 + 12) + 'px'); // r.x + r.w + 12
    expect(card.dataset.where).toBe('beside');
  });

  it('places itself from a precomputed anchorRect + plateSize when given — the real plate is a cross-origin iframe, so there is no live DOM element to measure for a Point-tool pick', () => {
    const { container } = render(
      <PromptCard {...baseProps({ anchorRect: { x: 100, y: 100, w: 100, h: 40 }, plateSize: { w: 1044, h: 872 } })} />,
    );
    const card = container.querySelector('.jig-prompt-card') as HTMLElement;
    expect(card.style.left).toBe((100 + 100 + 12) + 'px');
    expect(card.dataset.where).toBe('beside');
  });

  it('sits over the corner and says so when the selection leaves no room anywhere', () => {
    const anchor = document.createElement('div');
    const plate = document.createElement('div');
    document.body.append(anchor, plate);
    mockRect(anchor, { left: 0, top: 0, width: 1044, height: 872 });
    mockRect(plate, { left: 0, top: 0, width: 1044, height: 872 });
    render(<PromptCard {...baseProps({ anchorEl: anchor, plateEl: plate })} />);
    expect(screen.getByText(/the selection is larger than the room around it/i)).toBeTruthy();
  });
});

/**
 * #66 (the 0.2.0 desk retest, round 2): "pressing Build makes the prompt card disappear and
 * reappear." The card is anchored once, when it opens — and then the build stream grows INSIDE
 * it while `claude -p` runs. The placement effect re-ran on every `buildStream.length` change,
 * measured a taller card each time and re-placed it, so the card walked up the plate frame by
 * frame instead of staying under the selection it belongs to.
 *
 * jsdom computes no layout — every box is zero — so the card's own height has to be modelled for
 * this to be visible at all: the `offsetHeight` stub below answers the way a browser would, from
 * the stream lines the card is actually rendering. Without it the placement inputs never change
 * and the defect is invisible to any test in this suite (which is why it reached the desk).
 */
describe('PromptCard — #66: it stays put while Claude builds', () => {
  let originalOffsetHeight: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        if (!this.classList.contains('jig-prompt-card')) return 0;
        return 300 + 60 * this.querySelectorAll('.jig-prompt-card__stream li').length;
      },
    });
  });

  afterEach(() => {
    if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
  });

  /** n stream frames, the shape `POST /api/prompts/:id/build` streams over the WS. */
  function frames(n: number): BuildStreamEvent[] {
    return Array.from({ length: n }, (_, i) => ({ kind: 'text', text: `editing invoice-list.html (${i})` }) as BuildStreamEvent);
  }

  const anchorRect = { x: 120, y: 140, w: 200, h: 60 };
  const plateSize = { w: 1045, h: 700 };

  it('the card does not move as the build stream grows under it', () => {
    const props = baseProps({ anchorRect, plateSize, state: 'building' as const, text: 'show days overdue' });
    const { container, rerender } = render(<PromptCard {...props} buildStream={frames(0)} />);
    const card = container.querySelector('.jig-prompt-card') as HTMLElement;
    const openedAt = { left: card.style.left, top: card.style.top, where: card.dataset.where };

    rerender(<PromptCard {...props} buildStream={frames(6)} />);

    // the SAME element — the card changes state in place, it is never unmounted and re-created
    expect(container.querySelector('.jig-prompt-card')).toBe(card);
    expect(card.style.top).toBe(openedAt.top);
    expect(card.style.left).toBe(openedAt.left);
    expect(card.dataset.where).toBe(openedAt.where);
  });

  it('stays the same element, at the same place, from ready through building to built', () => {
    const props = baseProps({ anchorRect, plateSize, text: 'show days overdue' });
    const { container, rerender } = render(<PromptCard {...props} state="ready" buildStream={frames(0)} />);
    const card = container.querySelector('.jig-prompt-card') as HTMLElement;
    const openedAt = { left: card.style.left, top: card.style.top };

    rerender(<PromptCard {...props} state="building" buildStream={frames(3)} />);
    expect(container.querySelector('.jig-prompt-card')).toBe(card);
    rerender(<PromptCard {...props} state="built" buildStream={frames(9)} builtSummary={{ files: 3, durationMs: 72000 }} />);

    expect(container.querySelector('.jig-prompt-card')).toBe(card);
    expect({ left: card.style.left, top: card.style.top }).toEqual(openedAt);
  });

  // The detector control for the two above: placement is not simply frozen. A NEW anchor — the
  // next Point pick — still re-places the card, which is the only thing that ever should.
  it('detector control: a new anchor still re-places it', () => {
    const props = baseProps({ plateSize, state: 'building' as const, text: 'show days overdue' });
    const { container, rerender } = render(<PromptCard {...props} anchorRect={anchorRect} buildStream={frames(2)} />);
    const card = container.querySelector('.jig-prompt-card') as HTMLElement;
    const firstTop = card.style.top;

    rerender(<PromptCard {...props} anchorRect={{ x: 300, y: 420, w: 120, h: 40 }} buildStream={frames(2)} />);

    expect(card.style.top).not.toBe(firstTop);
  });
});

/**
 * Retest 0.2.0 defect #58, at the card. The two hold tests above render ONCE with the words and
 * `state: 'draft'` already in the props and one `onReadyComplete` that never changes — which is
 * not the sequence a human produces, and is why they were green while the desk was stuck.
 *
 * The real sequence, from `App.tsx`: the card opens empty (`state: 'none'`); the first keystroke
 * gives it words, so `cardState` falls back to `'draft'` from the words alone (`App.tsx:208`,
 * deliberate — the card must light before the server answers) and Ready lights; only THEN does
 * `POST /api/prompts` answer, and `onReadyComplete` becomes a closure that knows the prompt id
 * (`App.tsx:316` — before that it is `matchedPrompt && …` with `matchedPrompt === null`, a
 * silent no-op). Ready is pressed after all of that.
 */
describe('PromptCard — retest #58: the hold sends what the card knows at 800 ms, not at the first keystroke', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('holding Ready calls the onReadyComplete the card has now, after the draft has been created', () => {
    const beforeTheCreateAnswered = vi.fn(); // App's no-op closure over a prompt that does not exist
    const afterTheCreateAnswered = vi.fn(); // the same closure, holding a real prompt id

    // 1 — the card opens on a fresh Point pick: no words, no Prompt, Ready dark.
    const { rerender } = render(
      <PromptCard {...baseProps({ state: 'none', text: '', onReadyComplete: beforeTheCreateAnswered })} />,
    );
    expect(screen.getByRole('button', { name: /Ready/ }).hasAttribute('disabled')).toBe(true);

    // 2 — the keystroke: words, so the card calls itself a draft and Ready lights, while the
    // create is still in flight and the callback is still the one that can do nothing.
    rerender(<PromptCard {...baseProps({ state: 'draft', text: 'show days overdue', onReadyComplete: beforeTheCreateAnswered })} />);
    expect(screen.getByRole('button', { name: /Ready/ }).hasAttribute('disabled')).toBe(false);

    // 3 — the create answers. Nothing else about the card changes: same state, same words.
    rerender(<PromptCard {...baseProps({ state: 'draft', text: 'show days overdue', onReadyComplete: afterTheCreateAnswered })} />);

    // 4 — the hold.
    const ready = screen.getByRole('button', { name: /Ready/ });
    act(() => {
      fireEvent.pointerDown(ready);
    });
    expect(screen.getByText(/hold — the ring fills/i)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(afterTheCreateAnswered).toHaveBeenCalledTimes(1);
    expect(beforeTheCreateAnswered).not.toHaveBeenCalled();
    expect(screen.queryByText(/let go early/i)).toBeNull();
  });

  it('a tap is still a tap: it cancels in words and sends nothing, however many times the card re-rendered first', () => {
    const onReadyComplete = vi.fn();
    const { rerender } = render(<PromptCard {...baseProps({ state: 'none', text: '', onReadyComplete })} />);
    rerender(<PromptCard {...baseProps({ state: 'draft', text: 'show days overdue', onReadyComplete })} />);

    const ready = screen.getByRole('button', { name: /Ready/ });
    act(() => {
      fireEvent.pointerDown(ready);
    });
    act(() => {
      vi.advanceTimersByTime(240);
    });
    act(() => {
      fireEvent.pointerUp(ready);
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onReadyComplete).not.toHaveBeenCalled();
    expect(screen.getByText(/let go early — still a draft · \d+ ms of 800/i)).toBeTruthy();
  });
});
