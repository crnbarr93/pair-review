---
phase: 05-walkthrough-inline-threaded-comments
plan: "05"
subsystem: web-ui
tags: [react, diff-viewer, thread-card, walkthrough, inline-comments]
dependency_graph:
  requires: [05-01, 05-02, 05-03, 05-04]
  provides: [ThreadCard, DiffViewer-phase5, App-walkthrough-wiring]
  affects: [web/src/components/ThreadCard.tsx, web/src/components/DiffViewer.tsx, web/src/App.tsx, web/src/index.css]
tech_stack:
  added: []
  patterns:
    - Fragment wrapper for push-down thread rows in diff table
    - Walkthrough-aware virtualList with curated/show-all projection
    - WalkthroughBanner injected above curated hunk header
    - ThreadCard anchored below threaded diff lines via thread-row tr
key_files:
  created:
    - web/src/components/ThreadCard.tsx
  modified:
    - web/src/components/DiffViewer.tsx
    - web/src/App.tsx
    - web/src/index.css
decisions:
  - onCollapse no-op: ThreadCard receives onCollapse prop (API complete) but collapse is wired as no-op; per UI-SPEC collapse is local display state with no server event — future wire-up point noted in component
  - SplitHunk thread anchor: threads anchored to representative line (right/add side preferred, fallback to left) to avoid duplicate ThreadCard renders per pair row
metrics:
  duration: ~18 minutes
  completed_date: "2026-04-22T09:40:41Z"
  tasks: 2
  files: 4
---

# Phase 05 Plan 05: ThreadCard + Final UI Wiring Summary

ThreadCard push-down component wired into DiffViewer below anchored diff lines; App.tsx extended with walkthrough-aware virtualList, show-all toggle, c-key thread scroll, and WalkthroughBanner/ThreadCard prop passthrough.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | ThreadCard component + DiffViewer wiring | ce009e6 | ThreadCard.tsx (new), DiffViewer.tsx, index.css |
| 2 | App.tsx walkthrough virtualList + c-key + handlers | 6270a6a | App.tsx |

## What Was Built

### Task 1: ThreadCard + DiffViewer

**ThreadCard** (`web/src/components/ThreadCard.tsx`):
- Push-down inline thread card rendered as `tr.thread-row` inside the diff table
- Shows last 3 turns by default; "N earlier messages" expander for longer threads
- Draft comment textarea slot appears when `thread.draftBody !== undefined`
- Local draft state syncs from server on first set; blur-on-change persists via `onDraftChange`
- Security: `turn.message` renders as React text node inside `<p>` — never innerHTML (T-5-05-01)
- Security: `draftBody` renders in `<textarea value={localDraft}>` — textarea value is always text (T-5-05-02)

**DiffViewer** modifications:
- Added `Fragment` wrapper in `UnifiedHunk` line map to emit thread rows after each diff line (`colSpan={2}`)
- Added `Fragment` wrapper in `SplitHunk` pair map to emit thread rows after each pair row (`colSpan={4}`)
- `WalkthroughBanner` injected above `hunk-head` when hunk is in walkthrough steps
- `hunk--curated` CSS class added when hunk matches a walkthrough step
- New props: `walkthrough`, `threads`, `onDraftChange`, `onSkipStep`, `onNextStep` (all optional for backward compat)
- `HunkProps`, `FileSectionProps`, `DiffViewerProps` all extended with Phase 5 fields

**CSS additions** (`web/src/index.css`):
- `.thread-row td { padding: 0 !important }` — zero-gap push-down
- `.thread-panel--resolved` — green left border + ok-bg tint
- `.thread-draft-input:focus` — claude outline
- `.thread-older-expander:hover` — underline affordance

### Task 2: App.tsx wiring

- **walkthrough-aware virtualList**: curated mode returns `walkthrough.steps` in step order; show-all returns all non-generated hunks in file order (D-05/D-06, T-5-05-04 coordinate separation)
- **handleWalkthroughStepClick**: posts `walkthrough.stepAdvanced` + scrolls to target hunk
- **handleShowAllToggle**: posts `walkthrough.showAllToggled`; snaps back to current step when toggling curated (D-07)
- **handleSkipStep / handleNextStep**: post `walkthrough.stepAdvanced` with incremented cursor; `handleNextStep` scrolls to next step
- **handleDraftChange**: delegates to `actions.updateLocalDraft` (Pitfall 3 protection — user edits survive SSE reconnects)
- **c-key** (was stub): scrolls to first thread on focused hunk, or shows "Ask Claude to start a thread on this line" toast
- **StageStepper**: receives `walkthrough`, `onWalkthroughStepClick`, `onShowAllToggle`
- **DiffViewer**: receives `walkthrough`, `threads`, `onDraftChange`, `onSkipStep`, `onNextStep`
- **Footer hint**: `c` key moved from dimmed (`var(--ink-4)`) to active (`var(--ink-3)`)
- **Removed stub**: "Comments available in Phase 5" toast replaced by functional c-key behavior

## Verification

- `pnpm --filter web exec tsc --noEmit` — exits 0 (clean TypeScript)
- `pnpm test` — 449 tests pass (75 web + 374 server)
- `grep -c 'dangerouslySetInnerHTML' web/src/components/ThreadCard.tsx` — returns 0
- `grep -c 'Fragment' web/src/components/DiffViewer.tsx` — returns 5 (import + unified + split usages)
- All plan acceptance criteria verified

## Deviations from Plan

### Auto-fixed Issues

None.

### Minor Implementation Adjustments

**1. [Rule 2 - Correctness] SplitHunk thread anchor uses representative line**
- **Found during:** Task 1 implementation
- **Issue:** SplitHunk emits pair rows (left del + right add); a thread anchored to a left-side line would appear on the wrong pair row if naively filtering by `pair.left.line?.id` only
- **Fix:** Threads are matched to representative line (`pair.right.line?.id ?? pair.left.line?.id`) — prefers right (add) side, falls back to left. This matches the line the thread was anchored to via `thread.lineId`
- **Files modified:** `web/src/components/DiffViewer.tsx`
- **Commit:** ce009e6

**2. onCollapse wired as no-op (intentional per UI-SPEC)**
- **Found during:** Task 1 implementation
- **Decision:** UI-SPEC specifies collapse as local display state with no server event. `onCollapse` prop is present in the API surface for future wiring; the no-op is documented in the component. This is not a blocking stub.

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| `onCollapse={() => {}}` no-op | `web/src/components/DiffViewer.tsx` | ~364, ~519 | UI-SPEC: collapse is local display state; no server event defined. Future wiring point. ThreadCard renders and functions fully without it. |

## Threat Flags

No new security surface introduced beyond what is documented in the plan's threat model (T-5-05-01 through T-5-05-04). All mitigations applied as specified.

## Self-Check: PASSED

- `web/src/components/ThreadCard.tsx` — FOUND
- `web/src/components/DiffViewer.tsx` — modified, FOUND
- `web/src/App.tsx` — modified, FOUND
- `web/src/index.css` — modified, FOUND
- Commit `ce009e6` — FOUND (feat(05-05): ThreadCard component + DiffViewer walkthrough/thread wiring)
- Commit `6270a6a` — FOUND (feat(05-05): walkthrough-aware virtualList, show-all toggle, c-key, draft wiring in App.tsx)
