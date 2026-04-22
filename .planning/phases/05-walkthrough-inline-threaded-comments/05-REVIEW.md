---
phase: 05-walkthrough-inline-threaded-comments
reviewed: 2026-04-22T12:00:00Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - server/src/http/routes/session-events.ts
  - server/src/mcp/server.ts
  - server/src/mcp/tools/__tests__/draft-comment.test.ts
  - server/src/mcp/tools/__tests__/reply-in-thread.test.ts
  - server/src/mcp/tools/__tests__/resolve-thread.test.ts
  - server/src/mcp/tools/__tests__/set-walkthrough.test.ts
  - server/src/mcp/tools/draft-comment.ts
  - server/src/mcp/tools/reply-in-thread.ts
  - server/src/mcp/tools/resolve-ids.ts
  - server/src/mcp/tools/resolve-thread.ts
  - server/src/mcp/tools/set-walkthrough.ts
  - server/src/session/__tests__/reducer-phase5.test.ts
  - server/src/session/reducer.ts
  - shared/types.ts
  - web/src/__tests__/App.keyboard.test.tsx
  - web/src/__tests__/DiffViewer.test.tsx
  - web/src/App.tsx
  - web/src/components/__tests__/StaleDiffModal.test.tsx
  - web/src/components/DiffViewer.tsx
  - web/src/components/ThreadCard.tsx
  - web/src/components/TopBar.tsx
  - web/src/components/WalkthroughBanner.tsx
  - web/src/components/WalkthroughStepList.tsx
  - web/src/index.css
  - web/src/store.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-04-22T12:00:00Z
**Depth:** standard
**Files Reviewed:** 25
**Status:** issues_found

## Summary

Phase 5 introduces walkthrough (hunk-by-hunk narrative), inline threaded comments (reply_in_thread, draft_comment, resolve_thread MCP tools), and the supporting UI components (ThreadCard, WalkthroughBanner, WalkthroughStepList). The overall architecture is sound: the reducer is pure and well-tested, MCP tools validate inputs and fail gracefully, the shared type surface is cleanly extended, and LLM-authored text is consistently rendered via React text nodes (never innerHTML). Security posture is strong.

Key concerns center on a stale-closure bug in the keydown handler's 'c' key branch and a defensive gap in the reducer where spreading an undefined thread produces a malformed object.

## Warnings

### WR-01: Stale closure in keydown handler captures outdated `focusedHunkId` and `state.threads`

**File:** `web/src/App.tsx:263-321`
**Issue:** The `useEffect` keydown handler at line 263 reads `focusedHunkId` (line 293) and `state.threads` (line 296) inside the `case 'c':` branch. However, the dependency array at line 321 is `[advanceHunk, markCurrentFileReviewed, showToast]` -- neither `focusedHunkId` nor `state` (or `state.threads`) is listed. The closure captures the values from the first render (or last dep-change render), so pressing 'c' after navigating to a hunk or after threads are created will use stale values. `focusedHunkId` will always be `null` (its initial useState value), and `state.threads` will be the empty object.

**Fix:** Add `focusedHunkId` and `state.threads` to the dependency array, or extract the 'c' handler into a `useCallback` that depends on them:
```typescript
  }, [advanceHunk, markCurrentFileReviewed, showToast, focusedHunkId, state.threads]);
```

### WR-02: Reducer spreads potentially undefined thread in `thread.draftSet` and `thread.resolved`

**File:** `server/src/session/reducer.ts:79-92`
**Issue:** In the `thread.draftSet` case (line 83), the expression `{ ...s.threads[e.threadId], draftBody: e.body }` will produce `{ draftBody: e.body }` if `s.threads[e.threadId]` is undefined -- a malformed Thread object missing `threadId`, `lineId`, `path`, `line`, `side`, `turns`, `resolved`, `createdAt`. The same issue exists for `thread.resolved` at line 90 where `{ ...s.threads[e.threadId], resolved: true }` would produce `{ resolved: true }`. While the MCP tool handlers guard against this by checking thread existence before calling `applyEvent`, the reducer itself is not defensive, and a future caller or event replay could trigger malformed state.

**Fix:** Add a guard that returns the session unchanged when the threadId is not found:
```typescript
case 'thread.draftSet': {
  const existing = s.threads?.[e.threadId];
  if (!existing) return s;
  return {
    ...s,
    threads: { ...s.threads, [e.threadId]: { ...existing, draftBody: e.body } },
  };
}
case 'thread.resolved': {
  const existing = s.threads?.[e.threadId];
  if (!existing) return s;
  return {
    ...s,
    threads: { ...s.threads, [e.threadId]: { ...existing, resolved: true } },
  };
}
```

### WR-03: ThreadCard `useEffect` sync condition misses re-sync when server updates draftBody after user clears the textarea

