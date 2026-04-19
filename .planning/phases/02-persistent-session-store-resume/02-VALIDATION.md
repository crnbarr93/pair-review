---
phase: 2
slug: persistent-session-store-resume
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-19
updated_by_planner: 2026-04-19
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (latest, server + web workspaces) |
| **Config file** | `server/vitest.config.ts` (Phase 1) + `web/vitest.config.ts` (Phase 1) |
| **Quick run command** | `cd server && pnpm test -- <file> --run` (single-file, ~2s) |
| **Full suite command** | `pnpm -r test --run` (server + web, ~20-30s with Phase-2 additions) |
| **Estimated runtime** | ~2 seconds per targeted file; ~25s for full suite |

---

## Sampling Rate

- **After every task commit:** Run the task's targeted `<file> --run` command (< 3 seconds)
- **After every plan wave:** Run `pnpm -r test --run` (full server + web suite)
- **Before `/gsd-verify-work`:** Full suite must be green + `scripts/security-probes.sh` still passes
- **Max feedback latency:** 3 seconds for per-task, 30s for full suite

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | SESS-01, SESS-02 | T-2-01-01, T-2-01-02 | SessionEvent union is exhaustive via `const _never: never`; type-layer only (no runtime surface) | typecheck | `cd /Users/connorbarr/dev/personal/git-review-plugin && pnpm -r exec tsc --noEmit` | ❌ W0 (shared/types.ts extensions) | ⬜ pending |
| 2-01-02 | 01 | 1 | SESS-01, SESS-02 | T-2-01-02, T-2-01-05 | Pure reducer — no I/O, no Date, never touches lastEventId; immutability enforced by test | unit | `cd server && pnpm test -- reducer.test.ts --run` | ❌ W0 (server/src/session/reducer.ts) | ⬜ pending |
| 2-01-03 | 01 | 1 | SESS-01 | T-2-01-03, T-2-01-04 | SessionBus catches listener throws + logs to stderr; no console.log | unit | `cd server && pnpm test -- bus.test.ts --run` | ❌ W0 (server/src/session/bus.ts) | ⬜ pending |
| 2-02-01 | 02 | 1 | SESS-03 | T-2-02-01, T-2-02-02 | SIGKILL during writeState leaves state.json either pristine or advanced — never truncated (5 iterations with varying timing) | integration | `cd server && pnpm test -- store.crash.test.ts --run` | ❌ W0 (server/src/persist/__tests__/store.crash.test.ts) | ⬜ pending |
| 2-02-02 | 02 | 1 | SESS-03 | — | Concurrent same-prKey writes serialize cleanly via proper-lockfile; different-prKey writes parallelize | integration | `cd server && pnpm test -- store.concurrency.test.ts --run` | ❌ W0 (server/src/persist/__tests__/store.concurrency.test.ts) | ⬜ pending |
| 2-02-03 | 02 | 1 | SESS-03 | — | Stale lockdir (30s old) broken within 3s; new writeState succeeds | integration | `cd server && pnpm test -- store.stale-lock.test.ts --run` | ❌ W0 (server/src/persist/__tests__/store.stale-lock.test.ts) | ⬜ pending |
| 2-03-01 | 03 | 2 | SESS-02 | T-2-03-04 | fetchCurrentHeadSha fails closed on error (throws, not silently returns null); no shell injection via argv discipline | unit | `cd server && pnpm test -- ingest --run` | ❌ W0 (new describe blocks in github.test.ts + local.test.ts) | ⬜ pending |
| 2-03-02 | 03 | 2 | SESS-01, SESS-02 | T-2-03-09 | SessionManager.applyEvent persists-then-broadcasts (disk → memory → bus); per-prKey queue serializes concurrent calls; legacy state.json migrates with lastEventId=0; fetchCurrentHeadSha error surfaces as session.error, not false-positive staleDiff | integration | `cd server && pnpm test -- manager --run` | ❌ W0 (new describe blocks + new manager.resume.test.ts) | ⬜ pending |
| 2-03-03 | 03 | 2 | SESS-01 | T-2-03-09 | SSE subscribe-before-snapshot (Pitfall E); buffer-and-flush for events in the gap; event:update with monotonic id per applyEvent; Last-Event-ID header read (Phase 2 always sends full snapshot on reconnect) | integration | `cd server && pnpm test -- events.test.ts --run` | ❌ W0 (new describe blocks in existing events.test.ts) | ⬜ pending |
| 2-03-04 | 03 | 2 | SESS-02 | T-2-03-01, T-2-03-02, T-2-03-03 | POST /api/session/choose-resume: zod .strict() rejects bogus bodies (400); missing token (403); unknown prKey (404); three branches adopt/reset/viewBoth each call the correct SessionManager method | integration | `cd server && pnpm test -- session-resume.test.ts --run` | ❌ W0 (server/src/http/__tests__/session-resume.test.ts) | ⬜ pending |
| 2-04-01 | 04 | 3 | SESS-02 | T-2-04-02, T-2-04-03 | openEventStream registers both snapshot + update listeners; chooseResume POSTs with X-Review-Token; throws on non-200 + when token unset | unit (web) | `cd web && pnpm test -- api --run` | ❌ W0 (web/src/__tests__/api.test.ts) | ⬜ pending |
| 2-04-02 | 04 | 3 | SESS-02 | T-2-04-04 | onSnapshot + onUpdate propagate staleDiff/sessionKey/headShaError; setSource stores source; store never crashes on malformed server data (TypeScript-guarded) | unit (web) | `cd web && pnpm test -- store --run` | ❌ W0 (web/src/__tests__/store.test.ts) | ⬜ pending |
| 2-04-03 | 04 | 3 | SESS-02 | T-2-04-01, T-2-04-02 | StaleDiffModal renders three Phase-2 buttons; not dismissible by Escape/backdrop; in-flight "Refreshing diff…" overlay; role=dialog + aria-modal=true; main.tsx captures token + source BEFORE URL wipe | unit (web) + integration | `cd web && pnpm test -- StaleDiffModal main-bootstrap --run` | ❌ W0 (web/src/components/__tests__/StaleDiffModal.test.tsx; extensions to main-bootstrap.test.tsx) | ⬜ pending |
| 2-04-04 | 04 | 3 | SESS-01, SESS-02, SESS-03 | all | Human-verify checkpoint: 8-step live-run covering resume-from-cold-start, stale-SHA modal, three-button dispatch, SSE live update, crash-safety sanity (via store.crash.test.ts), label sign-off | manual | live run in browser | (checkpoint, no file) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 = "files that must exist before the first red→green test cycle can run." All items below are created by the plans themselves (not pre-execution scaffolding), so Wave 0 is effectively "run in order 01 → 02 → 03 → 04."

