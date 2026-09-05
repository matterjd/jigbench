# ADR-001: The agent pulls over MCP; Jig never depends on push

- **Status:** Accepted
- **Date:** 2026-09-05
- **Deciders:** commission F7 (drafter order), F1 (agents on Tuesday); feasibility §A [mcp]

## Context

Jig needs a way to hand a drafted work order to a connected agent (Claude Code / Claude
Desktop) and, later, to have that agent report back when it's done. The MCP spec's
2026-07-28 revision adds sampling and richer server-initiated flows, but:

- Sampling is marked **deprecated** in that same revision.
- Whether Claude Code's stdio transport has adopted the 2026-07-28 semantics at all was, at
  research time, **unconfirmed** (feasibility §A, PROVEN/PRESUMED table).
- The stable, widely-supported path today is MCP's v1 TypeScript SDK
  (`@modelcontextprotocol/sdk` `^1.30`), where the client (the agent) always initiates:
  it lists tools/resources and calls them. The server (Jig) never pushes.

## Decision

Jig's MCP server (`jigbench mcp`, arriving in S6) exposes **tools and resources only**. The
agent **pulls**: it lists open work orders as MCP resources, calls a tool to claim one, and
calls another tool to report it done. Jig never depends on a server-initiated push,
notification, or sampling call to move a work order forward. Everything the agent needs to
know is either returned from a tool call it made, or sits in a resource it can read.

This also fixes the SDK line: v1 (`^1.30`), not the newer v2-shaped spec, for the whole S1
build (decision 14, one-way door mid-flight — switching SDKs later touches every tool/
resource registration).

## Consequences

- A work order can sit in `released` indefinitely with no agent attached; nothing is lost —
  it's a file, and any agent that connects later can pull it same as one that was there from
  the start.
- Jig can't proactively interrupt an agent mid-task to say "the human changed the mark" —
  the agent finds out the next time it reads, not the moment it happens. Acceptable for a
  local single-operator tool; revisit if Jig ever needs cross-agent coordination.
- No sampling means Jig's own local model (Ollama, S5) is a separate code path from the MCP
  surface entirely — the `Drafter` seam, not an MCP capability. That was already the design
  (commission F7); this ADR just confirms MCP never becomes the drafting path.

## What would reverse this

- Claude Code (or Claude Desktop) publicly confirms it implements the 2026-07-28 push
  semantics on stdio, **and** sampling un-deprecates or a stable push-capable replacement
  ships. At that point, a push-based "the shop is notified the moment a work order releases"
  UX becomes possible — but it would be **additive** (a faster path alongside pull), not a
  replacement, per the one-way-door note on decision 14: nothing that already works via pull
  should ever start depending on push.
- Concretely: run `claude mcp list` (or the Desktop equivalent) against a live push-capable
  server and confirm a push notification actually arrives client-side, unprompted.
