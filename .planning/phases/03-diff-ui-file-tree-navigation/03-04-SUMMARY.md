---
phase: 03-diff-ui-file-tree-navigation
plan: 04
subsystem: web
tags: [web, file-tree, topbar, ci-pill, store, api, postSessionEvent, prKey]

# Dependency graph
requires:
  - phase: 03-diff-ui-file-tree-navigation
    plan: 01
    provides: DiffFile.generated, FileReviewStatus/ReadOnlyComment/CheckRun/CIStatus, SessionEvent variants, ReviewSession+AppState Phase 3 fields
provides:
  - FileExplorer wired to DiffFile[] + fileReviewStatus Record (D-11 state machine, D-15 generated styling, D-10 disabled Repo tab)
  - TopBar wired to PullRequestMeta + CIStatus (D-25 palette, D-26 hide-when-none, D-24 bucket/link fields)
  - CIPill sub-component with click-to-expand dropdown and rel=noreferrer external links (T-3-08)
  - AppState top-level prKey:string field populated from msg.session.prKey / msg.state.prKey
  - AppState mirrors Phase-3 ReviewSession fields (fileReviewStatus/expandedGeneratedFiles/existingComments/ciStatus)
  - postSessionEvent(prKey, event) client helper with X-Review-Token double-submit CSRF (T-3-05)
