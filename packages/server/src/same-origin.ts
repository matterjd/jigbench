/** True when `origin` is absent (a non-browser client — curl, an MCP client, the CLI itself
 * — never sends one) or matches `host` (the request's own `Host` header) exactly. Browsers
 * always send `Origin` on a cross-origin fetch/XHR and on same-origin state-changing
 * requests too, so comparing it against the request's own Host is a same-origin check that
 * needs no hardcoded port — it works whether the bench is on its configured port or, in
 * tests, an OS-assigned one. A request from any other page's Origin fails this regardless
 * of which interface the server is bound to.
 *
 * Extracted from `http.ts` (S17a) so `fs/route.ts` — a LOCAL-only but sensitive filesystem
 * browser (S17a's own brief: "treat them as sensitive: refuse a foreign Origin header even on
 * GET") — can apply the exact same check without an import cycle back into `http.ts`. */
export function isSameOriginOrAbsent(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
