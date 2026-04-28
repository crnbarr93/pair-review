---
phase: 07-polish-concurrency
reviewed: 2026-04-28T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - commands/pair-review.md
  - server/src/__tests__/pitfall-verify.test.ts
  - server/src/http/__tests__/secure-headers.test.ts
  - server/src/http/middleware/secure-headers.ts
  - server/src/ingest/__tests__/identity.test.ts
  - server/src/ingest/identity.ts
  - server/src/mcp/tools/__tests__/start-review.test.ts
  - server/src/session/manager.ts
  - shared/types.ts
  - web/src/App.tsx
  - web/src/components/icons.tsx
  - web/src/components/TopBar.tsx
  - web/src/index.css
  - web/src/store.ts
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-04-28T00:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 7 adds the auth-identity badge (D-02/D-03/D-04), port-ephemeral pitfall tests, the secure-headers middleware, and a round of concurrency polish. The core security primitives (CSP, token double-submit) are correctly implemented. Two BLOCKER findings were identified: the SSE event router in `main.tsx` is missing a `walkthrough.set` branch, causing the walkthrough panel to stall in "Generating" state until a full `onUpdate` is triggered by an unrelated event; and the snapshot hydration path (`onSnapshot`) silently drops `submissionState`, `pendingSubmission`, and `pendingReview`, which corrupts resumed sessions that had in-progress or completed submissions. Four warnings cover unbounded cursor posting, a dead store action, a non-functional CI button, and a full-`process.env` spread to a child process.

---

## Critical Issues

### CR-01: `walkthrough.set` missing from SSE event router — walkthrough stalls on generation

**File:** `web/src/main.tsx:107-135`

**Issue:** The `openEventStream` update dispatcher in `main.tsx` special-cases `selfReview.set`, `summary.set`, and all submission/chat/thread events, but has no branch for `walkthrough.set`. When the LLM calls `set_walkthrough`, the resulting `walkthrough.set` SSE update falls through to `actions.onUpdate(msg)`. `onUpdate` does set `walkthrough` (store.ts:213), so the walkthrough eventually renders — but only when the next generic update arrives. More importantly, `onWalkthroughSet` exists in the store (store.ts:243) precisely to mirror the dedicated branch pattern used for `summary.set` and `selfReview.set`, but it is never called. During the window between `walkthrough.set` being emitted and the next unrelated event, the Walkthrough step nav shows "Generating" and the WalkthroughStepList shows a loading skeleton, contrary to D-01.

Contrast with the `summary.set` branch at line 109:
```typescript
} else if (msg.event?.type === 'summary.set') {
  actions.onSummarySet(msg);
}
```

**Fix:** Add the missing branch to the dispatcher in `main.tsx`:
```typescript
} else if (msg.event?.type === 'walkthrough.set') {
  actions.onWalkthroughSet(msg);
}
```

---

### CR-02: `onSnapshot` drops `submissionState`, `pendingSubmission`, and `pendingReview` — resumed sessions with in-progress submissions are corrupted

**File:** `web/src/store.ts:157-193`

**Issue:** The `onSnapshot` action (lines 157-193) rebuilds the entire app state from a server snapshot but does not include `submissionState`, `pendingSubmission`, or `pendingReview`. These three fields exist on `ReviewSession` (shared/types.ts lines 101-103), are persisted to disk via `applyEvent`, and are present in the `SnapshotMessage`. After a browser close/reopen on a session where the user had already submitted a review or was mid-submission, the store's `submissionState` remains `null` (the INITIAL value). Consequences:

- The TopBar still shows "Submit review" button instead of "Review posted" for an already-submitted session.
- The SubmissionPanel renders the wrong state.
- The submit modal can be re-opened, allowing a duplicate submission attempt.

The `onUpdate` path (lines 195-222) correctly carries all three fields. The omission is only in `onSnapshot`, the resume path.

**Fix:** Add the three missing fields to `onSnapshot`'s state spread:
```typescript
// inside onSnapshot, after pendingSubmission line
submissionState: s.submissionState ?? null,
pendingSubmission: s.pendingSubmission ?? null,
pendingReview: s.pendingReview ?? null,
```

---

## Warnings

### WR-01: `handleNextStep` sends an out-of-bounds cursor to the server when called on the last step

**File:** `web/src/App.tsx:278-292`

**Issue:** `handleNextStep` computes `nextCursor = state.walkthrough.cursor + 1` without clamping. When invoked on the last step (`cursor === steps.length - 1`), it posts `cursor: steps.length` to the server. The local `if (nextStep)` guard prevents a client-side crash, but the server receives an out-of-range cursor value in the `walkthrough.stepAdvanced` event. Whether the server's reducer accepts this silently, clamps it, or throws depends on reducer logic not in scope here, but the invariant that `cursor < steps.length` should be enforced at the source.

Contrast with `handleSkipStep` (App.tsx:262) which correctly uses `Math.min(...)`.

**Fix:**
```typescript
const handleNextStep = useCallback(() => {
  if (!prKey || !state.walkthrough) return;
  const nextCursor = Math.min(
    state.walkthrough.cursor + 1,
    state.walkthrough.steps.length - 1
  );
  postSessionEvent(prKey, {
    type: 'walkthrough.stepAdvanced',
    cursor: nextCursor,
  }).catch(() => showToast('Could not advance step. Retry.'));
  // ... rest unchanged
}, [prKey, state.walkthrough, showToast]);
```

---

