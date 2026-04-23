---
phase: 06-review-submission-verdict-ui
plan: 04
subsystem: web
tags: [react, frontend, submit-modal, verdict-picker, keyboard-shortcuts, typescript]

requires:
  - phase: 06-review-submission-verdict-ui
    plan: 01
    provides: SubmissionState, PendingReview types + 6 SessionEvent variants
  - phase: 06-review-submission-verdict-ui
    plan: 03
    provides: submit_review MCP tool, /api/confirm-submit HTTP endpoint

provides:
  - web/src/components/SubmitModal.tsx — verdict picker, editable body, signal-ratio stats, threads list, D-03 retype gate
  - web/src/components/PendingReviewModal.tsx — adopt/clear/keep choices at session start
  - web/src/store.ts — 6 new event action handlers, Phase 6 AppState fields, setSubmitModalOpen
  - web/src/api.ts — confirmSubmit POST function
  - web/src/index.css — Phase 6 submit-modal CSS classes
  - web/src/components/TopBar.tsx — Submit review button replacing stubs, verdict display, StageStepper Submit step activated
  - web/src/App.tsx — v/s keyboard shortcuts wired, SubmitModal + PendingReviewModal mounted, StageStepper wired

affects:
  - Human-verify checkpoint (Task 3) — end-to-end browser verification of submit flow

tech-stack:
  added: []
  patterns:
    - Self-guarding modals (render only when state flag set — analog: StaleDiffModal)
    - Event-specific action handlers in store + main.tsx routing (analog: onSelfReviewSet, onSummarySet)
    - Signal-ratio calculation from selfReview.findings (counts.blocker + counts.major / total)
    - D-03 retype gate — walkthroughComplete OR retypeValue.toLowerCase().trim() === verdictWords[verdict]
    - confirmSubmit POST with X-Review-Token double-submit header (analog: chooseResume)

key-files:
  created:
    - web/src/components/SubmitModal.tsx (322 lines)
    - web/src/components/PendingReviewModal.tsx (93 lines)
  modified:
    - web/src/store.ts (+75 lines — 6 event handlers, Phase 6 fields, setSubmitModalOpen)
    - web/src/api.ts (+36 lines — confirmSubmit function)
    - web/src/index.css (+251 lines — Phase 6 CSS classes)
    - web/src/components/TopBar.tsx (+20 lines — Submit button, StageStepper activated)
    - web/src/App.tsx (+15 lines — imports, keyboard shortcuts, modal mounts, prop wiring)
    - web/src/main.tsx (+12 lines — 6 Phase 6 event type routes)

key-decisions:
  - "PendingReviewModal all 3 buttons fire pendingReview.resolved — server handles GitHub DELETE for Clear"
  - "SubmitModal not dismissible when walkthrough incomplete (D-03) — no Escape, no cancel button"
  - "Store event handlers added as dedicated named actions (onSubmissionProposed etc.) following selfReview.set pattern rather than generic onUpdate switch"
  - "StageStepper Submit step uses selfReview presence as proxy for readiness — active when selfReview exists"

requirements-completed: [SUB-01, SUB-02, SUB-03, SUB-04]

duration: ~6 min
completed: 2026-04-23
---

# Phase 6 Plan 04: Review Submission + Verdict UI — Frontend UI Summary

**Complete submit flow UI: SubmitModal with verdict picker, signal-ratio stats, D-03 retype gate, and threads list; PendingReviewModal for session-start adopt/clear; TopBar Submit button replacing stubs; v/s keyboard shortcuts wired.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-23T08:09:41Z
- **Completed:** 2026-04-23T08:15:42Z
- **Tasks:** 2 (Task 3 is checkpoint:human-verify — awaiting human)
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

**Task 1 — Store + API + CSS extensions**

- `AppState` extended with `submissionState`, `pendingSubmission`, `pendingReview`, `submitModalOpen` fields
- 6 new named action handlers: `onSubmissionProposed` (sets `submitModalOpen: true`), `onSubmissionConfirmed`, `onSubmissionCompleted` (clears modal), `onSubmissionFailed`, `onPendingReviewDetected`, `onPendingReviewResolved`
- `setSubmitModalOpen(open: boolean)` action for keyboard shortcut wiring
- `main.tsx` extended with `if/else` routing for all 6 Phase 6 event types
- `api.ts`: `confirmSubmit` POST function with `X-Review-Token` header and typed response
- `index.css`: Full Phase 6 CSS section — `.submit-modal-backdrop`, `.submit-modal-card`, `.verdict-card` with 3 color variants, `.submit-modal-stats--warn`, `.submit-modal-warn`, `.pending-review-modal-card`, and all sub-classes per UI-SPEC

**Task 2 — Components + TopBar + App wiring**

