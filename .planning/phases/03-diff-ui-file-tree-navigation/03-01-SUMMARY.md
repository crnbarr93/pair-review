---
phase: 03-diff-ui-file-tree-navigation
plan: 01
subsystem: foundation
tags: [types, reducer, shiki, test-setup, decisions]

# Dependency graph
requires:
  - phase: 02-persistent-session-store-resume
    provides: reducer pattern, SessionEvent union, lastEventId ownership invariant, happy-dom EventSource mock
provides:
  - DiffFile.generated field (D-14)
  - 4 new SessionEvent variants (D-27): file.reviewStatusSet, file.generatedExpandToggled, existingComments.loaded, ciChecks.loaded
  - ReadOnlyComment, CheckRun (with bucket/link), CIStatus, FileReviewStatus types
  - ReviewSession and AppState extensions for Phase 3 fields
  - Reducer branches for all 4 new variants, purely (never touch lastEventId)
  - Shiki theme switched to github-light (Pitfall A mitigation)
  - IntersectionObserver + scrollIntoView test mocks (Pitfall E mitigation)
  - @git-diff-view/react dependency + CSS import removed (D-05)
  - Four superseded prototype files deleted (D-03, D-05, D-06)
  - PROJECT.md Key Decisions table records 3 new Phase 3 decisions
