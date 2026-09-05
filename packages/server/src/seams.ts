import type { Mark, Survey, WorkOrderHuman } from '@jigbench/core';

/**
 * The three seams the commission names (FEASIBILITY.md §B, EXECUTION-PLAN.md §3): a new
 * target stack, drafting model, or render route is one new implementation of one of these
 * interfaces — nothing else in `server` changes.
 */

export interface SurveyAdapter {
  /** Can this adapter make sense of the repo at all? */
  detect(repoRoot: string): Promise<boolean> | boolean;
  /** Read the repo and produce a Survey. */
  survey(repoRoot: string): Promise<Survey> | Survey;
}

export interface DrafterContext {
  survey: Survey;
}

export interface Drafter {
  /** Given a mark and whatever context the survey/docs provide, produce the human face of
   * a work order. Never writes anything — the caller decides what to do with the result. */
  draft(mark: Mark, context: DrafterContext): Promise<WorkOrderHuman> | WorkOrderHuman;
}

/** The always-available fallback: a human fills the face in themselves. Returns an empty
 * face, keyed off whatever the mark already knows about its target, so there is always
 * something to edit rather than a form with no starting point. */
export class HumanDrafter implements Drafter {
  draft(mark: Mark): WorkOrderHuman {
    return {
      what: '',
      why: '',
      where: mark.target.component ?? mark.target.file ?? mark.target.path,
      acceptance: [],
    };
  }
}

/** A drafter that refuses to draft — useful as an explicit "nothing is wired" seam in tests
 * and for a caller that wants to detect the no-model, no-agent case and fall back itself. */
export class NullDrafter implements Drafter {
  draft(): never {
    throw new Error('NullDrafter: no drafting driver is configured');
  }
}

export interface PlateHost {
  /** Point the plate at a running target and get back the URL to load in the frame. S1's
   * stub does no proxying at all — it is the identity function until S3 replaces it. */
  start(target: string): Promise<string> | string;
}

export class StubPlateHost implements PlateHost {
  start(target: string): string {
    return target;
  }
}
