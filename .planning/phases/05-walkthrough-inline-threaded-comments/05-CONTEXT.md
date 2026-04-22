# Phase 5: Walkthrough + Inline Threaded Comments — Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

The heart of the Core Value. Phase 5 turns the Phase-4 "LLM can summarize and self-review" workspace into a guided pair-review session: the LLM picks an order for the core changes, narrates each hunk with per-step commentary, and drives the user through them; the user can toggle "show all" to walk the remaining non-curated hunks without losing progress; and at any diff line the LLM and user carry on a threaded conversation that flattens to a single posted GitHub comment on submission.

All LLM anchors go through server-resolved opaque IDs (Phase 1 D-17, Phase 4 D-04 pattern) — the LLM never hands back freeform `(path, line)` strings, so hallucinated coordinates (Pitfall 2) are structurally impossible.

**Explicitly in scope:**
- Three new MCP tools: `set_walkthrough`, `draft_comment`, `reply_in_thread` — cumulative toolbelt 8/10 after Phase 5.
- One new MCP tool: `resolve_thread` — marks a thread resolved without posting. Cumulative 9/10 (leaves 1-slot buffer for Phase 6's `submit_review`). *Note: planner may merge `resolve_thread` semantics into `draft_comment` if the tool budget is tight; the decision is D-09 below.*
- New `ReviewSession` fields: `walkthrough`, `threads`, `draftComments`.
- New `SessionEvent` variants for walkthrough and thread state changes.
- Walkthrough step-by-step UI: banner above hunk with LLM commentary, step list in StageStepper, curated/show-all toggle.
- Inline thread UI: GitHub-style in-diff thread cards below anchored lines, with conversation turns + editable post-body slot.
- Enabling the "Walkthrough" step in StageStepper (disabled since Phase 4 D-10).
- `c` keyboard shortcut wired (currently a Phase-5 toast stub from Phase 3 D-18).

**Explicitly NOT in scope (per ROADMAP / REQUIREMENTS boundaries):**
- Verdict UI, `pulls.createReview` submission, pre-submit signal-ratio check (Phase 6).
- Pre-existing pending-review detection (Phase 6, Pitfall 10, SUB-03).
- Multi-session switcher, concurrency (Phase 7, SESS-04).
- Multi-line comment ranges (v2, DIFF-V2-01).
- `suggestion` code blocks in comments (v2, DIFF-V2-03).
- Any Anthropic API call from the plugin process.
- Drag-to-reorder walkthrough steps (rejected — see D-02).
- User-initiated solo threads without LLM involvement (rejected — see D-08).

</domain>

<decisions>
## Implementation Decisions

### Walkthrough narrative flow

- **D-01:** **Walkthrough operates at hunk-level granularity.** Each walkthrough step maps to one hunk. The LLM can reorder hunks across files to build a narrative. Matches ROADMAP language ("hunk-by-hunk") and success criteria. The walkthrough step list shows `hunkId`-anchored entries with the LLM's commentary for each.
- **D-02:** **The "change this order?" affordance is a read-only preview with skip.** Before the walkthrough starts, the LLM's proposed step order is visible in a sidebar/panel. The user can see the plan and skip individual steps, but cannot drag-to-reorder in the UI. If the user wants a different order, they ask Claude in chat to revise. Simple to implement; the "affordance" from ROADMAP success criterion 1 is satisfied by visibility + skip + the ability to ask Claude to re-propose.
- **D-03:** **Per-step commentary renders as a banner/card above the hunk.** When the walkthrough advances to a step, a styled commentary card appears directly above the target hunk in the diff view. It scrolls with the diff. It contains the LLM's narrative text for that step (intent, flagged issues, what to pay attention to). The commentary for previous steps collapses to a compact one-line summary when the user moves past them.
- **D-04:** **`set_walkthrough` is a single atomic MCP tool call.** Shape: `set_walkthrough({ steps: [{ hunkId: string, commentary: string }...] })`. The LLM composes the full walkthrough plan in one shot. Matches the atomic pattern from Phase 4's `run_self_review` (D-01). The reducer event `walkthrough.set` replaces the walkthrough state atomically. No `add_step / finalize` lifecycle — same rationale as Phase 4 D-01 (avoids transaction semantics and saves tool-budget slots).

### Show-all toggle mechanics

- **D-05:** **"Show all" is a filter, not a state reset** (Pitfall 18 mitigation). The walkthrough state (cursor position, visited steps, drafted comments) is preserved when toggling. The curated walkthrough and the full hunk list are two *projections* of one underlying state. `n`/`p` navigation in curated mode only steps through curated hunks; in show-all mode it steps through all hunks.
- **D-06:** **Non-curated hunks appear interleaved by file position** when show-all is active. Curated hunks get a visual badge/highlight (e.g., a colored left-border or a "Curated" chip) indicating they're part of the walkthrough. User scrolls one continuous diff with curated steps visually emphasized. No "curated first, then remainder" split.
- **D-07:** **Toggling back to curated-only snaps to the current walkthrough step.** The view scrolls to the current step (or the next unvisited curated step). Non-curated hunks hide. Clean re-entry to the guided flow.

### Thread conversation model

- **D-08:** **Every thread is conversational (LLM-initiated).** There are no solo user threads. The LLM initiates threads via MCP tool calls (`reply_in_thread` to start or continue a thread on a line). The user replies in the thread UI. This enforces the pair-review model — the LLM is always part of the conversation. If the user wants to comment on a specific line, they ask Claude in chat, and Claude opens the thread.
- **D-09:** **Thread-to-comment flattening: LLM synthesizes, user edits.** After the conversation on a line, the LLM calls `draft_comment` to produce a synthesized post body that distills the thread into a single review comment. The synthesized text appears in an editable text field (the "post-body slot") within the thread card. The user can revise it before submission. This is the text that becomes the GitHub inline comment in Phase 6.
- **D-10:** **Synthesis happens on explicit `draft_comment` action, not automatically.** The thread conversation flows freely without re-synthesis after every turn. When the user or LLM decides the thread is done, the LLM calls `draft_comment({ threadId, body })`. This produces the post body in one shot. Avoids churn of re-synthesizing after every reply.
- **D-11:** **`pre_existing: true` gate on context lines** (Pitfall 12 mitigation). `draft_comment` and `reply_in_thread` reject comments anchored to unchanged context lines unless the tool call includes an explicit `preExisting: true` flag. This prevents the LLM from flagging code the PR author didn't write. The `run_self_review` findings from Phase 4 are exempt (D-04 Phase 4 CONTEXT already notes this).

### MCP tool surface for Phase 5

- **D-12:** **Phase 5 adds three or four MCP tools.** Projected:
  - `set_walkthrough` — atomic walkthrough plan (D-04).
  - `reply_in_thread` — starts or continues a conversational thread on a line. Takes `{ lineId, message }` for a new thread or `{ threadId, message }` for an existing thread.
  - `draft_comment` — synthesizes a thread into an editable post body. Takes `{ threadId, body }`. Creates or updates the draft comment for that thread.
  - `resolve_thread` — marks a thread as resolved (no comment to post). Takes `{ threadId }`. Planner may merge this into `draft_comment` with a `resolved: true` flag if tool budget is tight.
  - Cumulative toolbelt after Phase 5: **8–9/10** (Phase 1: `start_review`; Phase 4: `list_files`, `get_hunk`, `set_pr_summary`, `run_self_review`; Phase 5: 3–4 new tools). Leaves 1–2 slot buffer for Phase 6's `submit_review`.
- **D-13:** **All thread/comment tools accept only opaque IDs** — `lineId` and `threadId` are server-generated. `threadId` is a nanoid assigned when the first `reply_in_thread` creates a thread. Garbage IDs return a schema error. This extends the Phase 1 D-17 / Phase 4 D-04 opaque-ID discipline to threads.

### Inline thread UI

- **D-14:** **Threads render in-diff, below the anchored line** (GitHub PR review style). The thread card inserts between diff lines, pushing subsequent lines down (not overlay). Contains: conversation turns (user + LLM messages), the editable post-body slot (appears after `draft_comment` is called), and collapse/resolve controls. The Phase 3 D-21 `thread-marker` DOM slot shows a marker icon on lines that have threads; clicking the marker scrolls to and expands the thread card.
- **D-15:** **Multiple threads can be expanded simultaneously.** The user can have several thread cards open at once for cross-referencing between threads on related code. No auto-collapse of other threads when opening one.
- **D-16:** **Long conversations collapse older turns.** Only the last 2–3 turns are visible by default. Older turns collapse behind an "N earlier messages" expander. Keeps the card compact even for extended discussions. The post-body slot (when present) stays pinned at the bottom of the card, always visible.
- **D-17:** **FindingsSidebar and inline threads coexist simultaneously.** FindingsSidebar stays open showing Phase 4 self-review findings. Inline threads render in-diff independently. User can reference findings in the sidebar while discussing in a thread. No layout conflict since threads are in-diff, not in a panel.

### Reducer extensions (Phase-2 event-sourcing pattern)

- **D-18:** New `SessionEvent` variants for Phase 5 (planner determines exact shapes):
  - `walkthrough.set` — fires when `set_walkthrough` lands; reducer replaces `session.walkthrough`.
  - `walkthrough.stepAdvanced` — fires when the user advances to the next step (via `n` in curated mode or UI button).
  - `thread.replyAdded` — fires when `reply_in_thread` lands; adds a turn to a thread.
  - `thread.draftSet` — fires when `draft_comment` lands; sets the editable post body on a thread.
  - `thread.resolved` — fires when `resolve_thread` lands; marks thread as resolved.
  - `walkthrough.showAllToggled` — fires when the user toggles show-all mode.
  - All events follow the Phase 2 reducer/applyEvent/SSE pattern. `lastEventId` ownership remains with `applyEvent`.
- **D-19:** `ReviewSession` gains new fields (all optional for backward compat):
  - `walkthrough?: Walkthrough | null` — step list, cursor position, show-all state.
  - `threads?: Record<string, Thread>` — keyed by `threadId`.
  - `draftComments?: Record<string, DraftComment>` — keyed by `threadId`, contains the synthesized post body. (Planner may inline this into `Thread` if cleaner.)

### Claude's Discretion

The planner resolves the following without further user input:
- Exact `Walkthrough` / `Thread` / `DraftComment` type shapes in `shared/types.ts`.
- Whether `resolve_thread` is a separate tool or a flag on `draft_comment`.
- Exact commentary banner styling (colors, collapse animation, compact summary format).
- Exact thread card styling (message bubble vs flat, timestamp display, author labels).
- Exact "curated" badge visual treatment on hunks (left border, chip, icon).
- How many turns to show by default before collapsing (2–3 is the guidance; planner picks).
- Exact post-body slot styling (textarea vs contenteditable, placeholder text).
- Whether the walkthrough step list renders in StageStepper or a dedicated sidebar section.
- How the `c` keyboard shortcut integrates (e.g., opens the thread card for the focused line if a thread exists, or prompts Claude to start one).
- Exact `threadId` format (nanoid length, prefix convention).
- Whether `reply_in_thread` uses `lineId` for new threads and `threadId` for existing, or unifies via a discriminated union.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level governance
- `.planning/PROJECT.md` — Core Value ("walkthrough -> inline-comments -> posted-review loop must feel like a competent co-reviewer"); constraint "LLM driver is the user's active Claude Code session; plugin does not make its own LLM API calls"; Key Decisions table.
- `.planning/REQUIREMENTS.md` — Phase 5 requirements: **LLM-03** (walkthrough narrative), **LLM-04** (show-all escape), **LLM-05** (threaded inline comments). v2 deferrals: `DIFF-V2-01` (multi-line ranges), `DIFF-V2-03` (suggestion blocks).
- `.planning/ROADMAP.md` §"Phase 5: Walkthrough + Inline Threaded Comments" — five success criteria. Criterion 4 is the opaque-ID integration test. Criterion 5 is browser-refresh persistence proof.
- `.planning/STATE.md` — current progress; accumulated decisions through Phase 4.

### Phase 1 artifacts (load-bearing — opaque ID rail)
- `.planning/phases/01-plugin-skeleton-secure-vertical-slice/01-CONTEXT.md` — D-17 (opaque-ID rail for `DiffFile.id` / `Hunk.id` / `DiffLine.id`). Phase 5 extends this to `threadId`.
- `server/src/mcp/tools/start-review.ts` — reference `mcp.registerTool(name, { title, description, inputSchema }, handler)` pattern. Phase 5's new tools follow the same shape.

### Phase 2 artifacts (load-bearing — reducer/persistence)
- `.planning/phases/02-persistent-session-store-resume/02-01-PLAN.md` — pure reducer pattern, `SessionEvent` union discipline.
- `.planning/phases/02-persistent-session-store-resume/02-03-PLAN.md` — `applyEvent` ownership of `lastEventId`; per-`prKey` Promise-chain queue; SSE fanout.
- `server/src/session/reducer.ts` — Phase 5 adds new case branches for walkthrough/thread events.
- `server/src/session/manager.ts` — `applyEvent`; no changes to the method itself.
- `shared/types.ts` — Phase 5 extends `SessionEvent` union and `ReviewSession` fields.

### Phase 3 artifacts (load-bearing — diff UI + thread slot)
- `.planning/phases/03-diff-ui-file-tree-navigation/03-CONTEXT.md` — D-21 (thread-marker DOM slot reserved for Phase 5 active threads), D-07 (multi-file scroll model), D-18 (keyboard shortcuts; `c` is a toast stub to wire).
- `web/src/components/DiffViewer.tsx` — `scrollIntoView` + focus-ring rail; thread marker DOM slot; Phase 5 mounts thread cards below anchored lines here.
- `web/src/components/TopBar.tsx` + `StageStepper` — Phase 5 enables the "Walkthrough" step.

### Phase 4 artifacts (load-bearing — tool patterns + findings sidebar)
- `.planning/phases/04-llm-summary-checklist-self-review/04-CONTEXT.md` — D-01 (atomic tool pattern), D-04 (lineId-only anchoring + server-side resolution), D-05 (adversarial framing), D-14 (tool budget 5/10 → Phase 5 adds 3-4), D-20 (tool descriptions as sole prompt surface).
- `server/src/mcp/tools/run-self-review.ts` — reference for lineId resolution pattern. Phase 5's `reply_in_thread` / `draft_comment` reuse this resolution.
- `web/src/components/FindingsSidebar.tsx` — coexists with inline threads (D-17).

### Pitfalls research (BLOCKERS + SERIOUS relevant to Phase 5)
- `.planning/research/PITFALLS.md` §"Pitfall 2 — LLM hallucinated line numbers" **(BLOCKER)** — closed by opaque-ID discipline extended to `threadId` + `lineId` in all Phase 5 tools (D-13).
- `.planning/research/PITFALLS.md` §"Pitfall 12 — Mis-attribution of pre-existing code" — closed by `preExisting: true` gate on `draft_comment` / `reply_in_thread` (D-11).
- `.planning/research/PITFALLS.md` §"Pitfall 14 — Walkthrough ordering misses core change" — mitigated by LLM-curated ordering via `set_walkthrough` + user-visible preview with skip (D-02). Tool description should instruct the LLM to prioritize PR-intent-aligned changes over alphabetical/diff order.
- `.planning/research/PITFALLS.md` §"Pitfall 18 — Show-all escape re-anchoring" — closed by D-05 (filter, not state reset) + D-06/D-07 (interleaved view + snap-back).
- `.planning/research/PITFALLS.md` §"Pitfall 19 — Thread doesn't map to one GitHub comment" — closed by D-09/D-10 (explicit `draft_comment` synthesis + editable post-body slot).
- `.planning/research/PITFALLS.md` §"Pitfall 15 — Tool schema surface too large" — cumulative 8-9/10 after Phase 5 (D-12). 1-2 slot buffer for Phase 6.

</canonical_refs>

<code_context>
## Existing Code Insights

Phase 5 is an additive feature layer on top of Phase 4's stable MCP + reducer + UI scaffold. The walkthrough and thread systems are new state surfaces; the diff UI gets thread cards injected but the core renderer doesn't change.

### Reusable Assets
- **`mcp.registerTool` pattern** (`server/src/mcp/tools/start-review.ts`, `run-self-review.ts`) — Phase 5's 3-4 new tools follow this shape.
- **`lineId` resolution in `run-self-review.ts`** — the `resolveLineId(lineId, session)` → `(path, line, side)` pattern. Phase 5's thread tools reuse this for anchoring.
- **Phase 2 reducer/applyEvent/SSE pipeline** — walkthrough and thread events inherit serialization, persistence, and broadcast for free.
- **Phase 3 `thread-marker` DOM slot** in `DiffViewer.tsx` — already reserved for thread markers. Phase 5 activates it.
- **Phase 3 `scrollIntoView` + focus-ring rail** — reused for walkthrough step navigation and thread-marker clicks.
- **Phase 4 `StageStepper`** (mounted in `TopBar.tsx`) — Phase 5 enables the "Walkthrough" step.
- **Phase 4 `FindingsSidebar.tsx`** — stays as-is; coexists with inline threads.
- **CSS token palette** (`--paper`, `--claude`, `--ok`, `--warn`, `--block`, `--mono`) — covers walkthrough banner, thread card, curated badge styling.

### Established Patterns
- **Atomic MCP tools that produce SessionEvents** — `set_walkthrough` follows `run_self_review`'s shape.
- **Opaque IDs on every LLM-facing surface** — Phase 5 adds `threadId` to the vocabulary.
- **Tool descriptions as the sole prompt surface** — `set_walkthrough` description instructs narrative ordering; `draft_comment` instructs synthesis discipline.
- **Stderr-only logging** in the MCP process.
- **SessionEvent plain-JSON discipline** — no Date, no functions, no class instances.

### Integration Points
- **`server/src/mcp/server.ts`**: add 3-4 new `register*()` imports.
- **`server/src/mcp/tools/`**: 3-4 new sibling modules.
- **`server/src/session/reducer.ts`**: new case branches for walkthrough/thread events.
- **`shared/types.ts`**: new types + SessionEvent variants + ReviewSession fields.
- **`web/src/store.ts`**: new store actions for walkthrough/thread updates.
- **`web/src/components/DiffViewer.tsx`**: mount thread cards below anchored lines; mount walkthrough commentary banners above hunks; activate thread-marker slot.
- **`web/src/components/TopBar.tsx` / StageStepper**: enable "Walkthrough" step; wire walkthrough step list.
- **`web/src/App.tsx`**: show-all toggle control; walkthrough navigation controls.

</code_context>

<specifics>
## Specific Ideas

- **The LLM drives the walkthrough AND initiates threads.** In this model the LLM is the co-reviewer who picks what to discuss and opens the conversation. The user responds, pushes back, or agrees. This matches the Core Value: "a competent co-reviewer sitting next to you."
- **`draft_comment` is the flattening boundary.** Before `draft_comment`, the thread is a scratchpad conversation. After `draft_comment`, there's a concrete post body the user can read and edit. This clean boundary avoids the "what gets posted?" ambiguity of Pitfall 19.
- **Walkthrough commentary banners should be concise.** The LLM's per-step commentary should be 2-4 sentences explaining intent and flagging concerns — not a full code analysis. The self-review findings (Phase 4) already provide detailed analysis. Walkthrough commentary is about *narrative flow* — "this hunk implements the auth check we discussed in the summary; notice the null guard on line 47."
- **Show-all is a toggle, not a mode switch.** The implementation should be a boolean on the walkthrough state. When true, the diff renders all hunks with curated ones badged. When false, only curated hunks render. The walkthrough cursor is always tracked relative to the curated step list regardless of show-all state.
- **Thread state must survive browser refresh** (success criterion 5). Since threads are just SessionEvents through the Phase 2 pipeline, they persist automatically. The web store rebuilds thread state from the SSE snapshot on reconnect. No special refresh handling needed beyond what Phase 2 already provides.
- **`preExisting: true` gate is a social + structural mitigation.** The LLM can set the flag intentionally when it genuinely wants to flag pre-existing code. The gate prevents *accidental* attribution by requiring explicit opt-in. The tool description should instruct: "Only set preExisting when you're intentionally flagging a pre-existing issue the PR author should be aware of."

</specifics>

<deferred>
## Deferred Ideas

- **Drag-to-reorder walkthrough steps** — rejected in favor of read-only preview + skip + asking Claude to revise (D-02). Significant UI complexity for a rare use case.
- **User-initiated solo threads (no LLM involvement)** — rejected; every thread is conversational per the pair-review model (D-08). If daily use reveals friction, revisit in Phase 7.
- **Auto-synthesis of post body after each LLM reply** — rejected in favor of explicit `draft_comment` action (D-10). Avoids churn.
- **One-thread-at-a-time auto-collapse** — rejected; user wants multiple simultaneous threads for cross-referencing (D-15).
- **Thread card overlay (not push-down)** — rejected; push-down (GitHub-style) is more natural for code review (D-14).
- **Thread side panel (replacing or alongside FindingsSidebar)** — rejected; in-diff placement is more spatially relevant (D-14, D-17).
- **Suggestion blocks in thread comments** — v2 per DIFF-V2-03.
- **Multi-line comment ranges** — v2 per DIFF-V2-01.
- **Walkthrough file-level or logical-group granularity** — rejected in favor of hunk-level (D-01).
- **Incremental `add_step / finalize` walkthrough tool lifecycle** — rejected per Phase 4 D-01 precedent; atomic `set_walkthrough` (D-04).

</deferred>

---

*Phase: 05-walkthrough-inline-threaded-comments*
*Context gathered: 2026-04-22*