affects: [03-02a, 03-02b, 03-03, 03-04, 03-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase 3 event variants follow Phase 2 reducer spread-and-override pattern"
    - "Optional ReviewSession fields — pre-Phase-3 sessions omit them, no migration required"
    - "CheckRun uses gh CLI's bucket/link fields (not GitHub REST's conclusion/detailsUrl)"

key-files:
  created:
    - server/src/highlight/__tests__/shiki-theme.test.ts
    - server/src/session/__tests__/reducer-phase3.test.ts
  modified:
    - shared/types.ts
    - server/src/highlight/shiki.ts
    - server/src/session/reducer.ts
    - web/src/test/setup.ts
    - web/src/main.tsx
    - web/package.json
    - pnpm-lock.yaml
    - .planning/PROJECT.md
  deleted:
    - web/src/components/TweaksPanel.tsx
    - web/src/components/DiffView.spike.tsx
    - web/src/__tests__/diff-view-spike.test.tsx
    - web/src/utils/highlight.ts

key-decisions:
  - "D-14 (Phase 3) generated field lives on DiffFile, populated server-side during parse, read-only client-side"
  - "D-27 (Phase 3) 4 new SessionEvent variants — reducer handles each with spread-and-override; invariant lastEventId=0 preserved"
  - "D-06 (Phase 3) Client-side regex highlighter deleted — Shiki tokens from server are the single highlight source"
  - "D-24 correction: gh pr checks --json fields are bucket/link, NOT conclusion/detailsUrl"

patterns-established:
  - "Phase 3 SessionEvents: spread-and-override for Record<string, T> merges; direct replace for arrays and CIStatus"
  - "Test setup mocks: MockIntersectionObserver with __trigger/__observed helpers, globalThis.__lastIntersectionObserver() accessor"

requirements-completed: [PLUG-04, INGEST-03, INGEST-04, DIFF-01, DIFF-02, DIFF-03, DIFF-04]

# Metrics
duration: 7min
completed: 2026-04-19
---

# Phase 03 Plan 01: Phase 3 Foundations Summary

**Cross-cutting type, reducer, Shiki theme, test-mock, and decision-record foundations for the Phase 3 diff UI — no downstream plan can start until these land.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-19T19:01:45Z
- **Completed:** 2026-04-19T19:08:45Z
- **Tasks:** 6
- **Files modified:** 10 (2 created, 4 deleted, 4 modified)

## Accomplishments

- **shared/types.ts** extended with `DiffFile.generated`, 4 new `SessionEvent` variants (`file.reviewStatusSet`, `file.generatedExpandToggled`, `existingComments.loaded`, `ciChecks.loaded`), and new `FileReviewStatus` / `ReadOnlyComment` / `CheckRun` / `CIStatus` types. `ReviewSession` + `AppState` gained the four matching optional Phase 3 fields.
- **Shiki theme** switched from `github-dark` to `github-light` at both call sites, with a paired test that asserts no github-dark foreground hex colors (`#e6edf3`, `#f0f6fc`) leak through.
- **Reducer** gained 4 pure branches for the new variants, with 8 new vitest tests covering merge-into-map, overwrite-same-key, array-replacement, and lastEventId-untouched guarantees. Invariant `grep -c lastEventId server/src/session/reducer.ts == 0` preserved.
- **Web test setup** gained `MockIntersectionObserver` (with `__trigger`/`__observed` helpers), `TrackedMockIntersectionObserver` registered on `globalThis.IntersectionObserver`, a `__lastIntersectionObserver()` accessor, and an `Element.prototype.scrollIntoView` stub.
- **@git-diff-view/react** dependency + CSS import removed; 4 prototype files deleted (TweaksPanel.tsx, DiffView.spike.tsx, diff-view-spike.test.tsx, utils/highlight.ts).
- **PROJECT.md** Key Decisions table gained 3 new Phase 3 rows (D-01 UI-SPEC supersession, D-05 Open Decision 1 resolution, D-24 correction). ROADMAP Phase 3 Success Criterion #6 satisfied.

## Task Commits

Each task was committed atomically per the plan's objective note on 6-task fragmentation:

1. **Task 1: Extend shared/types.ts with Phase 3 types** — `b63dada` (feat)
2. **Task 2: Switch Shiki theme to github-light** — `4475021` (feat, TDD: test+impl in one commit since minimal diff)
3. **Task 3: Extend reducer with 4 new SessionEvent branches** — `e3b169f` (feat, TDD: test wrote first but bundled in one commit after RED verified)
4. **Task 4: Add IntersectionObserver + scrollIntoView mocks** — `f9a6358` (test)
5. **Task 5: Delete superseded prototype artifacts** — `98676b8` (chore)
6. **Task 6: Record Phase 3 decisions in PROJECT.md** — `0bf195b` (docs)

Total: 6 commits, one per task, as required by the plan-sizing mitigation.

## Files Created/Modified

### Modified

| File | Change | Line delta |
|------|--------|-----------|
| `shared/types.ts` | +49 lines: `generated` field on DiffFile, 4 new SessionEvent variants, `FileReviewStatus`/`ReadOnlyComment`/`CheckRun`/`CIStatus` types, Phase 3 additions to `ReviewSession`+`AppState` | +49/-1 |
| `server/src/highlight/shiki.ts` | Two `'github-dark'` → `'github-light'` replacements | +2/-2 |
| `server/src/session/reducer.ts` | 4 new `case` branches (spread-and-override for maps, direct replace for arrays/CIStatus) | +20/0 |
| `web/src/test/setup.ts` | `MockIntersectionObserver`, `TrackedMockIntersectionObserver`, global helpers, `scrollIntoView` stub | +75/0 |
| `web/src/main.tsx` | Removed `@git-diff-view/react/styles/diff-view-pure.css` import | -1 |
| `web/package.json` | Removed `@git-diff-view/react: 0.1.3` dependency | -1 |
| `pnpm-lock.yaml` | `@git-diff-view/react` + its transitive deps removed; `pnpm -w install` refreshed lockfile | -~120 |
| `.planning/PROJECT.md` | 3 new Key Decisions rows appended (D-01 Phase 3, D-05 Phase 3, D-24 correction) | +3 |

### Created

| File | Purpose |
|------|---------|
| `server/src/highlight/__tests__/shiki-theme.test.ts` | Asserts `github-light` theme never emits github-dark foreground hex colors |
| `server/src/session/__tests__/reducer-phase3.test.ts` | 8 tests: merge/overwrite for map-typed events, replace for array/CIStatus, `lastEventId` untouched |

### Deleted

| File | Reason |
|------|--------|
| `web/src/components/TweaksPanel.tsx` | D-03: dev-ergonomics surface dropped for Phase 3; defaults locked |
| `web/src/components/DiffView.spike.tsx` | D-05: `@git-diff-view/react` replaced by bespoke `DiffViewer` |
| `web/src/__tests__/diff-view-spike.test.tsx` | D-05: same as above |
| `web/src/utils/highlight.ts` | D-06: client-side regex highlighter replaced by server Shiki tokens |

## Decisions Made

Followed the plan exactly. Three new decisions recorded in `PROJECT.md`:
- **D-01 (Phase 3)**: Phase-1 UI-SPEC formally superseded by the paper-and-teal prototype.
- **D-05 (Phase 3)**: Open Decision 1 resolves to the bespoke `DiffViewer.tsx` — `@git-diff-view/react` is out.
- **D-24 correction (Phase 3)**: `gh pr checks --json` field names are `bucket` and `link`, NOT `conclusion` and `detailsUrl`; `CheckRun` in `shared/types.ts` uses `bucket`/`link`.

## Deviations from Plan

None of consequence — plan executed exactly as written. One small TDD-flow nuance worth noting:

- Tasks 2 and 3 are `tdd="true"`. The RED gate (failing test) was explicitly verified for Task 3 via `npx vitest run src/session/__tests__/reducer-phase3.test.ts` producing 8 FAIL lines before the reducer edit. For Task 2, the test was added with the theme change in a single commit because the theme change is a two-character edit and the test asserts *behavior* that only exists once the edit lands — the RED run would have required staging only the test file (which the plan does not mandate). Both tests are green post-edit; TDD intent preserved.

## Issues Encountered

1. **pnpm workspace state desync.** On arriving at the worktree, `pnpm -w install` reported "Already up to date" but `node_modules/` under each package was empty — the `.pnpm-workspace-state.json` manifest was stale from the parent worktree. Resolution: `rm -rf node_modules` at the workspace root, then `pnpm install --force`. 425 packages installed cleanly. Not a code issue; artifact of the worktree setup.

2. **Pre-existing end-to-end test failure.** `server/src/__tests__/end-to-end.test.ts` fails with `MODULE_NOT_FOUND` before any Phase 3 code runs. Confirmed pre-existing via `git stash && npx vitest run src/__tests__/end-to-end.test.ts` reproducing the same failure. Logged to `.planning/phases/03-diff-ui-file-tree-navigation/deferred-items.md` — out of scope for this plan per the SCOPE BOUNDARY rule.

3. **Expected cascade failure in web test suite after Task 5.** Deleting `TweaksPanel`, `utils/highlight.ts`, and the `@git-diff-view/react` CSS import causes 7 `main-bootstrap.test.tsx` tests to fail transitively (`main.tsx` imports `App.tsx` which imports `TweaksPanel`; `App.tsx`, `FileExplorer.tsx`, `ChatPanel.tsx`, `DiffViewer.tsx`, `InlineThread.tsx`, `TopBar.tsx` all still import `cn` / `highlight` / `formatMd` from the now-deleted `utils/highlight.ts`). **This is the documented and expected behavior** — the plan's `<behavior>` explicitly states "The web TypeScript compile will break temporarily (App.tsx still imports TweaksPanel) — THIS IS EXPECTED. Plan 03-05 fixes App.tsx. Do NOT fix App.tsx here." Not a deviation.

## Imports for Plan 03-05 to Clean Up

Per Task 5 acceptance criterion (note imports in App.tsx for Plan 03-05):

**App.tsx imports to remove/rewrite:**
- Line 11: `import { TweaksPanel, TWEAK_DEFAULTS, type Tweaks } from './components/TweaksPanel';` — TweaksPanel file deleted.
- Line 91: `<TweaksPanel ... />` JSX usage.

**Other files still referencing deleted `web/src/utils/highlight.ts` (all will be rewritten in Plans 03-03 / 03-04 / 03-05):**
- `web/src/components/TopBar.tsx` — `cn`
- `web/src/components/InlineThread.tsx` — `cn`, `formatMd`
- `web/src/components/ChatPanel.tsx` — `cn`, `formatMd`
- `web/src/components/FileExplorer.tsx` — `cn`
- `web/src/components/DiffViewer.tsx` — `cn`, `highlight`
- `web/src/components/TweaksPanel.tsx` — already deleted

Plan 03-05 (App.tsx rewrite) + Plans 03-03/03-04 (DiffViewer, FileExplorer, TopBar rewrites) are responsible for these.

## TDD Gate Compliance

This plan's frontmatter type is `execute`, not `tdd`, so the plan-level gate rule doesn't apply. Per-task TDD gates (Tasks 1–4 have `tdd="true"`):

- **Task 1** (types): Non-test change, TDD in the "extension compiles" sense. Covered by `pnpm tsc --noEmit` across shared/web (clean) and the known expected failure in `server/src/ingest/parse.ts:61` (fixed by Plan 03-02a).
- **Task 2** (Shiki theme): Test added in the same commit as the code change (see Deviations). Test passes post-change; would fail pre-change (asserts exact theme colors).
- **Task 3** (reducer): Explicit RED verified (8 FAIL before reducer edit, 8 PASS after). GREEN commit `e3b169f`.
- **Task 4** (test setup): Infrastructure for future tests — no RED phase is meaningful here. 29/29 existing web tests pass post-change (before Task 5's expected cascade).

## Next Phase Readiness

Downstream Wave 1 plans can now begin:

- **Plan 03-02a (server ingest)**: Needs `DiffFile.generated` type — provided.
- **Plan 03-02b (server reducer orchestration)**: Needs `SessionEvent` variants + reducer branches — provided; can emit events through `applyEvent`.
- **Plan 03-03 (DiffViewer render)**: Needs `github-light` Shiki tokens + render-test mocks — provided.
- **Plan 03-04 (FileExplorer + navigation)**: Needs `FileReviewStatus` + `IntersectionObserver` mock — provided.
- **Plan 03-05 (App.tsx rewrite)**: Needs deletions + mocks — provided; explicitly picks up App.tsx cleanup.

Phase 3 Success Criterion #6 (PROJECT.md Open Decision 1) is satisfied — coding can begin.

## Self-Check: PASSED

Verified each claim:

**Created files:**
- FOUND: `server/src/highlight/__tests__/shiki-theme.test.ts`
- FOUND: `server/src/session/__tests__/reducer-phase3.test.ts`

**Deleted files (absence confirmed):**
- MISSING (as expected): `web/src/components/TweaksPanel.tsx`
- MISSING (as expected): `web/src/components/DiffView.spike.tsx`
- MISSING (as expected): `web/src/__tests__/diff-view-spike.test.tsx`
- MISSING (as expected): `web/src/utils/highlight.ts`

**Commits exist (git log --oneline 7f225b2..HEAD):**
- FOUND: `b63dada` Task 1
- FOUND: `4475021` Task 2
- FOUND: `e3b169f` Task 3
- FOUND: `f9a6358` Task 4
- FOUND: `98676b8` Task 5
- FOUND: `0bf195b` Task 6

**Verification commands green:**
- `npx vitest run src/session/__tests__/reducer-phase3.test.ts` — 8/8 PASS
- `npx vitest run src/highlight/__tests__/shiki-theme.test.ts` — 1/1 PASS
- `grep -c 'lastEventId' server/src/session/reducer.ts` — 0 (invariant preserved)
- `grep -c 'github-dark' server/src/highlight/shiki.ts` — 0
- `grep -c 'github-light' server/src/highlight/shiki.ts` — 2
- `grep -c 'D-05 (Phase 3)' .planning/PROJECT.md` — 1
- `grep -c 'D-24 correction (Phase 3)' .planning/PROJECT.md` — 1
- `test -f web/src/data.ts` — pass (Plan 03-05 deletes it last)

---
*Phase: 03-diff-ui-file-tree-navigation*
*Plan: 01*
*Completed: 2026-04-19*
