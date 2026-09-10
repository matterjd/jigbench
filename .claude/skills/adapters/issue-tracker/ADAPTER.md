# Issue-Tracker Adapter — interface

The **stable interface** that every issue-tracker implementation must satisfy. The
command skills (`notes-story/`, `notes-epic/`) call only this interface — they never
know the concrete tracker, its API, or its field ids. Swapping trackers means writing a
new impl that satisfies this contract; the command skills do not change.

The active impl is named by `issue_tracker.adapter` in `config/workspace.yml`. Its
real ids live in a local `field-map.yml` (path from `issue_tracker.field_map`) — never
in any tracked example file.

## Resolution

Before any tracker operation, an agent MUST:

1. Read `config/workspace.yml` → get `issue_tracker.adapter` and `field_map` path.
2. Read this `ADAPTER.md` (the interface).
3. Read the active impl file (`<adapter>.md`) for tracker-specific mechanics.
4. Read the local `field-map.yml` for the real ids (`project_key`, `base_url`,
   `team_filter_jql`, and each `<CUSTOM_FIELD_*>`).

If any of those are missing, stop and report the gap.

## Operations (the contract)

Every impl must provide each operation below. Inputs and outputs are described
abstractly; the impl maps them to its tracker's API and fields.

### `create_story(input) -> story_ref`
- **Input:** title, description (rich text), acceptance criteria (rich text), technical
  notes (rich text, optional), epic reference (optional), plus the impl's required
  defaults.
- **Behavior:** create a story-type issue. Keep acceptance criteria and technical notes
  **out of** the description body — store them in their dedicated fields per the impl.
  Use the tracker's rich-text format, not newline-delimited plain text.
- **Output:** a `story_ref` (the tracker key/id) and its url.

### `update_story(story_ref, changes) -> story_ref`
- **Input:** a story reference and a partial set of field changes.
- **Behavior:** apply only the provided changes; do not clobber unspecified fields.
- **Output:** the same `story_ref`.

### `search_stories(query) -> [story_ref]`
- **Input:** a structured query (team filter, status, text, epic, etc.).
- **Behavior:** run the tracker's query, honoring the team filter from `field-map.yml`.
- **Output:** a list of matching `story_ref`s with their summary fields.
- **Caveat:** "completed" must be expressed by the impl's documented completed-state
  semantics, not assumed (see the Jira example's `statusCategory` note).

### `create_epic(input) -> epic_ref`
- **Input:** title, description (rich text), plus the impl's required epic defaults.
- **Output:** an `epic_ref` and its url.

### `update_epic(epic_ref, changes) -> epic_ref`
- Same semantics as `update_story` for epic-type issues.

### `search_epics(query) -> [epic_ref]`
- Same semantics as `search_stories` for epic-type issues.

### `add_comment(issue_ref, body) -> comment_ref`
- **Input:** an issue reference and a rich-text comment body.
- **Behavior:** post a comment (e.g. a kickoff comment) in the tracker's rich-text
  format.
- **Output:** a `comment_ref`.

### `add_worklog(issue_ref, time_spent, started_at, note) -> worklog_ref`
- **Input:** an issue reference, a duration, a start timestamp, and an optional note.
- **Behavior:** log work against the issue.
- **Output:** a `worklog_ref`.

## Required defaults

Each impl declares the **default field values** to apply on create (e.g. team, an
"unreviewed" flag, a refinement state, a velocity field, story-point handling). These
defaults are part of the impl, expressed via `<CUSTOM_FIELD_*>` placeholders resolved
from the local `field-map.yml`. The command skills pass user-supplied values and rely
on the impl for the rest.

## Rules every impl must honor

- Resolve all ids from the local `field-map.yml`; never hardcode them.
- Use the tracker's rich-text format for description, comments, and rich custom fields —
  never plain text with literal `\n`.
- Keep acceptance criteria and technical notes out of the description body when the
  tracker provides dedicated fields for them.
- Only set fields the caller asked for, plus declared defaults; never blank a field that
  was not provided.
- Never write tracker credentials into the repo.
