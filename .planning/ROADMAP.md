# Roadmap: Git Review Plugin

## Overview

The journey: a Claude Code plugin that pairs the user with an LLM to review pull requests through a rich local web GUI, ending in a posted GitHub review of real reviewer quality. Seven phases take the tool from "plugin boots and paints a diff" through "persistent state across sessions" → "proper diff UI the user wants to read" → "LLM summary and self-review scaffolding" → "the core walkthrough and threaded inline comment loop" → "atomic review submission to GitHub" → "polish and concurrency" once daily use surfaces gaps.

The architecture gravity well is the single-Node-process model (MCP stdio server + embedded HTTP/push server sharing one in-memory session reducer). Persistence, security, and the opaque-ID MCP schema are paid for in the earliest phases they apply to — not retrofitted — because every one of them is a BLOCKER-severity pitfall per research.

Three Open Decisions from research must be resolved during planning (not treated as phases unto themselves):
- **Phase 1 planning:** real-time transport (WebSocket vs SSE + HTTP POST) and persistence format (`better-sqlite3` vs atomic JSON).
- **Phase 3 planning:** diff viewer library (`@git-diff-view/react` vs fallbacks), validated on a real fixture PR.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Plugin Skeleton + Secure Vertical Slice** - Plugin boots, MCP + HTTP server run in one process, `/pair-review` fetches a PR (or local branch diff), browser opens to a basic diff view. Security (127.0.0.1 + token + Host + CSP) ships from day one. Transport and persistence format decisions resolved in planning. (completed 2026-04-16)
- [x] **Phase 2: Persistent Session Store + Resume** - Event-sourced reducer with atomic persistence, `/pair-review` on the same PR resumes walkthrough cursor and drafted comments, head-SHA-gated stale-diff detection surfaces a choice when the PR has moved, state survives crashes without corruption. (completed 2026-04-19)
- [x] **Phase 3: Diff UI + File Tree + Navigation** - Real diff renderer (with unified and split modes) with syntax highlighting, file-tree sidebar showing review status, generated/lockfile files auto-collapsed and excluded from LLM context, keyboard shortcuts, existing PR review comments shown read-only, CI check-run status on the PR header. (completed 2026-04-19)
- [x] **Phase 4: LLM Summary + Checklist + Self-Review** - LLM-generated PR summary pane, built-in criticality-ranked checklist shipped with the plugin, self-review produces category-grouped severity-tagged findings with clickable `file:line` refs, per-category coverage visible in the UI. (completed 2026-04-21)
- [ ] **Phase 5: Walkthrough + Inline Threaded Comments** - LLM-curated walkthrough narrative ordering core changes with per-step commentary, "show all" escape to walk the remaining hunks without losing state, threaded conversational comments anchored to `{path, line, side}` via opaque server-resolved IDs (never freeform strings from the LLM).
- [ ] **Phase 6: Review Submission + Verdict UI** - Verdict UI (Approve / Request changes / Comment), atomic single-call GitHub review submission with verdict + body + all inline comments, pre-submit signal-ratio check, existing-pending-review detection with adopt/clear choice, local-branch markdown export path.
- [ ] **Phase 7: Polish + Concurrency** - Multi-session switcher for concurrent reviews across tabs, large-PR virtualization tightening, auth-identity display, daily-use papercut repairs surfaced during Phases 1–6 ship.

## Phase Details

