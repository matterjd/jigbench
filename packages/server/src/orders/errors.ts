/** The two error shapes `http.ts`'s orders routes map to real HTTP status codes — thrown
 * by `service.ts`, caught at the route boundary, never leaked as a generic 400. */

export class OrderNotFoundError extends Error {
  constructor(id: string) {
    super(`no such work order: ${id}`);
    this.name = 'OrderNotFoundError';
  }
}

/** An illegal ladder transition, or an edit attempted outside the window it is allowed
 * in (e.g. the human face after release). Maps to 409 Conflict — the request is well
 * formed, but the work order's own state refuses it. */
export class OrderConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderConflictError';
  }
}
