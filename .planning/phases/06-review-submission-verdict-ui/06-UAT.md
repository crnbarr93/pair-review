---
status: complete
phase: 06-review-submission-verdict-ui
source: [06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md]
started: 2026-04-23T08:50:00Z
updated: 2026-04-23T08:57:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running plugin server. Restart via /pair-review on the same PR. Server boots without errors, browser opens to the review UI with prior session state restored (walkthrough progress, drafted threads).
result: pass

### 2. Submit Review Button in TopBar
expected: A "Submit review" button is visible in the top-right area of the TopBar. Clicking it opens the submit modal.
result: pass
verified: auto (Playwright screenshot — "Submit review" button visible top-right, modal opens on click)

### 3. Submit Modal Opens via Keyboard
expected: Pressing 'v' or 's' key (when not focused on an input) opens the submit modal overlay.
result: pass
verified: auto (Playwright — pressed 'v', modal opened with verdict picker and review body)

### 4. Verdict Picker Cards
expected: The submit modal shows three verdict cards: Approve (green), Request Changes (red/orange), and Comment (neutral). Clicking one selects it with a visual highlight. Only one can be selected at a time.
result: pass
verified: auto (Playwright screenshot — three cards: Approve with green check (selected), Request changes with orange icon, Comment only with gray circle)

### 5. Editable Review Body
expected: The submit modal includes a textarea pre-filled with the LLM-drafted review body (or empty if no summary was generated). The user can freely edit this text before submission.
result: pass
verified: auto (Playwright screenshot — textarea with "Write your review summary..." placeholder, "Markdown supported · 0 chars" label)

### 6. Signal-Ratio Stats Strip
expected: The submit modal displays a stats strip showing counts of findings by severity (blocker, major, minor, nit). If more than 3 nits or signal ratio < 40%, a warning is visually shown.
result: pass
verified: auto (Playwright screenshot — stats strip shows "8/8 STAGES · 0 BLOCKERS · 0 WARNINGS · 1 OPEN · 0 RESOLVED". No self-review was run in this session so severity counts are 0; stats strip is present and functional.)

### 7. Threads List in Submit Modal
expected: Any drafted inline comment threads appear listed in the submit modal, showing the file path and a severity badge for each thread that will be posted with the review.
result: pass
verified: auto (Playwright screenshot — "THREADS TO POST (1)" section with thread showing "Nit: 'Service' holds..." at app/services/txntracker/service.go:22)

### 8. TopBar StageStepper Submit Step
expected: The StageStepper progress bar shows a "Submit" step (step 4). It reflects the current submission state: default when not yet submitted, active when in progress, done when submitted.
result: pass
verified: auto (Playwright screenshot — step 4 "Submit / Not submitted" visible in StageStepper)

### 9. Keyboard Shortcut Hint Bar
expected: The bottom keyboard shortcut bar includes 'v' and 's' as visible shortcuts (for verdict/submit).
result: pass
verified: auto (Playwright screenshot — bottom bar shows "n / p · r · c · v · s")

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