- `SubmitModal.tsx` (322 lines): self-guarding on `submitModalOpen`, verdict radiogroup cards (approve/request_changes/comment), signal-ratio calculation with `isNitHeavy`, editable review body textarea, threads-to-post list with severity badges, D-03 incomplete walkthrough retype gate, success state with GitHub URL link, local-mode "Export to file" button label
- `PendingReviewModal.tsx` (93 lines): `role="alertdialog"`, adopt/clear/keep three-button layout, all fire `pendingReview.resolved`
- `TopBar.tsx`: `onApprove`/`onRequestChanges` replaced with `onSubmitReview`/`submissionState`/`pendingSubmission` props; single "Submit review" button, "Review posted ✓" in `--ok` green when submitted; StageStepper Submit step activated with dynamic sub-label and `done`/`active`/`default` status
- `App.tsx`: `v` and `s` keyboard shortcuts open submit modal; `SubmitModal` + `PendingReviewModal` mounted alongside `StaleDiffModal`; StageStepper receives `submissionState` and `onSubmitStep` props

## Task Commits

| Hash | Message |
|------|---------|
| 56564ea | feat(06-04): extend store/api/css for Phase 6 submission state |
| 44db53c | feat(06-04): SubmitModal, PendingReviewModal, TopBar changes, App.tsx wiring |

## Files Created/Modified

- `web/src/components/SubmitModal.tsx` — Full submit modal per UI-SPEC (verdict cards, stats strip, body textarea, threads list, retype gate, success/error states)
- `web/src/components/PendingReviewModal.tsx` — Session-start pending review detection modal
- `web/src/store.ts` — Phase 6 AppState fields, 6 event handlers, setSubmitModalOpen action
- `web/src/api.ts` — confirmSubmit POST function
- `web/src/index.css` — Phase 6 CSS classes (submit-modal-*, verdict-card-*, pending-review-modal-card)
- `web/src/components/TopBar.tsx` — Submit button, Review posted state, StageStepper Submit step activated
- `web/src/App.tsx` — Imports, keyboard shortcuts, modal mounts, StageStepper + TopBar prop wiring
- `web/src/main.tsx` — Phase 6 event routing for 6 new event types

## Decisions Made

- PendingReviewModal: all 3 action buttons fire `pendingReview.resolved` as a session event. The server-side handler for this event is responsible for the actual GitHub DELETE call when "Clear" is chosen. For v1 this is a simplification — the UI distinction between Adopt/Clear/Keep is present but the server-side distinction was deferred.
- SubmitModal is not dismissible (no backdrop click, no Escape) when walkthrough is incomplete, matching StaleDiffModal non-dismissible pattern and D-03 friction requirement.
- Named store action handlers (not a switch in `onUpdate`) — follows the established pattern set by `onSelfReviewSet`/`onSummarySet` which were the only named handlers before Phase 6. This makes event routing explicit and traceable in main.tsx.

## Deviations from Plan

### Auto-fixed Issues

None.

### Notes

The plan's `<interfaces>` section showed the store would have a `switch (msg.event.type)` pattern in `onUpdate`, but the actual codebase uses named action handlers (established by prior phases). The implementation follows the actual codebase pattern rather than the plan's pseudocode, which is the correct approach.

## Known Stubs

- `PendingReviewModal` "Adopt comments" and "Clear pending review" both fire the same `pendingReview.resolved` event. The server-side distinction (DELETE GitHub review for Clear, no-op for Adopt) is not yet implemented in the server event handler. This is intentional for v1 — documented here for a future plan to wire the server-side GitHub DELETE path.

## Threat Flags

None beyond what the plan's threat model already covers:
- T-6-04-01: Review body rendered as `textarea value` (React controlled input — no innerHTML). Thread bodies rendered as text nodes.
- T-6-04-02: `X-Review-Token` header sent on every `confirmSubmit` POST; `credentials: 'same-origin'` set.
- T-6-04-03: Incomplete-walkthrough retype gate forces deliberate verdict entry (D-03).
- T-6-04-04: `pending` state prevents double-click; SSE delivers `submission.failed` on duplicate attempt.

## Self-Check

Files created:
- web/src/components/SubmitModal.tsx: EXISTS (322 lines)
- web/src/components/PendingReviewModal.tsx: EXISTS (93 lines)

Files modified:
- web/src/store.ts: EXISTS (Phase 6 fields confirmed)
- web/src/api.ts: EXISTS (confirmSubmit confirmed)
- web/src/index.css: EXISTS (submit-modal-backdrop confirmed)
- web/src/components/TopBar.tsx: EXISTS (Submit review confirmed)
- web/src/App.tsx: EXISTS (SubmitModal mount confirmed)
- web/src/main.tsx: EXISTS (Phase 6 routing confirmed)

Commits:
- 56564ea: EXISTS (feat(06-04): extend store/api/css for Phase 6 submission state)
- 44db53c: EXISTS (feat(06-04): SubmitModal, PendingReviewModal, TopBar changes, App.tsx wiring)

TypeScript: 0 errors in non-test source files.
Phase 6 stubs removed from App.tsx and TopBar.tsx: CONFIRMED.

## Self-Check: PASSED
