import type { NextFunction, Request, Response } from 'express';

/**
 * #81 item 8 (a #70 suggestion the S20 review carried): what the bench answers when a request
 * body is not JSON.
 *
 * `express.json({limit: '64kb'})` is the only body parser either server mounts (`http.ts` and
 * `bench/host.ts`), and it parses exactly `application/json`. Two things used to fall out of
 * that badly, and they are different failures that deserve different answers:
 *
 *   1. **A body sent under some OTHER media type is not parsed at all.** `req.body` stays empty
 *      and the request reaches the route, which refuses it for whatever field it found missing —
 *      `POST /api/docs/clamp` answers `folder is required` for a perfectly well-formed form
 *      submission. The caller is told the wrong thing about the wrong thing. That is what 415
 *      Unsupported Media Type is for, and it is the one status that says "send it as JSON".
 *
 *   2. **A malformed body under `application/json`** throws inside body-parser, whose error
 *      carries `status: 400` and its own wording — `Unexpected token 'o', "not json" is not
 *      valid JSON` — which the generic error handler passed straight through. 400 is the right
 *      STATUS (the media type was supported; the syntax was not), so it stays; what changes is
 *      that the sentence is the bench's, in the bench's voice, like every other refusal here.
 *
 * Both live here rather than inline so the two servers cannot drift, the same reason
 * `same-origin.ts` and `valid-port.ts` do.
 */

/** The 415 body, in words — the same on both servers. */
export const UNSUPPORTED_MEDIA_TYPE_MESSAGE =
  'this request body is not JSON — send it as application/json (the bench reads no other type)';

/** The 400 body a malformed JSON payload gets, in place of body-parser's own phrasing. */
export const MALFORMED_JSON_MESSAGE = 'this request body is not valid JSON — check the payload and send it again';

/** Did this request actually carry a body? A `POST` with no body at all is ordinary here —
 * `POST /api/target/start` takes one only to override detection — so an absent body must never
 * be mistaken for a badly typed one. */
function carriesBody(req: Request): boolean {
  if (req.headers['transfer-encoding'] !== undefined) return true;
  const declared = Number(req.headers['content-length'] ?? '0');
  return Number.isFinite(declared) && declared > 0;
}

/**
 * Refuses, with 415 and words, a request that sent a body under a media type the bench does not
 * read. Mount on `/api` AFTER the Host/Origin gate, so a foreign origin still loses on 403
 * first. Its position relative to `express.json()` does not matter: this middleware never reads
 * `req.body` or any parse result, only the request's own headers (the lead's 2026-09-15
 * review).
 */
export function refuseNonJsonBody(req: Request, res: Response, next: NextFunction): void {
  if (!carriesBody(req)) {
    next();
    return;
  }
  // `req.is` answers `false` for a body whose type does not match and `null` when there is no
  // body to type at all — the `carriesBody` guard above has already handled the second. A body
  // sent with NO `Content-Type` header is the third case, and type-is answers `false` for it:
  // it takes the 415 too, which is right — the bench cannot read what it cannot type — and
  // `http.test.ts` pins it.
  if (req.is('application/json') === false) {
    res.status(415).json({ error: UNSUPPORTED_MEDIA_TYPE_MESSAGE });
    return;
  }
  next();
}

/** True for body-parser's own "could not parse the entity" error. It tags every error it throws
 * with a `type`, which is a far steadier signal than matching on the message text — that text is
 * V8's, and it has changed spelling between Node releases. */
export function isMalformedJsonError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { type?: unknown }).type === 'entity.parse.failed';
}