### Phase 1: Plugin Skeleton + Secure Vertical Slice
**Goal**: The control plane works end-to-end. A user can type `/pair-review <pr>` or `/pair-review --local <base> <head>` inside Claude Code, the plugin process boots (MCP stdio + HTTP/push server in one Node process), the PR is fetched via `gh`, the default browser opens to a minimal diff view, and every request the browser makes is authenticated against a per-session token with strict Host validation and CSP. No comments, no checklist, no submission — but every architectural assumption and every BLOCKER-severity security pitfall is closed.
**Depends on**: Nothing (first phase)
**Requirements**: PLUG-01, PLUG-02, PLUG-03, INGEST-01, INGEST-02, SEC-01, SEC-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):
  1. User can run `/pair-review <github-url>` or `/pair-review <pr-number>` inside Claude Code and the default browser auto-launches to the local review URL showing the PR's diff; if the browser launch fails, the terminal prints the exact URL as a fallback.
  2. User can run `/pair-review --local <base-ref> <head-ref>` and get a browser-rendered diff of those two refs with no network call to GitHub.
  3. `curl` probes confirm the local server binds to `127.0.0.1` only, rejects requests missing the per-session token with 403, rejects requests with any `Host` header other than `127.0.0.1:<port>` or `localhost:<port>`, and serves HTML with a strict CSP that forbids external scripts and inline scripts (except a nonce'd entry).
  4. Planning resolves Open Decision 2 (WebSocket vs SSE + HTTP POST) and Open Decision 3 (`better-sqlite3` vs atomic JSON) — both decisions documented in PROJECT.md's Key Decisions table before coding starts.
**Plans**: 7 plans in 5 waves
Plans:
- [x] 01-01-PLAN.md — Monorepo scaffold + test infrastructure + shared types + fixtures (Wave 0)
- [x] 01-02-PLAN.md — Server core: logger, SessionManager, persistence, browser-launch, 127.0.0.1 boot (Wave 1)
- [x] 01-03-PLAN.md — HTTP security layer: host/token/CSP middleware + SSE/adopt routes + probes (Wave 2)
- [x] 01-04-PLAN.md — Ingestion (gh + git) + parse-diff + Shiki highlighting + real startReview (Wave 3)
- [x] 01-05-PLAN.md — Web SPA foundation: Vite/Tailwind, main.tsx bootstrap, chrome components (Wave 3)
- [x] 01-06-PLAN.md — Web diff canvas: 4 states + DiffView wrapper + App.tsx 4-phase router (Wave 4)
- [x] 01-07-PLAN.md — Plugin manifest + /pair-review command + end-to-end test + human walkthrough (Wave 5)
**UI hint**: yes

**Placement rationale**: Research explicitly recommends a thin vertical slice first because it proves the control plane with zero product risk. Security must ship here (not in a later "hardening" phase) because the local server is exposed to every tab the user opens from day one — PITFALLS.md rates DNS-rebinding/CSRF as a BLOCKER that cannot be retrofitted. INGEST-01 and INGEST-02 are the two ingestion paths (GitHub and local) and both need to exist here because the local-diff path is the only way to validate the UI independent of GitHub-API flakiness.

---

### Phase 2: Persistent Session Store + Resume
**Goal**: The plugin remembers. Every state mutation — whether from an MCP tool or a browser POST — funnels through one event-sourced reducer and is persisted to disk atomically. Closing the browser, quitting Claude Code, crashing, or power-failing in mid-review is a no-op: the next `/pair-review` on the same PR resumes at the exact cursor, with drafted comments and any partial checklist progress intact. When the PR's head SHA has moved since last session, the UI surfaces the change with an explicit resolution choice.
**Depends on**: Phase 1
**Requirements**: SESS-01, SESS-02, SESS-03
**Success Criteria** (what must be TRUE):
  1. User can start a review, draft a partial state (walkthrough cursor + any in-flight UI state from Phase 1 + the persistence scaffolding for future Phase-5 drafts), close the browser, quit Claude Code, and on next `/pair-review` for the same PR the browser reopens at the same cursor with all prior state restored.
  2. User is shown a "PR updated" alert with three explicit choices (rebase drafts where possible / discard session / view-both) when resuming a PR whose head SHA differs from the stored SHA.
  3. Kill -9 on the plugin process mid-mutation, followed by restart, does not leave a corrupted state file — persistence uses atomic write-and-rename plus cross-process file locking, verified by a test that interrupts a write.
  4. All mutations (from any entry point) go through `sessionManager.applyEvent(id, event)` — unit tests cover the reducer exhaustively for every event type in use so far.
**Plans**: 4 plans in 3 waves
Plans:
- [x] 02-01-PLAN.md — Shared types + pure reducer + typed SessionBus (Wave 1)
- [x] 02-02-PLAN.md — SESS-03 persistence proofs: crash-interrupt + concurrency + stale-lock tests (Wave 1)
- [x] 02-03-PLAN.md — SessionManager applyEvent + disk-load resume + stale-SHA + POST /choose-resume + SSE update fan-out (Wave 2)
- [x] 02-04-PLAN.md — Web StaleDiffModal + chooseResume API + store onUpdate + main.tsx wiring + human-verify checkpoint (Wave 3)

**Placement rationale**: PROJECT.md names resumable state as a hard v1 requirement. PITFALLS flags browser-refresh data loss (Pitfall 8), stale-diff-on-resume (Pitfall 9), and crash corruption (implicit in SESS-03) as blockers that cannot be retrofitted without rewriting state handling throughout downstream phases. Ships before the LLM product surfaces (Phases 4+) precisely so every feature that follows persists naturally rather than being retrofitted. SESS-04 (multi-session switcher) is deliberately deferred to Phase 7 because concurrent reviews are a polish concern, not a blocker.

---

### Phase 3: Diff UI + File Tree + Navigation
**Goal**: The tool starts to feel like a review tool. A real GitHub-style diff renderer replaces the Phase-1 placeholder; the user can toggle unified vs split; a file-tree sidebar shows per-file review status; generated/lockfile/vendored files collapse by default and are excluded from the LLM's diff context; keyboard shortcuts drive navigation; existing PR review comments appear read-only alongside the diff; the PR header shows CI check status. Planning resolves the diff viewer Open Decision (spike on a real fixture PR before committing).
**Depends on**: Phase 2
**Requirements**: PLUG-04, INGEST-03, INGEST-04, DIFF-01, DIFF-02, DIFF-03, DIFF-04
**Success Criteria** (what must be TRUE):
  1. User can read a GitHub-style unified diff with syntax highlighting as the default mode, and toggle to side-by-side split view with a single control.
  2. User can navigate changed files via a file-tree sidebar that visibly marks each file as reviewed / in-progress / untouched, and click a file to jump the diff view to it.
  3. User can see generated/lockfile/vendored paths auto-collapsed in the UI (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `dist/`, `node_modules/`, `.min.*`, etc.) and confirms via state inspection that these paths are excluded from the LLM's diff context.
  4. User can drive the review UI via `n`/`p` (next/prev hunk), `c` (comment), `r` (mark hunk reviewed), `v` (set verdict), `s` (submit) without touching the mouse.
  5. User can see existing PR review comments (inline and top-level) as read-only annotations on the diff, and sees CI / check-run status (name + conclusion) on the PR header for GitHub-source reviews.
  6. Planning resolves Open Decision 1 (`@git-diff-view/react` vs fallbacks) via a 30-minute spike on a real fixture PR; decision documented in PROJECT.md's Key Decisions table before coding starts.
**Plans**: 5 plans in 3 waves
**UI hint**: yes

Plans:
- [x] 03-01-PLAN.md — Foundation: shared types, Shiki theme fix, reducer extension, test mocks, deletions, PROJECT.md decisions (Wave 0)
- [ ] 03-02-PLAN.md — Server ingest: generated-file detection, existing-comments + CI-checks fetch, POST /api/session/events route, fixture capture (Wave 1)
- [x] 03-03-PLAN.md — DiffViewer live-wire: multi-file + Shiki tokens + read-only markers + generated-file stub (Wave 1)
- [x] 03-04-PLAN.md — FileExplorer + TopBar + store + api postSessionEvent (Wave 1)
- [x] 03-05-PLAN.md — App.tsx AppShell: 2-column layout + keydown + IntersectionObserver + toast + footer hint + delete data.ts (Wave 2)

**Placement rationale**: Readable diff is a prerequisite for every LLM-driven feature that follows — the LLM and user must share a reference for "what hunk are we on?" and the user cannot read along without syntax highlighting and file-tree navigation. Per PITFALLS.md Pitfall 23, UI bikeshedding is a pattern risk; leaning on `@git-diff-view/react` (or a validated fallback) keeps this phase scoped. INGEST-03 and INGEST-04 live here rather than Phase 1 because their user-facing criterion is about what the reviewer *sees* alongside the diff — which needs the diff UI to exist. Ingest plumbing can be extended from Phase 1's `gh` adapter; the win is showing richer data against the real diff renderer.

---

### Phase 4: LLM Summary + Checklist + Self-Review
**Goal**: The first LLM-driven product surface. The LLM generates a PR summary (intent, key changes, risk areas) rendered in a dedicated pane. The plugin ships with a criticality-ranked built-in checklist covering correctness, security, tests, performance, and style. The LLM's self-review runs against that checklist and emits findings grouped by category, severity-tagged (blocker/major/minor/nit), ordered by criticality, each with clickable `file:line` refs that scroll the diff to the hunk. Per-category coverage (pass / partial / fail) is visible in the UI.
**Depends on**: Phase 3
**Requirements**: LLM-01, LLM-02, CHECK-01, CHECK-02
**Success Criteria** (what must be TRUE):
  1. User can see an LLM-generated PR summary (intent, key changes, risk areas) in a dedicated summary pane, regenerable on demand, that visibly paraphrases the PR description (mitigating Pitfall 11 — LLM ignoring PR intent).
  2. User can see the built-in default checklist (correctness, security, tests, performance, style) in the UI with each item tagged by criticality; the checklist ships inside the plugin (no repo override — that's v2 per `CHECK-V2-01`).
  3. User can trigger `run_self_review` and see findings grouped by checklist category, each tagged `blocker` / `major` / `minor` / `nit`, ordered by criticality, each with a clickable `file:line` reference that scrolls the diff to the hunk.
  4. User can see per-category coverage (pass / partial / fail) derived from the self-review findings in a checklist sidebar or equivalent UI surface.
  5. On a fixture PR with a genuine bug, the first self-review pass does NOT default to "Approve" — the prompt framing (adversarial stance, default verdict = "Request changes") visibly forces the LLM to argue down from "Request changes" rather than up from "Approve" (mitigating Pitfall 4 — sycophantic self-review).
**Plans**: 8 plans in 4 waves
Plans:
- [x] 04-01-PLAN.md — shared/types.ts extensions (PrSummary, SelfReview, Finding, ResolvedFinding, Severity, ChecklistCategory, Verdict, CategoryCoverage, SummaryIntent, 2 new SessionEvent variants, ReviewSession+AppState fields) (Wave 1)
- [x] 04-02-PLAN.md — server/src/checklist/index.ts TS-const CHECKLIST + ChecklistItem type (Wave 1)
- [x] 04-03-PLAN.md — Reducer branches for summary.set + selfReview.set + exhaustive purity tests (Wave 2)
- [x] 04-04-PLAN.md — list_files + get_hunk MCP tools with cursor pagination + generated-file filtering (Wave 2)
- [x] 04-05-PLAN.md — set_pr_summary MCP tool with paraphrase-discipline description + atomic replace (Wave 3)
- [x] 04-06-PLAN.md — run_self_review MCP tool with zod nit cap + lineId regex + server-side resolution + adversarial framing + default verdict inversion (Wave 3)
- [x] 04-07-PLAN.md — Frontend: StageStepper mount + FindingsSidebar + SummaryDrawer + 5-chip coverage strip + store dispatch routing + human-verify checkpoint (Wave 4)
- [x] 04-08-PLAN.md — Evaluation harness: 5 fixtures (01/04/06/07/08) + dim-02 (anchor) + dim-03 (verdict calibration) + dim-04 (coverage breadth) + Phase-4 baseline (Wave 3)
**UI hint**: yes

**Placement rationale**: Summary is the lowest-risk LLM integration — no anchoring, no posting — so it's the right place to nail prompting discipline (adversarial framing, intent classification, nit caps in the schema) before that discipline has to survive the harder surfaces of Phase 5. Checklist and self-review are scaffolding that walkthrough and comments depend on: the walkthrough uses the self-review's findings to prioritize hunks; the comment drafts anchor on the self-review's `file:line` refs. Running this phase ahead of Phase 5 means the narrative order has something to reason about.

---

### Phase 5: Walkthrough + Inline Threaded Comments
**Goal**: The heart of the Core Value. The LLM picks an order for the core changes, narrates each hunk, and drives the user through them; the user can toggle "show all" to walk the remaining non-curated hunks without losing progress; and at any diff line the user and LLM can carry on a threaded conversation that flattens to a single posted comment on submission. All LLM anchors go through server-resolved opaque IDs — the LLM never hands back freeform `(path, line)` strings, so hallucinated coordinates (Pitfall 2) are structurally impossible.
**Depends on**: Phase 4
**Requirements**: LLM-03, LLM-04, LLM-05
**Success Criteria** (what must be TRUE):
  1. User can walk through an LLM-curated narrative that picks hunk order and provides per-step commentary explaining intent and flagging potential issues; order is visible before walkthrough starts with a "change this order?" affordance (mitigating Pitfall 14 — wrong ordering).
  2. User can toggle "show all" during the walkthrough and walk the remaining non-curated hunks without losing the curated-set progress — "show all" is a filter, not a state reset (mitigating Pitfall 18).
  3. User can carry on a conversational thread with the LLM on any diff line, anchored to `{path, line, side}`, that visibly flattens to a single posted comment via a designated editable post-body slot (not auto-concatenation of the whole thread — mitigating Pitfall 19).
  4. MCP tool schema inspection confirms that `draft_comment` / `reply_in_thread` / `resolve_thread` accept only opaque `hunk_id` / `line_id` values generated server-side; an integration test feeding a garbage ID returns a schema error (mitigating Pitfall 2 — hallucinated coordinates); comments on unchanged context lines are rejected unless an explicit `pre_existing: true` flag is passed (mitigating Pitfall 12).
  5. Browser refresh mid-thread restores the drafted conversation and its anchor (leverages Phase 2 persistence).
**Plans**: 6 plans
Plans:
- [x] 05-01-PLAN.md — Shared types + reducer (6 new event branches) + resolve-ids utility (Wave 1)
- [x] 05-02-PLAN.md — MCP tools: set_walkthrough + reply_in_thread with opaque ID + preExisting gate (Wave 2)
- [x] 05-03-PLAN.md — MCP tools: draft_comment + resolve_thread + server.ts registration + session-events.ts (Wave 2)
- [x] 05-04-PLAN.md — Store extensions + WalkthroughBanner + WalkthroughStepList + StageStepper activation + CSS (Wave 3)
- [x] 05-05-PLAN.md — ThreadCard + DiffViewer integration + App.tsx walkthrough wiring + c-key + human-verify (Wave 3)
- [x] 05-06-PLAN.md — Gap closure: walkthrough hunk filtering in DiffViewer + "change this order?" affordance (Wave 4, gap closure)
**UI hint**: yes

**Placement rationale**: All prior phases exist to make this work. Walkthrough needs summary + self-review (Phase 4) as inputs because the narrative order is informed by what the self-review discovered. Inline threads need the diff UI (Phase 3) for anchoring and the persistence layer (Phase 2) for draft survival. Per the instructions, the opaque-ID MCP schema ships no later than Phase 5 — it ships *here*, in the same phase that introduces `draft_comment`, because introducing it any later means retrofitting every tool handler. This is explicitly called out as a must-research phase by SUMMARY.md (tool schema shape, filter-not-reset, thread synthesis UX).

---

### Phase 6: Review Submission + Verdict UI
**Goal**: The terminal step. The user picks a verdict (Approve / Request changes / Comment), sees a pre-submit signal-ratio check discouraging nit floods, and submits a full GitHub review — verdict + summary body + all inline comments — in a single atomic `pulls.createReview` call. Pre-existing pending reviews on the PR are detected at session start and either adopted or cleared (never silently duplicated). In local-branch mode, `Submit` exports the review to a markdown file on disk instead.
**Depends on**: Phase 5
**Requirements**: SUB-01, SUB-02, SUB-03, SUB-04
**Success Criteria** (what must be TRUE):
  1. User can submit a full GitHub review with verdict (Approve / Request changes / Comment), summary body, and all drafted inline comments in a single atomic `pulls.createReview` call — an integration test against a fixture PR reads each posted comment back and asserts it lands on the expected line (mitigating Pitfall 1 — `position` vs `line`/`side` confusion).
  2. Before submission, user sees a signal-ratio check listing counts of major / minor / nit findings; a nit-heavy draft (> 3 nits or signal ratio < 40%) visibly warns before allowing submit (mitigating Pitfall 3).
  3. At session start, the plugin detects an existing pending review on the PR from the authenticated user and offers an explicit adopt-or-clear choice — a submit-twice test confirms only one posted review ever exists on the PR (mitigating Pitfall 10 — duplicate submissions).
  4. In local-branch mode (no GitHub PR), `Submit` exports the review to a markdown file on disk with verdict, body, and inline comments anchored to diff locations.
  5. Submit is gated on walkthrough completion or an explicit "submit early anyway" confirmation that requires the user to retype the verdict (mitigating Pitfall 20 — premature submission).
**Plans**: TBD
**UI hint**: yes

**Placement rationale**: Submission is last because every prior phase's output funnels here. Per PITFALLS.md this phase owns the single most error-prone API interaction in the whole product — idempotency, coordinate-adapter correctness, pending-review semantics are all shipping requirements, not later hardening. Keeping submission as a dedicated phase (rather than rolling it into Phase 5) ensures the read-back integration test and the pending-review detection get focused attention. This is a must-research phase per SUMMARY.md (Octokit + pending-review semantics).

---

### Phase 06.3: Walkthrough and review stage design alignment — match inline comments, walkthrough steps, and review UI to updated design.html mockup (INSERTED)

**Goal:** Pixel-match the walkthrough step cards, inline comment threads, review findings UI, submission panel, and DiffViewer inline integration to the updated design.html mockup. One functional addition: finding validity toggle (Valid/Invalid with dismiss + collapse). All other new interactive elements shown in the design (suggested changes, Mark resolved/Needs work/Block) are deferred.
**Requirements**: D-01 through D-22 (CONTEXT.md locked decisions, excluding D-10 deferred)
**Depends on:** Phase 06.2
**Plans:** 4/4 plans complete

Plans:
- [x] 06.3-01-PLAN.md — Finding validity types + reducer + test + WalkthroughStepBanner component (Wave 1)
- [x] 06.3-02-PLAN.md — ThreadCard + InlineComposer full restyle with severity headers, avatars, reply input (Wave 1)
- [x] 06.3-03-PLAN.md — WalkthroughStepList + FindingsSidebar + SubmissionPanel restyle with validity toggle (Wave 2)
- [x] 06.3-04-PLAN.md — DiffViewer inline integration + App.tsx wiring + CSS + human-verify checkpoint (Wave 3)

### Phase 06.2: UI design alignment — match review workspace to updated design.html mockups (INSERTED)

**Goal:** Pixel-match the review workspace to the updated design.html mockups across all 4 steps (Summary, Walkthrough, Review, Submission). Two-row TopBar, step-based routing with right panel (step content + chat), contextual footer, and component relocations (summary to full-page, findings to inline, submit modal to step view, walkthrough steps to right panel).
**Requirements**: D-01 through D-11 (CONTEXT.md locked decisions)
**Depends on:** Phase 06.1
**Plans:** 4 plans in 3 waves

Plans:
- [ ] 06.2-01-PLAN.md — Foundation: store activeStep + CSS structural overhaul + RightPanel + StepFooter + SummaryStep (Wave 1)
- [ ] 06.2-02-PLAN.md — TopBar two-row rework with StepNav (Wave 1)
- [ ] 06.2-03-PLAN.md — Component transformations: ChatPanel, FindingsSidebar, SubmitModal, WalkthroughStepList (Wave 2)
- [ ] 06.2-04-PLAN.md — App.tsx step-routing rewrite + WalkthroughBanner cleanup + human-verify checkpoint (Wave 3)

### Phase 06.1: Bidirectional LLM Collaboration + Auto-Generation (INSERTED)

**Goal:** Flip the interaction model so the browser UI drives the LLM. Three capabilities: (1) auto-generation of PR summary + walkthrough on startup so the user never has to prompt Claude manually, (2) reverse communication channel via long-poll MCP tool (`await_user_request`) so the browser can send requests to the Claude Code session, (3) chat panel + user-initiated inline comments with @claude tagging for line-level collaboration.
**Requirements**: D-01 through D-21 (CONTEXT.md locked decisions)
**Depends on:** Phase 06
**Plans:** 5 plans in 5 waves

Plans:
- [ ] 06.1-01-PLAN.md — Phase 06.1 types + reducer branches + RequestQueue module + unit tests (Wave 1)
- [ ] 06.1-02-PLAN.md — await_user_request + respond_chat MCP tools + POST /api/user-request route + server wiring (Wave 2)
- [ ] 06.1-03-PLAN.md — Store extensions + SSE routing + ChatPanel component + App.tsx 3-column layout (Wave 3)
- [ ] 06.1-04-PLAN.md — InlineComposer + DiffViewer gutter + icon + @claude tagging (Wave 4)
- [ ] 06.1-05-PLAN.md — Slash command rewrite (auto-generation + listen loop + --dry) + human-verify checkpoint (Wave 5)

### Phase 7: Polish + Verification
**Goal**: v1 shake-out. Auth identity badge in TopBar, PITFALLS verification pass (mixed automated + manual), and emergent papercut repairs. SESS-04 (multi-session concurrency) deferred to backlog per D-01.
**Depends on**: Phase 6
**Requirements**: SESS-04 (deferred to backlog per D-01 — not implemented in this phase)
**Success Criteria** (what must be TRUE):
  1. Authenticated GitHub user identity is visible in the UI chrome (avatar + username badge in TopBar row 1, with token mismatch warning when `gh auth token` and `GITHUB_TOKEN` resolve to different users — mitigating Pitfall 17).
  2. The "looks done but isn't" checklist from PITFALLS.md is walked through with each item verified: comment line correctness (Pitfall 1), security headers (Pitfall 6), resume across close (Pitfall 8), resume after force-push (Pitfall 9), duplicate-submission guard (Pitfall 10), port-in-use fallback (Pitfall 16) — automated; signal-ratio check (Pitfall 3), self-review stance (Pitfall 4), large-PR handling (Pitfall 5), pre-existing code guard (Pitfall 12), walkthrough ordering (Pitfall 14) — manual.
  3. Daily-use papercuts captured during verification are fixed (or explicitly deferred with rationale).
  4. SESS-04 (multi-session concurrency) is acknowledged as deferred to backlog — not implemented in Phase 7.
**Plans**: 3 plans in 3 waves
Plans:
- [x] 07-01-PLAN.md — Stale test fix + AuthIdentity types + identity module + identity tests + PITFALLS verification tests (Pitfalls 8/9/16) (Wave 1)
- [x] 07-02-PLAN.md — Server identity wiring (manager.ts + CSP fix) + web integration (store + TopBar badge + icon + CSS) (Wave 2)
- [ ] 07-03-PLAN.md — Full test baseline + manual PITFALLS verification pass + papercut repairs + human-verify checkpoint (Wave 3)
**UI hint**: yes

**Placement rationale**: SESS-04 is the single requirement deferred from Phase 2 because multi-session concurrency is a polish concern rather than a blocker — a single daily-driver review session works end-to-end without it. Per D-01, SESS-04 has been dropped from Phase 7 and moved to backlog. The rest of this phase is intentionally verification-focused: auth identity badge (small new feature), automated test coverage gaps filled, and a manual verification pass against a real PR to catch "looks done but isn't" issues before v1 ships.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 06.1 → 06.2 → 06.3 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Plugin Skeleton + Secure Vertical Slice | 7/7 | Complete   | 2026-04-16 |
| 2. Persistent Session Store + Resume | 0/4 | Not started | - |
| 3. Diff UI + File Tree + Navigation | 0/TBD | Not started | - |
| 4. LLM Summary + Checklist + Self-Review | 0/TBD | Not started | - |
| 5. Walkthrough + Inline Threaded Comments | 0/6 | Planning | - |
| 6. Review Submission + Verdict UI | 0/TBD | Not started | - |
| 06.1. Bidirectional LLM Collaboration | 0/5 | Planning | - |
| 06.2. UI Design Alignment | 0/4 | Planning | - |
| 06.3. Walkthrough + Review Design Alignment | 4/4 | Complete    | 2026-04-27 |
| 7. Polish + Verification | 2/3 | In Progress|  |

---
*Roadmap created: 2026-04-16*
*Coverage: 31/31 v1 requirements mapped to exactly one phase*
