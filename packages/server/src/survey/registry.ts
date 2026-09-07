import { angularAdapter } from '@jigbench/adapter-angular';
import { dotnetAdapter } from '@jigbench/adapter-dotnet';
import { webAdapter } from '@jigbench/adapter-web';
import type { SurveyAdapter } from '../seams.js';

export interface RegisteredSurveyAdapter {
  name: string;
  adapter: SurveyAdapter;
}

/**
 * S2's stack registrations, plus S16's generic web fallback (AMENDMENT-1 §6/A5). `server` is
 * the one place allowed to import adapter packages directly (AGENTS.md boundary rule:
 * adapters import core interfaces only, never `server`) — a new stack adapter is one more
 * entry here and nothing else in `survey/run.ts` changes.
 *
 * `web` is registered LAST, deliberately: it is the fallback that matches almost any web
 * codebase (a `package.json` or a stray stylesheet), so every stack adapter must have already
 * had its chance to detect the same repo before `survey/merge.ts` decides whether web's own
 * `stack`/`components`/`routes` contribution should yield to a real one.
 */
export const SURVEY_ADAPTERS: RegisteredSurveyAdapter[] = [
  { name: 'angular', adapter: angularAdapter },
  { name: 'dotnet', adapter: dotnetAdapter },
  { name: 'web', adapter: webAdapter },
];
