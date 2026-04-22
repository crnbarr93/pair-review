---
phase: 06-review-submission-verdict-ui
plan: 02
subsystem: api
tags: [octokit, github-api, typescript, vitest, markdown-export, anchor-adapter]

requires:
  - phase: 05-walkthrough-inline-threaded-comments
    provides: Thread type with path/line/side/draftBody fields used by anchor adapter
  - phase: 04-llm-summary-checklist-self-review
    provides: Verdict type used by octokit-submit event map
  - phase: 01-plugin-skeleton-secure-vertical-slice
    provides: logger.ts pattern (stderr-only logging)

provides:
  - server/src/submit/anchor.ts — threadToOctokitComment (line+side only, D-09) and collectPostableThreads
  - server/src/submit/markdown-export.ts — exportReviewMarkdown with validateExportPath path traversal defense
  - server/src/submit/octokit-submit.ts — submitGithubReview using Octokit pulls.createReview with submissionId embedding
  - server/src/submit/pending-review.ts — detectPendingReview (paginated), clearPendingReview, getAuthenticatedLogin
  - 33 tests covering all four modules

affects:
  - 06-03 (confirm-submit HTTP endpoint calls submitGithubReview and applyEvent)
  - 06-04 (UI SubmitModal and TopBar wire to the two-step submit flow)

tech-stack:
  added: [octokit@5.0.5]
  patterns:
    - Anchor adapter using line+side only (never position) — D-09, Pitfall A/F
    - submissionId embedded as HTML comment in review body — D-10 idempotency
    - gh auth token shell-out pattern for Octokit authentication
    - octokit.paginate for paginated GitHub API calls — Pitfall D
    - validateExportPath — path traversal defense for LLM-supplied file paths

key-files:
  created:
    - server/src/submit/anchor.ts
    - server/src/submit/markdown-export.ts
    - server/src/submit/octokit-submit.ts
    - server/src/submit/pending-review.ts
    - server/src/submit/__tests__/anchor.test.ts
    - server/src/submit/__tests__/markdown-export.test.ts
    - server/src/submit/__tests__/pending-review.test.ts
  modified:
    - server/package.json (added octokit@5.0.5)
    - pnpm-lock.yaml

key-decisions:
  - "BOTH side maps to RIGHT in anchor adapter — context lines anchor on post-image side (Pitfall F)"
  - "position: undefined always in OctokitComment — never a number (D-09, Pitfall A)"
  - "submissionId embedded as HTML comment in review body for idempotency tracking (D-10)"
  - "octokit.paginate used for pending review listing — never assume single page (Pitfall D)"
  - "Pending review detection uses client-side filter: state===PENDING + user login match"
  - "getAuthenticatedLogin fetches GitHub identity server-side for spoofing defense (T-6-02-03)"
  - "validateExportPath rejects relative paths, non-.md extensions, and .. segments (T-6-02-01)"

patterns-established:
  - "Anchor adapter: single function threadToOctokitComment for all Thread->Octokit comment conversions"
  - "Paginated GitHub API calls via octokit.paginate with per_page: 100"
  - "gh auth token shell-out pattern reused from ingest/github.ts for Octokit auth"

requirements-completed: [SUB-01, SUB-03, SUB-04]

duration: 5min
completed: 2026-04-22
---

# Phase 6 Plan 02: Review Submission + Verdict UI — Submission Infrastructure Summary

**Octokit-based GitHub review submission engine with Anchor adapter (line+side only), paginated pending-review detection, path-traversal-safe markdown export, and 33 passing unit tests.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-22T13:46:00Z
- **Completed:** 2026-04-22T13:53:27Z
- **Tasks:** 2
- **Files modified:** 9 (7 created, 2 modified)

## Accomplishments

- Created `anchor.ts` with `threadToOctokitComment` (D-09 compliant: line+side only, position always undefined) and `collectPostableThreads` with 10 tests
- Created `markdown-export.ts` with `exportReviewMarkdown` (structured format per D-11) and `validateExportPath` path traversal defense (T-6-02-01) with 13 tests
- Created `octokit-submit.ts` with `submitGithubReview` using D-07 event mapping and D-10 submissionId embedding
- Created `pending-review.ts` with paginated `detectPendingReview` (D-08), `clearPendingReview`, and `getAuthenticatedLogin` with 10 tests
- octokit@5.0.5 installed as server dependency
- TypeScript compiles cleanly with no errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Install octokit + create anchor.ts and markdown-export.ts with tests** - `17affc2` (feat)
2. **Task 2: Create octokit-submit.ts and pending-review.ts with tests** - `7834c85` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `server/src/submit/anchor.ts` — Thread→OctokitComment adapter (D-09): line+side only, BOTH→RIGHT, position always undefined
- `server/src/submit/markdown-export.ts` — Local-branch review export with validateExportPath path traversal defense
- `server/src/submit/octokit-submit.ts` — GitHub review submission via Octokit pulls.createReview with submissionId embedding
- `server/src/submit/pending-review.ts` — Paginated pending review detection with client-side PENDING+login filter
- `server/src/submit/__tests__/anchor.test.ts` — 10 tests for anchor adapter (side mapping, position, filtering)
- `server/src/submit/__tests__/markdown-export.test.ts` — 13 tests for path validation and file writing
- `server/src/submit/__tests__/pending-review.test.ts` — 10 tests with mocked Octokit (pagination, user filtering, deletion)
- `server/package.json` — Added octokit@5.0.5
- `pnpm-lock.yaml` — Updated lock file

## Decisions Made

- BOTH side maps to RIGHT in anchor adapter (Pitfall F) — context lines must anchor on the post-image side to avoid wrong-line comment placement
- position is always undefined in OctokitComment — bypasses Octokit type bug (issue #614) and ensures D-09 compliance
- submissionId embedded as HTML comment `<!-- submission_id: abc123 -->` in review body per D-10 idempotency tracking
- octokit.paginate used for pending review listing — Pitfall D mitigation, never assumes a single page
- validateExportPath validates absolute path + .md extension + absence of .. before any file write — closes T-6-02-01

## Deviations from Plan

None — plan executed exactly as written. The type assertion on `comments` in octokit-submit.ts follows the Pitfall B guidance from the plan exactly.

## Issues Encountered

None. TypeScript compilation clean, all 33 tests pass.

## Known Stubs

None. These are backend infrastructure modules with no UI rendering path.

## Threat Flags

None beyond what is already mitigated:
- T-6-02-01: validateExportPath implemented
- T-6-02-02: logger.info/warn/error used, no console.log
- T-6-02-03: getAuthenticatedLogin implemented
- T-6-02-04: accepted per plan

## Next Phase Readiness

- Plan 03 (confirm-submit HTTP endpoint) can import `submitGithubReview` and `exportReviewMarkdown` directly
- Plan 03 can import `detectPendingReview` and `clearPendingReview` for session-start pending review check
- `collectPostableThreads` is ready for the confirm-submit handler to enumerate postable threads
- All four modules are independently tested and type-safe

## Self-Check

Files created:
- server/src/submit/anchor.ts: EXISTS
- server/src/submit/markdown-export.ts: EXISTS
- server/src/submit/octokit-submit.ts: EXISTS
- server/src/submit/pending-review.ts: EXISTS

Commits:
- 17affc2: EXISTS (feat(06-02): install octokit and create anchor + markdown-export)
- 7834c85: EXISTS (feat(06-02): create octokit-submit and pending-review)

## Self-Check: PASSED

---
*Phase: 06-review-submission-verdict-ui*
*Completed: 2026-04-22*
