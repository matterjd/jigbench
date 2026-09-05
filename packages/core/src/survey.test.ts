import { describe, expect, it } from 'vitest';
import { SurveySchema, stubSurvey } from './survey.js';

describe('Survey', () => {
  it('stubSurvey() produces a schema-valid, honestly-labeled stub', () => {
    const survey = stubSurvey('2026-09-05T00:00:00.000Z');
    expect(() => SurveySchema.parse(survey)).not.toThrow();
    expect(survey.stub).toBe(true);
    expect(survey.jigFormat).toBe(1);
    expect(survey.components).toEqual([]);
  });

  it('rejects a survey missing jigFormat', () => {
    const bad = { ...stubSurvey(), jigFormat: undefined };
    expect(() => SurveySchema.parse(bad)).toThrow();
  });
});
