import { describe, expect, it } from 'vitest';
import { categorizeGauge } from './gauges.js';

// Exercised against the actual starter.css tokens (design-book/tokens/starter.css) that
// packages/bench's tokens.css copies verbatim, so this test is pinned to real names.
describe('categorizeGauge', () => {
  it('categorizes ground/ink colours as colour', () => {
    expect(categorizeGauge('--bg0', '#0a0c0f')).toBe('colour');
    expect(categorizeGauge('--ink', '#e8e6e1')).toBe('colour');
    expect(categorizeGauge('--ember', '#f2762e')).toBe('colour');
  });

  it('categorizes an rgba() value as colour even with a generic name', () => {
    expect(categorizeGauge('--ember-soft', 'rgba(242, 118, 46, 0.14)')).toBe('colour');
  });

  it('categorizes font stacks as type', () => {
    expect(categorizeGauge('--sans', "'Segoe UI Variable', sans-serif")).toBe('type');
    expect(categorizeGauge('--mono', "'Cascadia Code', monospace")).toBe('type');
  });

  it('categorizes the shape scale as radius', () => {
    expect(categorizeGauge('--r', '10px')).toBe('radius');
    expect(categorizeGauge('--r-pill', '999px')).toBe('radius');
  });

  it('categorizes shadows as shadow', () => {
    expect(categorizeGauge('--shadow-held', '0 6px 24px rgba(0, 0, 0, 0.45)')).toBe('shadow');
  });

  it('categorizes motion timing as motion', () => {
    expect(categorizeGauge('--t-feather', '120ms')).toBe('motion');
    expect(categorizeGauge('--ease-standard', 'cubic-bezier(0.2, 0, 0, 1)')).toBe('motion');
  });

  it('categorizes an explicit z-index token as z', () => {
    expect(categorizeGauge('--z-overlay', '50')).toBe('z');
  });

  it('falls back to space for an unrecognized quantitative token', () => {
    expect(categorizeGauge('--gutter-lg', '24px')).toBe('space');
  });
});
