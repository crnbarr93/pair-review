# Phase 3: Diff UI + File Tree + Navigation — Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

The first "feels like a real review tool" surface. Phase 3 turns the Phase-1 minimal diff-view shell into a navigable, information-rich review UI: a real GitHub-style diff renderer (unified + split toggle) that consumes the live `DiffModel` + Shiki tokens from the Phase-2 event-sourced session reducer, a file-tree sidebar with per-file review status (untouched / in-progress / reviewed), generated/lockfile detection with UI collapse + state-level exclusion flag (so Phase 4/5 MCP tools filter by default), global keyboard shortcuts (`n`/`p`/`r` fully wired; `c`/`v`/`s` registered as toasted stubs for Phase 5/6), existing PR comments fetched at session start and rendered read-only on the diff gutter reusing the prototype's thread-marker DOM slot, and a CI check-run aggregate pill + expandable list on the TopBar.

**Explicitly in scope:** Live-wire committed prototype components (TopBar, FileExplorer, DiffViewer) to the Phase-2 store snapshot; delete `@git-diff-view/react` + `DiffView.spike.tsx`; delete `web/src/utils/highlight.ts`; delete `TweaksPanel`; swap `data.ts` fixtures for store-derived data; add `generated: boolean` to `DiffFile` with path-pattern detection; add per-file review-status (in-progress / reviewed) to session state; add SessionEvents for the new mutations; extend ingest to also fetch existing PR comments + CI checks via `gh api` / `gh pr checks`.

**Explicitly NOT in scope (per ROADMAP / REQUIREMENTS boundaries):**
- PR summary, checklist, self-review (Phase 4)
- Walkthrough narrative, inline-thread composer, threaded user↔LLM conversations (Phase 5)
- Verdict UI, submission, pending-review detection (Phase 6)
- Octokit dependency (stays deferred to Phase 6)
- Multi-session switcher, authenticated-user display, polling CI refresh, orphan-comment panel, keyboard help overlay (Phase 7)
- Repo-tab full file-tree implementation (Phase 7 polish — toggle ships disabled in Phase 3)
- Word-level intra-line diff highlighting (Phase 7 or v1.x)
- `ChatPanel`, `InlineThread`, `StageStepper` component mounts (Phase 4/5 wire them)
- New LLM-facing MCP tools (Phase 3 adds state surface only; Phase 4/5 add tools)

</domain>

<decisions>
## Implementation Decisions

### Design baseline (supersedes Phase 1 UI-SPEC)

- **D-01:** Commit `c7fe93f`'s "Claude Pair Review" prototype (paper/teal light mode, 3-column layout scaffolding, `TopBar` + `FileExplorer` + bespoke `DiffViewer` + `ChatPanel` + `InlineThread` + `TweaksPanel` + `StageStepper`) is the authoritative Phase-3+ design direction. Phase-1 `01-UI-SPEC.md` is **formally superseded**: its `@theme` token block, dark-mode palette, system font stacks, and `@git-diff-view/react` dependency are abandoned. A new Key Decision row must be added to PROJECT.md at Phase-3 commit time naming this supersession and pointing at Phase 3's CONTEXT + artifacts.
- **D-02:** Phase 3 renders a **2-column layout**: `TopBar` across the top, then `FileExplorer` | `DiffViewer` in the main region. `StageStepper`, `ChatPanel`, and `InlineThread` components stay on disk in `web/src/components/` but are **not mounted** in Phase 3 — Phase 4 mounts `StageStepper`, Phase 5 mounts `ChatPanel` + `InlineThread`.
- **D-03:** `TweaksPanel` is **deleted**. Defaults for its former toggles (`threadLayout`, `progressViz`) are locked in planning and committed as constants (the values will only matter once Phase 5 mounts the thread UI). No dev-ergonomics surface ships.
- **D-04:** The prototype's `:root` token set in `web/src/index.css` (`--paper`, `--claude`, `--mono`, etc.) is authoritative. Tailwind v4's `@theme` block from the Phase-1 UI-SPEC is not used; the existing `index.css` structure is the source of truth. Planner may reorganize tokens for clarity but must NOT reintroduce UI-SPEC's dark-mode palette or GitHub-dark color values.

