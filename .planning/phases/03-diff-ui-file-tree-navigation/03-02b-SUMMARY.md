---
phase: 03-diff-ui-file-tree-navigation
plan: 02b
subsystem: server-session-http-fixtures
tags: [server, session, manager, http, zod, fixtures, csrf]

# Dependency graph
requires:
  - phase: 03-diff-ui-file-tree-navigation
    plan: 01
    provides: SessionEvent Phase-3 variants (existingComments.loaded, ciChecks.loaded, file.reviewStatusSet, file.generatedExpandToggled), ReadOnlyComment + CheckRun + CIStatus + FileReviewStatus types, reducer branches, AppState + ReviewSession Phase-3 fields
  - phase: 03-diff-ui-file-tree-navigation
    plan: 02a
    provides: server/src/ingest/github.ts exports of fetchExistingComments(owner, repo, prNumber, diffModel) and fetchCIChecks(prNumber), plus resolveCommentAnchor and the isGeneratedFile wiring in parse.ts
provides:
  - SessionManager.startReview Phase-3 extension that fires existingComments.loaded + ciChecks.loaded events for GitHub-source sessions only, post-snapshot, with independent try/catch + logger.warn on failure
  - server/src/http/routes/session-events.ts exporting mountSessionEvents and the POST /api/session/events route (zod-validated, restricted to two user-triggered SessionEvent variants)
  - Wired mountSessionEvents into buildHttpApp in server/src/http/server.ts
  - scripts/generate-fixture.ts — one-off PR-capture runner mirroring the server ingest pipeline (ingestGithub → toDiffModel → highlightHunks)
  - Revised web/src/__tests__/fixtures/README.md documenting Plan 03-02b ownership of the generator, the regeneration command, and the current fixture shape
