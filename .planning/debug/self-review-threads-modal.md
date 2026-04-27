---
status: resolved
trigger: "Self-review findings not visible as threads in the submission modal. A previous implementation added them as inline PR comments since they have line references, but they never appeared as threads in the modal."
created: 2026-04-27
updated: 2026-04-27
---

## Symptoms

- expected: Self-review findings should appear as discussion threads in the submission modal
- actual: Findings were added as inline PR comments (they have line references) but never shown as threads in the modal
- errors: None reported
- timeline: Never worked — feature was never wired up to display in the modal
- reproduction: Run a self-review, open the submission modal, observe no threads

## Current Focus

- hypothesis: CONFIRMED — run_self_review stores findings in selfReview.findings but never creates Thread objects; the SubmitModal shows findings as static rows (not editable), unlike real threads with draftBody textareas
- test: Create threads from findings when selfReview.set fires
- expecting: Findings appear as editable threads in the submission modal
- next_action: none — fix applied
- reasoning_checkpoint: null

## Evidence

- timestamp: 2026-04-27 run-self-review.ts only fires selfReview.set event, never creates threads
- timestamp: 2026-04-27 reducer selfReview.set handler (line 50-51) only sets selfReview field, never touches threads
- timestamp: 2026-04-27 SubmitModal shows postableFindings as static rows (lines 404-415) without editable draftBody
- timestamp: 2026-04-27 anchor.ts has collectPostableFindings() which deduplicates findings vs threads by lineId
- timestamp: 2026-04-27 octokit-submit.ts already posts findings as GitHub comments via findingToOctokitComment()
- timestamp: 2026-04-27 All server-side tests pass after fix (515 pass, 1 pre-existing timeout)
- timestamp: 2026-04-27 TypeScript compiles cleanly

## Root Cause

run_self_review stores findings only in session.selfReview but never creates corresponding Thread objects in session.threads. The SubmitModal renders findings from selfReview as static, non-editable rows. Real threads (created during walkthrough) have editable draftBody textareas. The gap is that findings need to become threads so users can review/edit them before submission.

## Resolution

- root_cause: selfReview.set reducer only stored findings in selfReview blob without creating Thread objects, so findings appeared as static inline comment rows in the submit modal instead of editable discussion threads
- fix: Modified reducer selfReview.set handler to auto-create Thread objects for each finding with draftBody matching the findingToOctokitComment format. Threads use threadId prefix "finding-" for idempotent replacement on re-run. Preserves existing user/walkthrough threads at the same lineId. The anchor.ts deduplication layer automatically filters out the raw findings since threads now cover them, preventing double-posting.

## Eliminated