### Diff renderer (resolves Open Decision 1)

- **D-05:** **Open Decision 1 resolves toward the bespoke `DiffViewer.tsx`.** `@git-diff-view/react` is no longer the Phase-3 choice. Remove the dependency from `web/package.json`; delete `web/src/components/DiffView.spike.tsx`; delete `web/src/__tests__/diff-view-spike.test.tsx`; remove the `@git-diff-view/react/styles/diff-view-pure.css` import from `web/src/main.tsx`. A new PROJECT.md Key Decision row must reflect this at Phase-3 commit time.
- **D-06:** The bespoke `DiffViewer` must consume the server's Shiki tokens (D-22 Phase-1 contract; `state.shikiTokens` is already populated server-side). `web/src/utils/highlight.ts` (client-side regex highlighter) is **deleted**. Each line renders pre-tokenized content from `state.shikiTokens[fileId][hunkIdx][lineIdx]` into its content cell. No client-side highlighting code ships.
- **D-07:** Multi-file scroll model is **all files in one long vertical scroll with per-file section headers** (GitHub-PR-style). FileExplorer clicks scroll to the clicked file's section via id-anchored `scrollIntoView`. `n`/`p` keyboard shortcuts navigate hunks across the virtual list including across file boundaries (D-18).
- **D-08:** Word-level intra-line diff highlighting is **NOT in Phase 3**. Defer entirely to Phase 7 polish or v1.x. No stub DOM structure is pre-reserved — if Phase 7 ships word-diff, the renderer can add span wrapping then.
- **D-09:** Open Decision 1 resolution is validated by a **committed synthetic fixture**: a real mid-size PR (target 5-10 files, 30-50 hunks, mixed languages) is captured once via `gh pr diff` piped through the server Shiki pipeline; the captured `DiffModel` + `ShikiFileTokens` are committed as JSON under `web/src/__tests__/fixtures/`. Phase 3 ships a vitest test that mounts `DiffViewer` against this fixture, asserts unified + split modes render correctly, asserts hunk anchors resolve via opaque IDs (D-17 Phase 1), and asserts first paint completes within a planner-picked budget (500ms on a 50-hunk PR is a reasonable starting target).

### File tree + review status (DIFF-03)

- **D-10:** `FileExplorer`'s "Changed / Repo" toggle is **kept in the UI** but the "Repo" tab is rendered **disabled** (greyed, non-interactive) with a tooltip indicating Phase 7 polish. This preserves the committed design affordance while honoring Phase 3's scope — no full-repo-tree fetch or cache plumbing now. "Changed" tab is the only functional mode.
- **D-11:** Review-status state machine per file: `untouched → in-progress → reviewed`.
  - `untouched → in-progress`: auto-fires when a file's section enters the viewport by ≥50% for ≥500ms (IntersectionObserver). Threshold values are planner-tunable.
  - `in-progress → reviewed`: explicit only — via the `r` keyboard shortcut or a "Mark reviewed" button in the per-file header.
  - `reviewed → in-progress`: explicit — hitting `r` on a reviewed file toggles back to in-progress (never directly back to untouched).
  - Both transitions fire as SessionEvents through `sessionManager.applyEvent` so Phase-2's persistence + broadcast semantics apply.
- **D-12:** Review status is tracked **per file** for the file-tree indicator (DIFF-03 semantics). Per-hunk "reviewed" is Phase 5's walkthrough concern — the `r` key in Phase 3 marks the file containing the currently-focused hunk, not the hunk itself.

### Generated / lockfile handling (DIFF-04)