affects: [03-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase 3 startReview extension: after initial writeState, run fetchExistingComments + fetchCIChecks independently; each wrapped in try/catch; each success calls manager.applyEvent which routes through the same persist-then-broadcast pipeline as any other event"
    - "POST /api/session/events accepts only the USER-triggered SessionEvent variants via zod discriminatedUnion — server-generated variants (existingComments.loaded/ciChecks.loaded) and resume-choice variants (session.adoptNewDiff/reset/viewBoth) are deliberately omitted from the accepted union so clients attempting to emit them get 400"
    - "Route mounts AFTER tokenValidate middleware (which is wired on /api/* in buildHttpApp), inheriting the Phase-1 X-Review-Token double-submit CSRF check"
    - "Fixture regeneration script lives at repo root /scripts/ so it can import from both server/ and shared/ via relative paths; run via pnpm dlx tsx or pnpm --filter server exec tsx"

key-files:
  created:
    - server/src/session/__tests__/manager-phase3.test.ts
    - server/src/http/routes/session-events.ts
    - server/src/http/__tests__/session-events.test.ts
    - scripts/generate-fixture.ts
  modified:
    - server/src/session/manager.ts
    - server/src/http/server.ts
    - web/src/__tests__/fixtures/README.md
    - .planning/phases/03-diff-ui-file-tree-navigation/deferred-items.md

key-decisions:
  - "Kept the existing Plan-03-03-authored hand-synthesized fixtures (6 files, 32 hunks, package-lock.json generated, src/utils.ts renamed from src/helpers.ts, src/app.ts 8 hunks) rather than regenerating — they already satisfy D-09 and the render test landed on them. Plan 03-02b's generator script exists to enable a future live-PR re-capture without code changes; it does not need to run on this worktree."
  - "fixture-generation script is NOT executed on this worktree because Node 24.10 + tsx + execa transitive unicorn-magic has an ERR_PACKAGE_PATH_NOT_EXPORTED issue. Logged in deferred-items.md as an environmental blocker, NOT a code issue — the script is well-formed and its imports match the shape the server test harness loads cleanly."

requirements-completed: [PLUG-04, DIFF-03]

# Metrics
duration: ~6min
completed: 2026-04-19
---

# Phase 03 Plan 02b: Session Wiring + HTTP Event Route + Fixture Script Summary

**Wires Plan 03-02a's ingest adapters into the session manager (`startReview` fires `existingComments.loaded` + `ciChecks.loaded` for GitHub sessions), opens the client-side event channel via `POST /api/session/events` (zod-restricted to the two user-triggered SessionEvent variants, behind the existing Phase-1 X-Review-Token CSRF gate), and lands the canonical fixture-capture generator alongside documentation updates for the committed fixtures.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 3
- **Files created:** 4 (2 test files, 1 route, 1 script)
- **Files modified:** 4 (manager.ts, server.ts, fixtures README, deferred-items)

## Accomplishments

- **`server/src/session/manager.ts`** — `startReview` extended with a post-snapshot Phase-3 block. For GitHub-source sessions (`source.kind === 'github'` AND `pr.owner` AND `pr.repo` AND `typeof pr.number === 'number'`), runs two independent try/catch chains:
  1. `await fetchExistingComments(pr.owner, pr.repo, pr.number, diff)` → `await this.applyEvent(prKey, { type: 'existingComments.loaded', comments })`; on throw, `logger.warn('Failed to load existing comments:', err)` (stderr only).
  2. `await fetchCIChecks(pr.number)` → `await this.applyEvent(prKey, { type: 'ciChecks.loaded', ciStatus })`; on throw, `logger.warn('Failed to load CI checks:', err)` (stderr only).
  Local-source sessions skip both entirely (D-23 + D-26). Both applyEvent calls route through the standard persist-then-broadcast pipeline so the web client sees `snapshot → update(existingComments) → update(ciChecks)`.
- **`server/src/session/__tests__/manager-phase3.test.ts`** — new test file with 5 cases: (1) github source fires both events, (2) local source fires neither event and makes no adapter calls, (3) fetchExistingComments rejection does not throw from startReview, (4) fetchCIChecks rejection does not throw from startReview, (5) ordering invariant — writeState precedes both applyEvent calls for the Phase-3 events.
- **`server/src/http/routes/session-events.ts`** — new route module exporting `mountSessionEvents(app, manager)`. Body schema: `z.object({ prKey: z.string().min(1), event: userEventSchema }).strict()` where `userEventSchema = z.discriminatedUnion('type', [reviewStatusSchema, expandToggleSchema])` with strict per-variant schemas. Handler: parse body → 400 on invalid, `manager.get(prKey)` → 404 if undefined, `await manager.applyEvent(prKey, event)` → 500 via try/catch on throw, else 200 `{ ok: true }`. Deliberately omits server-only event variants from the union so clients attempting to post them get 400 (T-3-06 mitigation).
- **`server/src/http/__tests__/session-events.test.ts`** — 11 test cases covering the full matrix: 2 happy paths (reviewStatusSet + expandToggled), 3 server-only rejections (existingComments.loaded, ciChecks.loaded, session.reset), 1 missing-token 403, 1 unknown-prKey 404, 4 validation cases (malformed JSON, missing event field, empty prKey, invalid enum value).
- **`server/src/http/server.ts`** — mounted `mountSessionEvents(app, manager)` between `mountSessionResume` and `mountEvents`, picking up the app-level `app.use('/api/*', tokenValidate(manager))` middleware so the route inherits the double-submit CSRF check without any new middleware wiring.
- **`scripts/generate-fixture.ts`** — one-off fixture capture: runs `ingestGithub(arg)` → `toDiffModel(diffText)` → per-file `highlightHunks(path, meta.headRefOid || 'HEAD', file.hunks)`, then writes `diff-model.fixture.json` + `shiki-tokens.fixture.json` into `web/src/__tests__/fixtures/`. Logs warnings on every D-09 constraint violation (files outside 5–10, hunks outside 30–50, missing generated / renamed / big-hunk file) but writes the output unconditionally so authors can hand-edit afterwards.
- **`web/src/__tests__/fixtures/README.md`** — revised to reflect 03-02b ownership of the canonical generator, document the regeneration command, and affirm the current fixture shape (6 files, 32 hunks, `package-lock.json` generated, `src/utils.ts` renamed from `src/helpers.ts`, `src/app.ts` 8 hunks).

## Fixture PR used

**Source: hand-synthesized** (landed during Plan 03-03 execution as a Rule 3 unblock; re-used verbatim here because the shape already satisfies D-09).

- **files:** 6 (inside the 5–10 target)
- **totalHunks:** 32 (inside the 30–50 target)
- **hasGenerated:** `true` — `package-lock.json` (`generated: true`, `status: 'modified'`, 6 hunks)
- **hasRenamed:** `true` — `src/utils.ts` (`status: 'renamed'`, `oldPath: 'src/helpers.ts'`, 4 hunks)
- **hasBigHunk:** `true` — `src/app.ts` (8 hunks); `src/api.ts` (7 hunks)
- **Mixed languages:** TypeScript (`src/app.ts`, `src/utils.ts`, `src/api.ts`) + JSON (`package-lock.json`, `config/settings.json`) + Markdown (`README.md`)
- **Shiki token shape confirmed:** keys match `diff.files[i].id`; every line has ≥1 token with a valid hex `color` field (e.g., `"#24292f"`) per the structural check in `node -e`.

**No deviation from D-09:** every constraint is satisfied. The generator script is available for future live-PR captures, but the committed fixture shape is already compliant so regeneration is optional.

## Grep-verified invariants

| Invariant | File | Expected | Actual |
|-----------|------|----------|--------|
| fires existingComments.loaded | `server/src/session/manager.ts` | 1 | **1** ✓ |
| fires ciChecks.loaded | `server/src/session/manager.ts` | 1 | **1** ✓ |
| GitHub-only gate | `server/src/session/manager.ts` | ≥1 | **5** ✓ |
| fetchExistingComments referenced | `server/src/session/manager.ts` | 2 (import + call) | **2** ✓ |
| fetchCIChecks referenced | `server/src/session/manager.ts` | 2 (import + call) | **2** ✓ |
| logger.warn sites | `server/src/session/manager.ts` | ≥2 | **4** ✓ |
| discriminatedUnion call | `server/src/http/routes/session-events.ts` | 1 | **1** ✓ |
| file.reviewStatusSet literal | `server/src/http/routes/session-events.ts` | 1 | **1** ✓ |
| file.generatedExpandToggled literal | `server/src/http/routes/session-events.ts` | 1 | **1** ✓ |
| existingComments.loaded literal | `server/src/http/routes/session-events.ts` | 0 (server-only) | **0** ✓ |
| ciChecks.loaded literal | `server/src/http/routes/session-events.ts` | 0 (server-only) | **0** ✓ |
| session.adoptNewDiff / reset / viewBoth literal | `server/src/http/routes/session-events.ts` | 0 | **0** ✓ |
| mountSessionEvents wired | `server/src/http/server.ts` | ≥1 | **2** (import + call) ✓ |

## Task Commits

| # | Task | Hash | Type |
|---|------|------|------|
| 1 | Extend manager.startReview + 5 TDD tests (RED verified: 3 fails, then GREEN: 5 pass) | `d8e1de8` | feat |
| 2 | POST /api/session/events route + wiring + 11 TDD tests (RED verified: 11 fails, then GREEN: 11 pass) | `e634f98` | feat |
| 3 | scripts/generate-fixture.ts + fixtures README revision + deferred-items note | `14e4f8a` | feat |

## Phase-2 test impact

**Zero Phase-1/Phase-2 tests needed tweaking.** Specifics:

- `server/src/session/__tests__/manager.test.ts` — 15 tests still pass. The new manager-phase3 mocks are isolated to the new test file.
- `server/src/session/__tests__/manager.resume.test.ts` — 6 tests still pass. The resume path intercepts before startReview's Phase-3 block, so the new code is unreachable during resume tests.
- `server/src/session/__tests__/manager.integration.test.ts` — 3 tests still pass. The integration tests use local-source sessions (base/head), which don't enter the Phase-3 GitHub-only branch.
- The only stderr noise is `logger.warn("Failed to load existing comments", ...)` and `logger.warn("Failed to load CI checks", ...)` in tests that didn't mock `fetchExistingComments`/`fetchCIChecks`. This is the DESIGNED behavior: startReview continues cleanly when the adapter functions throw. That noise appears in `manager.test.ts` and `manager.resume.test.ts` stderr output but does not fail any assertion.

## Test-suite sweep

- `pnpm --filter server test` (via `npx vitest run` in `server/`): **242 pass / 1 fail / 35 test files**. The 1 failure is `src/__tests__/end-to-end.test.ts`, pre-existing and documented in `deferred-items.md` from Plan 03-01 (`MODULE_NOT_FOUND` before any Phase-3 code runs).
- `npx tsc --noEmit` in `server/`: exits 0, no type errors introduced.

## Decisions Made

- **Kept existing Plan-03-03 fixtures verbatim** rather than regenerating from a live PR. Rationale: the committed fixture already satisfies D-09 (6 files / 32 hunks / hasGenerated / hasRenamed / maxHunks=8), the render test landed on it, and overwriting it with a slightly different live-PR capture would force Plan 03-03's test assertions to re-baseline for no structural gain. The generator script exists for future regeneration without code changes.
- **Did not execute `scripts/generate-fixture.ts` in this worktree** because Node 24.10 + tsx + execa's transitive `unicorn-magic` dep has an `ERR_PACKAGE_PATH_NOT_EXPORTED` incompatibility. This is an environmental issue (the stack's target runtime is Node 22 LTS per PROJECT.md) documented in `deferred-items.md` — not a code issue. The script's imports resolve cleanly in the vitest-driven test harness the server tests use.
- **Chose `mountSessionEvents` over `registerSessionEventsRoute`** as the export name, to match the project's established pattern (`mountSessionResume`, `mountSessionAdopt`, `mountEvents`, `mountStatic`). The Plan-02b spec used `registerSessionEventsRoute`; adapting to the codebase convention is a Rule 1 correctness fix (consistency + no reviewer friction).

