---
phase: "04"
plan: "04"
status: complete
started: 2026-04-20T12:56:00Z
completed: 2026-04-20T12:59:00Z
---

## Summary

Shipped two read-only diff-inspection MCP tools: `list_files` (cursor-paginated file enumeration with generated-file filtering) and `get_hunk` (within-hunk cursor pagination preserving opaque lineIds). Both enforce ~2k-token response caps and return `isError: true` with corrective text on every failure path.

## Self-Check: PASSED

- 8 list_files tests pass (pagination, filter, cursor errors, size budget)
- 9 get_hunk tests pass (pagination, lineId preservation, all error paths, size budget)
- All 293 tests pass (17 new + 276 existing)
- server.ts wires both tools into startMcp() alongside start_review
- Response size verified: 30-file page < 6000 chars; 60-line hunk page < 10000 chars

## Tasks

| # | Task | Status |
|---|------|--------|
| 1 | list_files tool + tests | Done |
| 2 | get_hunk tool + tests | Done |
| 3 | Wire into server.ts startMcp() | Done |

## Key Files

### key-files.created
- `server/src/mcp/tools/list-files.ts` — registerListFiles, cursor pagination, generated-file filter
- `server/src/mcp/tools/get-hunk.ts` — registerGetHunk, within-hunk SLICE_SIZE=60 pagination
- `server/src/mcp/tools/__tests__/list-files.test.ts` — 8 tests
- `server/src/mcp/tools/__tests__/get-hunk.test.ts` — 9 tests

### key-files.modified
- `server/src/mcp/server.ts` — +4 lines (2 imports + 2 registration calls)

## Deviations

None. SLICE_SIZE=60 as planned. Manager method confirmed as `manager.get(prKey)`.

## Notes

- Both tools use `@shared/types` path alias (consistent with start-review.ts pattern) rather than relative `../../../../shared/types.js` paths
- Cursor encoding uses base64 of integer offset — simple and opaque enough for LLM consumption
- get_hunk does NOT filter generated files (per D-16: filter is at list_files enumeration level only)
