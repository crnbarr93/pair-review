# Phase 6: Review Submission + Verdict UI — Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

The terminal step. Phase 6 turns the Phase-5 "walkthrough + threaded comments" workspace into a complete review-authoring tool that posts to GitHub. The user picks a verdict (Approve / Request changes / Comment), reviews an LLM-drafted summary body and the list of drafted inline comments in a submit modal, sees a signal-ratio check discouraging nit floods, and submits a full GitHub review — verdict + summary body + all inline comments — in a single atomic `pulls.createReview` call. Pre-existing pending reviews on the PR are detected at session start and either adopted or cleared (never silently duplicated). In local-branch mode, `Submit` exports the review to a user-specified markdown file on disk instead.

**Explicitly in scope:**
- One new MCP tool: `submit_review` — cumulative toolbelt 10/10 after Phase 6.
- New `ReviewSession` fields: `submissionState`, `pendingReview`.
- New `SessionEvent` variants for submission state changes and pending-review handling.
- Submit modal UI: verdict picker, editable review body, signal-ratio stats, drafted threads list, early-submit gate.
- Verdict picker in TopBar (replacing existing stubs) + submit modal on click.
- Octokit dependency for the `pulls.createReview` API call.
- Pending-review detection at session start with adopt/clear choice.
- Local-branch markdown export path.
- Activating the "Submit" step in StageStepper (disabled since Phase 4 D-10).
- `v`/`s` keyboard shortcuts wired (currently Phase-6 toast stubs from Phase 3 D-18).
- Integration test that posts a review to a fixture PR and reads each comment back to assert correct line placement.

**Explicitly NOT in scope (per ROADMAP / REQUIREMENTS boundaries):**
- Multi-session switcher, concurrency (Phase 7, SESS-04).
- Authenticated-user display (Phase 7, PLUG-V2-01).
- Slack/team notifications from the submit modal (v2 — see design.html deferred).
- "Request re-review when addressed" workflow (v2 — see design.html deferred).
- Tone/length controls on review body ("Tone: constructive", "Shorten") (v2 — see design.html deferred).
- "Summarize threads" auto-generation button (v2 — see design.html deferred).
- Multi-line comment ranges (v2, DIFF-V2-01).
- Suggested-edit code blocks (v2, DIFF-V2-03).
- Any Anthropic API call from the plugin process.

</domain>

<decisions>
## Implementation Decisions

### Verdict + submit UX

- **D-01:** **Submit flow uses a modal dialog.** Verdict picker stays in TopBar (replacing existing `onApprove`/`onRequestChanges` stubs). Clicking Submit opens a confirmation modal showing: verdict picker, editable review summary body, signal-ratio stats, and list of all drafted inline comments. The modal is the user's final review-before-posting surface.
- **D-02:** **Signal-ratio warning is inline in the submit modal.** Stats (blocker/major/minor/nit counts) always display. When nit-heavy (>3 nits or signal ratio <40%), stats turn `--warn`-colored and the Submit button changes to "Submit anyway" — requiring an extra deliberate click. No hard gate — visual friction only. Per SUB-02.
- **D-03:** **Incomplete walkthrough requires verdict retype to submit early.** Per ROADMAP success criterion 5: if the walkthrough isn't complete (e.g., 3/8 steps visited), the submit modal shows a warning ("Walkthrough incomplete — 3/8 steps") and the user must type the verdict word (e.g., "request changes") to enable the Submit button. High-friction confirmation matching Pitfall 20 mitigation.
- **D-04:** **Review summary body is LLM-drafted via the `submit_review` MCP tool, user-editable in the modal.** The LLM calls `submit_review` with a `body` field containing its drafted review summary. The draft appears in the modal as an editable textarea. User can revise before confirming. Markdown supported. The design.html shows a "Draft with Claude" affordance for re-drafting.
- **D-05:** **Two-step submit flow: LLM proposes, user confirms.** The LLM calls `submit_review({ verdict, body })` which puts the review in a `pending_confirmation` state. SSE pushes this to the browser, opening the submit modal. User reviews/edits the body and verdict in the modal, then clicks Confirm. Browser POSTs to `/api/confirm-submit`. Server then does the actual Octokit call with the user's final edits. This ensures human-in-the-loop on every posted review.
- **D-06:** **Design reference is `design.html` at project root** (click "Submit review" to see the modal). Key visual elements from the design: stats strip across the top (stages completed, blockers, warnings, open, resolved), three horizontal verdict cards (Approve green, Request changes with blocker badge, Comment only), editable textarea for review body, threads-to-post list with severity badges.