**File:** `web/src/components/ThreadCard.tsx:26-31`
**Issue:** The `useEffect` that syncs `localDraft` from `thread.draftBody` has the condition `thread.draftBody !== undefined && localDraft === ''` (line 27). This means if the user has typed something in the textarea (making `localDraft` non-empty) and then deletes all text (making `localDraft === ''`), and then the server updates `thread.draftBody` to a new value, the effect will fire and overwrite the user's intentional empty textarea. More importantly, after the initial sync, subsequent server-side draft updates (e.g., the LLM calls `draft_comment` again with a revised body) will NOT sync to the local state because `localDraft` is no longer empty. The `eslint-disable-next-line` suppresses the exhaustive-deps warning, hiding this dependency issue. The store-level `locallyEditedDrafts` Set in `store.ts` provides partial protection, but this component-level sync remains fragile.

**Fix:** Track whether the user has manually edited via a ref, and only block server sync when the user has explicitly typed:
```typescript
const userHasEdited = useRef(false);

useEffect(() => {
  if (thread.draftBody !== undefined && !userHasEdited.current) {
    setLocalDraft(thread.draftBody);
  }
}, [thread.draftBody]);

// In the onChange handler:
onChange={(e) => {
  userHasEdited.current = true;
  setLocalDraft(e.target.value);
}}
```

### WR-04: `handleSkipStep` and `handleNextStep` have identical logic -- skip does not mark step as skipped

**File:** `web/src/App.tsx:218-242`
**Issue:** `handleSkipStep` (lines 218-225) and `handleNextStep` (lines 227-242) both compute `nextCursor` identically (`Math.min(cursor + 1, steps.length - 1)`) and both emit `walkthrough.stepAdvanced`. The only difference is `handleNextStep` also scrolls to the next hunk. Neither sets the current step's status to `'skipped'` -- the reducer's `walkthrough.stepAdvanced` handler (reducer.ts:54-67) only transitions `pending` steps with `i < cursor` to `'visited'`, never to `'skipped'`. The `WalkthroughStepStatus` type includes `'skipped'` but there is no event or reducer path that ever sets it. The "Skip step" button in WalkthroughBanner is misleading -- it does the same thing as "Next step" but without scrolling.

**Fix:** Either add a distinct `walkthrough.stepSkipped` event that sets the current step to `'skipped'` status before advancing the cursor, or add an optional `skippedIndex` field to the `walkthrough.stepAdvanced` event that the reducer can use to mark that specific step as skipped instead of visited. The `handleSkipStep` handler should also scroll (like `handleNextStep` does) to avoid a confusing UX where the user clicks "Skip" and nothing visible changes.

## Info

### IN-01: Walkthrough `generatedAt` field required by type but not validated in Zod schema

**File:** `server/src/mcp/tools/set-walkthrough.ts:73-78` and `shared/types.ts:320`
**Issue:** The `Walkthrough` type requires a `generatedAt: string` field (shared/types.ts:320). The `set_walkthrough` tool handler creates this field using `new Date().toISOString()` at line 77. However, the test fixture `makeWalkthrough` in the DiffViewer test (web/src/__tests__/DiffViewer.test.tsx:248) creates a `Walkthrough` without `generatedAt`, which TypeScript should catch. This suggests the field may be missing from the object literal type-check in tests.

**Fix:** Add `generatedAt` to test fixtures:
```typescript
const walkthrough: Walkthrough = {
  steps: [...],
  cursor: 0,
  showAll: false,
  generatedAt: '2026-04-22T00:00:00Z',
};
```

### IN-02: `Walkthrough` type in `shared/types.ts` requires `generatedAt` but `StaleDiffModal.test.tsx` fixture omits it

**File:** `web/src/components/__tests__/StaleDiffModal.test.tsx:45`
**Issue:** The `makeState` function sets `walkthrough: null`, which is fine. But the broader pattern in test fixtures suggests `generatedAt` may be silently omitted elsewhere and covered by `as unknown as Walkthrough` casts.

**Fix:** Ensure all test fixtures that construct `Walkthrough` objects include `generatedAt`.

### IN-03: Multiple `cn()` helper duplications across components

**File:** `web/src/App.tsx:23-25`, `web/src/components/ThreadCard.tsx:9-11`, `web/src/components/TopBar.tsx:6-8`, `web/src/components/WalkthroughBanner.tsx:3-5`, `web/src/components/WalkthroughStepList.tsx:3-5`
**Issue:** The `cn()` classname utility function is identically defined in 5 separate files. This is dead-simple code so correctness risk is negligible, but it adds maintenance friction if the signature ever changes.

**Fix:** Extract to a shared utility file (e.g., `web/src/utils/cn.ts`) and import from there.

---

_Reviewed: 2026-04-22T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