- **D-13:** Detection is a **hardcoded path-pattern allowlist** in `server/src/ingest/`. Initial list: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `poetry.lock`, `Gemfile.lock`, `composer.lock`, `Package.resolved`, `*.min.*`, `*.map`, `dist/**`, `build/**`, `node_modules/**`, `vendor/**`, `.next/**`, `.nuxt/**`, `coverage/**`, `__generated__/**`, `*.pb.go`. The list is extended when a genuine miss surfaces in daily use. No size-based heuristic; no user-override config file.
- **D-14:** `shared/types.ts` `DiffFile` gets a new boolean field: `generated: boolean`. Populated during `parse-diff` ingest before the `ReviewSession` snapshot is built. Travels through the SSE snapshot intact; no re-derivation client-side.
- **D-15:** UI behavior: generated-true files render in `FileExplorer` with a muted style (`--color-text-disabled` equivalent in the prototype palette) + an "Excluded" label; their section in the diff canvas renders **collapsed by default**, with an "Expand" affordance that expands inline. Expanding a generated file does NOT flip its `generated` flag — purely a UI toggle. The expand-toggle state persists across reload via a SessionEvent (D-27).
- **D-16:** LLM-side exclusion is **stateful only** in Phase 3 — no new MCP tools. The `generated: boolean` flag travels in the session snapshot and becomes available to every future LLM tool handler. Phase 4's summary tool, Phase 5's `list_files` / `get_hunk` tools, etc. will filter on this flag by default (with an explicit opt-in arg to include excluded). Phase 3's verification test proves the flag is set correctly on a fixture PR containing lockfiles — no LLM-facing call is made in Phase 3.

### Keyboard shortcuts (PLUG-04)