### GitHub submission mechanics

- **D-07:** **Octokit for the `pulls.createReview` API call.** Add `octokit` as a server dependency. Auth via `gh auth token` (same `execa` call used by existing ingest). Single atomic `octokit.rest.pulls.createReview({ owner, repo, pull_number, event, body, comments[] })`. Per CLAUDE.md stack decision. `gh` CLI continues to handle all ingest; Octokit is only for submission.
- **D-08:** **Pending-review detection with adopt-or-clear choice at session start.** On session start (or resume) for GitHub PRs, query `GET /repos/{o}/{r}/pulls/{n}/reviews` filtered by `state: PENDING` and authenticated user. If found: UI modal offers "Adopt" (import pending comments into session threads), "Clear" (DELETE the pending review), or "Cancel". Never silently create a second pending review. Per SUB-03 and Pitfall 10.
- **D-09:** **Single `Anchor` adapter for coordinate mapping — `line` + `side` only, never `position`.** One internal type `{ path, line, side }` derived from each thread's resolved `(path, line, side)` triplet (already stored on `Thread` from Phase 5). One adapter function maps `Anchor` → Octokit comment payload. An integration test posts a review comment to a fixture PR and reads it back to assert the comment lands on the expected line. Per Pitfall 1.
- **D-10:** **Session state gate for idempotency.** `ReviewSession` gains a `submissionState` field tracking: `not_yet` → `submitting` → `submitted | failed`. A `submissionId` (nanoid) is generated when the user clicks Confirm, persisted in session state, and embedded as an HTML comment (`<!-- submission_id: abc123 -->`) in the review body. Submit button refuses to fire if state is `submitted`. On resume, if `submitted`, show the posted review URL. Prevents duplicate submissions per Pitfall 10.

### Local-branch export

- **D-11:** **GitHub-style structured markdown export** for local-branch reviews. Format includes: verdict header, base→head refs, date, review summary body, then each inline comment as a section with `### file:line (side)` heading and comment body. Readable in any markdown viewer.
- **D-12:** **Export path is user-specified.** The `submit_review` MCP tool accepts an `exportPath` field (required for local mode). The LLM asks the user where to save or proposes a default. The export file is written to the specified path.

### MCP tool surface for Phase 6

- **D-13:** **One tool: `submit_review` — handles both GitHub submission and local export.** Server detects GitHub vs local from the session's `prKey` prefix (`gh:` vs `local:`). GitHub path: two-step confirm flow → Octokit `createReview`. Local path: write markdown export to `exportPath`. Same tool, two code paths. Cumulative toolbelt: **10/10** (Phase 1: 1, Phase 4: 4, Phase 5: 4, Phase 6: 1). Matches Pitfall 15 budget.
- **D-14:** **`submit_review` input schema:** `{ body: string, verdict: Verdict, exportPath?: string }`. `body` is the LLM-drafted review summary. `verdict` is one of `'approve' | 'request_changes' | 'comment'`. `exportPath` is required when `prKey` starts with `local:`, ignored for GitHub PRs. The tool validates that threads with `draftBody` exist before proceeding (no empty reviews).
- **D-15:** **`submit_review` return:** For GitHub: `{ content: [{ type: 'text', text: 'Review submitted: <url>' }] }` after user confirms and Octokit call succeeds. For local: `{ content: [{ type: 'text', text: 'Review exported to <path>' }] }`. On pending confirmation (waiting for user in modal): returns a message indicating the review is awaiting user confirmation.

### Reducer extensions (Phase-2 event-sourcing pattern)

