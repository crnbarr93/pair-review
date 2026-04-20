---
phase: "04"
plan: "06"
status: complete
started: 2026-04-20T13:02:00Z
completed: 2026-04-20T13:06:00Z
---

## Summary

Shipped `run_self_review` — the load-bearing Phase 4 tool. Adversarial-framing description with inline CHECKLIST interpolation (~400 words). Zod-enforced nit cap (<=3), lineId regex gate (Pitfall 2 BLOCKER), default verdict `request_changes` (D-05). Server-side lineId resolution maps opaque anchors to (path, line, side) before emitting `selfReview.set`. checklistItemId validated against the CHECKLIST id set.

## Self-Check: PASSED

- 11 run_self_review tests pass (happy path, default verdict, nit cap, lineId regex, lineId resolution, checklistItemId validation, unknown prKey, atomic replace, description content)
- All 309 tests pass (11 new + 298 existing)
- All 5 Phase 4 MCP tools wired in server.ts
- Nit cap moved to handler-side validation (MCP SDK's `Input.shape` doesn't propagate `.refine()`)

## Tasks

| # | Task | Status |
|---|------|--------|
| 1 | run_self_review + tests + server registration | Done |

## Key Files

### key-files.created
- `server/src/mcp/tools/run-self-review.ts` — registerRunSelfReview with adversarial framing, lineId resolution, nit cap
- `server/src/mcp/tools/__tests__/run-self-review.test.ts` — 11 tests

### key-files.modified
- `server/src/mcp/server.ts` — +2 lines (import + registration call)

## Deviations

- **Nit cap validation**: Moved from zod `.refine()` on the schema to handler-side validation. MCP SDK constructs its own validator from `Input.shape` and doesn't propagate `.refine()` refinements. The `.refine()` remains on the schema for documentation but the handler enforces it with an explicit count check returning `isError: true`.

## Notes

- nanoid was already installed in server/package.json (5.1.9)
- DESCRIPTION exported for test access (description content assertions in Plan 04-08 eval dimension tests)
- Phase 4 MCP tool surface complete: start_review + list_files + get_hunk + set_pr_summary + run_self_review (5/10 cumulative per D-14)
