---
phase: 05-walkthrough-inline-threaded-comments
fixed_at: 2026-04-22T12:15:00Z
review_path: .planning/phases/05-walkthrough-inline-threaded-comments/05-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-04-22T12:15:00Z
**Source review:** .planning/phases/05-walkthrough-inline-threaded-comments/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: Stale closure in keydown handler captures outdated focusedHunkId and state.threads

**Files modified:** `web/src/App.tsx`
**Commit:** edfb29a
**Applied fix:** Added `focusedHunkId` and `state.threads` to the `useEffect` dependency array for the global keydown handler. The 'c' key branch reads both values inside the closure, so they must be listed as deps to avoid capturing stale initial values.

### WR-02: Reducer spreads potentially undefined thread in thread.draftSet and thread.resolved

**Files modified:** `server/src/session/reducer.ts`
**Commit:** 978bd60
**Applied fix:** Added early-return guards in both `thread.draftSet` and `thread.resolved` cases. Each now extracts the existing thread via `s.threads?.[e.threadId]` and returns `s` unchanged if the thread is not found, preventing spread of `undefined` into a malformed Thread object.

### WR-03: ThreadCard useEffect sync condition misses re-sync when server updates draftBody after user clears textarea

**Files modified:** `web/src/components/ThreadCard.tsx`
**Commit:** 2718530
**Applied fix:** Replaced the fragile `localDraft === ''` condition with a `useRef(false)` tracking whether the user has manually edited the textarea. The `useEffect` now syncs from `thread.draftBody` whenever it changes, as long as `userHasEdited.current` is false. The `onChange` handler sets the ref to `true` on first user keystroke, blocking further server-driven overwrites. Also removed the `eslint-disable-next-line` suppression since the deps array is now correct.

### WR-04: handleSkipStep and handleNextStep have identical logic -- skip does not mark step as skipped

**Files modified:** `shared/types.ts`, `server/src/session/reducer.ts`, `web/src/App.tsx`
**Commit:** 6994850
**Applied fix:** Added an optional `skippedIndex` field to the `walkthrough.stepAdvanced` event type. The reducer now checks for `e.skippedIndex` and sets the targeted step's status to `'skipped'` (instead of `'visited'`). `handleSkipStep` in App.tsx now passes `skippedIndex: state.walkthrough.cursor` and also scrolls to the next step (matching `handleNextStep` UX). This makes the "Skip step" button semantically distinct: it marks the current step as skipped rather than visited, and provides visual feedback by scrolling forward. Status: fixed: requires human verification (logic change).

## Skipped Issues

None -- all findings were fixed.

---

_Fixed: 2026-04-22T12:15:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
