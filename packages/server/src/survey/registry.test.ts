import { describe, expect, it } from 'vitest';
import { SURVEY_ADAPTERS } from './registry.js';

describe('SURVEY_ADAPTERS', () => {
  it('registers exactly angular, dotnet, and web, each with a working detect/survey pair', () => {
    const names = SURVEY_ADAPTERS.map((r) => r.name).sort();
    expect(names).toEqual(['angular', 'dotnet', 'web']);
    for (const { adapter } of SURVEY_ADAPTERS) {
      expect(typeof adapter.detect).toBe('function');
      expect(typeof adapter.survey).toBe('function');
    }
  });

  // S16 (AMENDMENT-1 §6/A5): the generic web adapter is the fallback — it must run AFTER every
  // stack adapter so a stack adapter's real components/routes always exist by the time
  // merge.ts decides whether web's own stack/components contribution should yield.
  it('registers web last', () => {
    expect(SURVEY_ADAPTERS[SURVEY_ADAPTERS.length - 1]?.name).toBe('web');
  });
});
