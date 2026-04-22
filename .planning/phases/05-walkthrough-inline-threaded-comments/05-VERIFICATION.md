---
phase: 05-walkthrough-inline-threaded-comments
verified: 2026-04-22T10:42:51Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "Show-all toggle lets user walk non-curated hunks without losing curated progress (SC-2)"
    - "LLM-curated narrative with visible order and 'change this order?' affordance (SC-1)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Curated/All toggle visible effect"
    expected: "With walkthrough active and showAll=false, only curated hunks visible; toggle to All shows all hunks with curated hunks badged; toggle back hides non-curated hunks immediately"
    why_human: "Requires running the server with an active walkthrough to confirm the filteredDiff memo produces the expected visual output in the browser"
  - test: "Collapse thread button functionality"
    expected: "Clicking 'Collapse thread' in ThreadCard collapses the thread card so only its header is visible"
    why_human: "onCollapse is wired as a no-op in DiffViewer (documented intentional stub per 05-05-SUMMARY). Whether the intended UX is acceptable or must be fixed before the phase is declared complete needs user decision."
  - test: "FileExplorer click-to-scroll in curated mode"
    expected: "Clicking a file in FileExplorer that has no curated hunks either scrolls to the nearest visible file or shows a toast/visual cue that the file is not in the curated view"
    why_human: "In curated mode, filtered-out files still appear in FileExplorer. Clicking them does nothing (getElementById returns null, scrollIntoView never fires). Whether this is acceptable UX requires user judgment."
---

# Phase 5: Walkthrough + Inline Threaded Comments Verification Report

**Phase Goal:** The heart of the Core Value. The LLM picks an order for the core changes, narrates each hunk, and drives the user through them; the user can toggle "show all" to walk the remaining non-curated hunks without losing progress; and at any diff line the user and LLM can carry on a threaded conversation that flattens to a single posted comment on submission. All LLM anchors go through server-resolved opaque IDs -- the LLM never hands back freeform `(path, line)` strings, so hallucinated coordinates (Pitfall 2) are structurally impossible.

**Verified:** 2026-04-22T10:42:51Z
**Status:** human_needed
**Re-verification:** Yes -- after gap closure (Plan 05-06)

## Goal Achievement