- **D-16:** New `SessionEvent` variants for Phase 6:
  - `submission.proposed` — fires when `submit_review` lands; stores the LLM's proposed verdict + body in `pendingSubmission`. Browser opens the submit modal.
  - `submission.confirmed` — fires when user confirms in the modal (POST `/api/confirm-submit`). Transitions `submissionState` to `submitting`.
  - `submission.completed` — fires after successful Octokit call or markdown export. Stores `reviewId`, `url`, `submissionId`. Transitions to `submitted`.
  - `submission.failed` — fires on Octokit error. Stores error message. Transitions to `failed`.
  - `pendingReview.detected` — fires when a pending review is found at session start.
  - `pendingReview.resolved` — fires when user adopts or clears the pending review.
  - All events follow the Phase 2 reducer/applyEvent/SSE pattern. `lastEventId` ownership remains with `applyEvent`.
- **D-17:** `ReviewSession` gains new fields (all optional for backward compat):
  - `submissionState?: SubmissionState` — tracks `not_yet | submitting | submitted | failed` with associated metadata.
  - `pendingSubmission?: { verdict: Verdict; body: string }` — the LLM's proposed review, shown in the modal for user editing.
  - `pendingReview?: { reviewId: number; createdAt: string; commentCount: number }` — detected pending review from GitHub.

### Claude's Discretion

The planner resolves the following without further user input:
- Exact submit modal component structure (single component vs decomposed).
- Exact styling of verdict cards (colors, selected states, badge positioning).
- Exact stats strip layout and which counts to show.
- Whether the "Draft with Claude" button re-invokes the MCP tool or is a UI-only affordance.
- How adopted pending review comments map into session threads (exact field mapping).
- Exact `submissionId` format (nanoid length, embedding pattern in review body).
- Whether `v` keyboard shortcut opens the verdict picker dropdown or cycles through verdicts.
- Whether `s` keyboard shortcut opens the submit modal directly.
- Exact wording of the incomplete-walkthrough warning and retype prompt.
- How the confirm-submit POST endpoint validates the user's edits (body length limits, verdict validation).
- Whether the threads-to-post list in the modal is read-only or allows deselecting individual threads.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level governance
- `.planning/PROJECT.md` — Core Value ("walkthrough → inline-comments → posted-review loop"); constraint "LLM driver is the user's active Claude Code session; plugin does not make its own LLM API calls"; Key Decisions table.
- `.planning/REQUIREMENTS.md` — Phase 6 requirements: **SUB-01** (atomic createReview), **SUB-02** (signal-ratio check), **SUB-03** (pending-review detection), **SUB-04** (local-branch export).
- `.planning/ROADMAP.md` §"Phase 6: Review Submission + Verdict UI" — five success criteria. Criterion 1 is the integration test. Criterion 5 is the early-submit retype gate.
- `.planning/STATE.md` — current progress; accumulated decisions through Phase 5.

### Design reference
- `design.html` at project root — **click "Submit review" button to see the submit modal mockup.** Authoritative for visual direction: verdict cards, stats strip, editable review body, threads list. Some elements are v2 (Slack notifications, re-review checkbox, tone controls) — see deferred section.

### Phase 1 artifacts (load-bearing — transport + security)
- `.planning/phases/01-plugin-skeleton-secure-vertical-slice/01-CONTEXT.md` — D-01 (SSE + HTTP POST transport), D-07..D-12 (security — CSP + token + Host check apply to the new `/api/confirm-submit` POST endpoint), D-17 (opaque-ID rail).
- `server/src/http/middleware/token-validate.ts` — token validation middleware. The new `/api/confirm-submit` endpoint must use this.

### Phase 2 artifacts (load-bearing — reducer/persistence)
- `.planning/phases/02-persistent-session-store-resume/02-01-PLAN.md` — pure reducer pattern, `SessionEvent` union discipline.
- `server/src/session/reducer.ts` — Phase 6 adds new case branches for submission events.
- `server/src/session/manager.ts` — `applyEvent`; no changes to the method itself.
- `shared/types.ts` — Phase 6 extends `SessionEvent` union and `ReviewSession` fields.

