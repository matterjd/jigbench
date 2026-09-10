# Issue-Tracker Impl — GitHub Issues (via `gh` CLI)

Concrete implementation of [`ADAPTER.md`](ADAPTER.md) for **GitHub Issues**, driven by
the `gh` CLI. The command skills (`story-refinement-orchestration`,
`guided-epic-creation`, …) call only the abstract operations below; this file maps each
to a `gh` invocation.

Active when `issue_tracker.adapter: github-gh` in `config/workspace.yml`. Real
repo/label values live in the local, untracked `config/field-map.yml` (path from
`issue_tracker.field_map`) — never hardcode them here.

## Preconditions

- `gh auth status` succeeds (the user is authenticated). The token lives in `gh`'s
  credential store — **never** copy it into this repo.
- `repo` (owner/name) is set in `field-map.yml`. Pass it explicitly with `--repo` so
  operations work regardless of the current working directory.

## Field model

GitHub classic issues have **no custom fields**. Map the abstract inputs as follows:

- **description** → issue body intro.
- **acceptance criteria** → a `## Acceptance Criteria` section in the body (GitHub task
  list, `- [ ] …`). GitHub has no dedicated field, so a structured section is correct.
- **technical notes** → a `## Technical Notes` section in the body.
- **epic reference** → add the `epic_link` label `epic:<epic-number>` (from
  `field-map.yml` conventions) and reference the epic issue with `#<number>` in the body.
- **story vs epic type** → distinguished by labels: `story_label` for stories,
  `epic_label` for epics (both from `field-map.yml`).

## Operations

### `create_story(input) -> story_ref`
```bash
gh issue create --repo "<repo>" \
  --title "<title>" \
  --label "<story_label>" [--label "<product-label>"] [--label "epic:<n>"] \
  --body "$(cat <<'EOF'
<description>

## Acceptance Criteria
- [ ] <criterion>

## Technical Notes
<notes>
EOF
)"
```
Output: the new issue number + url printed by `gh`.

### `update_story(story_ref, changes) -> story_ref`
- Title/body: `gh issue edit <number> --repo "<repo>" [--title ...] [--body ...]`.
- Labels: `--add-label` / `--remove-label`. Apply only the requested changes; never
  rewrite the whole body unless the caller asked to replace it.

### `search_stories(query) -> [story_ref]`
```bash
gh issue list --repo "<repo>" --label "<story_label>" --state <open|closed|all> \
  [--search "<text>"] \
  --json number,title,labels,state,url
```
- "completed" = `--state closed` (GitHub's documented completed semantics).
- Honor any product/area filter by adding the relevant label.

### `create_epic(input) -> epic_ref`
- Same as `create_story` but `--label "<epic_label>"`. Optionally seed a tracking task
  list in the body linking child stories with `- [ ] #<number>`.

### `update_epic` / `search_epics`
- Identical to the story operations, swapping `<story_label>` for `<epic_label>`.

### `add_comment(issue_ref, body) -> comment_ref`
```bash
gh issue comment <number> --repo "<repo>" --body "<rich markdown>"
```

### `add_worklog(issue_ref, time_spent, started_at, note) -> worklog_ref`
- **GitHub has no worklog.** Degrade gracefully: record the time as a comment, e.g.
  `⏱ <time_spent> on <started_at> — <note>`, and return that comment ref. If worklog
  tracking is not wanted, skip and report it.

## Required defaults (applied on create)

- `story_label` on every story; `epic_label` on every epic (from `field-map.yml`).
- Any `default_labels` listed in `field-map.yml` (e.g. a `needs-triage` label).
- The product label, when the caller names a product from `products[]`.

## Rules honored

- All repo/label ids come from `field-map.yml`; nothing hardcoded here.
- Bodies use GitHub-flavored markdown (rich text), never literal `\n` plain text.
- Acceptance criteria + technical notes go in dedicated body sections (GitHub has no
  field for them).
- Only the requested fields/labels are changed on update.
- Credentials never enter the repo — `gh` owns the token.
