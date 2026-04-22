---
phase: 06-review-submission-verdict-ui
plan: 03
subsystem: api
tags: [mcp-tool, http-endpoint, submit-flow, two-step-confirm, typescript, vitest]

requires:
  - phase: 06-review-submission-verdict-ui
    plan: 01
    provides: SubmissionStatus, SubmissionState, PendingReview types + 6 SessionEvent variants + reducer branches
  - phase: 06-review-submission-verdict-ui
    plan: 02
    provides: submitGithubReview, exportReviewMarkdown, detectPendingReview, collectPostableThreads

provides:
  - server/src/mcp/tools/submit-review.ts — submit_review MCP tool (10th and final tool, D-13)
  - server/src/http/routes/confirm-submit.ts — POST /api/confirm-submit HTTP handler
  - server/src/mcp/tools/__tests__/submit-review.test.ts — 9 MCP tool unit tests
  - server/src/http/routes/__tests__/confirm-submit.test.ts — 10 HTTP route unit tests
  - start-review.ts modified — pending-review detection at GitHub session start (D-08)
  - session-events.ts modified — pendingReview.resolved added to browser-accepted allowlist
  - mcp/server.ts modified — submit_review registered as 10th tool
  - http/server.ts modified — mountConfirmSubmit wired into buildHttpApp

affects:
  - 06-04 (UI SubmitModal and TopBar wire to the two-step submit flow via confirmed events + /api/confirm-submit)