affects: [03-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live-wired component props replace data.ts fixture imports — no direct store reads inside components"
    - "CIPill palette Record<aggregate, {bg, fg}> indexed by CIStatus.aggregate; 'none' variant hides the entire pill"
    - "postSessionEvent mirrors chooseResume's fail-fast-on-missing-token + double-submit + same-origin pattern"
    - "AppState prKey:'' empty-string sentinel lets Plan 03-05 short-circuit pre-snapshot call sites with a falsy check"

key-files:
  created:
    - web/src/components/__tests__/FileExplorer.test.tsx
    - web/src/components/__tests__/TopBar.test.tsx
  modified:
    - web/src/api.ts
    - web/src/__tests__/api.test.ts
    - web/src/store.ts
    - web/src/__tests__/store.test.ts
    - web/src/components/FileExplorer.tsx
    - web/src/components/TopBar.tsx
    - web/src/components/__tests__/StaleDiffModal.test.tsx
  deleted: []

key-decisions:
  - "AppState Phase-3 fields made REQUIRED (not optional) — INITIAL sets empty sentinels {}, {}, [], undefined, ''. Eliminates `?? {}` noise at call sites at the cost of a one-line StaleDiffModal test fixture update."
  - "CIPill aggregate 'none' branch defined in the palette record but unreachable at runtime (early-return before palette lookup) — kept for exhaustiveness in TypeScript's Record<CIStatus['aggregate'], ...> inference."

patterns-established:
  - "Component prop-shape replaces data.ts fixture imports: components consume DiffFile[] / PullRequestMeta / FileReviewStatus from props, parents (Plan 03-05 App.tsx) pass them from store subscriptions."
  - "postSessionEvent(prKey, event) — canonical client POST path for user-triggered SessionEvents; all future event-dispatch call sites go through this helper."

requirements-completed: [DIFF-03, INGEST-04, PLUG-04]

# Metrics
duration: 6min
completed: 2026-04-19
---

# Phase 03 Plan 04: FileExplorer + TopBar + Store/API Live-Wiring Summary

**Replaces `data.ts` fixture imports in FileExplorer, TopBar, and the web store/api modules with live Phase-2-store data — landing the three remaining UI surfaces Plan 03-03 (DiffViewer) does not touch. Plan 03-05 assembles them into the AppShell with keyboard + IntersectionObserver plumbing.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-19T19:16:06Z
- **Completed:** 2026-04-19T19:22:16Z
- **Tasks:** 4
- **Files modified:** 9 (2 created, 7 modified, 0 deleted)

## Accomplishments

- **web/src/api.ts** gained `postSessionEvent(prKey, event)` — POSTs `/api/session/events` with `X-Review-Token` header + `{prKey, event}` body, fails fast when token unset, throws on non-ok HTTP. 3 new vitest cases.
- **web/src/store.ts** AppState extended with five new fields: `fileReviewStatus` / `expandedGeneratedFiles` / `existingComments` / `ciStatus` (mirrored from ReviewSession Phase-3 additions per Plan 03-01) AND a first-class top-level `prKey: string` (populated from `msg.session.prKey` and `msg.state.prKey`). INITIAL defaults to empty sentinels (`{}, {}, [], undefined, ''`). The existing `sessionKey: s.prKey` mirror is preserved for Plan 02-04 backward compat — `prKey` and `sessionKey` are dual mirrors of the same source value. 4 new vitest cases.
- **web/src/components/FileExplorer.tsx** rewired from `FILE_STATE[path]`/`REPO_TREE`/`PR` fixture imports to typed props `{ files: DiffFile[], fileReviewStatus, activeFileId, onPickFile }`. Status dots per D-11 (reviewed → `var(--ok)`, in-progress → `var(--warn)`, untouched → `var(--ink-4)` at 0.4 opacity). Live summary chips (`N reviewed · N in-progress · N untouched`). "Repo" tab rendered `disabled` with `title="Full repo tree available in Phase 7"` tooltip and muted styling (D-10). Generated files render with muted ink-4 color + right-aligned "Excluded" label (D-15). Click handler calls `onPickFile(file.id)` AND `document.getElementById(`diff-${file.id}`)?.scrollIntoView(...)`. 7 new vitest cases.
- **web/src/components/TopBar.tsx** rewired from `PR`/`Stage` fixtures to props `{ pr: PullRequestMeta, ciStatus?: CIStatus, onSettingsClick, onRequestChanges, onApprove }`. New `CIPill` sub-component — returns `null` when `ciStatus` undefined or `aggregate === 'none'` (D-26 local-branch mode); palette per D-25 (pass → `--ok-bg`/`--ok`, fail → `--block-bg`/`--block`, pending → `--warn-bg`/`--warn`); click-to-expand dropdown lists `{check.name} · {check.bucket}` with external `<a target="_blank" rel="noreferrer">` (T-3-08); `aria-label` includes aggregate and check count. CTA buttons (Request changes / Approve & merge / Settings) wire through `onX` callbacks — Plan 03-05 connects them to Phase-6-stub toasts. `StageStepper` export retained on disk for Phase 4 (D-02). 7 new vitest cases.

## Task Commits

Each task was committed atomically with RED → GREEN TDD verified per task:

1. **Task 1: Extend api.ts with postSessionEvent + update api.test.ts** — `652d722` (feat)
2. **Task 2: Extend store.ts AppState + handlers to mirror Phase-3 fields AND prKey** — `4e66cd5` (feat)
3. **Task 3: Refactor FileExplorer to consume live store props + add tests** — `d2116df` (feat)
4. **Task 4: Refactor TopBar with CI pill + stub CTAs + settings; add tests** — `54e8ae9` (feat)

Total: 4 commits, one per task.

## Files Created/Modified

### Modified

| File | Change | Line delta |
|------|--------|-----------|
| `web/src/api.ts` | +40 lines: `postSessionEvent(prKey, event)` helper, SessionEvent import | +40/-1 |
| `web/src/__tests__/api.test.ts` | +66 lines: 3 postSessionEvent tests (happy path, missing-token throw, non-ok throw) | +66/0 |
| `web/src/store.ts` | +20 lines: 5 new AppState fields (fileReviewStatus/expandedGeneratedFiles/existingComments/ciStatus/prKey), INITIAL defaults, onSnapshot + onUpdate mirror | +20/-3 |
| `web/src/__tests__/store.test.ts` | +112 lines: 4 new tests (INITIAL defaults, onSnapshot with/without Phase-3 fields, onUpdate mirror) | +112/0 |
| `web/src/components/FileExplorer.tsx` | Full rewrite — remove `../data` and `../utils/highlight` imports, inline `cn` helper, new prop signature, D-10/D-11/D-15 compliance | +172/-172 |
| `web/src/components/TopBar.tsx` | Full rewrite — remove `../data` and `../utils/highlight` imports, inline `cn`, add `CIPill` sub-component, retain `StageStepper` export for Phase 4 | +175/-15 |
| `web/src/components/__tests__/StaleDiffModal.test.tsx` | +6 lines: add Phase-3 AppState defaults to makeState() fixture (AppState fields became required) | +6/0 |

### Created

| File | Purpose |
|------|---------|
| `web/src/components/__tests__/FileExplorer.test.tsx` | 7 tests: prop-rendering, D-11 dot colors, D-15 Excluded label, D-10 disabled Repo tab, click→onPickFile+scrollIntoView, summary counts, active class |
| `web/src/components/__tests__/TopBar.test.tsx` | 7 tests: PR meta, CIPill show/hide (undefined + aggregate==='none'), click-to-expand dropdown with rel="noreferrer" links, CTA callbacks, aria-label |

### Confirmation: No Data Imports

Verified with `grep -c "from '../data'"`:

| File | Count |
|------|-------|
| `web/src/components/FileExplorer.tsx` | 0 |
| `web/src/components/TopBar.tsx` | 0 |
| `web/src/api.ts` | 0 |
| `web/src/store.ts` | 0 |

`data.ts` is still on disk (`test -f web/src/data.ts` passes) — deletion scheduled for Plan 03-05 per Pitfall D.

### CSS Classes Added

Only one novel class name was introduced: **`ci-pill`** (and its child `ci-dropdown` / `ci-row`). Used only by the new `CIPill` sub-component. Plan 03-05 will add the corresponding CSS rules or inline-style refinements if the current inline-style baseline is insufficient. No changes to existing class names.

### Test Count Added Per File

| File | New tests |
|------|-----------|
| `web/src/__tests__/api.test.ts` | 3 |
| `web/src/__tests__/store.test.ts` | 4 |
| `web/src/components/__tests__/FileExplorer.test.tsx` | 7 |
| `web/src/components/__tests__/TopBar.test.tsx` | 7 |

**Total: 21 new vitest cases, all green.** Combined with existing tests, the 5 files covered by Plan 03-04 run 40/40 PASS.

## Decisions Made

1. **AppState Phase-3 fields are required (non-optional).** INITIAL supplies empty sentinels. This avoids scattering `?? {}` fallbacks at every Plan 03-05 consumer and makes state invariants cleaner. One StaleDiffModal test fixture needed a 5-line update (Phase-3 defaults added to its `makeState()` helper). Documented as a Rule-1 fix in the same commit.

2. **prKey is a SECOND mirror of `ReviewSession.prKey` alongside `sessionKey`.** The plan spec was explicit that both fields stay in sync because both read `s.prKey`. Plan 02-04's existing `sessionKey` mirror remains untouched. Plan 03-05's new call sites (r-key, IntersectionObserver, expand-generated) will read `state.prKey` — an unambiguously-named property — rather than the legacy `sessionKey` which historically doubled as a session identifier.

3. **D-24 comment phrasing** in TopBar.tsx CIPill JSDoc was trimmed to avoid mentioning the legacy `conclusion`/`detailsUrl` names — this keeps the plan-wide grep invariant (`grep -c "conclusion\|detailsUrl" web/src/components/TopBar.tsx  # -> 0`) satisfied. The corrected field names (`bucket`/`link`) are recorded in PROJECT.md per Plan 03-01's D-24 correction row.

## Deviations from Plan

**1. [Rule 1 — Bug introduced by this plan's AppState change] Added Phase-3 defaults to StaleDiffModal.test.tsx makeState fixture**

- **Found during:** Task 4 (plan-wide tsc check)
- **Issue:** After Task 2 made the five new AppState fields required, `web/src/components/__tests__/StaleDiffModal.test.tsx:26` failed TypeScript type checking because its `makeState` spread didn't supply them. The Vitest tests still ran (esbuild transpile ignores type errors) but `pnpm tsc --noEmit` flagged the error.
- **Fix:** Added the five Phase-3 defaults to the test's `makeState()` helper (`fileReviewStatus: {}, expandedGeneratedFiles: {}, existingComments: [], ciStatus: undefined, prKey: 'gh:o/r#1'`). 5-line change in the test fixture only.
- **Files modified:** `web/src/components/__tests__/StaleDiffModal.test.tsx`
- **Commit:** `54e8ae9` (bundled with Task 4)
- **Rationale:** This plan's AppState change is the direct cause; fixing the consumer in the same plan is the right scope.

No other deviations — plan executed exactly as written. Both TDD gates (RED fail verified before GREEN implementation) were observed on all 4 tasks.

## Issues Encountered

1. **Expected pre-existing web test failures.** `src/__tests__/main-bootstrap.test.tsx` (7 tests) fails to transform because `src/App.tsx` imports the deleted `TweaksPanel`. This is the documented and expected cascade failure from Plan 03-01 (see its SUMMARY §Issues 3). Plan 03-05's App.tsx rewrite is responsible for fixing it. Out of scope per SCOPE BOUNDARY rule. Verified the failure count is unchanged (7 before this plan, 7 after).

2. **Expected pre-existing TypeScript errors.** `pnpm tsc --noEmit` reports errors in `App.tsx` (legacy `ExplorerFilter` import, `TweaksPanel` import, legacy `TopBar()` / `FileExplorer` prop shapes), `ChatPanel.tsx`, `DiffViewer.tsx`, `InlineThread.tsx` (import deleted `../utils/highlight`). Every single error is in a file explicitly earmarked for Plans 03-03 or 03-05 cleanup per Plan 03-01 SUMMARY §"Imports for Plan 03-05 to Clean Up". None are caused by this plan's work.

3. **pnpm `node_modules/` was missing on worktree arrival.** Ran `pnpm install` (1.3s, packages already in content-addressed store). Not a code issue.

## prKey Population Confirmation

Per the plan's `<output>` bullet — confirmed via vitest assertions in `web/src/__tests__/store.test.ts`:

- **Task 2 test "onSnapshot populates prKey + the four Phase-3 fields from ReviewSession"** calls `actions.onSnapshot(snapshot(baseSession({ prKey: 'github:owner/repo#1', ... })))` and asserts `state.prKey === 'github:owner/repo#1'`. GREEN.
- **Task 2 test "onUpdate mirrors prKey + Phase 3 fields from UpdateMessage.state"** constructs an `UpdateMessage` with `state.prKey = 'gh:o/r#1'` and asserts the store reflects that value. GREEN.
- **Task 2 test "INITIAL includes Phase 3 fields with empty defaults AND prKey empty string"** asserts `state.prKey === ''` before any snapshot arrives — the empty-string sentinel Plan 03-05 needs for its falsy-short-circuit check. GREEN.

## Imports Still Pending for Plan 03-05

After Plan 03-04, these files still need work (all documented in Plan 03-01 SUMMARY):

- `web/src/App.tsx` — mounts old TopBar/FileExplorer with legacy prop shapes; imports deleted `TweaksPanel` — Plan 03-05 rewrites.
- `web/src/components/DiffViewer.tsx` — imports deleted `../utils/highlight` — Plan 03-03's work.
- `web/src/components/ChatPanel.tsx` — imports deleted `../utils/highlight` — Plan 03-05's work (panel presentation refactor).
- `web/src/components/InlineThread.tsx` — imports deleted `../utils/highlight` — Plan 03-05's work.

## TDD Gate Compliance

All four tasks are `tdd="true"`. Per-task gates:

- **Task 1 (api)** — RED: 3 FAIL assertions (`postSessionEvent is not a function`) before api.ts edit. GREEN: 9/9 PASS after edit. Commits: test+impl in one commit (`652d722`). The plan states test-append → impl-append → verify; they landed in one commit, with TDD intent preserved (tests written first, run failing, implementation added, re-run green).
- **Task 2 (store)** — RED: 4 FAIL assertions (`state.prKey` undefined, Phase-3 fields undefined) before store.ts edit. GREEN: 10/10 PASS. Single commit `4e66cd5`.
- **Task 3 (FileExplorer)** — RED: test file failed to import because FileExplorer still referenced deleted `../data` / `../utils/highlight`. GREEN: 7/7 PASS after rewrite. Single commit `d2116df`.
- **Task 4 (TopBar)** — RED: identical import-failure RED pattern. GREEN: 7/7 PASS after rewrite. Single commit `54e8ae9`.

All plan-level acceptance criteria verified (grep invariants documented above).

## Next Plan Readiness

Plan 03-05 (AppShell / App.tsx rewrite) can now proceed:

- **FileExplorer** accepts `(files, fileReviewStatus, activeFileId, onPickFile)` — ready.
- **TopBar** accepts `(pr, ciStatus, onSettingsClick, onRequestChanges, onApprove)` — ready.
- **AppState** carries `prKey`, `fileReviewStatus`, `expandedGeneratedFiles`, `existingComments`, `ciStatus` — ready.
- **postSessionEvent(prKey, event)** is the single POST helper for the three Plan-03-05 call sites (r-key, IntersectionObserver, expand-generated).
- `prKey === ''` falsy-check sentinel gives Plan 03-05 a clean bootstrap-window early-return.

## Self-Check: PASSED

Verified each claim:

**Created files (absolute paths):**
- FOUND: `/Users/connorbarr/dev/personal/git-review-plugin/.claude/worktrees/agent-a37a261e/web/src/components/__tests__/FileExplorer.test.tsx`
- FOUND: `/Users/connorbarr/dev/personal/git-review-plugin/.claude/worktrees/agent-a37a261e/web/src/components/__tests__/TopBar.test.tsx`

**Commits exist (git log --oneline fc78c65..HEAD):**
- FOUND: `652d722` feat(03-04): add postSessionEvent client helper with X-Review-Token
- FOUND: `4e66cd5` feat(03-04): mirror Phase-3 session fields and prKey into AppState
- FOUND: `d2116df` feat(03-04): live-wire FileExplorer to DiffFile + FileReviewStatus props
- FOUND: `54e8ae9` feat(03-04): live-wire TopBar with CI pill and stub CTA callbacks

**Plan-wide grep invariants (all PASS):**
- `grep -c "from '../data'" web/src/components/FileExplorer.tsx` → 0
- `grep -c "from '../data'" web/src/components/TopBar.tsx` → 0
- `grep -c "X-Review-Token" web/src/api.ts` → 4 (≥2 required)
- `grep -c 'rel="noreferrer"' web/src/components/TopBar.tsx` → 1 (≥1)
- `grep -cE "conclusion|detailsUrl" web/src/components/TopBar.tsx` → 0
- `grep -c "prKey: s.prKey" web/src/store.ts` → 2 (≥2)
- `grep -c "prKey: ''" web/src/store.ts` → 1 (≥1)

**Test suites (runtime, vitest run):**
- `src/__tests__/api.test.ts` — 9/9 PASS (6 existing + 3 new)
- `src/__tests__/store.test.ts` — 10/10 PASS (6 existing + 4 new)
- `src/components/__tests__/FileExplorer.test.tsx` — 7/7 PASS (7 new)
- `src/components/__tests__/TopBar.test.tsx` — 7/7 PASS (7 new)
- `src/components/__tests__/StaleDiffModal.test.tsx` — 7/7 PASS (unchanged count)
- Pre-existing 7 FAIL on `main-bootstrap.test.tsx` — documented Plan 03-01 cascade, Plan 03-05's responsibility.

**Other invariants:**
- `test -f web/src/data.ts` → PASS (still on disk; Plan 03-05 deletes it per Pitfall D)

---
*Phase: 03-diff-ui-file-tree-navigation*
*Plan: 04*
*Completed: 2026-04-19*