- [ ] `server/src/session/reducer.ts` — NEW (Plan 01 Task 2) — pure applyEvent
- [ ] `server/src/session/__tests__/reducer.test.ts` — NEW (Plan 01 Task 2)
- [ ] `server/src/session/bus.ts` — NEW (Plan 01 Task 3) — typed EventEmitter wrapper
- [ ] `server/src/session/__tests__/bus.test.ts` — NEW (Plan 01 Task 3)
- [ ] `shared/types.ts` — MODIFIED (Plan 01 Task 1) — SessionEvent + UpdateMessage + ReviewSession extensions
- [ ] `server/src/persist/__tests__/store.crash.test.ts` — NEW (Plan 02 Task 1)
- [ ] `server/src/persist/__tests__/crash-fixture.ts` — NEW (Plan 02 Task 1)
- [ ] `server/src/persist/__tests__/store.concurrency.test.ts` — NEW (Plan 02 Task 2)
- [ ] `server/src/persist/__tests__/store.stale-lock.test.ts` — NEW (Plan 02 Task 3)
- [ ] `server/src/ingest/github.ts` — MODIFIED (Plan 03 Task 1) — fetchCurrentHeadSha export
- [ ] `server/src/ingest/local.ts` — MODIFIED (Plan 03 Task 1)
- [ ] `server/src/session/manager.ts` — MODIFIED (Plan 03 Task 2) — applyEvent + disk-load + resetSession + bus + queue
- [ ] `server/src/session/__tests__/manager.resume.test.ts` — NEW (Plan 03 Task 2)
- [ ] `server/src/http/routes/events.ts` — MODIFIED (Plan 03 Task 3) — subscribe-before-snapshot + update push
- [ ] `server/src/http/routes/session-resume.ts` — NEW (Plan 03 Task 4) — POST handler
- [ ] `server/src/http/__tests__/session-resume.test.ts` — NEW (Plan 03 Task 4)
- [ ] `server/src/http/server.ts` — MODIFIED (Plan 03 Task 4) — mount new route
- [ ] `web/src/api.ts` — MODIFIED (Plan 04 Task 1) — setReviewToken + chooseResume + onUpdate handler
- [ ] `web/src/__tests__/api.test.ts` — NEW-OR-EXTENDED (Plan 04 Task 1)
- [ ] `web/src/store.ts` — MODIFIED (Plan 04 Task 2) — AppState extensions + onUpdate + setSource
- [ ] `web/src/__tests__/store.test.ts` — NEW-OR-EXTENDED (Plan 04 Task 2)
- [ ] `web/src/components/StaleDiffModal.tsx` — NEW (Plan 04 Task 3)
- [ ] `web/src/components/__tests__/StaleDiffModal.test.tsx` — NEW (Plan 04 Task 3)
- [ ] `web/src/App.tsx` — MODIFIED (Plan 04 Task 3) — render StaleDiffModal
- [ ] `web/src/main.tsx` — MODIFIED (Plan 04 Task 3) — setReviewToken + setSource + sourceFromPrKey + 4-arg openEventStream