tech-stack:
  added: []
  patterns:
    - Two-step submit flow — LLM proposes via submit_review, user confirms via /api/confirm-submit (D-05)
    - Idempotency gate — submissionState.status === 'submitted' blocks duplicate MCP calls and returns 409 on HTTP (D-10)
    - Pending-review detection at session start — fail-open, wrapped in try/catch, logger.warn on failure (D-08, T-6-03-05)
    - Zod .strict() body schema for all /api/* POST endpoints — rejects unknown keys (T-6-03-01)
    - prKey prefix routing — gh: → Octokit, local: → markdown export

key-files:
  created:
    - server/src/mcp/tools/submit-review.ts
    - server/src/http/routes/confirm-submit.ts
    - server/src/mcp/tools/__tests__/submit-review.test.ts
    - server/src/http/routes/__tests__/confirm-submit.test.ts
  modified:
    - server/src/mcp/server.ts (added registerSubmitReview import + call — 10th tool)
    - server/src/http/server.ts (added mountConfirmSubmit import + mount)
    - server/src/http/routes/session-events.ts (added pendingReviewResolvedSchema to discriminatedUnion)
    - server/src/mcp/tools/start-review.ts (added D-08 pending-review detection block)

key-decisions:
  - "submit_review never calls Octokit directly — proposes via applyEvent, user confirms via browser (D-05)"
  - "confirm-submit endpoint parses gh: prKey as owner/repo#number for Octokit call"
  - "Pending-review detection failure is non-fatal — fail open with logger.warn (T-6-03-05)"
  - "Local mode 400 applies submission.failed before returning HTTP error — consistent state transitions"

requirements-completed: [SUB-01, SUB-02, SUB-03, SUB-04]

duration: ~10min
completed: 2026-04-22
---

# Phase 6 Plan 03: Review Submission + Verdict UI — MCP Tool, HTTP Endpoint, Server Wiring Summary

**submit_review MCP tool (10th tool) proposes reviews for browser confirmation, /api/confirm-submit handler executes GitHub or local submission with full submission state transitions and idempotency gate.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

**Task 1 — submit_review MCP tool + /api/confirm-submit endpoint + tests**

- Created `submit-review.ts` with `registerSubmitReview` — tool proposes review via `submission.proposed` event, never calls Octokit (D-05)
- Idempotency gate: returns isError if `submissionState.status === 'submitted'` (D-10)
- Content gate: refuses empty body with no drafted threads
- Local-mode guard: requires `exportPath` for `local:` prKeys
- Created `confirm-submit.ts` with `mountConfirmSubmit` — zod `.strict()` validation, GitHub + local code paths, three submission state events
- GitHub path: parses `gh:owner/repo#number` → calls `submitGithubReview` → `submission.completed`
- Local path: calls `exportReviewMarkdown` → `submission.completed`
- Both paths: `submission.confirmed` before submit, `submission.failed` on error
- 9 MCP tool unit tests, 10 HTTP route unit tests — all pass

**Task 2 — Server wiring + session-events extension + pending-review at session start**

- `mcp/server.ts`: `registerSubmitReview` added — 10th and final tool (D-13, Pitfall 15 budget met)
- `http/server.ts`: `mountConfirmSubmit` mounted — token middleware applies automatically via `/api/*`
- `session-events.ts`: `pendingReviewResolvedSchema` added to browser-accepted discriminatedUnion
- `start-review.ts`: D-08 pending-review detection runs post-startReview for GitHub PRs, fail-open with `logger.warn`

## Task Commits

| Hash | Message |
|------|---------|
| c633add | feat(06-03): create submit_review MCP tool and confirm-submit HTTP endpoint with tests |
| ba98dc5 | feat(06-03): wire server registration, session-events extension, and pending-review detection |

## Files Created/Modified

- `server/src/mcp/tools/submit-review.ts` — submit_review MCP tool: proposes review, never calls Octokit (D-05), idempotency + content + local-mode guards
- `server/src/http/routes/confirm-submit.ts` — POST /api/confirm-submit: zod .strict() validation, GitHub/local dispatch, full submission state transitions
- `server/src/mcp/tools/__tests__/submit-review.test.ts` — 9 tests: registration, session guard, duplicate gate, local guard, content gate, applyEvent, success message, error handling
- `server/src/http/routes/__tests__/confirm-submit.test.ts` — 10 tests: 400/404/409 gates, GitHub submit+complete, GitHub error+failed, local submit+complete, local 400, event ordering, strict schema
- `server/src/mcp/server.ts` — 10th tool registered
- `server/src/http/server.ts` — confirm-submit endpoint mounted
- `server/src/http/routes/session-events.ts` — pendingReview.resolved allowed from browser
- `server/src/mcp/tools/start-review.ts` — D-08 pending-review detection at GitHub session start

## Decisions Made

- `submit_review` never calls Octokit directly — it proposes via `applyEvent('submission.proposed')` only. The actual Octokit call happens in `confirm-submit.ts` after user confirms in the browser. This is the D-05 two-step flow.
- `confirm-submit.ts` applies `submission.confirmed` before the Octokit call and `submission.failed` before returning any error response — consistent state machine at every code path.
- Pending-review detection failure in `start-review.ts` is wrapped in try/catch with `logger.warn` — any auth or network error during detection must not prevent the session from starting (T-6-03-05 mitigation).
- Local mode `400` (missing exportPath) still applies `submission.failed` event before returning, keeping submission state consistent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] octokit not installed in worktree**
- **Found during:** Task 2 TypeScript compilation check
- **Issue:** `octokit@5.0.5` is in `server/package.json` (added by Plan 02) but the package was not installed in this worktree's `node_modules`. `npx tsc --noEmit` reported `Cannot find module 'octokit'`.
- **Fix:** Ran `pnpm --filter server install` to populate the worktree's node_modules with the already-declared dependency.
- **Files modified:** None (install only — lockfile unchanged since dependency was already declared)
- **Commit:** Not committed separately (no code change)

## Known Stubs

None. These are backend infrastructure modules with no UI rendering path.

## Threat Flags

All threats from the plan's threat model are mitigated:
- T-6-03-01: `confirmSubmitBody.strict()` rejects unknown keys; token middleware covers all `/api/*` routes
- T-6-03-02: `submissionId = nanoid(12)` generated server-side, embedded in review body via octokit-submit
- T-6-03-03: Duplicate submit refused at both MCP tool level (isError) and HTTP level (409)
- T-6-03-04: No role escalation possible; single-user local tool
- T-6-03-05: `detectPendingReview` wrapped in try/catch; errors logged to stderr, never exposed to browser

## Self-Check

Files created/modified:
- server/src/mcp/tools/submit-review.ts: FOUND
- server/src/http/routes/confirm-submit.ts: FOUND
- server/src/mcp/tools/__tests__/submit-review.test.ts: FOUND
- server/src/http/routes/__tests__/confirm-submit.test.ts: FOUND

Commits:
- c633add: FOUND (feat(06-03): create submit_review MCP tool and confirm-submit HTTP endpoint with tests)
- ba98dc5: FOUND (feat(06-03): wire server registration, session-events extension, and pending-review detection)

## Self-Check: PASSED
