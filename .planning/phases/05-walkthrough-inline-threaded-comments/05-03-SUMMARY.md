---
phase: 05-walkthrough-inline-threaded-comments
plan: 03
subsystem: api
tags: [typescript, mcp, thread-management, event-sourcing, zod, session-events]

# Dependency graph
requires:
  - phase: 05-walkthrough-inline-threaded-comments
    plan: 01
    provides: Thread/ThreadTurn types in shared/types.ts, thread.draftSet and thread.resolved SessionEvent variants, resolve-ids.ts resolveLineIdExtended utility
  - phase: 05-walkthrough-inline-threaded-comments
    plan: 02
    provides: set-walkthrough.ts (registerSetWalkthrough) and reply-in-thread.ts (registerReplyInThread) MCP tools for server.ts wiring

provides:
  - draft_comment MCP tool (server/src/mcp/tools/draft-comment.ts) — validates threadId exists, emits thread.draftSet
  - resolve_thread MCP tool (server/src/mcp/tools/resolve-thread.ts) — validates threadId exists, emits thread.resolved
  - Full 9-tool MCP registry in server/src/mcp/server.ts (registerAllTools now includes all Phase 5 tools)
  - session-events.ts extended with walkthrough.stepAdvanced and walkthrough.showAllToggled browser-accepted events
  - 10 unit tests covering both new tool handlers (5 each)

affects:
  - 05-04 (web store will handle all 9 MCP tool events including thread.draftSet and thread.resolved from the extended SessionEvent union)
  - 05-05 (UI components can consume thread draftBody and resolved fields from ReviewSession.threads)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Simple tool pattern (validate session → validate threadId → applyEvent) mirrors set-pr-summary.ts"
    - "session-events.ts discriminatedUnion allowlist extended per-phase; thread.* events remain server-only"
    - "All 9 MCP tools follow the same registration pattern: import registerFoo from tool module, call registerFoo(mcp, manager) in registerAllTools"

key-files:
  created:
    - server/src/mcp/tools/draft-comment.ts
    - server/src/mcp/tools/resolve-thread.ts
    - server/src/mcp/tools/__tests__/draft-comment.test.ts
    - server/src/mcp/tools/__tests__/resolve-thread.test.ts
  modified:
    - server/src/mcp/server.ts
    - server/src/http/routes/session-events.ts

key-decisions:
  - "draft_comment and resolve_thread use the same simple threadId-existence-check pattern rather than resolveLineIdExtended — the lineId was already resolved when the thread was created by reply_in_thread"
  - "walkthrough.stepAdvanced and walkthrough.showAllToggled added to session-events.ts allowlist — browser navigates the walkthrough UI; thread.* events remain server-only (posted only via MCP tools)"

patterns-established:
  - "threadId gate: check session.threads?.[threadId] before emitting thread.* events — same existence-check pattern as session/prKey gate"
  - "userEventSchema allowlist comment updated per phase to document which categories of events are intentionally excluded"

requirements-completed: [LLM-05, LLM-03, LLM-04]

# Metrics
duration: 4min
completed: 2026-04-22
---

# Phase 5 Plan 03: Remaining MCP Tools + Server Wiring Summary

**draft_comment and resolve_thread MCP tools with threadId validation, all 9 Phase 5 MCP tools registered in server.ts, and session-events.ts extended with browser walkthrough navigation events**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-22T09:15:22Z
- **Completed:** 2026-04-22T09:19:25Z
- **Tasks:** 2
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- Implemented `draft_comment` MCP tool: validates `threadId` existence against `session.threads`, emits `thread.draftSet` event with synthesized review comment body
- Implemented `resolve_thread` MCP tool: validates `threadId` existence, emits `thread.resolved` event for threads that need no posted comment
- Wired all 9 MCP tools into `registerAllTools` in `server.ts` — 5 existing + 4 Phase 5 additions (set_walkthrough, reply_in_thread, draft_comment, resolve_thread)
- Extended `session-events.ts` with `stepAdvancedSchema` and `showAllToggledSchema` allowing the browser to post walkthrough navigation events; thread.* events and walkthrough.set remain server-only
- 10 new unit tests pass (5 per tool); full 374-test suite passes; `tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement draft_comment + resolve_thread MCP tools + tests** - `87044f6` (feat)
2. **Task 2: Wire all Phase 5 tools in server.ts + extend session-events.ts** - `847b382` (feat)

## Files Created/Modified

- `server/src/mcp/tools/draft-comment.ts` — `draft_comment` MCP tool; validates threadId, emits thread.draftSet
- `server/src/mcp/tools/resolve-thread.ts` — `resolve_thread` MCP tool; validates threadId, emits thread.resolved
- `server/src/mcp/tools/__tests__/draft-comment.test.ts` — 5 tests: registration, isError paths, applyEvent call, ack text
- `server/src/mcp/tools/__tests__/resolve-thread.test.ts` — 5 tests: registration, isError paths, resolved flag, ack text
- `server/src/mcp/server.ts` — Added 4 imports + 4 registration calls; total 9 tools in registerAllTools
- `server/src/http/routes/session-events.ts` — Added stepAdvancedSchema, showAllToggledSchema; extended userEventSchema discriminatedUnion

## Decisions Made

- `draft_comment` and `resolve_thread` use simple threadId-existence-check (`session.threads?.[threadId]`) — no need for resolveLineIdExtended since lineId was already resolved when the thread was created via `reply_in_thread`
- `walkthrough.stepAdvanced` and `walkthrough.showAllToggled` added to browser-accepted event allowlist in `session-events.ts` — browser drives walkthrough cursor; `walkthrough.set` and all `thread.*` events remain server-only MCP events

## Deviations from Plan

### Minor Spec Note

**[Plan acceptance criteria mismatch] grep -c 'registerDraftComment' on source file returns 1, not "at least 2"**
- **Found during:** Task 1 acceptance criteria verification
- **Issue:** The acceptance criteria expected `grep -c 'registerDraftComment' server/src/mcp/tools/draft-comment.ts` to return at least 2 (assuming export and function definition on separate lines), but `export function registerDraftComment(...)` is a single line, so grep returns 1
- **Fix:** No code change — this is the same documented deviation from Plan 05-01 SUMMARY (grep heuristic mismatch). Functions are correctly exported and importable; `tsc --noEmit` confirms
- **Impact:** Zero functional impact

---

**Total deviations:** 1 trivial (grep heuristic mismatch, no code impact)
**Impact on plan:** No scope change. All functionality delivered as specified.

## Issues Encountered

None — set-walkthrough.ts and reply-in-thread.ts (from plan 05-02, wave 2 parallel) were already present in the repository when Task 2 executed, so no stub files were needed for tsc compilation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 9 MCP tools registered and ready for LLM use
- Browser can post walkthrough navigation events; server correctly rejects thread.* events from browser (T-5-03-03 mitigation)
- Plan 05-04 (web store handling of new event types) and Plan 05-05 (UI components) are unblocked
- No blockers

---
*Phase: 05-walkthrough-inline-threaded-comments*
*Completed: 2026-04-22*