No pre-execution framework installation needed — vitest is already configured in both workspaces from Phase 1.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live end-to-end resume-from-cold-start (close browser → quit plugin → re-run /review → diff repaints instantly) | SESS-01 | SSE + browser-launch + filesystem I/O cannot be faked end-to-end in unit tests without recreating the entire plugin lifecycle | Plan 04 Task 4 checkpoint Steps 1 |
| Stale-SHA modal visual correctness (three buttons with correct labels + colors + non-dismissibility) | SESS-02 | DOM rendering + Tailwind classes + accessibility semantics require a real browser | Plan 04 Task 4 checkpoint Steps 2 |
| Three-button dispatch behavior (adopt → diff repaints; reset → fresh session; viewBoth → flag persisted) | SESS-02 | Requires real gh/git CLI invocations + SSE round-trip | Plan 04 Task 4 checkpoint Steps 3, 4, 5 |
| SSE live update arrives without page refresh (event:update consumed by store, UI repaints) | SESS-01 | Requires real EventSource + server bus emission on applyEvent | Plan 04 Task 4 checkpoint Step 6 |
| Label sign-off on "Refresh to current PR" (vs Phase-5's "Rebase drafts where possible") | SESS-02 / Assumption A7 | UX-level decision; user preference | Plan 04 Task 4 checkpoint Step 8 |

Automated tests cover: reducer correctness, bus semantics, atomic-JSON crash-safety, lock-serialization, disk-load resume flow, legacy-file migration, fail-closed head-SHA check, SSE subscribe-before-snapshot gap, SSE update-push, POST route zod validation + token check + three-branch dispatch, web store state propagation, modal rendering + button behavior. The manual steps above are the irreducible "does the whole thing work in a real browser" gate.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify (except the explicit `checkpoint:human-verify` in Plan 04 Task 4) or Wave 0 dependencies documented above
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (Plan 04 Task 4 is the only manual task, sandwiched between automated Tasks 1-3 in the same plan and automated Plans 01-03 prior)
- [x] Wave 0 covers all MISSING references (every test file listed above maps to a plan task that creates it)
- [x] No watch-mode flags (all `pnpm test` invocations use `--run`)
- [x] Feedback latency < 3s per task (~2s for reducer/bus/store unit tests; <5s for the crash-interrupt integration test)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-19 (planner)
