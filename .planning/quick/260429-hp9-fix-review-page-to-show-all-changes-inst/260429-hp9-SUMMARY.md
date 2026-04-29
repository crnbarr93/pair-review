---
phase: quick
plan: 260429-hp9
subsystem: web-ui
status: complete
tags: [bugfix, diff-viewer, review-page]
key-files:
  modified:
    - web/src/App.tsx
metrics:
  tasks: 1
  commits: 1
  files_changed: 1
---

# Quick Task 260429-hp9: Fix review page diff filtering

## What Changed

Both `virtualList` and `filteredDiff` useMemo hooks in App.tsx were applying walkthrough hunk filtering on all steps (walkthrough, review, submission). This meant on the review page, only walkthrough-curated hunks were visible — findings referencing hunks outside that set couldn't be scrolled to.

**Fix:** Added `activeStep === 'walkthrough'` guard to both hooks. Now:
- Walkthrough step: curated filtering applies (existing behavior)
- Review/submission steps: full diff always shown (all hunks visible, all findings reachable)

Added `activeStep` to both useMemo dependency arrays.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 7f1c74e | fix: show all changes on review page instead of walkthrough-filtered view |

## Self-Check: PASSED
- Web build succeeds (vite build clean)
- 533 server tests pass
- 1 file changed, 6 lines modified
