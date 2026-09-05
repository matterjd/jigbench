import { describe, expect, it } from 'vitest';
import { SURVEY_ADAPTERS } from './registry.js';

describe('SURVEY_ADAPTERS', () => {
  it('registers exactly angular and dotnet, each with a working detect/survey pair', () => {
    const names = SURVEY_ADAPTERS.map((r) => r.name).sort();
    expect(names).toEqual(['angular', 'dotnet']);
    for (const { adapter } of SURVEY_ADAPTERS) {
      expect(typeof adapter.detect).toBe('function');
      expect(typeof adapter.survey).toBe('function');
    }
  });
});
