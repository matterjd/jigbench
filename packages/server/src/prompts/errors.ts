/** Error shapes `http.ts`'s prompts routes map to real HTTP status codes — same pattern as
 * `orders/errors.ts`. `PromptNotFoundError` itself lives on `PromptStore` (`store.ts`),
 * thrown by `require()`; everything below is service-level. */

/** An illegal state transition, or an operation attempted outside the state it's legal in
 * (editing a building/built/scrapped prompt, `ready`-ing something already ready, etc).
 * Maps to 409 Conflict. */
export class PromptConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptConflictError';
  }
}

/** "only ONE build at a time per repo (a second Build while building -> 409 with the running
 * id)" (S11 brief). Carries the id already running so the route can report it. */
export class PromptBuildConflictError extends Error {
  readonly runningPromptId: string;
  readonly runningBuildId: string;

  constructor(runningPromptId: string, runningBuildId: string) {
    super(`a build is already running for prompt ${runningPromptId} (build ${runningBuildId})`);
    this.name = 'PromptBuildConflictError';
    this.runningPromptId = runningPromptId;
    this.runningBuildId = runningBuildId;
  }
}

/** "Never run when claude is not on PATH: the API answers with a plain message" (S11 brief) —
 * the exact wording below is that plain message, verbatim. */
export class ClaudeNotInstalledError extends Error {
  constructor() {
    super('Claude Code is not installed on this machine — install it or use the MCP door');
    this.name = 'ClaudeNotInstalledError';
  }
}

/** "polish(id) ... 404-style honest error when no model" (S11 brief) — no local model is
 * reachable, so there is nothing to polish with; the button/route is absent, not a stub. */
export class PolishUnavailableError extends Error {
  constructor(message = 'no local model is reachable on this desk — Polish needs Ollama running') {
    super(message);
    this.name = 'PolishUnavailableError';
  }
}
