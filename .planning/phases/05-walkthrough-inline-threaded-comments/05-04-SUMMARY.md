---
phase: 05-walkthrough-inline-threaded-comments
plan: 04
subsystem: ui
tags: [react, typescript, store, walkthrough, threads, xss-mitigation, sse]

# Dependency graph
requires:
  - phase: 05-01
    provides: Phase 5 types (Walkthrough, WalkthroughStep, Thread, ThreadTurn) in shared/types.ts
  - phase: 05-02
    provides: Server-side walkthrough/thread state and SSE events
  - phase: 04
    provides: AppState interface pattern, StageStepper, store architecture

provides:
  - AppState extended with walkthrough, threads, locallyEditedDrafts fields
  - mergeThreadsFromServer helper for Pitfall 3 draftBody protection
  - WalkthroughBanner component: per-step commentary card above hunk
  - WalkthroughStepList component: step list with curated/all-hunks toggle
  - StageStepper Walkthrough step enabled when walkthrough is non-null
  - Phase 5 CSS tokens for walkthrough-banner, hunk--curated, walkthrough-step-entry

affects: [05-05, 06-submit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - mergeThreadsFromServer: Pitfall 3 mitigation pattern — SSE thread updates preserve locally-edited draftBody via locallyEditedDrafts Set
    - LLM-text-as-text-node: XSS mitigation enforced via grep — commentary rendered as React text nodes, never dangerouslySetInnerHTML

key-files:
  created:
    - web/src/components/WalkthroughBanner.tsx
    - web/src/components/WalkthroughStepList.tsx
  modified:
    - web/src/store.ts
    - web/src/components/TopBar.tsx
    - web/src/index.css
    - web/src/components/__tests__/StaleDiffModal.test.tsx

key-decisions:
  - "locallyEditedDrafts Set tracks threadIds where user has locally edited draftBody — SSE updates must not overwrite these (Pitfall 3)"
  - "mergeThreadsFromServer is the single merge point for all thread state from server — used in onSnapshot, onUpdate, and all thread action handlers"
  - "StageStepper Walkthrough step tooltip reads 'Ask Claude to set_walkthrough' when walkthrough is null — matches MCP tool name to guide user"

patterns-established:
  - "Pitfall 3 pattern: locallyEditedDrafts Set + mergeThreadsFromServer — copy this for any future LLM-sets-then-user-edits field"
  - "XSS pattern: LLM-authored commentary always renders as React text node {step.commentary} — never innerHTML. Grep-enforced."

requirements-completed: [LLM-03, LLM-04]

# Metrics
duration: 18min
completed: 2026-04-22
---

# Phase 5 Plan 04: Walkthrough UI Components + Store Extension Summary

**Walkthrough/thread state flows into React store with draftBody-overwrite protection; WalkthroughBanner and WalkthroughStepList components render LLM narrative safely as text nodes**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-22T10:20:00Z
- **Completed:** 2026-04-22T10:38:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Extended store.ts with Walkthrough/Thread state, locallyEditedDrafts protection, and 4 new action handlers (onWalkthroughSet, onThreadReplyAdded, onDraftSet, onThreadResolved) + updateLocalDraft for local textarea edits
- Created WalkthroughBanner: active/collapsed modes, LLM commentary as safe React text node, skip/next controls
- Created WalkthroughStepList: curated/all-hunks toggle, step status indicators, completion summary
- Enabled StageStepper Walkthrough step (shows step progress count, tooltip guides to set_walkthrough MCP tool)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend store.ts with walkthrough/thread state + draftBody protection** - `21be645` (feat)
2. **Task 2: Create WalkthroughBanner + WalkthroughStepList + wire StageStepper + CSS** - `f185c7a` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `web/src/store.ts` - Added Walkthrough/Thread imports, AppState fields, INITIAL values, mergeThreadsFromServer helper, new action handlers
- `web/src/components/WalkthroughBanner.tsx` - New: per-step commentary card with active/collapsed states (XSS-safe)
- `web/src/components/WalkthroughStepList.tsx` - New: step list with curated/all-hunks toggle and completion indicator
- `web/src/components/TopBar.tsx` - Extended StageStepper with walkthrough props, enabled Walkthrough step, renders WalkthroughStepList
- `web/src/index.css` - Added Phase 5 CSS section: walkthrough-banner, hunk--curated, walkthrough-step-entry, thread-marker
- `web/src/components/__tests__/StaleDiffModal.test.tsx` - Fixed makeState helper to include Phase 4+5 required AppState fields

## Decisions Made
- `locallyEditedDrafts` uses a `Set<string>` (not a plain boolean map) so it can be accurately cleared per-thread in future plans without iterating the whole threads record
- `mergeThreadsFromServer` is called from all four thread action handlers (not just onSnapshot/onUpdate) for a single consistent merge point
- StageStepper tooltip text is `'Ask Claude to set_walkthrough'` — matches the exact MCP tool name so the user knows which command to issue

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed StaleDiffModal.test.tsx makeState helper missing Phase 4+5 AppState fields**
- **Found during:** Task 1 (TypeScript check after extending AppState)
- **Issue:** Adding `walkthrough`, `threads`, `locallyEditedDrafts` to AppState as required fields caused the test helper's return type to fail — it spread `Partial<AppState>` at the end which could produce `summary: undefined` where `PrSummary | null` was required
- **Fix:** Restructured makeState to use a typed `base` object with all required fields (including Phase 4: summary, selfReview, findingsSidebarOpen, activeCategory; Phase 5: walkthrough, threads, locallyEditedDrafts), then spread overrides with `as AppState` cast
- **Files modified:** `web/src/components/__tests__/StaleDiffModal.test.tsx`
- **Verification:** `pnpm --filter web exec tsc --noEmit` exits 0
- **Committed in:** `21be645` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug from new required fields breaking existing test helper)
**Impact on plan:** Necessary correctness fix. No scope creep.

## Issues Encountered
- Worktree did not have node_modules — symlinked worktree's `web/node_modules` to main project's `web/node_modules` to allow `pnpm --filter web exec tsc --noEmit` to run. This is a worktree-specific setup concern, not a code issue.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Store fully wired for walkthrough and thread state with draftBody protection
- WalkthroughBanner ready to be placed above hunk renders in DiffCanvas (Phase 5 plan 05)
- WalkthroughStepList rendering inside StageStepper when walkthrough is set
- CSS tokens in place for all walkthrough UI elements
- No blockers for Phase 5 plan 05 (DiffCanvas integration)

---
*Phase: 05-walkthrough-inline-threaded-comments*
*Completed: 2026-04-22*
