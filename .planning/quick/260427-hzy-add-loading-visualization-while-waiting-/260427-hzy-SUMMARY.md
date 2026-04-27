---
phase: quick
plan: 260427-hzy
subsystem: web-ui
tags: [loading-state, animations, ux]
key-files:
  modified:
    - web/src/index.css
    - web/src/App.tsx
    - web/src/components/FindingsSidebar.tsx
    - web/src/components/TopBar.tsx
decisions:
  - "Inferred generating state from data === null (no explicit server flag needed)"
  - "Used CSS-only animations (shimmer, pulse, ellipsis) — no JS animation libraries"
metrics:
  duration: "2 minutes"
  completed: "2026-04-27T12:05:00Z"
---

# Quick Task 260427-hzy: Loading Visualization Summary

Skeleton shimmer, pulsing dot, and animated ellipsis indicators across all three review generation empty states (summary, walkthrough, self-review) and TopBar step status.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add CSS keyframes and classes for loading animations | 343b83f | web/src/index.css |
| 2 | Replace summary empty state with skeleton shimmer | 37177a3 | web/src/App.tsx |
| 3 | Add generating indicators to walkthrough and findings empty states | 9939234 | web/src/App.tsx, web/src/components/FindingsSidebar.tsx |
| 4 | Show animated generating status in TopBar step navigation | 3f50258 | web/src/components/TopBar.tsx |

## What Changed

### CSS (index.css)
- Three new `@keyframes`: `generating-shimmer` (horizontal gradient sweep), `generating-pulse` (opacity fade), `generating-ellipsis` (step-end content animation)
- Utility classes: `.generating-shimmer`, `.generating-pulse`, `.generating-text`
- Layout classes: `.summary-skeleton` (heading + 4 line bars), `.generating-placeholder` (centered container for right-panel indicators)

### Summary Step (App.tsx)
- Replaced static "Summary not generated yet" text with animated skeleton bars matching the SummaryStep layout shape
- Added label "Claude is generating the PR summary..."

### Walkthrough Empty State (App.tsx)
- Replaced empty `<div />` fallback with pulsing dot + "Generating walkthrough..." text

### Findings Sidebar (FindingsSidebar.tsx)
- Replaced static "Self-review not run yet" subtitle with pulsing "Running self-review..." indicator

### TopBar Step Nav (TopBar.tsx)
- Summary sub-text: "Not generated" -> "Generating" with animated CSS ellipsis when null
- Walkthrough sub-text: "Not started" -> "Generating" when summary exists but walkthrough is null
- Review sub-text: "Not run" -> "Running" when walkthrough exists but selfReview is null
- Added `subGenerating` flag to step type for conditional `.generating-text` class application

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