- **D-17:** **One global keydown listener** installed at the AppShell level in Phase 3. It captures `n`, `p`, `c`, `r`, `v`, `s`. The handler skips entirely if `document.activeElement` is an `input`, `textarea`, or `contenteditable` element.
- **D-18:** Key semantics:
  - `n` / `p`: next / previous hunk across the full **cross-file** virtual list. Scrolls the target hunk into view and applies a transient focus ring. At the last hunk of the last file `n` wraps to the first hunk (or no-ops — planner's choice; this is a MINOR UX preference).
  - `r`: marks the current file as reviewed (see D-11 for state machine). "Current file" = the file containing the currently-focused hunk (via `n`/`p` anchor), or the top-most visible file if no hunk is focused.
  - `c` / `v` / `s`: dispatch a transient toast/footer message naming the Phase where the shortcut will activate (`c` → "Available in Phase 5", `v` and `s` → "Available in Phase 6"). No other effect. This both teaches the user the shortcut exists and reserves the key so Phase 5/6 can wire handlers without a reshuffle.
- **D-19:** A `?` shortcut is NOT introduced in Phase 3 — keep the keydown surface tight. A minimal visible hint (e.g., footer text `"n / p · r"`) is acceptable if planner + visual design align; otherwise skip. Keyboard help overlay is a Phase 7 polish item.

### Existing PR comments (INGEST-03)

- **D-20:** Source: **`gh api`** via `execa`. Octokit stays deferred to Phase 6. At session start (inside `startReview`) call `gh api /repos/{owner}/{repo}/pulls/{n}/comments` (inline review comments) and `gh api /repos/{owner}/{repo}/pulls/{n}/reviews` (top-level review bodies). Normalize both into a single read-only anchor collection with fields `{path, line, side, author, created_at, body, thread_id}`. Pagination: use `gh api --paginate` or loop on the `Link` header — PRs with many prior reviewers paginate (Pitfall 22).
- **D-21:** Render: each anchor whose `{path, line, side}` resolves to a line in the current `DiffModel` mounts a **read-only marker variant** in the existing `thread-marker` DOM slot on that line (the prototype already has this slot for Phase-5 threads; Phase 3 reuses it). Clicking the marker opens a popover/expand showing comment body, author, timestamp. No reply affordance in Phase 3 (read-only). The read-only variant is visually distinct from Phase-5 active-thread markers — planner picks the distinction; muted grey is an obvious direction.
- **D-22:** Orphan comments (anchor does not resolve to a line in the current diff — e.g., force-push moved the line or it was removed): **hidden in Phase 3**. Server logs a count to stderr: `"Skipped N orphan comments"`. The "Orphan comments" sidebar panel is a Phase 7 polish item.
- **D-23:** Local-branch mode (no GitHub PR) has no existing comments to fetch. The ingest path skips the fetch entirely; no empty-state UI needed.

### CI check-run status (INGEST-04)

- **D-24:** Source: `gh pr checks <n> --json name,state,conclusion,detailsUrl` called at session start inside `startReview`. Parsed into `CIStatus: { aggregate: 'pass' | 'fail' | 'pending' | 'none', checks: CheckRun[] }`.
- **D-25:** Render: a **compact aggregate pill** on the `TopBar` (green = all pass, red = any fail, yellow = any pending with no failures, grey = none/local). Click-to-expand dropdown lists each check with name + conclusion icon + an external link to `detailsUrl` (renders as a native `<a href target="_blank">`; the CSP `connect-src 'self'` is unaffected by an `href`-only link). Failed-check inline log drill-down is deferred to Phase 7.
- **D-26:** **No polling** in Phase 3. One-shot fetch at session start. A user who wants fresh CI re-runs `/pair-review`. Periodic refresh is a Phase 7 polish item. Local-branch mode has no CI — ingest skips the fetch; planner chooses whether the pill hides entirely or renders as "none".

### Session event additions (Phase-2 reducer extensions)

- **D-27:** New `SessionEvent` variants required in `shared/types.ts`:
  - `{ type: 'file.reviewStatusSet', fileId: string, status: 'untouched' | 'in-progress' | 'reviewed' }` — fires on scroll-into-view, `r`-key, or "Mark reviewed" button click.
  - `{ type: 'file.generatedExpandToggled', fileId: string, expanded: boolean }` — UI-only toggle for the collapsed-generated-file expand affordance; persists across reload.
  - `{ type: 'existingComments.loaded', comments: ReadOnlyComment[] }` — fires once at session start after `gh api` completes.
  - `{ type: 'ciChecks.loaded', ciStatus: CIStatus }` — fires once at session start after `gh pr checks` completes.
- **D-28:** Each event extends the reducer (pure function per Phase 2 Plan 02-01 pattern) and inherits the persistence + SSE broadcast pipeline via the Phase-2 infrastructure. No changes to `applyEvent` itself beyond adding the new variants to the union.

### Claude's Discretion

The following are left to the planner to resolve without further user input:
- Exact number of files + hunks in the synthetic fixture PR (target: 5-10 files, 30-50 hunks, mixed languages).
- Exact viewport-intersection threshold for auto-in-progress transition (D-11) — 50%/500ms is a reasonable starting point.
- Exact render-budget threshold for the fixture-PR validation test (D-09) — 500ms first paint on a 50-hunk PR is reasonable.
- Wrap-around behavior for `n`/`p` at list boundaries (D-18) — wrap or no-op is a planner/user-preference choice.
- Keyboard hint visibility (D-19) — footer text or skipped entirely.
- Exact visual distinction between Phase-5-active thread markers and Phase-3 read-only existing-comment markers (D-21).
- Whether to hide the CI pill entirely in local-branch mode vs render 'none' (D-26).
- Disabled-state styling + tooltip copy for the "Repo" tab (D-10).
- Whether to repurpose any of the prototype's `data.ts` shapes as the jumping-off point for the committed synthetic fixture (D-09) or capture fresh from a real PR.
- Exact shape of the `ReadOnlyComment` + `CIStatus` + `CheckRun` types in `shared/types.ts`.
- Where the `n`/`p` "focused hunk" anchor lives — in session state (via SessionEvent) or client-local state. Probably client-local (transient visual focus), but planner confirms against Phase-2 discipline.

### Folded Todos

None. No pending backlog todos matched Phase 3 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level governance (must be updated at Phase-3 commit time)
- `.planning/PROJECT.md` §Key Decisions — **two new rows required:**
  (1) "Phase-1 `01-UI-SPEC.md` formally superseded by commit `c7fe93f`'s committed prototype; paper-and-teal light-mode design is authoritative for Phase 3+."
  (2) "Open Decision 1 resolves toward the bespoke `DiffViewer.tsx`; `@git-diff-view/react` removed from dependencies. Validated by the committed fixture-PR render test (D-09)."
- `.planning/REQUIREMENTS.md` §v1 Requirements — Phase 3 bar: `PLUG-04`, `INGEST-03`, `INGEST-04`, `DIFF-01`, `DIFF-02`, `DIFF-03`, `DIFF-04`.
- `.planning/ROADMAP.md` §"Phase 3: Diff UI + File Tree + Navigation" — six success criteria; criterion #6 (Open Decision 1 resolution) satisfied by D-05 + D-09 above.
- `.planning/STATE.md` — current position + accumulated Phase 1/2 decisions.

### Phase 1 artifacts (referenced; one SUPERSEDED)
- `.planning/phases/01-plugin-skeleton-secure-vertical-slice/01-CONTEXT.md` — Locks still load-bearing for Phase 3: D-01 (SSE + POST transport), D-04 (atomic JSON persistence), D-07..D-13 (security model + CSP), D-15 (gh CLI as GitHub path — Phase 3 extends with `gh api` and `gh pr checks`), D-17 (opaque-ID `DiffModel` shape — `DiffViewer` must honor), D-22 (Shiki tokens in SSE snapshot — `DiffViewer` must consume).
- `.planning/phases/01-plugin-skeleton-secure-vertical-slice/01-UI-SPEC.md` — **SUPERSEDED by the committed prototype** per D-01 above. Planner may read for historical context but must NOT treat its `@theme` block, dark-mode palette, system-font stacks, or `@git-diff-view/react` recommendation as authoritative.

### Phase 2 artifacts (load-bearing — Phase 3 extends the reducer)
- `.planning/phases/02-persistent-session-store-resume/02-01-PLAN.md`, `02-02-PLAN.md`, `02-03-PLAN.md`, `02-04-PLAN.md` — Event-sourced reducer pattern, `applyEvent` ownership of `lastEventId`, per-`prKey` Promise-chain queue, SSE subscribe-before-snapshot + buffer-and-flush, crash-safety tests. Every SessionEvent in D-27 must extend that reducer using this pattern; no direct mutations to `reducer.ts` internals; `reducer.ts` never touches `lastEventId`.
- `shared/types.ts` — `DiffModel`, `DiffFile`, `Hunk`, `DiffLine`, `ShikiFileTokens`, `ReviewSession`, `SessionEvent` union, `SnapshotMessage`, `UpdateMessage`. Phase 3 extensions (D-14 `generated` field, D-27 four new `SessionEvent` variants, plus `ReadOnlyComment` / `CIStatus` / `CheckRun` types) go here.

### Pitfalls research (BLOCKERS + SERIOUS relevant to Phase 3)
- `.planning/research/PITFALLS.md` §"Pitfall 5 — Context window exhaustion on large PRs" (BLOCKER) — D-14's `generated: boolean` flag is part of the solution. Phase 3 must leave the flag in a usable state so Phase 4/5 tools filter generated files by default.
- `.planning/research/PITFALLS.md` §"Pitfall 12 — Comments on unchanged/context lines" — existing comments (INGEST-03) CAN legitimately anchor on context lines (unlike Phase-5 new comments). The read-only marker variant renders on any line the comment anchor resolves to, including context lines.
- `.planning/research/PITFALLS.md` §"Pitfall 15 — Tool schema surface too large" — D-16's "no new MCP tools in Phase 3" directly honors this. Tool budget (≤10 across all phases) preserved.
- `.planning/research/PITFALLS.md` §"Pitfall 22 — Rate limits on large PRs (pagination)" — directly relevant to D-20: `gh api /repos/{owner}/{repo}/pulls/{n}/comments` paginates on PRs with many prior reviewers; use `--paginate` or loop on the `Link` header.
- `.planning/research/PITFALLS.md` §"Pitfall 23 — Bikeshedding the UI" — explicit warning against Phase 3 scope sprawl. Word-diff (D-08), polling CI (D-26), orphan panel (D-22), full-repo-tree (D-10) are all deliberate deferrals.

### External specs
- [`gh api` manual](https://cli.github.com/manual/gh_api) — auth + pagination for `/pulls/{n}/comments` and `/pulls/{n}/reviews`.
- [`gh pr checks` manual](https://cli.github.com/manual/gh_pr_checks) — `--json` field names for `name,state,conclusion,detailsUrl`.
- [GitHub Pull Request Review Comments API](https://docs.github.com/en/rest/pulls/comments) — payload shape (`path`, `line`, `side`, `original_line`, `user`, `body`, `in_reply_to_id`, resolved thread semantics) — needed to normalize into the read-only anchor shape in D-20.
- [Tailwind v4 `@theme` docs](https://tailwindcss.com/docs/theme) — for any optional token-system refactor the planner does while keeping the prototype palette authoritative (D-04).
- [IntersectionObserver API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API) — the D-11 auto-in-progress transition uses this.

### Committed prototype code (Phase 3 is a live-wire of these + additions)
- `web/src/App.tsx` — current 3-column layout assembled from fixtures; Phase 3 rewires to a 2-column layout (D-02) reading from the store.
- `web/src/components/DiffViewer.tsx` — bespoke renderer; Phase 3 swaps fixture `DiffModelFixture` for live `DiffModel` + `ShikiFileTokens` (D-06) and generalizes from single-file to multi-file (D-07).
- `web/src/components/FileExplorer.tsx` — kept; live-wired to store; Repo tab disabled per D-10.
- `web/src/components/TopBar.tsx` — kept; extended with CI status pill per D-25.
- `web/src/components/ChatPanel.tsx`, `web/src/components/InlineThread.tsx`, `web/src/components/StageStepper.tsx` (within `TopBar.tsx`) — **not mounted** in Phase 3 per D-02. Leave on disk.
- `web/src/components/StaleDiffModal.tsx` — Phase-2 deliverable; stays wired as-is. Planner harmonizes its styling with the prototype palette if needed; no functional change.
- `web/src/components/TweaksPanel.tsx` — **deleted** per D-03.
- `web/src/components/DiffView.spike.tsx` + `web/src/__tests__/diff-view-spike.test.tsx` — **deleted** per D-05.
- `web/src/utils/highlight.ts` — **deleted** per D-06.
- `web/src/data.ts` — **deleted** from production imports. Portions may be adapted into the synthetic test fixture per D-09 at planner discretion.
- `web/src/store.ts`, `web/src/api.ts` — kept; extended for the new SessionEvents per D-27 (actions for existing comments, CI checks, review status, generated-file expand toggle) + client-POST wrappers for user-triggered events.
- `web/src/main.tsx` — kept; drop the `@git-diff-view/react` CSS import per D-05.
- `web/src/index.css` — authoritative token set per D-04.

</canonical_refs>

<code_context>
## Existing Code Insights

Phase 3 is substantially a live-wiring + refactor exercise rather than greenfield. The committed prototype provides most of the visual structure; what's missing is the connection to live Phase-2 state and the handful of new features (generated-file flag, review status, existing comments, CI checks, keyboard shortcuts).

### Reusable Assets
- **Bespoke `DiffViewer` (`web/src/components/DiffViewer.tsx`)**: Already implements unified + split hunks, thread-marker gutter slots (reusable for read-only existing-comment markers per D-21), per-file "Mark reviewed" button slot, unified/split toggle. Missing: multi-file support, Shiki-token consumption, live-data binding. All additions extend the existing structure; no rewrite needed.
- **`FileExplorer` (`web/src/components/FileExplorer.tsx`)**: Already implements per-file status icons (`'pending'` / `'threads'` / `'reviewed'`), +/− counts, Changed/Repo filter toggle, nested folder rendering. Phase 3 remaps status values to the D-11 state machine (`untouched` / `in-progress` / `reviewed`), disables the Repo tab (D-10), and adds a muted `excluded` visual variant for generated files (D-15).
- **Prototype token system (`web/src/index.css`)**: Complete paper-and-teal palette, add/rem/warn/block/ok status colors, font stacks (Inter Tight + JetBrains Mono), radius tokens. Authoritative per D-04.
- **Icon set (`web/src/components/icons.tsx`)**: Lucide-wrapped `Ic.*` helpers. Sufficient for CI status icons + existing-comment markers without new icon additions.
- **Phase-2 reducer + `SessionEvent` + `applyEvent` plumbing**: Each D-27 event extends the existing pattern; zero infrastructure work needed beyond the new union branches.
- **Server-side Shiki pipeline (`server/src/highlight/`)**: Already produces `ShikiFileTokens` and ships them in the SSE snapshot. Phase 3 consumes them client-side (D-06).
- **Existing ingest flow (`server/src/ingest/`)**: `gh pr view` + `gh pr diff` + `parse-diff`. Phase 3 extends with `gh api /pulls/{n}/comments`, `gh api /pulls/{n}/reviews`, `gh pr checks --json`.
- **StaleDiffModal (Phase 2)**: stays wired; Phase 3 doesn't change its behavior.

### Established Patterns
- **Server → SessionEvent → reducer → persist + SSE broadcast → store → React**. Phase 3 must keep every state mutation on this path. No client-local state for review status, generated-file expand-toggles, or existing-comment loads — everything is a SessionEvent that goes through `sessionManager.applyEvent`.
- **`dangerouslySetInnerHTML` is used for diff content** (`web/src/components/DiffViewer.tsx:138`). Input must only ever come from server-produced Shiki tokens, never from user-provided text. Phase 3's refactor to consume `state.shikiTokens` preserves this invariant.
- **Stderr-only logging in the MCP server process** — stdout corrupts the JSON-RPC channel (Phase-1 anti-pattern AP2). Phase 3 additions (orphan-comment skip count, CI fetch errors, gh api pagination progress) log to stderr.
- **Opaque IDs on hunks and lines** (`shared/types.ts`: `DiffFile.id = sha1(path).slice(0,12)`; `Hunk.id = \`${fileId}:h${index}\``; `DiffLine.id = \`${fileId}:h${hunkIdx}:l${lineIdx}\``). Phase 3's existing-comment anchors resolve to these IDs server-side when possible; UI-level scrolling and marker mounts use these IDs.
- **Vitest for unit + integration tests**: `test/` folder structure + `vitest.config.ts` carried from Phase 1/2.
- **CSS token strategy**: prototype uses `:root` CSS variables, not Tailwind's `@theme` block. Tailwind v4 is imported (`web/src/index.css:3`) for utility classes consumed by `StaleDiffModal` and any overlays; the two coexist.
- **`applyEvent` owns `lastEventId`** (Phase 2 Plan 03) — `reducer.ts` never touches it. This invariant is grep-enforced and remains so.

### Integration Points
- **`web/src/store.ts` actions object**: Phase 3 adds `onFileReviewStatusChanged`, `onGeneratedFileToggle`, `onExistingCommentsLoaded`, `onCIChecksLoaded` handlers that reflect the new SessionEvent update messages into app state.
- **`web/src/api.ts`**: Phase 3 adds client POST wrappers for the two user-triggered events (file-status change via scroll/click, generated-file expand-toggle). Existing-comment and CI-status loads fire server-side during ingest — no client POST needed.
- **`server/src/session/`**: New SessionEvent variants + reducer branches.
- **`server/src/ingest/`**: New `gh api` + `gh pr checks` calls + response parsing + generated-file detection (D-13).
- **`server/src/http/`**: No new HTTP endpoints required — the Phase-2 POST-event endpoint accepts new SessionEvent shapes automatically via the typed union.
- **`web/src/main.tsx`**: Drop the `@git-diff-view/react` CSS import per D-05.
- **Phase-3 test fixture at `web/src/__tests__/fixtures/`**: new directory; committed JSON fixture drives the Open Decision 1 resolution validation (D-09).

</code_context>

<specifics>
## Specific Ideas

- **Committed design divergence is load-bearing.** Commit `c7fe93f` was not a toy spike — its 3-column layout, paper-and-teal palette, and prototype components are the target direction per user decision. Planner must treat the UI-SPEC supersession (D-01) as a first-order fact and record it in PROJECT.md Key Decisions at Phase-3 commit. Without that record, future phases will re-surface the discrepancy.
- **Resolve Open Decision 1 formally.** The ROADMAP's instruction that Phase-3 planning must resolve this is satisfied by all three of: (a) the decision itself — bespoke renderer wins (D-05), (b) the committed synthetic fixture + vitest render test (D-09), (c) a new PROJECT.md Key Decision row added at Phase-3 commit. All three must exist before execution starts.
- **"LLM excluded from seeing generated files" is a promise about FUTURE MCP tools, kept by a Phase-3 state-level flag.** DIFF-04's requirement — "User can confirm via state inspection that these paths are excluded from the LLM's diff context" — is verifiable at Phase-3 time by inspecting `DiffFile.generated` on the fixture PR; no LLM-facing call is needed. Planner should include an explicit verification step that reads the fixture snapshot and asserts the expected files are flagged.
- **Scope fidelity.** Every decision above that said "defer to Phase 7 polish" (word-diff, Repo tree, orphan-comment panel, CI polling, keyboard help overlay, failed-check log drill-down) is a binding deferral, not a soft preference. Planner should call Phase 7 deferrals out explicitly in the "Deferred" section of each PLAN artifact so they stay visible at phase transitions.
- **The committed prototype's own tech-debt is the planner's problem, not CONTEXT's.** Issues like `data.ts`'s `DiffModelFixture` shape differing from `shared/types` `DiffModel`, hand-rolled CSS coexisting with Tailwind v4 utilities, the `highlight()` regex covering only TypeScript-ish syntax — all are for the planner to address within Phase 3 scope. Planner may normalize/simplify during live-wiring but should not rewrite the prototype from scratch.
- **DIFF-02 split mode on narrow viewports** — the prototype's `SplitHunk` renders two columns side-by-side. On narrow viewports (<1024px), planner should decide whether split collapses to unified automatically or force-scrolls horizontally. This is a MINOR UX polish choice; flag for the UI-checker pass if one runs.
- **INGEST-03 + resolved-thread semantics.** GitHub's review API exposes `resolved_at` / resolved-thread state per comment thread. Phase 3 can either (a) render resolved threads identically to unresolved (simpler), or (b) apply a visually-muted variant to resolved threads. Planner picks — this is below the gray-area threshold for the user.

</specifics>

<deferred>
## Deferred Ideas

Ideas surfaced during discussion that belong in other phases or versions:

- **Orphan-comments sidebar panel** — existing PR comments whose anchors don't resolve to lines in the current diff. Phase 3 hides them with a stderr count log (D-22). Phase 7 adds a collapsible panel listing them with per-comment "jump to file" affordances.
- **Repo-mode file tree** — full repository tree (not just changed files), with unchanged files greyed for cross-reference. Toggle UI ships in Phase 3 but the tab is disabled (D-10). Phase 7 implements the tab's actual content.
- **Word-level intra-line diff highlighting** — deferred entirely to Phase 7 polish or v1.x (D-08).
- **Polling CI check refresh** — Phase 3 is one-shot at session start (D-26). Phase 7 adds a periodic refresh poll if real-use friction demands it.
- **Failed-check inline log drill-down** — Phase 3's CI dropdown links out via `detailsUrl` (D-25). Phase 7 could surface logs inline if daily use shows the context-switch is painful.
- **Keyboard help overlay (`?` key or visible hint)** — Phase 3 keeps the keydown surface tight (D-19). Phase 7 adds a help affordance if friction surfaces.
- **Octokit adoption** — stays at Phase 6 (D-20). Phase 3 uses `gh api` for the two new endpoints.
- **Dev-ergonomics `TweaksPanel`** — deleted in Phase 3 (D-03). Not carried forward.
- **Per-repo `.pair-review.json` config for generated-file patterns** — tracked as v2 territory per PROJECT.md Out-of-Scope (`CHECK-V2-01` precedent for per-repo override files). Not surfaced again.
- **Authenticated GitHub user identity display in UI chrome** — `PLUG-V2-01`; Phase 7 per roadmap.
- **Resolved-thread-variant styling for read-only existing comments** — a minor UX polish left at planner discretion (above under "Specific Ideas"); not a user decision.

### Reviewed Todos (not folded)

None.

</deferred>

---

*Phase: 03-diff-ui-file-tree-navigation*
*Context gathered: 2026-04-19*
