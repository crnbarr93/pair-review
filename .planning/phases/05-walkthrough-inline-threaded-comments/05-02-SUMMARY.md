---
phase: 05-walkthrough-inline-threaded-comments
plan: 02
subsystem: mcp
tags: [mcp-tools, walkthrough, threads, opaque-ids, zod, nanoid]

requires:
  - phase: 05-01
    provides: resolveHunkId and resolveLineIdExtended functions in resolve-ids.ts

provides:
  - set_walkthrough MCP tool with hunkId array validation and walkthrough.set event emission
  - reply_in_thread MCP tool with lineId/threadId routing, preExisting gate, and thread.replyAdded event emission
  - 20 total unit tests (8 + 12) covering all validation and error paths

affects:
  - 05-03 (walkthrough navigation tools depend on Walkthrough shape stored here)
  - 05-04 (thread management tools depend on Thread shape stored here)
  - 05-05 (UI rendering depends on walkthrough/threads session fields populated here)

tech-stack:
  added: []
  patterns:
    - "set_walkthrough validates every hunkId against session diff via resolveHunkId before emitting walkthrough.set"
    - "reply_in_thread duplicates .refine() runtime guard (MCP SDK strips zod refinements from Input.shape)"
    - "preExisting gate: context-line lineId rejected unless explicit preExisting:true flag set (Pitfall 12)"
    - "threadId generated server-side as th_ + nanoid(10) — never LLM-supplied"

key-files:
  created:
    - server/src/mcp/tools/set-walkthrough.ts
    - server/src/mcp/tools/reply-in-thread.ts
    - server/src/mcp/tools/__tests__/set-walkthrough.test.ts
    - server/src/mcp/tools/__tests__/reply-in-thread.test.ts
  modified: []

key-decisions:
  - "Runtime .refine() guard duplicated in handler body — MCP SDK strips zod refinements from Input.shape (same issue as Phase 4 nit cap)"
  - "preExisting gate implemented at lineKind==='context' check — unchanged context lines rejected without explicit opt-in to prevent accidental pre-existing issue flagging"

patterns-established:
  - "MCP tool pattern: export function registerXxx(mcp, manager) + export const DESCRIPTION"
  - "All hunkId/lineId validation done server-side via resolve-ids.ts — LLM never supplies raw paths"

requirements-completed: [LLM-03, LLM-05]

duration: 15min
completed: 2026-04-22
---

# Phase 5 Plan 02: set_walkthrough + reply_in_thread MCP Tools Summary

**set_walkthrough validates hunk arrays against session diff and emits walkthrough.set; reply_in_thread routes new vs existing threads with context-line preExisting gate and server-generated nanoid threadIds**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-22T09:16:00Z
- **Completed:** 2026-04-22T09:18:25Z
- **Tasks:** 2
- **Files modified:** 4 created

## Accomplishments

- `set_walkthrough` MCP tool with Zod hunkId regex gate, server-side resolveHunkId validation, and walkthrough.set event emission with all steps initialized to 'pending' status
- `reply_in_thread` MCP tool with lineId/threadId branching, preExisting gate for context-line anchors (Pitfall 12 mitigation), server-generated `th_` + nanoid(10) threadIds, and thread.replyAdded event on both new thread and reply paths
- 20 unit tests (8 + 12) covering session-not-found, garbage ID rejection, preExisting gate enforcement, thread reply routing, and DESCRIPTION content discipline

## Task Commits

1. **Task 1: set_walkthrough MCP tool + tests** - `9272266` (feat)
2. **Task 2: reply_in_thread MCP tool + tests** - `53e2763` (feat)

## Files Created/Modified

- `server/src/mcp/tools/set-walkthrough.ts` - set_walkthrough tool: hunkId validation, walkthrough.set event
- `server/src/mcp/tools/reply-in-thread.ts` - reply_in_thread tool: lineId/threadId routing, preExisting gate, nanoid threadId
- `server/src/mcp/tools/__tests__/set-walkthrough.test.ts` - 8 unit tests
- `server/src/mcp/tools/__tests__/reply-in-thread.test.ts` - 12 unit tests

## Decisions Made

- Runtime guard duplicates `.refine()` check in handler body — MCP SDK strips zod refinements from `Input.shape` at tool registration time (same pattern as Phase 4 nit cap handler)
- `th_` prefix + `nanoid(10)` = 13-character threadId: prefix makes IDs self-documenting as thread references; nanoid(10) gives 17 bits of entropy (sufficient for single-session IDs)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Walkthrough shape (`{ steps, cursor, showAll, generatedAt }`) now persisted via walkthrough.set event — Plan 05-03 walkthrough navigation tools can advance cursor and toggle showAll
- Thread shape (`{ threadId, lineId, path, line, side, preExisting, turns, resolved, createdAt }`) now persisted via thread.replyAdded — Plan 05-04 thread management tools can resolve threads and set drafts
- Both tools follow the established MCP tool registration pattern and import cleanly from resolve-ids.ts

## Self-Check

- [x] `server/src/mcp/tools/set-walkthrough.ts` exists
- [x] `server/src/mcp/tools/reply-in-thread.ts` exists
- [x] `server/src/mcp/tools/__tests__/set-walkthrough.test.ts` exists
- [x] `server/src/mcp/tools/__tests__/reply-in-thread.test.ts` exists
- [x] Commits `9272266` and `53e2763` exist in git log
- [x] All 20 tests pass
- [x] `tsc --noEmit` exits 0

## Self-Check: PASSED

---
*Phase: 05-walkthrough-inline-threaded-comments*
*Completed: 2026-04-22*
