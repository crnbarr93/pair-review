---
status: complete
phase: 04-llm-summary-checklist-self-review
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-04-SUMMARY.md, 04-05-SUMMARY.md, 04-06-SUMMARY.md, 04-07-SUMMARY.md, 04-08-SUMMARY.md]
started: 2026-04-20T13:42:00Z
updated: 2026-04-21T17:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start — Server boots with Phase 4 tools
expected: Kill any running server. Start fresh. Server boots without errors. No crash on new Phase 4 tool registrations. MCP stdio channel accepts connections.
result: pass

### 2. StageStepper Layout
expected: Open the review UI in browser. The layout has THREE rows: TopBar (44px) + StageStepper (52px) + main content. StageStepper shows 4 steps: Summary ("Not generated"), Self-review ("Not run"), Walkthrough (disabled, "Phase 5"), Submit (disabled, "Phase 6"). Steps 3-4 are muted/dimmed with tooltips.
result: pass

### 3. Summary Flow — set_pr_summary lands
expected: Have Claude invoke set_pr_summary with a structured summary. StageStepper step 1 transitions to "done" showing intent + confidence. Clicking step 1 opens the SummaryDrawer.
result: pass

### 4. Self-Review Flow — FindingsSidebar auto-opens
expected: Have Claude invoke run_self_review with findings. FindingsSidebar auto-opens. Coverage chips appear.
result: pass

### 5. Click-to-Scroll on Finding
expected: Click a finding's file:line reference in the FindingsSidebar. The DiffViewer scrolls to the referenced line.
result: pass

### 6. Regenerate — Silent Atomic Replace
expected: Have Claude invoke set_pr_summary again with a different paraphrase. SummaryDrawer content updates silently.
result: pass

### 7. Eval Harness — Tests Pass
expected: Run `cd server && pnpm run test:eval`. All 19 eval tests pass (dim-02 anchor correctness, dim-03 verdict calibration, dim-04 coverage breadth). No API key required.
result: pass

### 8. Full Test Suite — No Regressions
expected: Run `pnpm test -- --run`. All 328+ tests pass across server + web workspaces. No Phase 1-3 regressions.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