### Phase 4 artifacts (load-bearing — self-review findings for signal-ratio)
- `.planning/phases/04-llm-summary-checklist-self-review/04-CONTEXT.md` — D-03 (nit cap, severity enum), D-05 (default verdict = request_changes).
- `shared/types.ts` — `Verdict` type already exists. `SelfReview.findings` provides severity counts for the signal-ratio check.

### Phase 5 artifacts (load-bearing — threads with draftBody)
- `.planning/phases/05-walkthrough-inline-threaded-comments/05-CONTEXT.md` — D-09 (draft_comment produces draftBody), D-13 (opaque IDs on threads).
- `shared/types.ts` — `Thread.draftBody` is the text that becomes each GitHub inline comment. `Thread.path`, `Thread.line`, `Thread.side` are the resolved coordinates for the Anchor adapter.

### Pitfalls research (BLOCKERS + SERIOUS relevant to Phase 6)
- `.planning/research/PITFALLS.md` §"Pitfall 1 — GitHub review-comment positioning" **(BLOCKER)** — closed by D-09 (Anchor adapter using `line` + `side`, never `position`). Integration test required.
- `.planning/research/PITFALLS.md` §"Pitfall 3 — Nitpick flood" — extended by D-02 (pre-submit signal-ratio warning in submit modal). Phase 4 D-03 schema nit cap is the first line of defense.
- `.planning/research/PITFALLS.md` §"Pitfall 10 — Submitting duplicate reviews on resume" — closed by D-08 (pending-review detection + adopt/clear) and D-10 (session state gate + submissionId).
- `.planning/research/PITFALLS.md` §"Pitfall 20 — Verdict forced before user has walked enough" — closed by D-03 (retype verdict to submit early when walkthrough incomplete).

