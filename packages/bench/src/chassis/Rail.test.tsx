import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Rail } from './Rail.js';
import { getTool, setTool } from '../tools/toolState.js';

afterEach(() => {
  cleanup();
  setTool('hand');
});

describe('Rail', () => {
  it('renders all six tools as 44px buttons with the plain word in an aria-label', () => {
    render(<Rail />);
    const hand = screen.getByRole('button', { name: /Hand.*move the plate/i });
    expect(hand).toBeTruthy();
    for (const label of [/Hand/, /Loupe/, /Mark/, /Fixture/, /Toolpath/, /Sketch/]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('clicking a tool sets it active (aria-pressed) and clears the previous one', () => {
    render(<Rail />);
    const loupe = screen.getByRole('button', { name: /Loupe/ });
    const hand = screen.getByRole('button', { name: /Hand/ });
    expect(hand.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(loupe);
    expect(loupe.getAttribute('aria-pressed')).toBe('true');
    expect(hand.getAttribute('aria-pressed')).toBe('false');
    expect(getTool()).toBe('loupe');
  });

  it('shows the plain word pairing on hover (title/tooltip content)', () => {
    render(<Rail />);
    const loupe = screen.getByRole('button', { name: /Loupe — point at anything and see what it is/ });
    fireEvent.mouseEnter(loupe);
    expect(screen.getByText(/point at anything and see what it is/)).toBeTruthy();
  });

  it('Esc returns the tool to Hand from anywhere', () => {
    render(<Rail />);
    setTool('mark');
    expect(getTool()).toBe('mark');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(getTool()).toBe('hand');
  });

  it('keyboard shortcuts V/L/M/F/T/S switch tools', () => {
    render(<Rail />);
    fireEvent.keyDown(window, { key: 'l' });
    expect(getTool()).toBe('loupe');
    fireEvent.keyDown(window, { key: 'M' });
    expect(getTool()).toBe('mark');
    fireEvent.keyDown(window, { key: 'f' });
    expect(getTool()).toBe('fixture');
    fireEvent.keyDown(window, { key: 't' });
    expect(getTool()).toBe('toolpath');
    fireEvent.keyDown(window, { key: 's' });
    expect(getTool()).toBe('sketch');
    fireEvent.keyDown(window, { key: 'v' });
    expect(getTool()).toBe('hand');
  });

  it('shortcuts are ignored while a text field has focus (so typing "m" in a search box does not switch tools)', () => {
    render(
      <div>
        <Rail />
        <input aria-label="somewhere else" />
      </div>,
    );
    const input = screen.getByLabelText('somewhere else');
    input.focus();
    fireEvent.keyDown(input, { key: 'm' });
    expect(getTool()).toBe('hand');
  });

  it('selecting Loupe posts jig:mode "loupe" to the plate', () => {
    const postToPlate = vi.fn();
    render(<Rail postToPlate={postToPlate} />);
    fireEvent.click(screen.getByRole('button', { name: /Loupe/ }));
    expect(postToPlate).toHaveBeenCalledWith({ type: 'jig:mode', mode: 'loupe' });
  });

  it('selecting Mark also posts jig:mode "loupe" (Mark is the loupe with a click S5 turns into a mark)', () => {
    const postToPlate = vi.fn();
    render(<Rail postToPlate={postToPlate} />);
    fireEvent.click(screen.getByRole('button', { name: /Mark/ }));
    expect(postToPlate).toHaveBeenCalledWith({ type: 'jig:mode', mode: 'loupe' });
  });

  it('selecting Hand posts jig:mode "hand"', () => {
    const postToPlate = vi.fn();
    render(<Rail postToPlate={postToPlate} />);
    fireEvent.click(screen.getByRole('button', { name: /Loupe/ }));
    postToPlate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Hand/ }));
    expect(postToPlate).toHaveBeenCalledWith({ type: 'jig:mode', mode: 'hand' });
  });

  it('selecting Fixture/Toolpath/Sketch does not post a jig:mode message', () => {
    const postToPlate = vi.fn();
    render(<Rail postToPlate={postToPlate} />);
    fireEvent.click(screen.getByRole('button', { name: /Fixture/ }));
    expect(postToPlate).not.toHaveBeenCalled();
  });
});
