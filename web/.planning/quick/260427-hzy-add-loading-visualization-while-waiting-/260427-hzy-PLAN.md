---
title: "Add loading visualization while waiting for summary, walkthrough and self-review generation"
quick_id: "260427-hzy"
date: "2026-04-27"
---

# Quick Plan: Loading Visualization for Review Generation

## Context

When a review starts, Claude generates three artifacts in sequence: PR summary, walkthrough, and self-review. Currently, the UI shows static placeholder text ("Summary not generated yet", empty div, "Self-review not run yet") with no animation or visual cue that generation is in progress. The user has no way to know Claude is actively working.

## Approach

Add animated "generating" indicators to all three empty states. Since there is no explicit "generating" flag from the server (we only know `null` = not yet populated), the loading state is inferred: `session.active === true` AND data is `null`.

The design uses a shimmer/pulse animation consistent with the existing design system (warm paper palette, --claude accent color, --mono font). Three touch points:

1. **Summary step empty state** — Replace centered text with a skeleton shimmer matching the SummaryStep layout (title bar, key changes list placeholders)
2. **Right panel empty states** — Walkthrough (empty `<div />`) and Findings (static text) get compact "generating" indicators with a pulsing dot animation
3. **TopBar step status text** — "Not generated" / "Not started" / "Not run" → "Generating..." with a subtle animated ellipsis when the preceding step is done (indicating this step is next in the pipeline)

## Tasks

### Task 1: Add CSS for loading animations

**Files:** `web/src/index.css`
**Action:** Add keyframes and classes for:
- `.generating-shimmer` — a skeleton shimmer effect for the summary placeholder (horizontal gradient sweep)
- `.generating-pulse` — a pulsing dot indicator for compact right-panel placeholders
- `.generating-text` — animated ellipsis for TopBar status text

Use existing CSS tokens (`--paper-2`, `--paper-3`, `--claude`, `--claude-2`, `--ink-4`). Match the existing `sm-spin` keyframe pattern.

**Verify:** CSS parses without error, animations render when applied to a test element.
**Done:** Three keyframe animations and associated utility classes added to index.css.

### Task 2: Update Summary step empty state with skeleton shimmer

**Files:** `web/src/App.tsx`
**Action:** Replace the plain-text placeholder at lines 570-580 with an animated skeleton that mirrors the SummaryStep layout:
- A shimmer bar for the heading area
- 3-4 shimmer bars for "key changes" area
- A subtle "Claude is generating the PR summary..." label below
Keep the `<RightPanel chatSlot={chatPanelSlot} />` slot unchanged.

**Verify:** When `state.summary === null`, the skeleton shimmer renders instead of static text.
**Done:** Summary empty state shows animated skeleton placeholder.

### Task 3: Update Walkthrough and Findings right-panel empty states

**Files:** `web/src/App.tsx`, `web/src/components/FindingsSidebar.tsx`
**Action:**
- **Walkthrough** (App.tsx ~line 636): Replace `<div />` with a compact generating indicator: pulsing dot + "Generating walkthrough..." text, styled with `generating-pulse`.
- **Findings** (FindingsSidebar.tsx lines 34-43): Replace "Self-review not run yet" subtitle with a pulsing dot + "Running self-review..." text when session is active.

**Verify:** Empty states render animated indicators instead of static text.
**Done:** Both right-panel empty states show generating indicators.

### Task 4: Update TopBar step status to show "Generating..." when applicable

**Files:** `web/src/components/TopBar.tsx`
**Action:** In the StepNav steps array (lines 111-150), update the `sub` text for each step:
- **Summary**: `'Not generated'` → `'Generating...'` (always first, so always show generating when null)
- **Walkthrough**: `'Not started'` → `'Generating...'` when `summary` exists (i.e., the previous step is done, so this step is next in the pipeline)
- **Review**: `'Not run'` → `'Running...'` when `walkthrough` exists
- Leave the status/done logic unchanged — only the display text changes.

**Verify:** TopBar shows "Generating..." instead of static "Not generated" at the right times.
**Done:** Step status text reflects active generation state.
