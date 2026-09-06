import { angularAdapter } from '@jigbench/adapter-angular';
import { dotnetAdapter } from '@jigbench/adapter-dotnet';
import type { SurveyAdapter } from '../seams.js';

export interface RegisteredSurveyAdapter {
  name: string;
  adapter: SurveyAdapter;
}

/**
 * S2's stack registrations. `server` is the one place allowed to import adapter packages
 * directly (AGENTS.md boundary rule: adapters import core interfaces only, never `server`)
 * — a third stack is one more entry here and nothing else in `survey/run.ts` changes.
 */
export const SURVEY_ADAPTERS: RegisteredSurveyAdapter[] = [
  { name: 'angular', adapter: angularAdapter },
  { name: 'dotnet', adapter: dotnetAdapter },
];
