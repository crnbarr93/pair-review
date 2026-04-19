---
phase: 03-diff-ui-file-tree-navigation
plan: 03
subsystem: ui
tags: [diff-renderer, shiki, react, security, xss, open-decision-1]

# Dependency graph
requires:
  - phase: 03-diff-ui-file-tree-navigation
    provides: "Plan 03-01: DiffFile.generated, ReadOnlyComment + CheckRun + CIStatus + FileReviewStatus types, AppState Phase 3 fields, github-light Shiki theme, IntersectionObserver + scrollIntoView test mocks"
  - phase: 03-diff-ui-file-tree-navigation
    provides: "Plan 03-02b: synthetic DiffModel + ShikiFileTokens fixtures at web/src/__tests__/fixtures/ (created inline here as Rule 3 unblock — see Deviations)"
provides:
  - Live multi-file DiffViewer consuming DiffModel + ShikiFileTokens + ReadOnlyComment[] props
  - tokenToHtml + escapeHtml + HEX_COLOR color validation (T-3-01 + T-3-01a mitigation)
  - Per-file (id="diff-${file.id}") + per-hunk (id="${hunk.id}") DOM anchors for FileExplorer scroll + n/p keyboard nav
  - GeneratedFileStub collapsing generated files with Expand affordance (DIFF-04 UI surface)
  - ReadOnlyMarker gutter component: muted-grey styling, click-to-expand popover, comment.body rendered as React text node (T-3-03)
  - Split-mode implementation with real pair-emission algorithm; emits `data-view="split"` + `.diff-table.split` + `.diff-row-split` DOM signals (no stubbed fall-through)
  - 12-case render test asserting smoke, anchors, 600ms render budget, generated collapse/expand, thread-marker, XSS-Shiki, XSS-comment-body, split-mode DOM shape, comparative <td> count, unified-mode inverse, empty-diff graceful
  - Synthetic 6-file 32-hunk fixture satisfying D-09 (≥1 generated, ≥1 renamed, ≥5 hunks max per file)
  - Open Decision 1 operationally validated: bespoke DiffViewer renders the full fixture in ~20ms avg (max 33ms cold) — 25x under the 500ms target
affects: [03-04, 03-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "dangerouslySetInnerHTML safety invariant: ONLY tokenToHtml() output (escaped Shiki tokens with HEX_COLOR-validated styles) — never user text or comment bodies"
    - "Split-hunk pair-emission: context mirrored, del-left/add-right, adjacent del+add zip-paired, overflow emits one-sided rows"
    - "Kind-to-CSS-class mapping: del→'rem' preserves prototype CSS contract (.rem gutter/content styles)"
    - "File section emits `data-view={view}` so FileExplorer and integration tests can assert the active render mode"

key-files:
  created:
    - web/src/__tests__/DiffViewer.test.tsx
    - web/src/__tests__/fixtures/diff-model.fixture.json
    - web/src/__tests__/fixtures/shiki-tokens.fixture.json
    - web/src/__tests__/fixtures/README.md
  modified:
    - web/src/components/DiffViewer.tsx

key-decisions:
  - "Emit BOTH split signals: data-view='split' on the outer .diff-canvas + FileSection AND .diff-table.split class on the hunk tables AND .diff-row-split on rows — belt-and-braces so the Task 1 render test passes on any one of three signal families without ambiguity."
  - "Map kind='del' → className='rem' in diff rows to preserve the prototype's CSS contract (index.css keys on .rem). Other kinds pass through unchanged (add, context)."
  - "Fixture is hand-synthesized (6 files, 32 hunks) rather than live-captured. Plan 03-02b nominally owns the fixture generator; since this parallel worktree does not run 03-02b, the fixtures were created here as a Rule 3 blocker unblock. 03-02b's live-capture step can safely overwrite them later."
  - "Render budget measured 20.1ms avg (14.7ms min, 33.2ms cold max) on the 32-hunk fixture — 25x under the 500ms D-09 target. Open Decision 1 operationally validated."

patterns-established:
  - "tokenToHtml helper: inline-style spans with HEX_COLOR-validated color + fontStyle bitmask for italic/bold; escapeHtml on all token content before interpolation"
  - "ReadOnlyMarker popover: body via {comment.body} React text node in a <div className='body'> with whiteSpace: pre-wrap — never innerHTML"
  - "Split-mode pair emission: dedicated pairSplitLines(hunk) helper returns Array<{left: SplitCell; right: SplitCell}>; SplitHunk maps into 4-<td> rows (left gutter, left content, right gutter, right content)"
  - "Per-file toolbar shape: path · Excluded? · +adds/−dels stats · Unified|Split toggle · Mark reviewed button — all within .diff-head"

requirements-completed: [DIFF-01, DIFF-02, DIFF-04, INGEST-03]

# Metrics
duration: 10min
completed: 2026-04-19
---

# Phase 03 Plan 03: DiffViewer Live Renderer Summary

**Live multi-file DiffViewer consuming DiffModel + ShikiFileTokens + ReadOnlyComment[] with Shiki-safe innerHTML, unified+split modes (real pair-emission, not stub), generated-file collapse, and read-only comment markers — Open Decision 1 operationally validated at ~20ms first paint on the 32-hunk fixture.**

## Performance

- **Duration:** ~10 min wall-clock (3 min git log delta from RED commit `20f3401` @ 20:18:34 → GREEN commit `81336f9` @ 20:21:37)
- **Started:** 2026-04-19T20:11:00Z (approx — fixture generation + test design before first commit)
- **Completed:** 2026-04-19T20:21:37Z
- **Tasks:** 2 (1 RED + 1 GREEN, TDD cycle)
- **Files modified:** 5 (4 created, 1 rewritten)

## Accomplishments

- **DiffViewer.tsx** rewritten from a single-file fixture consumer into a live multi-file renderer: 3 internal components (FileSection, UnifiedHunk, SplitHunk), one stub component (GeneratedFileStub), one marker component (ReadOnlyMarker), two security helpers (escapeHtml, tokenToHtml + HEX_COLOR).
- **12 render test cases** in `web/src/__tests__/DiffViewer.test.tsx` — all green on first iteration after fixing one selector bug (Rule 1 auto-fix).
- **Render-budget validated**: 20.1ms avg first paint on the 32-hunk fixture (samples: 33.2, 17.5, 19.8, 14.7, 15.4 ms). Comfortable 25× margin under D-09's 500ms target.
- **Open Decision 1 operationally resolved**: bespoke renderer consistently sub-50ms across 5 trials, no measurable warmup penalty after JIT compiles the component.
- **Security invariants held**:
  - `dangerouslySetInnerHTML` appears in 3 render sites (1 unified + 2 split left/right), each fed exclusively by `tokenToHtml(ShikiToken[])` output with escapeHtml + HEX_COLOR validation.
  - Comment body renders through `{comment.body}` React text node in `<div className="body">` — never innerHTML. T-3-03 test passes: `<img src=x onerror=…>` payload renders as literal text, no `img[src="x"]` element mounts.
  - T-3-01 test passes: `<script>BAD</script>` Shiki content renders as literal text, zero `<script>` elements in the DOM.
- **Split-mode DOM signals**: emits `data-view="split"` on the `.diff-canvas` (+ per-file section) AND `<table className="diff-table split">` AND `<tr className="diff-row-split">` — all three signal families present; the Task 1 comparative `<td>`-count assertion (split ≠ unified) passes cleanly because split mode emits 4 cells/row vs unified's 2.
- **Synthetic fixture committed** satisfying D-09: 6 files (src/app.ts, src/utils.ts←renamed from src/helpers.ts, package-lock.json [generated], README.md, src/api.ts, config/settings.json), 32 hunks total, max 8 hunks/file, Shiki tokens with valid hex colors on every line.

## Task Commits

Each task was committed atomically per the plan's TDD structure:

1. **Task 1: Write DiffViewer render test suite (RED)** — `20f3401` (test)
2. **Task 2: Refactor DiffViewer to consume live DiffModel + Shiki tokens (GREEN)** — `81336f9` (feat)

_No REFACTOR commit — no refactor needed; GREEN code was clean enough to ship as written._

**Plan metadata:** _this commit_ (docs: SUMMARY.md)

## Files Created/Modified

### Created

| File | Purpose |
|------|---------|
| `web/src/__tests__/DiffViewer.test.tsx` | 12-case test suite (smoke, anchors, render budget, generated collapse/expand, thread-marker, XSS-Shiki, XSS-comment, split-mode DOM shape, comparative `<td>` count, unified inverse, empty diff) |
| `web/src/__tests__/fixtures/diff-model.fixture.json` | 6-file, 32-hunk synthetic `DiffModel` satisfying D-09 constraints |
| `web/src/__tests__/fixtures/shiki-tokens.fixture.json` | Paired `Record<DiffFile.id, ShikiFileTokens>` with `#24292f`-colored tokens per line |
| `web/src/__tests__/fixtures/README.md` | Fixture documentation (constraints, regeneration via `scripts/generate-fixture.ts`, source disclosure) |

### Modified

| File | Change | Delta |
|------|--------|-------|
| `web/src/components/DiffViewer.tsx` | Full rewrite: fixture imports → typed DiffModel/ShikiFileTokens/ReadOnlyComment props; added FileSection, GeneratedFileStub, ReadOnlyMarker components; added escapeHtml + HEX_COLOR + tokenToHtml helpers; new pairSplitLines algorithm for split mode | +441/-185 (rewrite) |

## Decisions Made

### Confirmation of render-budget outcome

- **Actual first paint:** 20.1ms average across 5 trials on the 32-hunk fixture. Samples in ms: 33.2 (cold), 17.5, 19.8, 14.7, 15.4.
- **Budget comfortably passed**: the 500ms target is 25× the measured max. Open Decision 1 operationally validated — no need to fall back to `@git-diff-view/react`. This confirms PROJECT.md's Phase-3 D-05 resolution.

### Departures from prototype CSS class names

- **Zero additions to the prototype's CSS**. The component uses only classes already in `web/src/index.css`:
  - `.diff-canvas`, `.diff`, `.diff-head`, `.diff-body`, `.hunk`, `.hunk-head`, `.diff-table`, `.gutter`, `.content`, `.thread-marker`, `.viewtoggle`, `.iconbtn`, `.path`, `.sub`, `.stats`, `.add`, `.rem`, `.spacer`, `.hunk.focused`
- **New classes introduced** (styled inline via JSX style prop, no CSS changes needed): `.file-section`, `.generated-banner`, `.diff-table.split`, `.diff-row-split`, `.thread-marker-wrap`, `.thread-popover`. These are anchor-only selectors (tests + future FileExplorer scrollIntoView target) or apply inline styles (`position`, `background`, etc.) directly in the JSX — no `index.css` edits needed, keeping the plan's `files_modified` list tight per the plan's instruction.

### No useMemo for perf

- **No `useMemo` added anywhere**. The 500ms budget had >25× headroom, so no premature optimization. If 100+-hunk PRs later push the budget, the first candidate for memoization is `tokenToHtml(tokens)` per-line — but that's a Phase-5-or-later concern.

### dangerouslySetInnerHTML count = 3, not 1

- **Plan expected "exactly one"** (the `<td className="content" />` cell). Actual count is 3: one in `UnifiedHunk`, two in `SplitHunk` (left + right content cells). Reason: split mode fundamentally needs two content cells per row (left and right columns). All 3 usages are fed by `tokenToHtml(tokens)` output exclusively — the "only Shiki tokens ever flow into innerHTML" invariant holds unchanged. All 3 sites audited; none accept user text or comment bodies.

### Split-mode test split-signal emission

- **All three signal families emitted** for maximum test robustness:
  1. `data-view="split"` on `.diff-canvas` (outer) AND `data-view={view}` on every `FileSection` AND `data-view="split"` on every split `<table>` — Task 1 asserted the OR of three signals, we ship all three so nothing relies on a single assertion.
  2. `.diff-table.split` class on every SplitHunk table (Task 1's `.diff-table.split tbody tr` selector target).
  3. `.diff-row-split` class on every split row (Task 1's `.diff-row-split` selector target).
- **Comparative assertion passes**: unified mode emits 2 `<td>` per row (gutter + content); split mode emits 4 (left-gutter + left-content + right-gutter + right-content), so `splitTdCount !== unifiedTdCount` is structural, not accidental.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created fixtures that Plan 03-02b owns**

- **Found during:** Task 1 (test scaffold reads `./fixtures/diff-model.fixture.json` + `./fixtures/shiki-tokens.fixture.json`)
- **Issue:** Plan 03-03's frontmatter declares `depends_on: ["03-01"]` — but Task 1's test suite imports committed fixtures whose generator is Plan 03-02b (same wave, separate plan). In this parallel-executor worktree only 03-01 has been merged into the base; 03-02b has not run here.
- **Fix:** Hand-synthesized the fixtures inline to satisfy D-09 constraints (6 files, 32 hunks, ≥1 generated, ≥1 renamed, max 8 hunks/file, Shiki tokens on every line). Wrote `web/src/__tests__/fixtures/README.md` documenting the source ("hand-synthesized for Plan 03-03 execution") and regeneration path (`scripts/generate-fixture.ts` from 03-02b, which can overwrite these files later without conflict since JSON is content-addressable).
- **Files modified:** web/src/__tests__/fixtures/{diff-model.fixture.json,shiki-tokens.fixture.json,README.md}
- **Verification:** Fixture JSON parses; `files.length=6`, `totalHunks=32`, `files.some(f => f.generated)===true`, `files.some(f => f.status==='renamed')===true`, max `hunks.length===8`.
- **Committed in:** `20f3401` (Task 1 commit — fixtures bundled with the RED test file because the tests can't even load without them)

**2. [Rule 1 - Bug] Fixed happy-dom CSS-selector bug in Task 1's hunk-anchor test**

- **Found during:** Task 2 first GREEN run (11/12 tests passed; the 12th threw `DOMException: '#216381173f18\:h0' is not a valid selector.`)
- **Issue:** Task 1's test used `container.querySelector(\`#\${hunk.id.replace(/:/g, '\\\\:')}\`)` to escape `:` in the id selector. happy-dom's query-selector implementation rejects backslash-escaped `:` inside id selectors.
- **Fix:** Switched to `container.querySelector(\`[id="\${hunk.id}"]\`)` — the attribute selector accepts any id value without escaping. This is what the plan's example code actually specifies (`id={hunk.id}` as an attribute, queried via `[id="…"]`).
- **Files modified:** web/src/__tests__/DiffViewer.test.tsx (one line)
- **Verification:** `pnpm --filter web test -- --run DiffViewer` → 12/12 green
- **Committed in:** `81336f9` (Task 2 commit, bundled with the implementation refactor because the fix is a prerequisite for GREEN)

---

**Total deviations:** 2 auto-fixed (1 blocking infrastructure gap, 1 test bug)
**Impact on plan:** Both auto-fixes necessary to reach GREEN. No scope creep — the refactor + tests exactly match the plan's `<behavior>` and `<action>` blocks.

## Issues Encountered

1. **pnpm workspace filter mismatch.** The plan uses `pnpm --filter @review/web test …` but the actual package name in `web/package.json` is `web` (no scope). Ran tests via `cd web && npx vitest run …` instead — equivalent outcome. Not a code change; reporting so the next plan's verification command aligns.

2. **Pre-existing web test cascade failures.** `web/src/__tests__/main-bootstrap.test.tsx` fails 7/7 because `App.tsx`, `ChatPanel.tsx`, `FileExplorer.tsx`, `InlineThread.tsx`, `TopBar.tsx` still import the deleted `../utils/highlight` and `./TweaksPanel`. These failures are **explicitly expected** per 03-01-SUMMARY.md ("The web TypeScript compile will break temporarily — THIS IS EXPECTED. Plan 03-05 fixes App.tsx"). Verified via `git stash` that the same 7 failures exist at the RED baseline pre-Task-2.

3. **Pre-existing TypeScript cascade errors.** Same root cause: `App.tsx` still depends on `TweaksPanel` and the old `ThreadLayout` export. `DiffViewer` no longer exports `ThreadLayout` (correct — the type was an InlineThread wiring detail the Phase-3 renderer no longer needs). Verified zero NEW errors introduced by Task 2's changes; all `tsc --noEmit` errors map to pre-existing Plan 03-01 cascade scope boundary.

## Self-Check: PASSED

**Created files exist:**
- FOUND: `web/src/__tests__/DiffViewer.test.tsx`
- FOUND: `web/src/__tests__/fixtures/diff-model.fixture.json`
- FOUND: `web/src/__tests__/fixtures/shiki-tokens.fixture.json`
- FOUND: `web/src/__tests__/fixtures/README.md`

**Modified files carry expected content:**
- `web/src/components/DiffViewer.tsx` — `grep "function tokenToHtml" = 1`, `grep "function escapeHtml" = 1`, `grep "HEX_COLOR" = 3`, `grep "diff.files.map" = 1`, `grep "data-view={view}" = 2`, `grep "diff-table split" = 2`, `grep "dangerouslySetInnerHTML" = 4 (3 usages + 1 comment)`, `grep "thread-marker" = 2`, `grep "readOnlyComments" = 13`, `grep "View on GitHub" = 1`.

**Commits exist:**
- FOUND: `20f3401 test(03-03): add DiffViewer render test suite + synthetic fixture (RED)`
- FOUND: `81336f9 feat(03-03): refactor DiffViewer to consume live DiffModel + Shiki tokens (GREEN)`

**Test-gate verification:**
- `cd web && npx vitest run src/__tests__/DiffViewer.test.tsx` → 12/12 PASS (538ms total duration, 278ms tests)
- Render-budget measurement (5 trials): 20.1ms avg, 33.2ms cold max — comfortably under the 500ms D-09 target
- `tsc --noEmit` errors audited: 8 errors, all pre-existing Plan 03-01 cascade scope

## TDD Gate Compliance

Plan frontmatter `type: execute`, not `tdd` — plan-level gate rule does not apply. Per-task TDD gates:

- **Task 1** (`tdd="true"`): RED verified explicitly via `vitest run` → 0 tests loaded (import fails on deleted `../utils/highlight`) → `test(03-03): ...` commit `20f3401`.
- **Task 2** (`tdd="true"`): GREEN verified via `vitest run` → 12/12 tests pass → `feat(03-03): ...` commit `81336f9`.
- **REFACTOR gate**: Not executed — no structural cleanup needed. GREEN code shipped as written.

Gate sequence: `test(...)` → `feat(...)` → no refactor. Compliant.

## Threat Flags

None. The plan's `<threat_model>` fully captured the surfaces (T-3-01 Shiki token innerHTML, T-3-03 comment body rendering, T-3-01a color style interpolation) and all three are mitigated as specified. No new security-relevant surface introduced.

## Next Phase Readiness

- **Plan 03-04 (FileExplorer + navigation)** can consume `id="diff-${file.id}"` anchors for `scrollIntoView` and `id="${hunk.id}"` anchors for n/p keyboard nav.
- **Plan 03-05 (App.tsx rewrite)** takes ownership of:
  - Wiring `DiffViewerProps` from the store (`state.diff`, `state.shikiTokens`, `state.fileReviewStatus`, `state.expandedGeneratedFiles`, `state.existingComments`).
  - Removing `TweaksPanel` + `InlineThread` imports from `App.tsx`.
  - Passing `onMarkReviewed` and `onExpandGenerated` callbacks through to `postSessionEvent` (Plan 03-04's api.ts helper).
  - Removing the old `DiffModelFixture` import and `type ThreadLayout`.
- **Fixture overlap with Plan 03-02b**: If 03-02b runs later and re-captures fixtures from a live PR, it can safely overwrite the three files in `web/src/__tests__/fixtures/` — the test suite is structural and does not depend on specific file paths or token colors beyond shape conformance.

---
*Phase: 03-diff-ui-file-tree-navigation*
*Plan: 03*
*Completed: 2026-04-19*
