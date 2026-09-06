import type { Mark, WorkOrderHuman } from '@jigbench/core';
import type { Drafter } from '../../seams.js';

/**
 * S5's stand-in for S6's MCP pull (`jig_draft`). Selecting this driver means an agent is
 * connected (`wiring.shop === 'wired'`) — false everywhere until S6 lands — so in
 * practice `select-drafter.ts` never picks it yet. When it is picked, `service.ts` never
 * transitions the ladder off `marked` for it: the mark is left pending in the queue for
 * a connected agent (or a human) to pick up, never silently answered.
 */
export class AgentDrafter implements Drafter {
  private readonly queue: Mark[] = [];

  /** Enqueues the mark rather than answering it — an agent pulls from `getQueue()`
   * later (S6); this never invents a face on the agent's behalf. */
  draft(mark: Mark): WorkOrderHuman {
    this.queue.push(mark);
    return {
      what: mark.prompt,
      why: '',
      where: mark.target.component ?? mark.target.file ?? mark.target.path,
      acceptance: [],
    };
  }

  /** Marks currently waiting for a connected agent to pull, oldest first. */
  getQueue(): readonly Mark[] {
    return this.queue;
  }
}
