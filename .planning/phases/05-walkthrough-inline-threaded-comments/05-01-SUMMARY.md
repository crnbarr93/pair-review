---
phase: 05-walkthrough-inline-threaded-comments
plan: 01
subsystem: api
tags: [typescript, event-sourcing, reducer, mcp, walkthrough, threads, types]

# Dependency graph
requires:
  - phase: 04-llm-summary-self-review
    provides: SessionEvent union, ReviewSession, applyEvent reducer pattern, resolveLineId pattern

provides:
  - WalkthroughStepStatus, WalkthroughStep, Walkthrough types in shared/types.ts
  - ThreadTurn, Thread types with SECURITY innerHTML guards
  - 6 new SessionEvent variants (walkthrough.set, walkthrough.stepAdvanced, walkthrough.showAllToggled, thread.replyAdded, thread.draftSet, thread.resolved)
  - ReviewSession.walkthrough and ReviewSession.threads optional fields
  - reducer.ts 6 new case branches handling all new event variants
  - resolve-ids.ts with resolveHunkId and resolveLineIdExtended shared utilities
  - 16 reducer unit tests covering all new event branches

affects:
  - 05-02 (set-walkthrough MCP tool imports resolveHunkId from resolve-ids.ts)
  - 05-03 (reply-in-thread and draft-comment MCP tools import resolveLineIdExtended from resolve-ids.ts)
  - 05-04 (web store handles new event types from updated SessionEvent union)
  - 05-05 (UI components consume walkthrough/threads from ReviewSession)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase 5 types follow the Phase-N comment header block pattern in shared/types.ts"
    - "Reducer cases follow established ...s spread pattern; no mutations, no I/O"
    - "resolveHunkId mirrors resolveLineId from Phase 4 run-self-review.ts — opaque ID rail extended to hunks"
    - "walkthrough.stepAdvanced marks all steps before cursor as visited on advance"

key-files:
  created:
    - server/src/mcp/tools/resolve-ids.ts
    - server/src/session/__tests__/reducer-phase5.test.ts
  modified:
    - shared/types.ts
    - server/src/session/reducer.ts

key-decisions:
  - "draftBody inlined on Thread (not a separate draftComments record) — simpler SSE update shape; Phase 6 reads thread.draftBody directly"
  - "resolveLineIdExtended returns lineKind in addition to (path, line, side) — Phase 5 preExisting gate needs DiffLine.kind to reject context anchors"
  - "walkthrough.stepAdvanced marks steps as visited (not just cursor advance) — reducer owns visited-state bookkeeping per plan spec"

patterns-established:
  - "resolve-ids.ts is the shared utility module for opaque ID resolution; downstream MCP tools import from here, not from run-self-review.ts"
  - "SECURITY comments on all LLM-authored text fields (commentary, message, draftBody) matching T-5-01-02 threat mitigation"

requirements-completed: [LLM-03, LLM-04, LLM-05]

# Metrics
duration: 15min
completed: 2026-04-22
---

# Phase 5 Plan 01: Phase 5 Types, Reducer + Resolve-IDs Foundation Summary

**Phase 5 type contracts defined with 6 new SessionEvent variants, extended reducer with walkthrough/thread case branches, and shared resolve-ids.ts utility for downstream MCP tools**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-22T09:07:33Z
- **Completed:** 2026-04-22T09:11:07Z
- **Tasks:** 2
- **Files modified:** 4 (2 modified, 2 created)

## Accomplishments

- Extended `shared/types.ts` with all Phase 5 types: `WalkthroughStepStatus`, `WalkthroughStep`, `Walkthrough`, `ThreadTurn`, `Thread`, 6 new `SessionEvent` variants, and optional `ReviewSession.walkthrough`/`threads` fields
- Extended `reducer.ts` with 6 new case branches; `walkthrough.stepAdvanced` marks prior pending steps as `visited` on advance; exhaustiveness guard satisfied
- Created `resolve-ids.ts` with `resolveHunkId` and `resolveLineIdExtended` — shared utilities for Plans 02 and 03 MCP tools
- 16 reducer unit tests pass covering all new event branches including null-safety, purity, and overwrite semantics

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Phase 5 types to shared/types.ts** - `1d3e3d9` (feat)
2. **Task 2: Add 6 reducer case branches + resolve-ids utility + tests** - `2c943d6` (feat)

## Files Created/Modified

- `shared/types.ts` — Added Phase 5 type block (WalkthroughStep, Walkthrough, ThreadTurn, Thread), 6 SessionEvent variants, ReviewSession phase 5 optional fields
- `server/src/session/reducer.ts` — 6 new case branches for walkthrough.* and thread.* events; walkthrough.stepAdvanced marks visited steps
- `server/src/mcp/tools/resolve-ids.ts` — Created shared resolveHunkId and resolveLineIdExtended utilities with ResolvedLine interface
- `server/src/session/__tests__/reducer-phase5.test.ts` — 16 unit tests covering all new event branches

## Decisions Made

- `draftBody` inlined on `Thread` (not a separate record) — simpler SSE update shape and cleaner Phase 6 consumption
- `resolveLineIdExtended` returns `lineKind` alongside `(path, line, side)` — needed by `reply_in_thread`'s preExisting gate in Plan 03
- `walkthrough.stepAdvanced` marks all prior pending steps as `visited` in the reducer (not just cursor advance) — the plan spec includes this bookkeeping in the reducer rather than client-side

## Deviations from Plan

### Minor Spec Deviation

**grep heuristic for resolveHunkId / resolveLineIdExtended counts**

- **Found during:** Task 2 acceptance criteria check
- **Issue:** The plan expected `grep -c 'resolveHunkId'` to return at least 2 (comment "export + function def"), but `export function resolveHunkId(...)` is one line so grep returns 1
- **Fix:** No code change needed — the functions are correctly exported and the TypeScript compiler confirms this (`tsc --noEmit` exits 0). The spec comment was based on an assumption that export and function definition would be on separate lines
- **Impact:** Zero functional impact; the utility is correctly implemented and importable

---

**Total deviations:** 1 trivial (grep heuristic mismatch, no code impact)
**Impact on plan:** No scope change. All functionality delivered as specified.

## Issues Encountered

None — the TypeScript exhaustiveness guard correctly flagged the missing reducer cases after Task 1 types were added (expected failure resolved by Task 2).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All Phase 5 type contracts are importable from `@shared/types`
- Reducer handles all 6 new event types — Plans 02/03 MCP tools can emit events immediately
- `resolve-ids.ts` exports `resolveHunkId` and `resolveLineIdExtended` ready for import in Plans 02/03
- Plan 02 (`set-walkthrough` MCP tool) and Plan 03 (`reply_in_thread`/`draft_comment`/`resolve_thread` tools) are unblocked
- No blockers

---
*Phase: 05-walkthrough-inline-threaded-comments*
*Completed: 2026-04-22*
