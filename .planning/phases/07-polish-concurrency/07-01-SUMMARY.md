---
phase: 07-polish-verification
plan: 01
subsystem: testing
tags: [vitest, identity, auth, pitfall-verification, fail-open]

# Dependency graph
requires:
  - phase: 06-review-submission
    provides: full plugin renamed to 'gr'; ReviewSession type surface
provides:
  - AuthIdentity interface in shared/types.ts
  - ReviewSession.authenticatedUser field (optional, Phase 7 addition)
  - fetchAuthIdentity module (fail-open, mismatch detection)
  - pitfall-verify integration tests (Pitfalls 8, 9, 16)
  - green test baseline (start-review.test.ts stale assertion fixed)
affects: [07-02-PLAN, 07-03-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "vi.importActual bypasses file-level vi.mock for real module access in mixed-mock test files"
    - "fetchAuthIdentity fail-open: outer try/catch returns null on any error; inner try/catch for mismatch detection also returns false on failure"

key-files:
  created:
    - server/src/ingest/identity.ts
    - server/src/ingest/__tests__/identity.test.ts
    - server/src/__tests__/pitfall-verify.test.ts
  modified:
    - server/src/mcp/tools/__tests__/start-review.test.ts
    - shared/types.ts
    - commands/pair-review.md

key-decisions:
  - "vi.importActual used in pitfall-verify.test.ts to access real writeState/readState inside a file that also mocks store.js for Pitfall 9 tests — avoids needing to split into separate files"
  - "commands/pair-review.md tool names updated from mcp__git-review-plugin__* to mcp__gr__* as deviation Rule 2 (missing critical): plugin renamed to 'gr' in plugin.json but commands file was stale"

patterns-established:
  - "identity.ts fail-open: outer try returns null on network/parse error; inner detectTokenMismatch returns false on detection failure"
  - "pitfall verification: describe('Pitfall N — ...') naming convention for automated D-06 evidence"

requirements-completed: [SESS-04]

# Metrics
duration: 15min
completed: 2026-04-28
---

# Phase 07 Plan 01: Green Baseline + Auth Identity Foundation Summary

**Green test baseline restored (5 stale assertions fixed), AuthIdentity type + fail-open fetchAuthIdentity module created, Pitfalls 8/9/16 automated with 4 integration tests — 532 total tests passing**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-28T09:18:00Z
- **Completed:** 2026-04-28T09:22:18Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Fixed 5 stale `'git-review-plugin'` assertions in `start-review.test.ts` (plugin renamed to `gr` in Phase 6 but test was not updated)
- Added `AuthIdentity` interface and `ReviewSession.authenticatedUser` field to `shared/types.ts` with Phase 7 security annotations
- Created `server/src/ingest/identity.ts` exporting `fetchAuthIdentity` with double-layer fail-open (outer returns null, inner mismatch check returns false) and GITHUB_TOKEN mismatch detection
- Created 7 unit tests for identity module covering success, fail-open scenarios, mismatch true/false/error, env-token skip
- Created pitfall-verify integration tests: Pitfall 8 (disk round-trip), Pitfall 9 (staleDiff populated on SHA mismatch), Pitfall 16 (two port:0 servers get distinct ports)
- Full test suite: 532 tests, 65 test files, all passing

## Task Commits

1. **Task 1: Fix stale assertions, add AuthIdentity type, create identity module** - `43f27e0` (feat)
2. **Task 2: Pitfall verification integration tests** - `51dfb12` (test)

**Plan metadata:** (final docs commit to follow)

## Files Created/Modified

- `server/src/ingest/identity.ts` — fetchAuthIdentity with fail-open and GITHUB_TOKEN mismatch detection
- `server/src/ingest/__tests__/identity.test.ts` — 7 unit tests for identity module
- `server/src/__tests__/pitfall-verify.test.ts` — integration tests for Pitfalls 8, 9, 16
- `server/src/mcp/tools/__tests__/start-review.test.ts` — fixed 5 stale 'git-review-plugin' → 'gr' assertions
- `shared/types.ts` — AuthIdentity interface + ReviewSession.authenticatedUser field
- `commands/pair-review.md` — updated all mcp__git-review-plugin__ → mcp__gr__ tool names (deviation)

## Decisions Made

- `vi.importActual` used in pitfall-verify.test.ts to access the real `writeState`/`readState` inside a file that also has file-level `vi.mock('../persist/store.js')` for Pitfall 9 — avoids splitting into separate files while testing the real persistence for Pitfall 8.
- SESS-04 (multi-session concurrency) acknowledged as deferred to backlog per D-01 — no implementation in Phase 7. Requirement ID tracked for traceability only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated commands/pair-review.md tool names to use 'gr' namespace**
- **Found during:** Task 1 (fixing start-review.test.ts assertions)
- **Issue:** Plugin was renamed from `git-review-plugin` to `gr` in plugin.json (prior Phase 6 quick task), but `commands/pair-review.md` still referenced `mcp__git-review-plugin__*` tool names throughout the `allowed-tools` frontmatter. The stale names would mean Claude Code's allowed-tools list would not match the actual MCP server's tool registration, silently blocking tool calls.
- **Fix:** Updated all `mcp__git-review-plugin__` occurrences to `mcp__gr__` in `commands/pair-review.md`
- **Files modified:** `commands/pair-review.md`
- **Verification:** `start-review.test.ts` assertion for `mcp__gr__start_review` now passes; grep confirms zero `git-review-plugin` occurrences in test file
- **Committed in:** `43f27e0` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical)
**Impact on plan:** Necessary correctness fix — stale tool namespace in allowed-tools would silently prevent Claude from calling MCP tools during a live review session. No scope creep.

## Issues Encountered

- **Pitfall 8 test mock conflict:** File-level `vi.mock('../persist/store.js')` (needed for Pitfall 9's SessionManager tests) intercepted the real store when Pitfall 8 tried `await import('../persist/store.js')`. Resolved by using `vi.importActual` which bypasses registered mocks and loads the real module — clean solution that avoids splitting into separate test files.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced beyond what the plan's `<threat_model>` documents. `identity.ts` (T-07-01, T-07-02) mitigated as planned: tokens never logged, JSON.parse wrapped in fail-open try/catch.

## Next Phase Readiness

- `fetchAuthIdentity` module is ready for integration into `SessionManager.startReview` in Plan 02
- `AuthIdentity` type available to both server and web via `shared/types.ts`
- Green baseline confirmed: all 532 tests pass
- Plans 02 and 03 can proceed without baseline risk

## Self-Check: PASSED

- identity.ts: FOUND
- identity.test.ts: FOUND (7 it() blocks)
- pitfall-verify.test.ts: FOUND (3 Pitfall describe blocks)
- 07-01-SUMMARY.md: FOUND
- Commit 43f27e0: FOUND
- Commit 51dfb12: FOUND
- AuthIdentity interface: FOUND in shared/types.ts
- authenticatedUser field: FOUND in shared/types.ts
- fetchAuthIdentity export: FOUND in identity.ts
- fail-open return null: FOUND in identity.ts

---
*Phase: 07-polish-verification*
*Completed: 2026-04-28*
