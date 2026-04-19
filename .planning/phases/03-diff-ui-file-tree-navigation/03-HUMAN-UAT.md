---
status: partial
phase: 03-diff-ui-file-tree-navigation
source: [03-VERIFICATION.md]
started: 2026-04-19T21:10:00Z
updated: 2026-04-19T21:10:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Visual paper-palette readability on real PR
expected: GitHub-style unified diff renders with paper-palette (github-light) Shiki colors; readable contrast on light background; file-tree sidebar on the left showing all non-generated files; per-file status dots in correct colors (ok/warn/ink-4).
result: [pending]

### 2. Unified / Split toggle visual correctness
expected: Split mode renders side-by-side left/right columns; content distinguishable from unified; smooth transition.
result: [pending]

### 3. Real keyboard navigation flow (n/p/c/r/v/s)
expected: n/p scroll smoothly to next hunk with wrap-around toast; r flips file dot and triggers server round-trip; c/v/s show Phase-5/Phase-6 stub toast copy.
result: [pending]

### 4. Real GitHub PR with existing inline comments
expected: muted-grey thread-marker in gutter of commented line; click opens popover with author, createdAt, body text, "View on GitHub ↗" link.
result: [pending]

### 5. Real GitHub PR with CI checks
expected: TopBar CI pill shows correct palette (pass=green, fail=red, pending=amber); click expands dropdown with each check name · bucket and external ↗ link.
result: [pending]

### 6. Generated file collapse/expand UX (package-lock.json)
expected: File row muted with "Excluded" label; section collapsed with "This file is auto-collapsed… Expand" affordance; expand reveals hunks and persists across reload.
result: [pending]

### 7. IntersectionObserver auto-in-progress timing on real scroll
expected: After ~500ms of a file being ≥50% in the viewport, its dot changes from untouched to in-progress automatically (single server round-trip per file).
result: [pending]

### 8. INPUT-focus guard against stolen keystrokes
expected: Keyboard shortcuts do NOT fire while an `<input>` is focused; existing hunks do not advance.
result: [pending]

### 9. Open Decision 1 operational render budget
expected: First paint ≤500ms on a real 30-50 hunk PR from `/pair-review` dispatch; no flash of unstyled content; Shiki tokens appear colored on first render.
result: [pending]

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps
