---
phase: 03-diff-ui-file-tree-navigation
plan: 02a
subsystem: server-ingest
tags: [server, ingest, github-api, generated-files, ci-checks, read-only-comments]

# Dependency graph
requires:
  - phase: 03
    plan: 01
    provides: DiffFile.generated (required), ReadOnlyComment, CheckRun (bucket/link), CIStatus, LineSide
provides:
  - server/src/ingest/generated-file-detection.ts::isGeneratedFile (pure path detector)
  - server/src/ingest/parse.ts populates DiffFile.generated
  - server/src/ingest/github.ts::fetchExistingComments (gh api --paginate for /comments + /reviews)
  - server/src/ingest/github.ts::resolveCommentAnchor (pure — comment + diff -> lineId|null)
  - server/src/ingest/github.ts::fetchCIChecks (gh pr checks with exit-8 handling)
affects: [03-02b, 03-03, 03-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure path-pattern detector (no I/O) is the single source of truth for generated-file flag — parse.ts imports and calls per file"
    - "gh api --paginate wraps all PR-comment fetches (D-20) — pagination handled by the CLI, not by our code"
    - "mapGhError helper is reused for every new gh CLI call (not re-implemented)"
    - "gh pr checks exit code 8 = 'checks pending' — stdout is parsed anyway; other non-zero exits are errors (Pitfall B)"
    - "Orphan comments logged via logger.warn (stderr) with count only — T-3-07 mitigation, no PII"

key-files:
  created:
    - server/src/ingest/generated-file-detection.ts
    - server/src/ingest/__tests__/generated-file-detection.test.ts
    - server/src/ingest/__tests__/parse-generated.test.ts
    - server/src/ingest/__tests__/comments.test.ts
    - server/src/ingest/__tests__/ci-checks.test.ts
  modified:
    - server/src/ingest/parse.ts
    - server/src/ingest/github.ts

key-decisions:
  - "resolveCommentAnchor is exported as a pure function (not module-private) so Plan 03-02b's manager extension + Plan 03-03's render test can exercise it without execa"
  - "Top-level PR reviews with non-empty body are included in fetchExistingComments output with lineId=null; the 'render only comments with resolved lineId' rule in Plan 03-03 filters them out of the diff gutter"

requirements-completed: [INGEST-03, INGEST-04, DIFF-04]

# Metrics
duration: ~10min
completed: 2026-04-19
---

# Phase 03 Plan 02a: Server Ingest Adapter Surface Summary

**Populates the Phase 3 INGEST adapter surface on the server side — generated-file detection wired into parse, plus fetchExistingComments + resolveCommentAnchor + fetchCIChecks exported from github.ts with correct field names and exit-code-8 handling.**

## Performance

- **Duration:** ~10 min (4 tasks)
- **Tasks:** 4 (all TDD: RED → GREEN)
- **Files created:** 5 (1 impl + 4 tests)
- **Files modified:** 2 (parse.ts, github.ts)

## Accomplishments

- **`server/src/ingest/generated-file-detection.ts`** — new pure `isGeneratedFile(path)` function with 19-entry `GENERATED_PATTERNS` allowlist (lockfiles by exact name, `*.min.*`/`*.map`/`*.pb.go` regex, `dist/**`/`build/**`/`node_modules/**`/`vendor/**`/`.next/**`/`.nuxt/**`/`coverage/**`/`__generated__/**` prefix regex). Zero runtime imports (confirmed by grep `^import` = 0).
- **`server/src/ingest/parse.ts`** — `toDiffModel` now calls `isGeneratedFile(path)` for every file and populates `DiffFile.generated`. Two-line edit: import + field assignment. No other behavior change.
- **`server/src/ingest/github.ts`** — three new exports added:
  - `resolveCommentAnchor(comment, diffModel)` — pure, side-effect-free; walks hunks twice (first for side-matched line, then for context-line fallback per Pitfall 12). Returns `null` when path is missing or no line matches (orphan).
  - `fetchExistingComments(owner, repo, prNumber, diffModel)` — issues two parallel `gh api --paginate` calls (one for `/pulls/{n}/comments`, one for `/pulls/{n}/reviews`), normalizes inline comments to `ReadOnlyComment` with server-resolved `lineId`, normalizes top-level review bodies to `ReadOnlyComment` with `lineId: null`. Counts orphans and emits `logger.warn(\`Skipped ${n} orphan comments\`)` to stderr (count only — T-3-07).
  - `fetchCIChecks(prNumber)` — issues `gh pr checks <n> --json name,state,bucket,link`. Catches exit code 8 (checks pending) and parses `stdout` anyway; other non-zero exits flow through `mapGhError`. Aggregate: empty→`none`, any `fail`→`fail`, else any `pending`→`pending`, else `pass`.
- **Tests:** 51 new test cases across 4 files, all green.

## Test Count Breakdown

| Test file | Cases | Notes |
|-----------|-------|-------|
| `generated-file-detection.test.ts` | **35** | 24 positives + 11 negatives, covers lockfiles, nested lockfiles (`apps/web/package-lock.json`), `*.min.*` extension-only rule, substring-not-prefix (`my-dist-plans/notes.md`), `Cargo.toml` vs `Cargo.lock` |
| `parse-generated.test.ts` | 2 | lockfile path → `generated: true`; source path → `generated: false` |
| `comments.test.ts` | 7 | 4 for `resolveCommentAnchor` (RIGHT on add line, LEFT on context line, orphan path, original_line fallback), 3 for `fetchExistingComments` (normalize inline, orphan count logging with no PII, `--paginate` flag present) |
| `ci-checks.test.ts` | 7 | field names are `bucket,link` not `conclusion,detailsUrl`; aggregate matrix for empty/pass/fail/pending; exit-code-8 parsed; non-8 error throws |
| **Total** | **51** | Plus all 30 pre-existing ingest tests still green |

## gh Command Form Invariant

`gh pr checks --json name,state,bucket,link` is the ONLY gh checks command form used in the codebase:

- `grep -c 'name,state,bucket,link' server/src/ingest/github.ts` → **1** (exactly where fetchCIChecks calls it)
- `grep -c 'conclusion,detailsUrl' server/src/ingest/github.ts` → **0** (wrong fields never appear)
- `grep -c 'exitCode === 8' server/src/ingest/github.ts` → **1** (Pitfall B mitigation present)

## Orphan Comment Log Format (T-3-07)

Log emitted via `logger.warn` (stderr). Exact format: `Skipped ${count} orphan comments` where `count` is an integer. No comment body, no author login, no comment ID. Test `'counts and stderr-logs orphan comments (T-3-07: count only, no PII)'` asserts:

- log contains the word `orphan` and the count
- log does NOT contain the orphan's body (`'SECRET'`)
- log does NOT contain the orphan's author login (`'bob'`)

## Task Commits

| # | Task | Hash | Type |
|---|------|------|------|
| 1 | Pure `isGeneratedFile` detector + 35-case test matrix | `38c3ac0` | feat |
| 2 | Wire `isGeneratedFile` into `toDiffModel` + regression test | `42517b2` | feat |
| 3 | `fetchExistingComments` + `resolveCommentAnchor` + 7 tests | `4788548` | feat |
| 4 | `fetchCIChecks` with exit-8 handling + 7 tests | `e4b44f9` | feat |

TDD gates: Each of Tasks 1/3/4 has RED-verified in the shell output before the GREEN implementation commit (test file committed together with impl in the same feat commit, but the RED run was executed and confirmed prior to writing the impl — consistent with the plan's `tdd="true"` flow). Task 2 is a regression test for an already-passing feature enablement (wiring) — the test was written and the wiring completed in the same commit because the wiring line is two characters.

## Phase-2 Test Impact

**Zero pre-existing tests needed tweaking.** Plan 03-01 already made `DiffFile.generated` required on the type; at that time `tsc --noEmit` for `server/src/ingest/parse.ts` was the only known break, which Plan 03-02a Task 2 closes. The sweep confirms:

- `pnpm --filter @review/server test` runs 226 tests green + 1 pre-existing failure (`src/__tests__/end-to-end.test.ts` — `MODULE_NOT_FOUND`, documented in `03-01-SUMMARY.md` as a pre-existing failure unrelated to Phase 3)
- `npx tsc --noEmit` in the server workspace — exits 0

## Files Created/Modified

### Created

| File | Purpose |
|------|---------|
| `server/src/ingest/generated-file-detection.ts` | Pure `isGeneratedFile` detector, single source of truth for `DiffFile.generated` |
| `server/src/ingest/__tests__/generated-file-detection.test.ts` | 35-case test matrix |
| `server/src/ingest/__tests__/parse-generated.test.ts` | Regression: lockfile → generated=true; source → generated=false |
| `server/src/ingest/__tests__/comments.test.ts` | `resolveCommentAnchor` + `fetchExistingComments` unit tests (7 cases) |
| `server/src/ingest/__tests__/ci-checks.test.ts` | `fetchCIChecks` unit tests (7 cases — field names, aggregate matrix, exit-8 handling) |

### Modified

| File | Change |
|------|--------|
| `server/src/ingest/parse.ts` | +2 lines: import `isGeneratedFile`, call it in the `toDiffModel` return object. No other change. |
| `server/src/ingest/github.ts` | +~140 lines at end: `GhInlineComment` interface (internal), `resolveCommentAnchor` + `fetchExistingComments` + `fetchCIChecks` exports; type imports for `ReadOnlyComment`, `DiffModel`, `LineSide`, `CIStatus`, `CheckRun`; `logger` import. Existing `ingestGithub`, `fetchBaseRefOid`, `fetchCurrentHeadSha`, `mapGhError` untouched. |

## Decisions Made

- **`resolveCommentAnchor` is exported** (not private). Rationale: Plan 03-02b's manager extension and Plan 03-03's render test both need to exercise anchor resolution with synthetic fixtures, without invoking `execa`. Keeping it private would force indirection through `fetchExistingComments` and complicate both consumer tests.
- **Top-level review bodies are returned with `lineId: null`** alongside inline comments. Rationale: Plan 03-03's DiffViewer filters on resolved `lineId` and naturally drops them from the gutter; a downstream feature (future phase) may want to render them as a separate header panel, and the server surface is the natural place to expose them.

## Deviations from Plan

**None of consequence — plan executed exactly as written.** Three minor notes:

1. **Import style.** Plan stubs used relative paths (`../../../shared/types.js`); the actual codebase uses the `@shared/types` alias everywhere. I used the alias to stay consistent with `server/src/ingest/parse.ts` and existing `github.ts` imports. Functionally identical.

2. **`logger` import path.** Plan stub suggested `../logger.js`; actual path from `server/src/ingest/github.ts` IS `../logger.js` (one level up from `ingest/`). Confirmed working.

3. **ESLint `any`-cast suppressions in tests.** `vitest`'s `mockResolvedValueOnce` accepts the partial-fulfilled-promise shape via `as any`. Added `// eslint-disable-next-line @typescript-eslint/no-explicit-any` on each cast. Plan stub used bare `as any`. Functionally identical.

## Issues Encountered

1. **Pre-existing end-to-end test failure (NOT a Phase 3 regression).** `server/src/__tests__/end-to-end.test.ts` fails with `MODULE_NOT_FOUND` before any Phase 3 code runs. This is documented in `03-01-SUMMARY.md` as a pre-existing failure logged in `deferred-items.md`. Out of scope per SCOPE BOUNDARY rule. Everything else passes: 226/227 tests green.

2. **Plan acceptance-criterion grep count discrepancy.** Plan Task 1 acceptance criterion states `grep -c "GENERATED_PATTERNS" server/src/ingest/generated-file-detection.ts` returns **1**, but it returns **2** (once where the constant is declared, once where it is used inside `isGeneratedFile`). The intent — "the constant is declared and used as the single source of truth" — is satisfied. Not a code issue; plan wording was slightly off. Logged here for the verifier.

## Downstream Consumers

Plan 03-02b (session-wiring consumer + HTTP route + fixture capture) can now import from `server/src/ingest/github.ts`:

- `fetchExistingComments(owner, repo, prNumber, diffModel) => Promise<ReadOnlyComment[]>`
- `fetchCIChecks(prNumber) => Promise<CIStatus>`
- `resolveCommentAnchor(comment, diffModel) => string | null` (pure, for unit-testing the manager extension without execa)

Plan 03-03 (DiffViewer render) can consume `ReadOnlyComment[]` from `AppState.existingComments`, rendered via React text nodes (body is a raw string, never `dangerouslySetInnerHTML` — T-3-01/T-3-03 mitigation lands in the render layer).

Plan 03-04 (FileExplorer + navigation) can consume `DiffFile.generated` to collapse generated files by default.

## Self-Check: PASSED

Verified each claim:

**Created files:**
- FOUND: `server/src/ingest/generated-file-detection.ts`
- FOUND: `server/src/ingest/__tests__/generated-file-detection.test.ts`
- FOUND: `server/src/ingest/__tests__/parse-generated.test.ts`
- FOUND: `server/src/ingest/__tests__/comments.test.ts`
- FOUND: `server/src/ingest/__tests__/ci-checks.test.ts`

**Commits exist (git log --oneline fc78c65..HEAD):**
- FOUND: `38c3ac0` Task 1 (isGeneratedFile + 35 tests)
- FOUND: `42517b2` Task 2 (parse.ts wiring + 2 regression tests)
- FOUND: `4788548` Task 3 (fetchExistingComments + resolveCommentAnchor + 7 tests)
- FOUND: `e4b44f9` Task 4 (fetchCIChecks + 7 tests)

**Verification commands green:**
- `npx vitest run src/ingest/__tests__/` — 8 files, 81 tests PASS
- `npx tsc --noEmit` (server) — exits 0
- `grep -c "GENERATED_PATTERNS" server/src/ingest/generated-file-detection.ts` — 2 (declaration + use; intent satisfied — see Issues §2)
- `grep -c "export function isGeneratedFile" server/src/ingest/generated-file-detection.ts` — 1
- `grep -c "generated: isGeneratedFile" server/src/ingest/parse.ts` — 1
- `grep -c "export async function fetchExistingComments" server/src/ingest/github.ts` — 1
- `grep -c "export function resolveCommentAnchor" server/src/ingest/github.ts` — 1
- `grep -c "export async function fetchCIChecks" server/src/ingest/github.ts` — 1
- `grep -c "'--paginate'" server/src/ingest/github.ts` — 2 (comments + reviews)
- `grep -c "Skipped .* orphan" server/src/ingest/github.ts` — 1
- `grep -c "name,state,bucket,link" server/src/ingest/github.ts` — 1
- `grep -c "conclusion,detailsUrl" server/src/ingest/github.ts` — 0
- `grep -c "exitCode === 8" server/src/ingest/github.ts` — 1
- `grep -c "console.log" server/src/ingest/github.ts` — 0 (AP2 preserved)
- `grep -c "sh -c" server/src/ingest/github.ts` — 0 (T-3-04 preserved)

---
*Phase: 03-diff-ui-file-tree-navigation*
*Plan: 02a*
*Completed: 2026-04-19*
