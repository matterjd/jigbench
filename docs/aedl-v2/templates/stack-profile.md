# Stack Profile — {REPO_NAME}

> **What this is.** A compact, brain-side **synthesis + index** of a target repo's house standards and
> paved road — the "best practices for this stack" that the harness cites at build and review time. It
> does **not** duplicate the repo's own instruction files; it **points to them** and distills the
> concrete, *checkable* rules. Produce/refresh it in the Discovery & Context stage as part of the
> repo's **context triad** (`CONTEXT.md` + `MAP.md` + this).
>
> **Authoritative source always wins.** Where this profile and the repo's own instruction files
> disagree, the repo's files win — fix this profile.

- **Repo:** {path} · **Host:** {code host} · **Tracker:** {tracker}
- **Profiled from** (authoritative instruction files, by path): {list every instruction/config file you read — agent-instruction files, editor-config, contributing guide, lint/format configs}
- **Last refreshed:** {YYYY-MM-DD}

## 1. Stack at a glance
| Layer | Tech / version | Project / path |
|-------|----------------|----------------|
| {Backend} | {} | {} |
| {Frontend} | {} | {} |
| {Tests} | {} | {} |
| {Data} | {} | {} |
| {CI / host} | {} | {} |

## 2. Paved road  *(the opinionated defaults — do this, not that)*
- {architecture / layering rule}
- {state / data-access pattern}
- {preferred libraries; banned alternatives}

## 3. Checkable house standards  *(what the review gate enforces — each cites its source rule)*
| Rule | Source (file) | How review checks it |
|------|---------------|----------------------|
| {comment policy} | {file} | {check} |
| {naming} | {file} | {check} |
| {banned patterns} | {file} | {check} |

## 4. Test conventions
- **Framework(s):** {}
- **TDD expectation:** {}
- **Naming / structure:** {}
- **Coverage / negative-test rule:** {}
- **Run commands:** {}

## 5. Verification hooks  *(inputs to the review pipeline / habit-hooks)*
- **Linters / analyzers → deterministic refactor instructions:** {your linter/analyzer configs}
- **Build / typecheck commands:** {}
- **Mutation-testing tool (if any):** {}

## 6. Existing agent harness in this repo  *(reuse, don't rebuild)*
- **Instruction files:** {paths}
- **Skills / prompts / chat modes:** {paths}
- **Self-improvement / learn loop:** {e.g. a promote-learning flow, a memories folder}
- **Harness integration points:** {e.g. the repo's plan-before-code gate == the Execution-Plan gate; repo TDD == worker TDD}

## 7. Cloud / infra guardrails
- {e.g. confirm before cloud-resource calls; local-run auth gotchas; never bypass safety checks}