### WR-02: `onWalkthroughSet` is a dead store action — it is defined but never called

**File:** `web/src/store.ts:243-245`

**Issue:** `onWalkthroughSet` is defined in the `actions` object but is never invoked from `main.tsx` (confirmed by grep). Because `walkthrough.set` falls through to `actions.onUpdate` in the current router, the dedicated action is dead code. This is entangled with CR-01 above: the fix for CR-01 makes this action live. However, if CR-01 is not fixed, `onWalkthroughSet`'s existence is misleading — it implies a dispatch path that does not exist.

**Fix:** Either wire `onWalkthroughSet` from `main.tsx` (fixing CR-01 in the process) or remove the method and keep the `onUpdate` fallthrough as intentional. The former is strongly preferred to match the pattern established for `summary.set` and `selfReview.set`.

---

### WR-03: `detectTokenMismatch` spreads all of `process.env` into child process env, including `GITHUB_TOKEN` itself

**File:** `server/src/ingest/identity.ts:43`

**Issue:**
```typescript
env: { ...process.env, GH_TOKEN: envToken },
```
The full `process.env` spread passes `GITHUB_TOKEN` (and any other secrets present in the server's environment — API keys, etc.) as environment variables to the `gh` child process. While `gh` will prefer `GH_TOKEN` over `GITHUB_TOKEN` for auth, the broader concern is that other secret env vars from the parent process are unnecessarily exposed to the child. In the plugin's single-user local context, this is lower risk, but it violates the principle of minimal privilege for child processes.

**Fix:** Pass only the minimum necessary environment:
```typescript
env: {
  HOME: process.env.HOME ?? '',
  PATH: process.env.PATH ?? '',
  GH_TOKEN: envToken,
},
```
At minimum, remove `GITHUB_TOKEN` from the child's env explicitly so it does not conflict:
```typescript
env: { ...process.env, GH_TOKEN: envToken, GITHUB_TOKEN: undefined },
```

---

### WR-04: Non-functional "Re-run all" button in CI dropdown has no handler

**File:** `web/src/components/TopBar.tsx:287`

**Issue:**
```typescript
<button type="button" className="ci-rerun-btn">Re-run all</button>
```
The "Re-run all" button renders with no `onClick` handler and no `disabled` attribute. Clicking it does nothing. For a non-functional control, this is either a stub that needs implementing or should be hidden/disabled, not silently unresponsive.

**Fix:** Either implement the handler, or mark the button visibly disabled while the feature is not yet wired:
```typescript
<button
  type="button"
  className="ci-rerun-btn"
  disabled
  title="Re-run not yet available"
>
  Re-run all
</button>
```

---

## Info

### IN-01: `pitfall-verify.test.ts` — Pitfall 16 test does not clean up servers on test failure

**File:** `server/src/__tests__/pitfall-verify.test.ts:196-231`

**Issue:** The `finally` block at line 222 correctly closes both servers. However, the server variables `server1` and `server2` are declared with `let` outside the `Promise` callbacks and populated inside them. If `serve()` itself throws (rather than calling the callback), or if the `resolve` callback is never invoked due to an internal error, the `finally` block will attempt to call `.close()` on uninitialized variables, causing a crash at cleanup time. In practice, `@hono/node-server` reliably calls the callback for `port: 0`, but the type assertion `as typeof server1` masks this.

**Fix:** Initialize the variables to `null` and guard in the `finally` block:
```typescript
let server1: { close: (cb: () => void) => void } | null = null;
let server2: { close: (cb: () => void) => void } | null = null;
// ...
} finally {
  if (server1) await new Promise<void>((res) => server1!.close(() => res()));
  if (server2) await new Promise<void>((res) => server2!.close(() => res()));
}
```

---

### IN-02: `TopBar` step nav items are interactive `div`s without keyboard accessibility

**File:** `web/src/components/TopBar.tsx:186-211`

**Issue:** The step navigation items are `<div>` elements with `onClick` and `cursor: pointer`. They carry `role="listitem"` but not `role="button"` or `tabIndex`, so they are not keyboard-focusable or activatable via Enter/Space. The `aria-current="step"` attribute is present but the items are not reachable without a pointer.

**Fix:** Change each step item to a `<button>` or add `tabIndex={0}` and an `onKeyDown` handler:
```tsx
<button
  className={cn('stage', ...)}
  role="listitem"
  aria-current={isActive ? 'step' : undefined}
  onClick={() => onStepClick(s.key)}
>
```

---

### IN-03: `commands/pair-review.md` — `type: "inline_comment"` handler ignores `payload.path` and does not call `draft_comment` when `lineId` is absent

**File:** `commands/pair-review.md:45`

**Issue:** The `inline_comment` handler reads `payload.lineId`, `payload.message`, and `payload.threadId`, then instructs Claude to call `draft_comment` after synthesizing a formal comment. However, the instruction also says "Call `draft_comment` when you have synthesized a formal comment for the review" without specifying what to do if `payload.lineId` is `null` (which `Thread.lineId` can be per types.ts line 213: `lineId: string | null`). This creates an ambiguous case where `draft_comment` might receive a null lineId, depending on how Claude interprets the instruction.

**Fix:** Add a conditional note:
```
- `type: "inline_comment"` — ... If `payload.lineId` is null, the comment is orphaned (no diff anchor); respond via `reply_in_thread` but skip `draft_comment` since the line anchor is unresolvable.
```

---

_Reviewed: 2026-04-28T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
