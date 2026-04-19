---
phase: 3
slug: diff-ui-file-tree-navigation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-19
revised: 2026-04-19 (checker revision — split Plan 03-02 into 03-02a + 03-02b)
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (web + server workspaces) |
| **Config file** | `web/vitest.config.ts`, `server/vitest.config.ts` |
| **Quick run command (web)** | `pnpm --filter @review/web test -- --run` |
| **Quick run command (server)** | `pnpm --filter @review/server test -- --run` |
| **Full suite command** | `pnpm -r test -- --run` |
| **Type compile** | `pnpm -r tsc --noEmit` |
| **Estimated runtime** | ~60 seconds for full suite (Phase 1+2 baseline ~30s; Phase 3 adds ~30s of new tests) |

---

## Sampling Rate

- **After every task commit:** Run the affected-workspace quick command (`pnpm --filter @review/web test -- --run` or `pnpm --filter @review/server test -- --run`).
- **After every plan wave:** Run full suite command.
- **Before `/gsd-verify-work`:** Full suite must be green, type compile clean.
- **Max feedback latency:** 30 seconds per targeted test run.

---

## Per-Task Verification Map

Per-plan, per-task verification. Maps each task to (plan, wave, requirement, threat, automated command, target test file).

Plan 03-02 was split into 03-02a (ingest readers) and 03-02b (session wiring + fixtures) during the checker revision. Former 02-T1..T4 become 02a-T1..T4; former 02-T5..T7 become 02b-T1..T3.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior / Invariant | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------------------|-----------|-------------------|-------------|--------|
| 01-T1 | 03-01 | 0 | PLUG-04 / INGEST-03 / INGEST-04 / DIFF-01..04 | T-3-02 | shared/types.ts gains `DiffFile.generated` + 4 SessionEvent variants + ReadOnlyComment/CIStatus/CheckRun + FileReviewStatus | unit (type-compile) | `pnpm -r tsc --noEmit` | ❌ must create | ⬜ pending |
| 01-T2 | 03-01 | 0 | DIFF-01 | T-3-01 | Shiki theme is `github-light` at both call sites; theme test asserts no `#e6edf3` dark-fg colors | unit | `pnpm --filter @review/server test -- --run shiki-theme` | ❌ must create | ⬜ pending |
| 01-T3 | 03-01 | 0 | DIFF-03 / DIFF-04 / INGEST-03 / INGEST-04 | T-3-P1-01 (purity) | Reducer handles 4 new branches purely; no `lastEventId` mutation | unit | `pnpm --filter @review/server test -- --run reducer-phase3` | ❌ must create | ⬜ pending |
| 01-T4 | 03-01 | 0 | PLUG-04 / DIFF-03 | — (infra) | Vitest setup exposes MockIntersectionObserver + scrollIntoView mocks alongside EventSource | unit (infra) | `pnpm --filter @review/web test -- --run` | ❌ must create | ⬜ pending |
| 01-T5 | 03-01 | 0 | DIFF-01 | — | Deletions: TweaksPanel, DiffView.spike, diff-view-spike.test, utils/highlight.ts; @git-diff-view/react removed | file-existence | `test ! -f web/src/components/TweaksPanel.tsx && test ! -f web/src/utils/highlight.ts` | ❌ must create | ⬜ pending |
| 01-T6 | 03-01 | 0 | DIFF-01 (Open Decision 1) | — | PROJECT.md Key Decisions contains Phase 3 rows for UI-SPEC supersession, Open Decision 1 resolution, gh-pr-checks correction | grep | `grep -c 'D-05 (Phase 3)' .planning/PROJECT.md` | ❌ must create | ⬜ pending |
| 02a-T1 | 03-02a | 1 | DIFF-04 | T-3-02 | `isGeneratedFile` is a pure function; positives include 8 lockfile names + glob patterns; negatives include non-lock package.json + substring-not-prefix paths | unit | `pnpm --filter @review/server test -- --run generated-file-detection` | ❌ must create | ⬜ pending |
| 02a-T2 | 03-02a | 1 | DIFF-04 | T-3-02 | `toDiffModel(lockfile)` produces `DiffFile.generated === true`; `toDiffModel(src)` produces `false` | unit | `pnpm --filter @review/server test -- --run parse` | ❌ must create | ⬜ pending |
| 02a-T3 | 03-02a | 1 | INGEST-03 | T-3-03 / T-3-07 | `resolveCommentAnchor` handles path-missing (orphan), context-line fallback, original_line fallback; orphans logged via `logger.warn` count-only (no PII); `--paginate` flag present; no shell injection | unit | `pnpm --filter @review/server test -- --run comments` | ❌ must create | ⬜ pending |
| 02a-T4 | 03-02a | 1 | INGEST-04 | T-3-04 | `fetchCIChecks` uses `name,state,bucket,link` field names (NOT `conclusion,detailsUrl`); handles exit code 8 as pending; aggregate logic correct | unit | `pnpm --filter @review/server test -- --run ci-checks` | ❌ must create | ⬜ pending |
| 02b-T1 | 03-02b | 1 | INGEST-03 / INGEST-04 | T-3-12 | `startReview` fires `existingComments.loaded` + `ciChecks.loaded` for GitHub-source only; local-source skips; failures logged without throwing | unit | `pnpm --filter @review/server test -- --run manager-phase3 \|\| pnpm --filter @review/server test -- --run manager` | ❌ must create | ⬜ pending |
| 02b-T2 | 03-02b | 1 | PLUG-04 / DIFF-03 / DIFF-04 | T-3-05 / T-3-06 | POST /api/session/events: zod `discriminatedUnion` accepts only `file.reviewStatusSet` + `file.generatedExpandToggled`; 400 on wrong type; 403 on missing token; 404 on unknown prKey | integration | `pnpm --filter @review/server test -- --run session-events` | ❌ must create | ⬜ pending |
| 02b-T3 | 03-02b | 1 | DIFF-01 / DIFF-02 / DIFF-04 | — | Fixture files exist at `web/src/__tests__/fixtures/`; JSON is parseable; ≥1 generated file; ≥1 renamed file | file-existence + parse | `node -e "const d=require('./web/src/__tests__/fixtures/diff-model.fixture.json'); if(!d.files.some(f=>f.generated))process.exit(1)"` | ❌ must create | ⬜ pending |
| 03-T1 | 03-03 | 1 | DIFF-01 / DIFF-02 / DIFF-04 / INGEST-03 | T-3-01 / T-3-03 | DiffViewer test suite covers smoke, anchors, render-budget, generated-collapse/expand, comment marker, XSS safety (Shiki + body), **split-mode DOM-shape assertion with comparative cell-count check (strengthened in checker revision)**, unified inverse, empty diff | unit + perf | `pnpm --filter @review/web test -- --run DiffViewer` | ❌ must create | ⬜ pending |
| 03-T2 | 03-03 | 1 | DIFF-01 / DIFF-02 / DIFF-04 / INGEST-03 | T-3-01 / T-3-01a / T-3-03 | DiffViewer refactored: no data.ts or utils/highlight imports; `tokenToHtml` + `escapeHtml` + `HEX_COLOR` defined; multi-file loop with `id="diff-${file.id}"` + `id="${hunk.id}"` anchors; emits `data-view="split"` + `.diff-table.split` for split mode (so Task 1's strengthened test passes); ≥12 tests green | unit + perf | `pnpm --filter @review/web test -- --run DiffViewer` | ❌ must create | ⬜ pending |
| 04-T1 | 03-04 | 1 | PLUG-04 / DIFF-03 / DIFF-04 | T-3-05 | `postSessionEvent` throws on missing token; sends `X-Review-Token` header; POSTs to `/api/session/events` with `{prKey, event}` body | unit | `pnpm --filter @review/web test -- --run api` | ❌ must create | ⬜ pending |
| 04-T2 | 03-04 | 1 | DIFF-03 / INGEST-03 / INGEST-04 / DIFF-04 | T-3-13 | store.ts `AppState`, `INITIAL`, `onSnapshot`, `onUpdate` mirror 4 Phase-3 fields with `?? {} / ?? [] / ?? undefined` fallbacks **AND add a new top-level `prKey: string` field populated from `msg.session.prKey` (INITIAL sets `prKey: ''`) — checker-required fix for Plan 03-05's postSessionEvent call sites** | unit | `pnpm --filter @review/web test -- --run store` | ❌ must create | ⬜ pending |
| 04-T3 | 03-04 | 1 | DIFF-03 / DIFF-04 | T-3-03 | FileExplorer consumes props; status dots per D-11 (ok/warn/ink-4); Repo tab disabled; generated styling muted + Excluded; scroll-to-anchor on click; live summary counts | unit | `pnpm --filter @review/web test -- --run FileExplorer` | ❌ must create | ⬜ pending |
| 04-T4 | 03-04 | 1 | INGEST-04 | T-3-08 | TopBar consumes props; CIPill renders per aggregate palette; hides when undefined or aggregate==='none'; dropdown links have `rel="noreferrer"`; aria-label includes aggregate + count | unit | `pnpm --filter @review/web test -- --run TopBar` | ❌ must create | ⬜ pending |
| 05-T1 | 03-05 | 2 | PLUG-04 | T-3-09 | App.tsx keyboard listener: n/p navigation + wrap toasts; r toggles review status; c/v/s stub toasts; skips INPUT focus; ignores meta/ctrl/alt | unit | `pnpm --filter @review/web test -- --run App.keyboard` | ❌ must create | ⬜ pending |
| 05-T2 | 03-05 | 2 | DIFF-03 | T-3-10 | App.tsx IntersectionObserver: 50%/500ms debounce; POSTs in-progress on untouched only; early-exit cancels; skips already-in-progress/reviewed | unit | `pnpm --filter @review/web test -- --run App.intersection` | ❌ must create | ⬜ pending |
| 05-T3 | 03-05 | 2 | DIFF-01..04 / INGEST-03 / INGEST-04 / PLUG-04 | — | App integration: TopBar + FileExplorer + DiffViewer render live; Expand stub POSTs generatedExpandToggled; FileExplorer click scrolls diff; StaleDiffModal still renders on stale-diff | unit | `pnpm --filter @review/web test -- --run App.integration` | ❌ must create | ⬜ pending |
| 05-T4 | 03-05 | 2 | DIFF-01..04 / INGEST-03 / INGEST-04 / PLUG-04 | T-3-05 / T-3-09 / T-3-10 / T-3-11 / T-3-13 | App.tsx final: 2-column CSS grid; no data.ts imports; no TweaksPanel/ChatPanel/InlineThread mounts; postSessionEvent path wired (≥3 call sites); **`prKey` sourced from `state.prKey` directly (no reconstruction ternary) + every call site has `if (!prKey) return;` early-return guard — checker-required fix**; footer hint + toast rendered | integration | `pnpm --filter @review/web test -- --run` | ❌ must create | ⬜ pending |
| 05-T5 | 03-05 | 2 | — | — | `web/src/data.ts` deleted; zero remaining `./data` or `../data` imports in web/src/; full test suite + tsc clean | file-existence + grep | `test ! -f web/src/data.ts && ! grep -rn "from.*'\\./data'\\\|from.*'\\.\\./data'" web/src/ --include="*.ts" --include="*.tsx"` | ❌ must create | ⬜ pending |

*Status key: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Shared types extended (`shared/types.ts`) — required by every downstream plan (03-01 Task 1)
- [ ] Shiki theme fix (`server/src/highlight/shiki.ts`) — required by DiffViewer render test in 03-03 (03-01 Task 2)
- [ ] Reducer extension (`server/src/session/reducer.ts`) — required by manager + http-events routes in 03-02b (03-01 Task 3)
- [ ] Test mocks (`web/src/test/setup.ts`) — required by App.intersection.test.tsx in 03-05 (03-01 Task 4)
- [ ] Obsolete file deletions (TweaksPanel, DiffView.spike, diff-view-spike test, utils/highlight.ts, `@git-diff-view/react` dep) (03-01 Task 5)
- [ ] PROJECT.md Key Decisions: 3 new Phase-3 rows (03-01 Task 6)
- [ ] Fixture PR cache — captured via `scripts/generate-fixture.ts` into `web/src/__tests__/fixtures/*.json` (03-02b Task 3)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Syntax-highlighted diff visually readable with light-mode paper palette | DIFF-01 | Visual regression not automated in v1 | Open a fixture PR in the review UI; confirm Shiki `github-light` tokens render with dark ink on paper (not white-on-white from `github-dark`) |
| Hunk focus pulse animation (400ms teal left-border) on `n`/`p` | PLUG-04 | CSS animation visual polish not asserted in JSDOM | Press `n` with a fixture loaded; observe the 400ms teal border-left pulse on the target hunk. Verify the pulse is absent when `prefers-reduced-motion: reduce` is active |
| Toast visual placement (bottom-center) + auto-dismiss timing feel | PLUG-04 | Subjective UX smoothness | Press `c`/`v`/`s`; verify toast appears bottom-center, dismisses around 2.5s, uses Inter Tight text |
| Footer hint readability at desktop viewport | PLUG-04 | Visual polish | Verify footer hint visible bottom-right on ≥768px viewport; `n / p · r` in `--ink-3`, `c v s` in `--ink-4`; hidden below 768px |
| CI dropdown click-to-expand animation + external-link glyph | INGEST-04 | Visual polish | Load a PR with ≥2 CI checks; click the pill; verify dropdown lists each check with external-link arrow; click arrow opens in new tab |

*All phase behaviors beyond the above have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify (no MISSING markers; Wave 0 infrastructure tasks noted explicitly)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — every task in every plan has an `<automated>` command
- [x] Wave 0 covers all infrastructure dependencies needed by later waves (Shiki theme, test mocks, shared types, deletions, decisions, fixtures)
- [x] No watch-mode flags (`--run` used throughout)
- [x] Feedback latency <30s per targeted command
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (will be set to approved by checker during `/gsd-verify-work`)
