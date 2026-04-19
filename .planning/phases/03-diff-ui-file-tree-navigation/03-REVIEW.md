---
phase: 03-diff-ui-file-tree-navigation
reviewed: 2026-04-19T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - scripts/generate-fixture.ts
  - server/src/highlight/shiki.ts
  - server/src/http/routes/session-events.ts
  - server/src/http/server.ts
  - server/src/ingest/generated-file-detection.ts
  - server/src/ingest/github.ts
  - server/src/ingest/parse.ts
  - server/src/session/manager.ts
  - server/src/session/reducer.ts
  - shared/types.ts
  - web/src/api.ts
  - web/src/App.tsx
  - web/src/components/DiffViewer.tsx
  - web/src/components/FileExplorer.tsx
  - web/src/components/TopBar.tsx
  - web/src/store.ts
  - web/src/main.tsx
  - web/src/test/setup.ts
  - web/src/index.css
findings:
  critical: 0
  warning: 1
  info: 6
  total: 7
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-04-19
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Phase 3 ships the live-wired AppShell, bespoke DiffViewer renderer, and three new ingest
adapters (generated-file detection, existing PR comments, CI check-runs). The code is
cohesive, well-commented, and extensively tested — the three security invariants called
out in the scope (T-3-01 script-token escaping, T-3-01a HEX_COLOR validation, T-3-03
comment-body-as-text-node) are **correctly implemented and test-covered**.

Security posture is strong:
- `tokenToHtml` uses `escapeHtml` on all Shiki token content and validates color against
  `/^#[0-9a-fA-F]{3,8}$/` before interpolating into the style attribute (DiffViewer.tsx:37-65).
- `ReadOnlyComment.body` renders through a React text-node expression inside the popover
  (DiffViewer.tsx:500-503), never via `innerHTML`. Test case
  `T-3-03: ReadOnlyComment.body is rendered as React text node...` explicitly exercises an
  `<img onerror>` payload.
- POST /api/session/events enforces a zod discriminated-union over user-triggerable events
  only; server-only variants return 400 (tested).
- `body` content in orphan-comment log calls is suppressed (T-3-07 test verifies logger.warn
  emits count only — no PII).

The issues below are non-security code-smell items. The one warning is a small foot-gun in
the toast auto-dismiss timer that can prematurely clear a follow-up toast.

## Warnings

### WR-01: Toast auto-dismiss timer causes follow-up toast to clear early

**File:** `web/src/App.tsx:47-50`
**Issue:** `showToast` schedules `setTimeout(() => setToast(null), 2500)` without tracking or
clearing any previous timeout. If a second toast arrives while the first timer is still
pending — easily reproducible with two `n`/`p` presses near a wrap boundary — the earlier
timer fires first and clears the newer toast before its 2.5 s display window elapses. The
unmount path also leaves pending timers in the macrotask queue (harmless post-React-18 but
surfaces as a "state update on unmounted component" warning in StrictMode dev runs).

**Fix:**
```tsx
const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const showToast = useCallback((msg: string) => {
  if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  setToast(msg);
  toastTimerRef.current = setTimeout(() => {
    setToast(null);
    toastTimerRef.current = null;
  }, 2500);
}, []);

// Clean up on unmount
useEffect(() => () => {
  if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
}, []);
```

## Info

### IN-01: Redundant single-iteration loop in `resolveCommentAnchor`

**File:** `server/src/ingest/github.ts:147-158`
**Issue:** The context-line fallback branch wraps the already-scoped `hunk` in a one-element
array and iterates it: `for (const hunk2 of [hunk]) { for (const line of hunk2.lines) ... }`.
The outer iteration is dead structural code. The inner intent — "match a LEFT/RIGHT comment
against a context line whose recorded `side` is BOTH" — is correct and test-covered, but
the shape reads as a copy-paste artifact.

**Fix:**
```ts
for (const hunk of file.hunks) {
  for (const line of hunk.lines) {
    if (line.fileLine === targetLine && line.side === targetSide) return line.id;
  }
  // Pitfall 12: context lines have side=BOTH — fall through for LEFT/RIGHT targets.
  for (const line of hunk.lines) {
    if (line.kind === 'context' && line.fileLine === targetLine) return line.id;
  }
}
```