### GitHub API reference
- [GitHub REST: Create a review](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request) — `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` with `event`, `body`, `comments[]` fields. Comments use `line` + `side` (not `position`).
- [Octokit `pulls.createReview`](https://octokit.github.io/rest.js/v21/) — the SDK method wrapping the REST endpoint.

</canonical_refs>

<code_context>
## Existing Code Insights

Phase 6 is an additive feature layer on top of Phase 5's stable walkthrough + thread scaffold. The submission system is a new state surface; the existing UI gets a submit modal and the TopBar stubs get wired.

### Reusable Assets
- **`mcp.registerTool` pattern** (`server/src/mcp/tools/start-review.ts`, `run-self-review.ts`, etc.) — `submit_review` follows this shape.
- **Phase 2 reducer/applyEvent/SSE pipeline** — submission events inherit serialization, persistence, and broadcast.
- **`Thread.draftBody` + `Thread.path/line/side`** — already populated by Phase 5's `draft_comment` tool. The Anchor adapter reads these directly.
- **`SelfReview.findings`** with severity enum — provides counts for the signal-ratio calculation.
- **`Verdict` type** in `shared/types.ts` — already defined (`'request_changes' | 'comment' | 'approve'`).
- **TopBar stubs** — `onApprove`, `onRequestChanges` callback props, "Submit" step in StageStepper (disabled), `v`/`s` keyboard shortcut toast stubs in `App.tsx`.
- **`gh auth token`** pattern in `server/src/ingest/github.ts` — reusable for Octokit auth.
- **CSS token palette** (`--paper`, `--claude`, `--ok`, `--warn`, `--block`) — covers verdict card colors, signal-ratio warning styling.
- **Security middleware** (`server/src/http/middleware/token-validate.ts`) — applies to the new `/api/confirm-submit` endpoint.

### Established Patterns
- **Atomic MCP tools that produce SessionEvents** — `submit_review` follows `run_self_review`'s shape.
- **Two-step confirmation pattern** — new for Phase 6 but analogous to Phase 2's stale-diff modal flow (server proposes via event, browser shows modal, user confirms via POST, server acts).
- **Stderr-only logging** in the MCP process.
- **Opaque IDs** on every LLM-facing surface.
- **SessionEvent plain-JSON discipline** — no Date, no functions.

### Integration Points
- **`server/src/mcp/server.ts`**: add `registerSubmitReview()` import.
- **`server/src/mcp/tools/submit-review.ts`**: new module.
- **`server/src/submit/`**: new directory for Octokit adapter, Anchor mapping, markdown export, pending-review detection.
- **`server/src/session/reducer.ts`**: new case branches for submission/pending-review events.
- **`shared/types.ts`**: new `SubmissionState` type, new `SessionEvent` variants, new `ReviewSession` fields.
- **`web/src/store.ts`**: new store actions for submission state updates.
- **`web/src/components/SubmitModal.tsx`**: new component (submit modal).
- **`web/src/components/TopBar.tsx`**: wire verdict picker and Submit button to open modal.
- **`web/src/App.tsx`**: wire `v`/`s` shortcuts, mount SubmitModal.
- **`server/src/http/routes/`**: new `/api/confirm-submit` POST endpoint.
- **`server/package.json`**: add `octokit` dependency.

</code_context>

<specifics>
## Specific Ideas

- **The two-step submit flow is load-bearing for the Core Value.** The LLM proposes a review, but the user always has the final say on every word that gets posted. The modal is the human-in-the-loop surface. This matches "a competent co-reviewer sitting next to you" — the co-reviewer drafts, you approve and edit.
- **The Anchor adapter is the single most error-prone piece in Phase 6.** Per Pitfall 1, `position` vs `line`/`side` confusion is the #1 cause of review comments landing on the wrong line. The adapter must use `line` + `side` exclusively. The integration test is non-negotiable — it posts a comment and reads it back to verify placement.
- **Pending-review detection happens at session start, not at submit time.** Discovering a stale pending review at the moment the user clicks Submit is a terrible UX. Detection runs during `start_review` (or resume), surfacing the choice immediately so the user can adopt or clear before investing time in the review.
- **Signal-ratio is derived from `selfReview.findings`, not from thread count.** The Phase 4 self-review already has severity-tagged findings with counts. The signal ratio = (blocker + major) / total findings. Thread drafts that don't originate from self-review findings don't factor in — they're user-initiated commentary.
- **The design.html submit modal is the visual reference.** The three verdict cards (Approve green, Request changes with badge, Comment only), the stats strip, the editable textarea with "Draft with Claude", and the threads list with severity badges are the target. Some elements (Slack notifications, re-review checkbox, tone controls, "Summarize threads") are v2 polish — note as deferred.
- **`submit_review` is the 10th and final tool in the v1 toolbelt.** Pitfall 15 caps at ~10 tools. Phase 7 should not add tools — only polish existing ones.

</specifics>

<deferred>
## Deferred Ideas

- **Slack/team notifications from the submit modal** — design.html shows a "Notify #platform-team" checkbox. This requires Slack integration; deferred to v2.
- **"Request re-review when addressed" checkbox** — design.html shows this option. Requires tracking re-review workflows; deferred to v2.
- **Tone/length controls** ("Tone: constructive", "Shorten") — design.html shows these below the review body textarea. These are LLM-driven refinement affordances; deferred to v2.
- **"Summarize threads" auto-generation** — design.html shows this button. Would invoke the LLM to auto-compose the review body from thread summaries. Deferred to v2; the LLM already drafts via `submit_review({ body })`.
- **"Include inline threads" toggle** — design.html shows a checkbox to include/exclude inline threads from posting. For v1, all threads with `draftBody` are posted. Selective exclusion deferred to v2.
- **Thread deselection in the submit modal** — ability to uncheck individual threads before posting. Deferred to v2 (planner may include if trivial).
- **`CHECK-V2-01` repo-level checklist override** — carries forward from Phase 4 deferred.
- **Multi-line comment ranges (DIFF-V2-01)** — carries forward.
- **Suggested-edit code blocks (DIFF-V2-03)** — carries forward.
- **GraphQL `addPullRequestReview` mutation path** — Octokit REST is sufficient for v1. GraphQL path deferred unless REST proves insufficient.

</deferred>

---

*Phase: 06-review-submission-verdict-ui*
*Context gathered: 2026-04-22*
