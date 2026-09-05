# QUALITY.md

Living quality dashboard. QA-owned — do not edit outside a QA pass.

Each number sits beside the command that produced it.

## Packages

| Package | Tests | Pass | Coverage | Open defects |
|---|---|---|---|---|
| core | — (not yet built) | — (not yet built) | — (not yet built) | — (not yet built) |
| server | — (not yet built) | — (not yet built) | — (not yet built) | — (not yet built) |
| bench | — (not yet built) | — (not yet built) | — (not yet built) | — (not yet built) |
| cli | — (not yet built) | — (not yet built) | — (not yet built) | — (not yet built) |
| adapters/angular | — (not yet built) | — (not yet built) | — (not yet built) | — (not yet built) |
| adapters/dotnet | — (not yet built) | — (not yet built) | — (not yet built) | — (not yet built) |

## Gates (from `docs/EXECUTION-PLAN.md` §5)

- Deterministic gates per slice: typecheck, unit, integration where named, e2e smoke where named,
  stdout-purity guard (S1 onward, red-first), `npm pack --dry-run` (S10).
- Conformance tests: the golden `.jig/` files, the survey fixture test over `examples/`, the
  ladder transition table.
- Adversarial probing on S6 (the MCP boundary) and S3 (the proxy's header handling). Mutation
  testing is post-Tuesday.
- Council of judges per `aedl-verify`: Standards, Spec, Security (never optional), Design (the
  floor in `docs/DESIGN-TEAM.md` §6) — judge count scaled to tier, run per wave on the accumulated
  diff. Any unanimous security finding is a hard stop.
- Security and supply-chain screen: OWASP Top 10 on the proxy (header rewriting, path traversal in
  `.jig/` writes, no shell from user input); no dependency younger than 14 days without a stated
  reason.
