# Issue-Tracker Adapter — Jira / Atlassian (example impl)

Concrete implementation notes for a Jira (Atlassian) tracker that satisfies
[`ADAPTER.md`](ADAPTER.md). **Placeholders only** — every real id lives in your local,
untracked `field-map.yml`. Copy `field-map.example.yml` to `field-map.yml` and fill it
in for your own instance.

> This is an *example*. If you use a different tracker, author a sibling impl that
> satisfies `ADAPTER.md` and point `issue_tracker.adapter` at it.

## Connection

- API surface: an Atlassian MCP / REST client (provided by your AI tool's MCP config).
  **Do not** store credentials or bearer tokens in the repo.
- `base_url`, `project_key`, and the team filter all come from `field-map.yml`.

## Rich text — ADF

Jira description and rich custom-text fields use **ADF** (Atlassian Document Format), a
structured JSON document — **not** plain text with literal `\n`. Always emit ADF for:

- the issue **description**,
- the **acceptance criteria** field,
- the **technical notes** field,
- **comments**.

Plain newline-delimited strings render poorly and break formatting. Build an ADF
document (paragraphs, bullet lists, headings) instead.

## Field placement

- Keep **acceptance criteria** OUT of the description; store it in
  `<CUSTOM_FIELD_ACCEPTANCE_CRITERIA>`.
- Keep **technical notes** OUT of the description; store them in
  `<CUSTOM_FIELD_TECHNICAL_NOTES>`.
- The description holds the user story + context only.

## Required defaults on create (story)

Apply these unless the caller overrides them. Every id is a placeholder resolved from
`field-map.yml`:

| Concept                    | Field placeholder                    | Default behavior                                      |
| -------------------------- | ------------------------------------ | ----------------------------------------------------- |
| Epic link                  | `<CUSTOM_FIELD_EPIC_LINK>`           | set when the caller supplies an epic                  |
| Story points               | `<CUSTOM_FIELD_STORY_POINTS>`        | leave null/empty **unless** the caller provides a value |
| % velocity                 | `<CUSTOM_FIELD_PERCENT_VELOCITY>`    | set to your team's default (placeholder value)        |
| Team                       | `<CUSTOM_FIELD_TEAM>`                | set to your team's option id (placeholder)            |
| Refinement state           | `<CUSTOM_FIELD_REFINEMENT_STATE>`    | set to your "to be refined / groomed" option id       |
| Reviewed flag              | `<CUSTOM_FIELD_REVIEWED>`            | set to your "reviewed = no" option id                 |

Do not set story points implicitly — only when the caller explicitly provides them.

## Operation mapping

- `create_story` / `create_epic` → create issue of the corresponding type, ADF
  description, AC/technical-notes in their dedicated fields, defaults above.
- `update_story` / `update_epic` → edit issue; send only changed fields.
- `search_stories` / `search_epics` → run JQL (see caveats below).
- `add_comment` → add an ADF comment (e.g. a kickoff comment).
- `add_worklog` → add a worklog entry (duration + start time + optional note).

## JQL caveats

- **Completed = `statusCategory = Done`**, not `status = Done`. Several workflows have
  multiple done-category statuses; filter by category to catch them all.
- **Team filter:** use the `team_filter_jql` string from `field-map.yml` (a
  `cf[<id>] = "<value>"` clause). Do not invent it inline.
- **Sprint helpers vary by instance.** Board-sprint JQL functions and the sprint custom
  field may not be returned by every MCP/REST configuration — verify against your
  instance before relying on them; do not assume they work.
- Always scope searches by `project = <project_key>` from `field-map.yml`.

## After create/update

- When requested, add a **kickoff comment** via `add_comment`.
- Log work via `add_worklog` when the workflow calls for it.