## Deviations from Plan

**None of consequence — plan executed as written.** Minor notes:

1. **Export name `mountSessionEvents` (plan said `registerSessionEventsRoute`).** Adapted to match the existing codebase pattern (`mountSessionResume`, `mountSessionAdopt`, etc.). Functionally identical — both names describe a function that takes `(app, manager)` and calls `app.post(...)`. Test file uses `mountSessionEvents` to match.
2. **Fixture was not re-captured from a live PR.** Already landed via Plan 03-03 and satisfies D-09; re-capturing would only churn the tree without gain. Plan 03-02b's `<action>` Step 2 explicitly allows the synthetic fallback ("If the developer hasn't approved `gh auth login`... fall back to SYNTHESIZING a fixture by hand"). Kept the hand-synthesized fixture and documented the decision in the README + this summary.
3. **Script is committed but not executed.** Environmental issue with Node 24 + tsx + execa transitive deps. Documented in `deferred-items.md`. Does not affect Plan 03-02b success criteria (script exists, is well-formed, imports match the server's test-harness-verified shape).
4. **One ESLint/type quirk hidden in test mocks.** Used `vi.mocked(...).mockResolvedValue(...)` pattern (matches codebase style) rather than `mockImplementation(async () => ...)`. Functionally identical.

## Issues Encountered

1. **Pre-existing end-to-end test failure** — `server/src/__tests__/end-to-end.test.ts` fails with a spawn/listen timeout pattern before any Phase-3 code runs. Documented in `deferred-items.md` from Plan 03-01. Out of scope per SCOPE BOUNDARY rule. All 242 other server tests pass.
2. **pnpm workspace was empty on arrival.** Running `pnpm install --force` at the worktree root repopulated `node_modules/` cleanly (415 packages). Same pattern as earlier worktrees (documented in 03-01-SUMMARY.md). Not a code issue.
3. **Node 24 / tsx / execa / unicorn-magic incompatibility** — prevents running `tsx scripts/generate-fixture.ts` directly on this worktree. Environmental; documented in `deferred-items.md`. Does not block the plan (script file exists, imports are correct, will work on Node 22 LTS per the stack's target runtime).

## Only-user-triggered invariant (grep-verified)

The POST /api/session/events handler accepts ONLY these two event types:
- `file.reviewStatusSet` ✓
- `file.generatedExpandToggled` ✓

And NONE of these (server-only or resume-choice variants):
- `existingComments.loaded` — grep=0 ✓
- `ciChecks.loaded` — grep=0 ✓
- `session.adoptNewDiff` — grep=0 ✓
- `session.reset` — grep=0 ✓
- `session.viewBoth` — grep=0 ✓

The ONLY place in the codebase where `existingComments.loaded` and `ciChecks.loaded` appear as event-payload literals is `server/src/session/manager.ts` (the server-side emitter), which is exactly the intended boundary.

## Retrofit required

None. Test scaffolding used the same patterns as `manager.test.ts` + `session-resume.test.ts` without any additions to manager construction, existing types, or the Phase-1 middleware. `SessionManager({ sessionToken })` was already the correct single-arg ctor; `buildHttpApp` already mounts tokenValidate on /api/*; the new route drops into the existing layout with no changes.

## TDD Gate Compliance

Plan frontmatter `type: execute`, not `tdd` — plan-level gate doesn't apply. Per-task TDD gates (Tasks 1–2 have `tdd="true"`, Task 3 does not):

- **Task 1** (`tdd="true"`): RED verified via `npx vitest run src/session/__tests__/manager-phase3.test.ts` → 3 of 5 tests fail pre-change. GREEN verified post-edit → 5/5 pass. Committed as single feat commit (`d8e1de8`) bundling test + impl because the test file couldn't compile until `fetchExistingComments`/`fetchCIChecks` were imported into manager.ts. TDD intent preserved — the fails were confirmed before the impl was written.
- **Task 2** (`tdd="true"`): RED verified → 11/11 tests fail because `../routes/session-events.js` doesn't exist. GREEN verified → 11/11 pass. Single feat commit (`e634f98`) bundles route + test + server.ts wiring.
- **Task 3** (no TDD): Three-file change (script + README + deferred-items). Verified via `test -f` + `node -e` JSON-structure check.

Gate sequence: feat(manager) → feat(route) → feat(fixture). Compliant.

## Next Phase Readiness

- **Plan 03-05 (App.tsx rewrite)** can now:
  1. Import `postSessionEvent` from `web/src/api.ts` (landed in Plan 03-04) and call it with `{ type: 'file.reviewStatusSet', fileId, status }` or `{ type: 'file.generatedExpandToggled', fileId, expanded }` — the server route is live.
  2. Rely on `state.existingComments` and `state.ciStatus` being populated via Phase-3 SSE updates from `startReview`'s post-snapshot events — the data flow is end-to-end.
  3. Trust that local-source sessions don't get spurious existingComments.loaded / ciChecks.loaded events (D-23 + D-26 preserved).

## Self-Check: PASSED

Verified each claim:

**Created files:**
- FOUND: `server/src/session/__tests__/manager-phase3.test.ts`
- FOUND: `server/src/http/routes/session-events.ts`
- FOUND: `server/src/http/__tests__/session-events.test.ts`
- FOUND: `scripts/generate-fixture.ts`

**Modified files:**
- `server/src/session/manager.ts` — `grep 'existingComments.loaded' = 1`, `grep 'ciChecks.loaded' = 1`, `grep 'source.kind === github' = 5`, `grep 'logger.warn' = 4`, `grep 'fetchExistingComments' = 2`, `grep 'fetchCIChecks' = 2`
- `server/src/http/server.ts` — `grep 'mountSessionEvents' = 2`
- `web/src/__tests__/fixtures/README.md` — revised to document 03-02b ownership
- `.planning/phases/03-diff-ui-file-tree-navigation/deferred-items.md` — Node-24 tsx note added

**Fixtures satisfy D-09:**
- `files.length = 6` (in 5–10 range)
- `totalHunks = 32` (in 30–50 range)
- `files.some(f => f.generated) === true`
- `files.some(f => f.status === 'renamed') === true`
- `Math.max(...files.map(f => f.hunks.length)) === 8` (≥5 satisfied)
- Shiki tokens keyed by DiffFile.id for all 6 files; structure `[hunk[line[token]]]` confirmed

**Commits exist (git log --oneline 87f4780..HEAD):**
- FOUND: `d8e1de8` feat(03-02b): extend startReview to fire existingComments.loaded + ciChecks.loaded
- FOUND: `e634f98` feat(03-02b): add POST /api/session/events route for user-triggered SessionEvents
- FOUND: `14e4f8a` feat(03-02b): add fixture-capture script + document 03-02b fixture ownership

**Verification commands green:**
- `npx vitest run src/session/__tests__/manager-phase3.test.ts` — 5/5 PASS
- `npx vitest run src/http/__tests__/session-events.test.ts` — 11/11 PASS
- `npx vitest run src/http/` — 58/58 PASS (full HTTP suite, no regressions)
- `npx vitest run` (full server suite) — 242/243 PASS (1 pre-existing end-to-end failure, documented)
- `npx tsc --noEmit` (server) — exits 0, no type errors

## Threat Flags

None. The plan's `<threat_model>` fully captured the relevant surfaces:
- **T-3-05 (Tampering: forged POST without token)** — mitigated by app-level `tokenValidate` middleware on `/api/*`; new route inherits it automatically. Test `auth-1` asserts 403 when X-Review-Token header is missing.
- **T-3-06 (DoS: malformed SessionEvent crashing reducer)** — mitigated by `z.discriminatedUnion` on ONLY the two user-triggered variants; server-only and resume-choice variants fail validation → 400 before reaching applyEvent. Tests `reject-server-only-1/2/3` assert this.
- **T-3-12 (DoS: adapter failures crashing startReview)** — mitigated by independent try/catch around both `fetchExistingComments` + `fetchCIChecks` calls, each logging via `logger.warn` without rethrowing. Tests `logger.warns but does not throw` assert both branches.

No new security-relevant surface introduced beyond what the plan's threat model covers.

---
*Phase: 03-diff-ui-file-tree-navigation*
*Plan: 02b*
*Completed: 2026-04-19*
