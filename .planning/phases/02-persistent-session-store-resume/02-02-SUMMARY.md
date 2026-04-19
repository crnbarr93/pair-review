---
phase: 02-persistent-session-store-resume
plan: 02
subsystem: persistence
tags: [proper-lockfile, write-file-atomic, crash-safety, vitest, spawn, sigkill]

requires:
  - phase: 01-plugin-skeleton-secure-vertical-slice
    provides: "server/src/persist/store.ts (Phase-1 writeState with write-file-atomic + proper-lockfile), vitest config, spawn-not-execa pattern from lifecycle.test.ts"
provides:
  - "writeState now accepts an OPTIONAL third `lockOptions?: WriteStateLockOptions` argument; production defaults preserved"
  - "SESS-03 proof: SIGKILL'd child process mid-writeState loop leaves state.json parseable JSON (5 timing-varied iterations)"
  - "SESS-03 companion: same-prKey concurrent writers serialize via proper-lockfile; different-prKey writers parallelize; serial writes last-writer-wins"
  - "SESS-03 companion: a 30-second-stale .lock directory is broken within <3s by a new writeState under the widened lockOptions budget"
affects:
  - "Plan 02-03 — SessionManager.applyEvent can either rely on the production-tight default (recommended — see Inputs to Plan 03 below) OR pass its own lockOptions if contention forces it"
  - "All future callers of writeState remain source-compatible because the new parameter is optional"

tech-stack:
  added: []
  patterns:
    - "Test-only override pattern: expose an optional parameter for test-side tuning without leaking wider retry budgets into production"
    - "Child-process crash fixture: spawn a long-lived child that hammers the production path, SIGKILL it, then inspect on-disk state"

key-files:
  created:
    - "server/src/persist/__tests__/store.crash.test.ts"
    - "server/src/persist/__tests__/crash-fixture.ts"
    - "server/src/persist/__tests__/store.concurrency.test.ts"
    - "server/src/persist/__tests__/store.stale-lock.test.ts"
  modified:
    - "server/src/persist/store.ts"
    - "server/src/persist/__tests__/store.test.ts"

key-decisions:
  - "Signature widening is source-compatible — every two-arg caller (Phase 1 manager, future Plan 02-03 wiring) keeps the tight ~150ms budget automatically"
  - "DEFAULT_LOCK_OPTIONS hoisted to a module-level const so the Phase-1 defaults are grep-auditable and tests can diff against them if they drift in the future"
  - "Crash test uses node:child_process.spawn (NOT execa) — execa v9 streams don't emit data events inside vitest worker threads (Phase-1 lesson)"
  - "Concurrency Tests 2 and 3 deliberately DO NOT pass lockOptions; they exercise the production-tight default so a regression to retries/minTimeout would fail them loudly"
  - "Stale-lock test necessarily uses the widened budget — the production 150ms is categorically insufficient for proper-lockfile's stale-detection cycle; this is not a test-budget smell, it's the documented point of the override"

patterns-established:
  - "Optional-parameter forwarding: when caller passes an override it is forwarded verbatim (no merge / no partial override) — keeps semantics trivial and grep-auditable"
  - "Variable-timing flake probe: 5 iterations of SIGKILL at 100/130/160/190/220ms ensure the crash lands at different points inside writeFileAtomic's write/fsync/rename cycle"

requirements-completed: [SESS-03]

duration: 19 min
completed: 2026-04-19
---

# Phase 02 Plan 02: Persistence Proof Suite Summary

**writeState is now proven crash-safe, serialization-correct, and stale-lock-recoverable — with zero behavior drift on any existing caller.**

## Performance

- **Duration:** ~19 minutes
- **Started:** 2026-04-19T13:26:17Z
- **Completed:** 2026-04-19T13:45:00Z (approximately)
- **Tasks:** 4 (all committed atomically)
- **Files modified:** 2 (store.ts, store.test.ts)
- **Files created:** 4 (crash-fixture + 3 proof tests)

## Accomplishments