### Observable Truths (derived from Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | LLM-curated narrative with visible order and "change this order?" affordance (SC-1) | VERIFIED | WalkthroughStepList renders steps in order with commentary; walkthrough-reorder-hint div shows "Want a different order? Ask Claude to reorder the walkthrough." with U+21F5 arrow; CSS rule in index.css L1494; commit e129cda |
| 2 | Show-all toggle lets user walk non-curated hunks without losing curated progress (SC-2) | VERIFIED | filteredDiff useMemo in App.tsx L73-90 computes curated DiffModel from walkthrough.steps; DiffViewer receives `filteredDiff ?? diff` at L439; in showAll=false, non-curated hunks excluded; in showAll=true, full diff passed unchanged; 2 new tests pass; commit 436385e |
| 3 | Threaded conversation flattens to a single posted comment via editable draft slot (SC-3) | VERIFIED | ThreadCard 162 lines with turns rendering + draftBody textarea; blur-on-change wired to actions.updateLocalDraft; human verified in initial verification |
| 4 | MCP tools accept only opaque IDs; garbage ID returns error; context-line anchor rejected without preExisting (SC-4) | VERIFIED | resolveHunkId/resolveLineIdExtended in resolve-ids.ts; preExisting gate in reply-in-thread.ts; 374 server tests pass including opaque ID and gate paths |
| 5 | Browser refresh mid-thread restores drafted conversation and anchor (SC-5) | VERIFIED | mergeThreadsFromServer in store.ts; locallyEditedDrafts Set protects user edits; SSE snapshot/update paths both call mergeThreadsFromServer |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/src/App.tsx` | filteredDiff useMemo + DiffViewer receives filteredDiff | VERIFIED | filteredDiff at L73-90; curatedHunkIds Set; DiffViewer gets `filteredDiff ?? diff` at L439; FileExplorer still gets full `diff.files` at L430 |
| `web/src/components/WalkthroughStepList.tsx` | Reorder affordance UI | VERIFIED | walkthrough-reorder-hint div at L40-52 with U+21F5 arrow + instructional text |
| `web/src/index.css` | walkthrough-reorder-hint CSS rule | VERIFIED | Rule at L1494 with border-bottom separator |
| `web/src/__tests__/DiffViewer.test.tsx` | 2 new walkthrough filtering tests | VERIFIED (with caveat) | "in curated mode" test at L241; "in show-all mode" test at L284; both pass at runtime (14/14 tests pass); CAVEAT: missing `generatedAt` field in Walkthrough construction causes `tsc --noEmit` failure (TS2741 at L245, L288) |
| `shared/types.ts` | Phase 5 types unchanged | VERIFIED | All types intact; Walkthrough includes `generatedAt: string` |
| `server/src/session/reducer.ts` | 6 Phase 5 event branches | VERIFIED | 5 matches for phase-5 event types (walkthrough.set covers set+stepAdvanced) |
| `server/src/mcp/tools/resolve-ids.ts` | resolveHunkId, resolveLineIdExtended | VERIFIED | 2 exports present |
| `server/src/mcp/server.ts` | All Phase 5 tools registered | VERIFIED | 8 occurrences (4 tools x 2 = import + call each) |
| `web/src/store.ts` | mergeThreadsFromServer, locallyEditedDrafts | VERIFIED | 10 combined occurrences |
| `web/src/components/ThreadCard.tsx` | Thread card with turns + draft textarea | VERIFIED | 162 lines; 14 matches for draftBody/textarea/turns |
| `web/src/components/WalkthroughBanner.tsx` | Commentary above active hunk | VERIFIED | Renders as React text node (0 dangerouslySetInnerHTML) |
| `web/src/components/DiffViewer.tsx` | ThreadCard + WalkthroughBanner integrated | VERIFIED | Both imported and rendered; hunk--curated class applied |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| App.tsx filteredDiff | DiffViewer diff prop | `filteredDiff ?? diff` | WIRED | L439: `diff={filteredDiff ?? diff}` |
| App.tsx filteredDiff | state.walkthrough | useMemo dependency | WIRED | L90: `[diff, state.walkthrough]` dependency array |
| App.tsx FileExplorer | full diff (not filteredDiff) | `diff.files` prop | WIRED | L430: `files={diff.files}` -- confirmed NOT filteredDiff |
| WalkthroughStepList | TopBar/StageStepper | import + render | WIRED | TopBar imports and renders WalkthroughStepList when walkthrough non-null |
| DiffViewer | ThreadCard | import + render in tr.thread-row | WIRED | Lines 361-368 (unified) and 513-524 (split) |
| DiffViewer | WalkthroughBanner | import + render above hunk | WIRED | Lines 267-275 |
| App.tsx virtualList | DiffViewer hunk rendering | walkthrough.showAll filter | WIRED (via filteredDiff) | Previously NOT_WIRED; now filteredDiff memo at L73-90 filters the DiffModel passed to DiffViewer; virtualList separately drives n/p navigation |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| WalkthroughBanner | step.commentary | walkthrough.steps[cursor] via store SSE snapshot | Yes -- set by set_walkthrough MCP tool | FLOWING |
| ThreadCard | thread.turns | state.threads from store SSE snapshot | Yes -- set by reply_in_thread MCP tool | FLOWING |
| ThreadCard textarea | thread.draftBody | state.threads via mergeThreadsFromServer | Yes -- set by draft_comment MCP tool | FLOWING |
| WalkthroughStepList toggle | walkthrough.showAll | store.walkthrough.showAll | Yes -- updated by showAllToggled event | FLOWING |
| DiffViewer curated hunk set | filteredDiff | App.tsx useMemo from diff + state.walkthrough | Yes -- derives filtered DiffModel from walkthrough.steps hunkIds | FLOWING |
| WalkthroughStepList reorder hint | static text | Hardcoded instructional string | N/A -- static content by design | FLOWING (static) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Server tests pass | `pnpm --filter server test --run` | 374 tests, 50 files passed | PASS |
| Web tests pass | `pnpm --filter web test --run` | 77 tests, 10 files passed | PASS |
| Server TypeScript compiles | `pnpm --filter server exec tsc --noEmit` | Exit 0 | PASS |
| Web TypeScript compiles | `pnpm --filter web exec tsc --noEmit` | Exit 2 -- TS2741: missing generatedAt in DiffViewer.test.tsx L245, L288 | FAIL |
| filteredDiff occurrences in App.tsx | `grep -c filteredDiff App.tsx` | 3 (declaration + comment + prop) | PASS |
| curatedHunkIds in App.tsx | `grep curatedHunkIds App.tsx` | 2 matches (Set creation + filter) | PASS |
| Reorder affordance text | `grep 'different order' WalkthroughStepList.tsx` | 1 match at L51 | PASS |
| Gap closure commits exist | `git show --stat 436385e e129cda` | Both found with expected files | PASS |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LLM-03 | 05-01 thru 05-06 | User can walk through LLM-curated narrative with per-step commentary and hunk ordering | SATISFIED | Walkthrough types, set_walkthrough MCP tool, reducer, store, WalkthroughBanner commentary, WalkthroughStepList with reorder affordance, filteredDiff curated hunk filtering all verified |
| LLM-04 | 05-01, 05-03, 05-04, 05-05, 05-06 | User can toggle "show all" during walkthrough without losing curated progress | SATISFIED | showAll toggle in WalkthroughStepList fires showAllToggled event; store tracks state; filteredDiff memo filters DiffModel in curated mode; full diff in show-all mode; 2 new tests verify |
| LLM-05 | 05-01 thru 05-05 | Conversational thread on any diff line, flattening to single posted comment | SATISFIED | ThreadCard, reply_in_thread, draft_comment, resolve_thread all functional; editable draft textarea; opaque ID discipline; preExisting gate; human verified |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `web/src/components/DiffViewer.tsx` | 364, 519 | `onCollapse={() => {/* collapse handled by parent state */}}` -- no-op callback | Warning | Thread collapse button visible but does nothing; documented intentional stub; not blocking thread creation/reply/draft |
| `web/src/__tests__/DiffViewer.test.tsx` | 245, 288 | Missing `generatedAt` field in Walkthrough test objects | Warning | Causes `tsc --noEmit` failure (TS2741); runtime tests pass; should add `generatedAt: '2026-01-01T00:00:00Z'` to both test objects |

### Human Verification Required

### 1. Curated/All Toggle Visible Effect

**Test:** Start a review with an active walkthrough (Claude sets walkthrough via set_walkthrough). With showAll=false, confirm only curated hunks are visible. Toggle to "All hunks," confirm all non-generated hunks appear with curated hunks badged (hunk--curated class). Toggle back to "Curated" and confirm non-curated hunks disappear immediately.
**Expected:** Curated mode shows only the hunks selected by the LLM; show-all mode reveals everything; toggling back does not lose progress.
**Why human:** Requires running the server with an active walkthrough session to confirm the filteredDiff memo produces the expected visual output in the browser. The filtering logic is verified at the code and test level but the end-to-end visual effect needs human confirmation.

### 2. Collapse Thread Button

**Test:** Start a review, ask Claude to start a thread on a line. When ThreadCard appears, click "Collapse thread."
**Expected:** The thread card collapses to show only its header (file:line reference), saving vertical space.
**Why human:** The `onCollapse` is wired as a no-op in DiffViewer (documented intentional stub per 05-05-SUMMARY). The developer needs to decide whether this constitutes a blocking gap or an acceptable Phase 5 stub. The rest of thread functionality works correctly.

### 3. FileExplorer Click-to-Scroll in Curated Mode

**Test:** With a walkthrough active in curated mode, click a file in the FileExplorer sidebar that has no curated hunks.
**Expected:** Either the file scrolls into view (if present) or the user gets a visual cue that the file is not in the curated view (e.g., toast or disabled state).
**Why human:** In curated mode, filtered-out files still appear in FileExplorer but their DOM sections are not rendered by DiffViewer. Clicking them does nothing silently (`getElementById` returns null). Whether this is acceptable UX or a polish item requires user judgment.

### Gaps Summary

**No blocking gaps remain.** Both gaps from the initial verification have been closed:

1. **Gap 1 (LLM-04) CLOSED:** `filteredDiff` useMemo in App.tsx computes a hunk-filtered DiffModel in curated mode. DiffViewer now receives only curated hunks when `showAll=false`. Two new tests verify the filtering behavior. Commit 436385e.

2. **Gap 2 (SC-1) CLOSED:** WalkthroughStepList now shows a "Want a different order? Ask Claude to reorder the walkthrough." affordance with a U+21F5 up-down arrow icon between the toggle and step list. CSS rule in index.css. Commit e129cda.

**Minor issue (non-blocking):** The two new test cases in `DiffViewer.test.tsx` (L245, L288) construct `Walkthrough` objects missing the required `generatedAt` field, causing `tsc --noEmit` to fail for the web workspace. The tests pass at runtime. Fix: add `generatedAt: '2026-01-01T00:00:00Z'` to both test objects.

Three items require human verification: the end-to-end visual effect of the curated/all toggle, the onCollapse no-op acceptability, and the FileExplorer behavior in curated mode.

---

_Verified: 2026-04-22T10:42:51Z_
_Verifier: Claude (gsd-verifier)_
