# ADR-002: Reverse-proxy injection over a dev-server plugin

- **Status:** Accepted
- **Date:** 2026-09-05
- **Deciders:** commission F8 (render route); feasibility §A one-way-doors table,
  §A risk register items 1–3 [render-inspect]

## Context

The plate needs to show a clamped app's own running dev server (`ng serve`, eventually
others) with a small script (the loupe) injected so a click resolves to a component and its
file. Two ways to get a script into that page:

1. **A dev-server plugin** the target repo installs (an Angular CLI / Vite plugin that
   injects the script at build time).
2. **A reverse proxy** in front of the target's dev server: Jig's `server` sits between the
   browser and `ng serve`, rewrites HTML responses to add the loupe `<script>` tag, and
   passes everything else through unchanged.

The commission's own ask is that Jig cost the target repo **nothing** — "the ability to
demo the application ... whatever is simplest to render" with no mention of installing
anything into the app being inspected. F19 already commits to *not* vendoring Jig's own
tooling into a clamped repo's toolchain.

## Decision

**The proxy is the default and the only route S1–S3 build.** `packages/server` runs an
HTTP proxy in front of whatever dev server the survey/user points it at. It:

- Rewrites HTML responses to inject the loupe `<script>` tag.
- Passes the target's WebSocket (HMR) traffic through unmodified.
- Handles `X-Frame-Options` / CSP headers **selectively** — reporting what it changed,
  never blanket-stripping the target's own security headers (risk register item 1: a
  blanket strip breaks the target's own security model, which is out of scope to weaken).

A dev-server plugin path is **not built** in S1–S3. It remains a possible **future addition**
for a stack where the proxy route hits a hard wall (e.g., a dev server whose host-allowlist
check can't be satisfied any other way — risk register item 3).

## Consequences

- Zero-touch: `examples/ledger-angular` (and, Tuesday, Matter's real repos) need no
  dependency added, no config file edited, no build step changed, to be clamped.
- Jig owns the failure mode when a target's CSP/X-Frame-Options blocks the plate outright.
  The mitigation is the documented fallback (paste one `<script>` tag manually — F8) and a
  dev-server config note, never a silent workaround that weakens the target's headers.
- Angular CLI's Vite-based dev server has host/origin allowlist checks that may reject a
  proxied origin (risk register item 3) — this is a known open risk, tracked for S3's smoke
  test, not resolved by this ADR.

## What would reverse this

**Never remove the proxy path.** Per the feasibility one-way-doors table: "plugin is
additive," meaning if a dev-server plugin route is ever built (because some stack's dev
server categorically can't be proxied), it ships *alongside* the proxy, as an opt-in for
that stack — contributors who rely on the zero-touch proxy path today must never be forced
onto a plugin later. The trigger for building the plugin path at all is a **named, repro'd**
dev-server that fails the proxy approach (e.g., a documented Vite/Angular CLI host-check
failure with no config-side fix) — not a preference or a performance guess.