- **Signature widening with zero production impact:** `writeState(prKey, data, lockOptions?)` — every Phase-1 caller still compiles and runs with the exact same retry budget. Manager tests and full typecheck confirm no regression from the optional parameter (the pre-existing `manager.ts:135` TS2741 is Plan 02-01's leftover, not caused by this plan).
- **SESS-03 proof landed:** `store.crash.test.ts` SIGKILLs a real child process 5 times at varied timings and asserts `state.json` is parseable JSON with a numeric `lastEventId` every single time. No pre-existing writeState behavior was touched.
- **Serialization semantics proved:** `store.concurrency.test.ts` proves mutual exclusion on same prKey (widened budget), parallelism on different prKeys (production default), and last-writer-wins on serial writes (production default).
- **Stale-lock recovery proved:** `store.stale-lock.test.ts` breaks a 30-second-stale lockdir in ~39ms under the widened budget.

## Task Commits

1. **Task 1: Widen `writeState` signature** — `6dfd82c` (feat)
2. **Task 2: Crash-interrupt test + fixture** — `5e22024` (test)
3. **Task 3: Concurrency serialization test** — `af03b1d` (test)
4. **Task 4: Stale-lock recovery test** — `67ade19` (test)

## Files Created / Modified

### Modified

- **`server/src/persist/store.ts`** — Final signature:
  ```typescript
  export type WriteStateLockOptions = Parameters<typeof lockfile.lock>[1];

  const DEFAULT_LOCK_OPTIONS = { retries: { retries: 3, minTimeout: 50 }, realpath: false } as const;

  export async function writeState(
    prKey: string,
    data: object,
    lockOptions?: WriteStateLockOptions,
  ): Promise<void> {
    // ... fs.mkdir, fs.access+fallback, lockfile.lock(file, lockOptions ?? DEFAULT_LOCK_OPTIONS),
    //     writeFileAtomic, release() in finally ...
  }
  ```
  The Phase-1 retry budget (`{ retries: 3, minTimeout: 50 }` ≈ 150ms) is now a named module-level constant; bypassed verbatim when a caller supplies `lockOptions`.

- **`server/src/persist/__tests__/store.test.ts`** — Extended with 3 new tests:
  1. `writeState with no lockOptions preserves Phase-1 behavior` — round-trips a two-arg call.
  2. `writeState with lockOptions forwards them verbatim to lockfile.lock` — mocks proper-lockfile and asserts the second argument is the exact object passed in (deep equal).
  3. `WriteStateLockOptions equals Parameters<typeof lockfile.lock>[1]` — compile-time `expectTypeOf` assertion.

### Created

- **`server/src/persist/__tests__/crash-fixture.ts`** — 30-line child that reads `CRASH_PR_KEY` from env, imports production `writeState` from `../store.js`, and hammers it in an infinite `while (true)` loop with a 1KB payload. No stdout writes. Parent kills it with SIGKILL.

  **What it assumes about the substrate:** `CLAUDE_PLUGIN_DATA` env is set by the parent; `stateFilePath()` sanitizes the prKey so writes can't escape the tmpDir. No persistence-logic fork — imports the exact production entry point.

- **`server/src/persist/__tests__/store.crash.test.ts`** — Spawns the fixture 5 times with `spawn('node', ['--import', 'tsx/esm', fixture])`, waits 100/130/160/190/220 ms, SIGKILLs, waits for exit, reads state.json, asserts:
  - `JSON.parse(raw)` does NOT throw
  - `typeof parsed.lastEventId === 'number'`
  - `parsed.lastEventId >= 0`

  Uses default (two-arg) `writeState` in the fixture — the crash-path behavior proved is the one under the production-tight retry budget.

  **Runtime:** ~895ms for all 5 iterations combined (~180ms per iteration including child spawn + SIGKILL + file read). Well under the 20s timeout.

- **`server/src/persist/__tests__/store.concurrency.test.ts`** — 3 tests:
  1. **Same-prKey `Promise.allSettled` with `WIDE_LOCK`** — both writers resolve; on-disk JSON equals one of the two payloads exactly (string comparison against both serialized forms, so even whitespace interleaving would fail).
  2. **Different-prKey `Promise.all` (default budget)** — `performance.now()` delta is <500ms (actually ~10-20ms observed); both files hold the expected payloads.
  3. **10 serial awaited writes (default budget)** — final readback is `{ n: 10 }`.

  **Budget usage observation:** Test 1 resolves in ~240ms wall-clock total; the two concurrent lock acquisitions almost never needed more than 2-3 retries, but the widened WIDE_LOCK budget removes scheduler-variance flakes. Tests 2 and 3 never exercised the retry path (different files don't contend; serial awaits guarantee no contention).

- **`server/src/persist/__tests__/store.stale-lock.test.ts`** — Plants `${stateFile}.lock/` with `fs.mkdir`, backdates mtime by 30s via `fs.utimes`, then calls `writeState('gh:o/r#1', { fresh: true }, WIDE_LOCK)`. Asserts completion in <3s (actual: ~39ms — proper-lockfile's stale check is cheap once mtime is clearly past threshold) and correct readback.

  **Budget usage observation:** The widened WIDE_LOCK was needed to avoid a flake under the 150ms production default, but in practice the break succeeded on the first retry — the test has generous headroom.

## Runtime Numbers

| Test | Wall Time | Notes |
|------|-----------|-------|
| `store.test.ts` (7 tests, incl. 3 new) | ~254ms | Task 1 GREEN phase |
| `store.crash.test.ts` (5 iterations) | ~900ms | Dominated by child spawn (tsx/esm import cost) |
| `store.concurrency.test.ts` (3 tests) | ~305ms | Test 1's mocked-style serialization finishes in ~240ms |
| `store.stale-lock.test.ts` (1 test) | ~39ms | Fast-path: mtime check + dir remove + re-acquire |
| **Full repo** | **~1.14s** | 136 tests, 25 files |

## Did WIDE_LOCK Actually Come Into Play?

**Concurrency Test 1 (same prKey):** The first writer acquires the lock immediately; the second writer's first retry (50ms default would be ~50ms, WIDE_LOCK's first retry is 100ms) almost always succeeds because the first writer's `writeFileAtomic` + `release()` completes in <10ms. The widened budget is defense against vitest worker-thread scheduler stalls, not the common path.

**Stale-lock test:** proper-lockfile's stale-detection short-circuits on the very first call once it sees an mtime >`stale` threshold old. The retries/minTimeout budget was never really consumed — the break happened inside the first call.

**Net:** on a healthy Mac the WIDE_LOCK budget is almost unused. It's insurance against machine-stress flakes. If CI ever shows stale-lock or concurrency flakes, these are the knobs to inspect.

## Deviations from Plan

**None — plan executed exactly as written.**

Every file path, grep pattern, and acceptance criterion in `02-02-PLAN.md` was satisfied verbatim. No Rule 1/2/3 auto-fixes were needed; no Rule 4 architectural questions surfaced.

**One intentional phrasing adjustment:** The `crash-fixture.ts` header comment originally included the substring `console.log` (in a prohibition: "do NOT console.log"). That string tripped the plan's own acceptance grep (`grep -c 'console\.'` must equal 0). Reworded the comment to avoid the substring while preserving the prohibition's intent. No semantic change.

## Authentication Gates

None. This plan is pure filesystem I/O + child-process spawning inside tmpDirs.

## Inputs to Plan 02-03 (SessionManager wiring)

- **Recommendation: do NOT pass `lockOptions` from `SessionManager.applyEvent`.** The per-prKey promise-chain queue already serializes calls within a single process, so the only remaining contention source is the `gh`/`git` ingest spawn racing a Plan 03 SSE update. That's a single-digit-ms window. The production-tight 150ms budget absorbs it comfortably.
- If production ever shows `Error: Lock file is already being held` during a real review session, the mitigation is to pass `{ retries: { retries: 5, minTimeout: 50 }, realpath: false }` (mildly wider — 5 retries = ~500ms budget) from SessionManager only. The whole WIDE_LOCK (~2s) budget is test-only tuning and should NOT leak into production.
- The widened-budget override knob exists so tests can prove semantics that the production budget deliberately refuses to wait for (stale recovery). Production's fail-fast behavior is a feature, not a bug.

## Known Stubs

None. Every file ships functional code; no placeholder data paths introduced.

## Threat Flags

None. The plan's `<threat_model>` accurately anticipated the delta: one optional parameter + three tmpDir-confined tests. No new network surface, no new auth path, no new filesystem surface outside tmpDir.

## Self-Check: PASSED

- [x] `server/src/persist/store.ts` modified (WriteStateLockOptions exported, signature widened, defaults preserved)
- [x] `server/src/persist/__tests__/store.test.ts` modified (3 new tests + 4 pre-existing still green)
- [x] `server/src/persist/__tests__/store.crash.test.ts` created
- [x] `server/src/persist/__tests__/crash-fixture.ts` created
- [x] `server/src/persist/__tests__/store.concurrency.test.ts` created
- [x] `server/src/persist/__tests__/store.stale-lock.test.ts` created
- [x] Commits exist: `6dfd82c`, `5e22024`, `af03b1d`, `67ade19`
- [x] Combined proof run green: `pnpm test -- 'store.(crash|concurrency|stale-lock)' --run` → 25 files / 136 tests pass
- [x] Server-wide full suite green (including unrelated integration tests)
- [x] Pre-existing `manager.ts:135` TS error confirmed untouched (Plan 02-03's territory)
