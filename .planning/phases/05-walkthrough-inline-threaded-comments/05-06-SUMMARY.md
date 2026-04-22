---
phase: 05-walkthrough-inline-threaded-comments
plan: "06"
subsystem: web-ui
tags: [gap-closure, walkthrough, diff-filtering, reorder-affordance]
dependency_graph:
  requires: [05-05]
  provides: [walkthrough-hunk-filtering, reorder-affordance]
  affects: [web/src/App.tsx, web/src/components/WalkthroughStepList.tsx, web/src/index.css]
tech_stack:
  added: []
  patterns: [useMemo-derived-model, gap-1-closure]
key_files:
  created: []
  modified:
    - web/src/App.tsx
    - web/src/components/WalkthroughStepList.tsx
    - web/src/index.css
    - web/src/__tests__/DiffViewer.test.tsx
decisions:
  - filteredDiff-memo-at-app-level: Filtering computed in App.tsx useMemo (not inside DiffViewer) so DiffViewer internals stay unchanged; FileExplorer always receives full diff
  - reorder-hint-static-text: Read-only instructional text using React text nodes (no innerHTML) consistent with T-5-06-02 accept disposition
metrics:
  duration: "3 minutes"
  completed: "2026-04-22"
  tasks: 2
  files_modified: 4
---

# Phase 05 Plan 06: Gap Closure — Walkthrough Filtering + Reorder Affordance Summary

**One-liner:** Curated-hunk DiffModel filtering via App.tsx useMemo + WalkthroughStepList reorder affordance closes verification gaps LLM-04 and SC-1.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Filter DiffModel by walkthrough state in App.tsx + verify in DiffViewer test | `436385e` | web/src/App.tsx, web/src/__tests__/DiffViewer.test.tsx |
| 2 | Add "change this order?" affordance to WalkthroughStepList | `e129cda` | web/src/components/WalkthroughStepList.tsx, web/src/index.css |

## What Was Built

### Gap 1 Closure (LLM-04): DiffModel filtering in App.tsx

Added a `filteredDiff` useMemo between the existing `virtualList` memo and `showToast` in App.tsx. In curated mode (`walkthrough` active and `showAll=false`), the memo:

- Builds a `Set` of hunk IDs from `walkthrough.steps`
- Filters each non-generated file's hunks to only those in the set
- Drops files that have no remaining hunks
- Recomputes `totalHunks` to match the filtered count

DiffViewer now receives `filteredDiff ?? diff` instead of the raw `diff`. In show-all or no-walkthrough mode, `filteredDiff` returns `diff` unchanged — zero overhead. FileExplorer continues to receive the full `diff` so the file tree always shows all files.

Two new tests in `DiffViewer.test.tsx` verify:
1. In curated mode (showAll=false): only the hunk listed in `walkthrough.steps` appears in the DOM; non-curated hunks have no anchor element
2. In show-all mode (showAll=true): all non-generated hunk anchors are present; curated hunks carry the `hunk--curated` CSS class; non-curated hunks do not

### Gap 2 Closure (SC-1): Reorder affordance

Added a `walkthrough-reorder-hint` div to `WalkthroughStepList.tsx` between the curated/all-hunks toggle and the step list. Shows:

```
⇵  Want a different order? Ask Claude to reorder the walkthrough.
```

Uses U+21F5 (&#8693;) up-down arrow as a visual icon, `--ink-3` for secondary text color, and a `border-bottom: 1px solid var(--paper-3)` separator rule in `index.css`. Satisfies Roadmap SC-1 Pitfall 14 mitigation. Rendered as static React text nodes — no innerHTML (T-5-06-02).

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- All 75 web tests pass (10 test files), including 2 new walkthrough filtering tests
- TypeScript compiles without errors (`pnpm --filter web exec tsc --noEmit`)
- Server tests unaffected (no server changes)

## Self-Check: PASSED

- `web/src/App.tsx` — modified, filteredDiff useMemo present, DiffViewer receives `filteredDiff ?? diff`
- `web/src/__tests__/DiffViewer.test.tsx` — 2 new test cases added, 75 total tests pass
- `web/src/components/WalkthroughStepList.tsx` — walkthrough-reorder-hint div with affordance text present
- `web/src/index.css` — walkthrough-reorder-hint CSS rule present
- Commits `436385e` and `e129cda` verified in git log