### IN-02: `fetchCurrentHeadSha` does not validate SHA shape (asymmetry with `fetchBaseRefOid`)

**File:** `server/src/ingest/github.ts:78-90`
**Issue:** `fetchBaseRefOid` enforces `/^[0-9a-f]{40}$/` on the returned string (line 67)
but `fetchCurrentHeadSha` accepts any non-empty string. A gh CLI that returned an
unexpected value (e.g., ref name instead of SHA because of a shape change in `--json
headRefOid`) would silently flow into the stale-diff comparison, producing a false-positive
"stale" modal or a false-negative mismatch. Defense-in-depth fix: mirror the 40-hex
validation.

**Fix:**
```ts
if (typeof parsed.headRefOid !== 'string' || !/^[0-9a-f]{40}$/.test(parsed.headRefOid)) {
  throw new Error(`gh returned invalid headRefOid: ${JSON.stringify(parsed.headRefOid)}`);
}
return parsed.headRefOid;
```

### IN-03: CI aggregate treats `skipping`/`cancel` buckets as pass

**File:** `server/src/ingest/github.ts:286-290`
**Issue:** The aggregate computation is `fail > pending > else pass`. Buckets `skipping`
and `cancel` fall through to `pass`. This is likely intentional (a skipped check shouldn't
block review), but the implicit semantics are undocumented and the `CheckRun['bucket']`
type includes both as valid values. Either add a comment explaining the three-state
reduction or widen the aggregate to surface `cancel` distinctly in the UI.

**Fix:** Add an inline comment documenting the policy, or extend the UI to show
`skipping`/`cancel` as a non-blocking neutral state so that PRs whose only "checks" got
cancelled are not misrepresented as green.

### IN-04: Resumed session does not re-fetch existing comments or CI

**File:** `server/src/session/manager.ts:87-124` (persisted-state branch)
**Issue:** The Phase-3 adapter calls `fetchExistingComments` and `fetchCIChecks` are gated
on the full-ingest fall-through branch (lines 210-223). Sessions resumed from disk inherit
the comments/CI snapshot from the last write and never refresh, even though `headSha` is
re-queried and drives stale-diff detection. A user reopening a day-old session sees old
comments/CI until they accept the stale-diff modal and re-ingest. Consider refreshing both
on resume (or at minimum refreshing `ciStatus`, which is the cheaper call).

**Fix:** After the persisted-session reconstruction (around line 117), fire the same two
applyEvent calls that the fresh-ingest branch does, guarded by the same
`source.kind === 'github'` check. Failures continue to log-only per the Phase-3 contract.

### IN-05: Code duplication — `splitPath` appears in two components

**File:** `web/src/components/DiffViewer.tsx:73-76`, `web/src/components/FileExplorer.tsx:16-19`
**Issue:** Identical `splitPath(p: string): [string, string]` helpers live in both
components. Minor, but any future change (Windows path support, trailing-slash handling)
would need to be applied twice.

**Fix:** Lift to `web/src/lib/path.ts` (or `web/src/utils.ts`) and import from both call
sites. Keep the signature and semantics identical to avoid churn.

### IN-06: Rename detection can misfire on additions when `f.new` is unset by parse-diff

**File:** `server/src/ingest/parse.ts:72-79`
**Issue:** The status ladder is `deleted → added (f.new) → renamed (f.from && f.to && f.from
!== f.to) → modified`. Git unified diff represents a new file as `--- /dev/null` / `+++
b/path`. `parse-diff` sets `f.new = true` in that case, so `renamed` is unreached for
additions — good. But the rename branch does not guard against `f.from === '/dev/null'`
explicitly; if a future `parse-diff` version sets `f.new` inconsistently, we would misclassify
an addition as a rename (with `oldPath === '/dev/null'`). Add a defensive check to
future-proof.

**Fix:**
```ts
const status: FileStatus = f.deleted
  ? 'deleted'
  : f.new
    ? 'added'
    : f.from && f.to && f.from !== f.to && f.from !== '/dev/null' && f.to !== '/dev/null'
      ? 'renamed'
      : 'modified';
```
Apply the same guard to the `oldPath` assignment on line 99.

---

_Reviewed: 2026-04-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
