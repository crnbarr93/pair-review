---
phase: 02-persistent-session-store-resume
plan: 03
subsystem: session-integration
tags: [reducer-wiring, persist-then-broadcast, per-prkey-queue, sse-fan-out, subscribe-before-snapshot, stale-diff, resume-route]

requires:
  - phase: 02-persistent-session-store-resume
    plan: 01
    provides: "SessionEvent union + UpdateMessage + ReviewSession fields (staleDiff, viewBothMode, pendingReset, lastEventId), pure applyEvent reducer, SessionBus with safeWrap listener isolation"
  - phase: 02-persistent-session-store-resume
    plan: 02
    provides: "writeState proven crash-safe + serialization-correct; optional lockOptions parameter for tests only — production callers use the 2-arg default"
provides:
  - "SessionManager.applyEvent(id, event) — THE ONE FUNNEL for Phase 2+ mutations. Persist-then-broadcast order: writeState → sessions.set → bus.emit. Per-prKey Promise-chain queue serializes concurrent calls (closes Pitfall D). Monotonic lastEventId increment owned exclusively by the manager."
  - "SessionManager.startReview disk-load path: in-memory miss → readState → legacy-file migration (absent lastEventId → 0) → fetchCurrentHeadSha (fail-closed per Pitfall F) → set staleDiff iff divergent → launchBrowser. Ingest is NOT re-run on the resume path."
  - "SessionManager.resetSession(prKey, source) — unlink state.json (ENOENT tolerated) → clear in-memory Map + launched marker → re-run startReview (falls through to full ingest)."
  - "fetchCurrentHeadSha exported from both ingest adapters. GitHub: `gh pr view <id> --json headRefOid`. Local: `git rev-parse --verify <headRef>` with cwd. Both throw on error (fail-closed)."
  - "GET /api/events — Pitfall E closed. Subscribe to bus BEFORE sending snapshot; any update landing in the gap is buffered and flushed after snapshot (filtered by lastEventId > snapshot.lastEventId). Monotonic id: on every SSE frame with session state. Last-Event-ID header read but Phase 2 always ships full snapshot on (re)connect. Keep-alive 15s ping preserved."
  - "POST /api/session/choose-resume — zod .strict() validation; three-branch switch (adopt/reset/viewBoth); protected by existing tokenValidate double-submit middleware; mounted in buildHttpApp between mountSessionAdopt and mountEvents."
  - "Resolved pre-existing TS error at manager.ts:135 (TS2741 missing lastEventId) — Phase 1-shape new-session construction now includes lastEventId: 0. Full `pnpm build` green."
affects:
  - "Plan 02-04 (web UI) — consumes event:update and Last-Event-ID reconnect semantics; POSTs to /api/session/choose-resume with X-Review-Token header; reads staleDiff + error fields from snapshot payload."
  - "All future mutation pathways (MCP tools in Phase 4, comment drafts in Phase 5, review submission in Phase 6) — MUST flow through manager.applyEvent rather than writing to this.sessions directly. The reducer is the extension point."

tech-stack:
  added: []
  patterns:
    - "Persist-then-broadcast: disk is source of truth; memory update and broadcast follow only after writeState resolves. Post-crash memory is empty and rebuilt from readState; zero drift."
    - "Per-prKey Promise-chain serialization queue — 12 lines, no external library. `queues.get(id) ?? Promise.resolve()` chained via `.then(async () => {...})`, stored back with `.catch(() => undefined)` so rejections don't poison subsequent callers."
    - "Subscribe-before-snapshot SSE pattern: register listener with buffer-push; write snapshot; drain buffer (filter lastEventId <= snapshot); swap listener to write-through."
    - "Fail-closed head-SHA check: fetchCurrentHeadSha errors surface as session.error, NOT as a false-positive staleDiff. User sees an error state, not a bogus resume modal."
    - "Legacy forward-migration in readState consumer: `typeof persisted.lastEventId === 'number' ? persisted.lastEventId : 0` — Phase-1 state.json files load cleanly."

key-files:
  created:
    - "server/src/http/routes/session-resume.ts"
    - "server/src/http/__tests__/session-resume.test.ts"
    - "server/src/session/__tests__/manager.resume.test.ts"
  modified:
    - "server/src/ingest/github.ts"
    - "server/src/ingest/local.ts"
    - "server/src/ingest/__tests__/github.test.ts"
    - "server/src/ingest/__tests__/local.test.ts"
    - "server/src/session/manager.ts"
    - "server/src/session/__tests__/manager.test.ts"
    - "server/src/http/routes/events.ts"
    - "server/src/http/__tests__/events.test.ts"
    - "server/src/http/server.ts"

key-decisions:
  - "applyEvent owns lastEventId increment, reducer does NOT — grep-enforced invariant from Plan 01 honored; reducer.ts has 0 occurrences of lastEventId mutation."
  - "Per-prKey queue keyed by prKey (the review identity), not by session object — correct because SessionManager.sessions is also keyed by prKey; the two maps stay in lockstep."
  - "Phase 2 ALWAYS re-sends full snapshot on reconnect regardless of Last-Event-ID. The header is read (void) so Phase 3+ has an obvious hook; Phase 2's replay log is a v2 feature per research."
  - "fetchCurrentHeadSha errors map to the EXISTING error variant 'fetch-failed' with a message prefix 'head-sha-check-failed: …'. No new error variant introduced — grep-auditable via the prefix string."
  - "session-resume route duplicates the ingest+highlight pipeline for the adopt branch rather than calling a shared helper. Plan 04's StaleDiffModal triggers this branch at most once per resume; extraction is a v2 refactor once call-sites multiply."
  - "The zod schema accepts `source` in the request body rather than reading the manager's session.pr to reconstruct it. Safer (server validates shape) and avoids the client-server round-trip that would otherwise need another GET endpoint."

patterns-established:
  - "Queue-based serialization for mutation funnel: `queues.get(id) ?? Promise.resolve()` → `.then(async body)` → `queues.set(id, chain.catch(() => undefined))`. Reuse wherever per-resource mutual exclusion is needed."
  - "Two-stage SSE listener swap: `bufferListener` during the subscribe-to-snapshot window, `liveListener` afterward. Both are unregistered via separate `stream.onAbort` handlers so early client disconnect during either stage still cleans up."
  - "SourceArg coercion from zod schema: `source.kind === 'github'` branches into `{ url }` or `{ number }` variants to produce the SourceArg union. The zod discriminated union allows both variants to coexist with `optional()` fields."

requirements-completed: [SESS-01, SESS-02]

duration: 8 min
completed: 2026-04-19
---

# Phase 02 Plan 03: Reducer + Bus Integration Tier Summary

**The contracts from Plan 01 and the persistence proofs from Plan 02 become live behavior: every session mutation now flows through `applyEvent` → disk → memory → bus → SSE client, in that order, serialized per prKey.**

## Performance

- **Duration:** ~8 minutes
- **Started:** 2026-04-19T13:39:57Z
- **Tasks:** 4 (all committed atomically)
- **Files modified:** 8
- **Files created:** 3

## Accomplishments

- **THE ONE FUNNEL shipped:** `SessionManager.applyEvent(id, event)` is the single entry point for all Phase 2+ mutations. Tests prove persist-then-broadcast ordering, monotonic lastEventId, per-prKey serialization, and rejection on unknown prKey.
- **Resume-from-disk works end-to-end:** `startReview` now detects an in-memory miss, reads persisted state, migrates legacy Phase-1 files (lastEventId=0), checks head SHA fail-closed, and populates `staleDiff` iff divergent — without re-running ingest.
- **SSE subscribe-before-snapshot gap closed:** `events.ts` registers the bus listener FIRST, buffers updates that land in the subscribe-to-snapshot window, then flushes them (filtered against the snapshot's lastEventId) before going live. Phase-2 SSE carries `id: String(state.lastEventId)` on every frame.
- **POST /api/session/choose-resume shipped** with zod `.strict()` validation, three-branch dispatch (adopt/reset/viewBoth), and the existing double-submit token middleware covering auth.
- **Legacy TS error from Plan 01 resolved:** the pre-existing `manager.ts:135` TS2741 — intentionally left by Plan 01 as Plan 02-03's handoff — is fixed by adding `lastEventId: 0` to the new-session construction. Full `pnpm build` is green.

## Task Commits

1. **Task 1: fetchCurrentHeadSha on both ingest adapters** — `12f02e9` (feat)
2. **Task 2: SessionManager applyEvent + disk-load + resetSession + bus** — `3dafd52` (feat)
3. **Task 3: SSE update fan-out + subscribe-before-snapshot** — `6c9e0f8` (feat)
4. **Task 4: POST /api/session/choose-resume** — `43c6db4` (feat)

## Final Shape of `SessionManager.applyEvent`

```typescript
async applyEvent(id: string, event: SessionEvent): Promise<ReviewSession> {
  const prev = this.queues.get(id) ?? Promise.resolve();
  const run = prev.then(async () => {
    const current = this.sessions.get(id);
    if (!current) throw new Error(`No session for prKey: ${id}`);
    const reduced = reduce(current, event);
    const next: ReviewSession = { ...reduced, lastEventId: current.lastEventId + 1 };
    await writeState(id, next); // disk first
    this.sessions.set(id, next); // memory second
    this.bus.emit('session:updated', { id, event, state: next }); // broadcast last
    return next;
  });
  this.queues.set(id, run.catch(() => undefined));
  return run;
}
```

**Serialization queue design:** Each prKey gets its own Promise chain stored in `queues: Map<string, Promise<unknown>>`. A new call reads the chain tail (or `Promise.resolve()` if absent), attaches its body via `.then(async)`, and writes the new chain tail back. Rejections are caught on the stored chain only (`run.catch(() => undefined)`) so one caller's error doesn't block the next caller. The returned promise is the ORIGINAL `run`, not the caught version, so callers still see their own errors.

**Why the queue proved necessary** despite `proper-lockfile` already serializing on-disk writes: within a single Node process, two callers can both read `this.sessions.get(id)` before either's `writeState` resolves. The second writer's reducer input is then pre-first-event, and whichever writes last wins at the in-memory level — lost update. proper-lockfile serializes the *file* but not the *reducer input read*. The queue closes that loop.

## Disk-Load Resume Flow (`startReview` path 2)

1. **In-memory cache hit** — return existing session (D-21 idempotency; unchanged from Phase 1).
2. **`readState(prKey)`** — if null, fall through to path 3 (full ingest).
3. **Legacy migration** — `typeof persisted.lastEventId === 'number' ? persisted.lastEventId : 0`. Phase-1 state.json files have no `lastEventId`; they become `lastEventId: 0`.
4. **`fetchCurrentHeadSha(source)`** — dispatches to `ingest/github.ts` or `ingest/local.ts` based on source kind.
5. **Stale detection**: if current SHA differs from migrated SHA, set `staleDiff = { storedSha, currentSha }`. Otherwise `staleDiff` stays undefined.
6. **Fail-closed branch**: if step 4 throws, set `session.error = { variant: 'fetch-failed', message: 'head-sha-check-failed: ${err.message}' }` and leave `staleDiff` undefined. User sees an error state, not a bogus stale-diff modal.
7. **`sessions.set(prKey, session)`** — populate in-memory.
8. **`launchBrowser`** — fire iff not already launched for this prKey in this process.
9. **Return the restored session.** Ingest is NOT re-run.

## Pitfall E Closure: Was the Race Theoretical or Observable?

**Theoretical — then made observable by the test.** The Phase 1 events.ts path was `streamSSE → write snapshot → (never subscribed)`, so no race existed yet because no fan-out existed. Plan 02-03 introduced bus emission via `applyEvent`, creating the window: between "subscribe" and "write snapshot" a concurrent `applyEvent` could emit and the stream would miss it.

The `pitfall-E-1` test reproduces this by overriding `bus.on` to schedule a `queueMicrotask(() => bus.emit(...))` immediately after subscription. The test asserts the update frame arrives AFTER the snapshot frame (buffer-drain order). With the naive subscribe-after-snapshot implementation, the update would have been lost entirely; with the subscribe-before-snapshot + buffer pattern, it is buffered and replayed.

**The race is now covered by a test that would fail any regression back to the naive pattern.**

## Exact Shape of the POST `/api/session/choose-resume` zod Schema

```typescript
const ChooseResumeInput = z
  .object({
    prKey: z.string().min(1),
    choice: z.enum(['adopt', 'reset', 'viewBoth']),
    source: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('github'),
        url: z.string().min(1).optional(),
        number: z.number().int().positive().optional(),
      }),
      z.object({
        kind: z.literal('local'),
        base: z.string().min(1),
        head: z.string().min(1),
      }),
    ]),
  })
  .strict();
```

- `.strict()` rejects extra fields with a 400 (tested via `validation-3`).
- `z.enum(['adopt', 'reset', 'viewBoth'])` caps choice to the SESS-02 triad.
- `z.discriminatedUnion('kind', ...)` narrows source so the downstream SourceArg coercion is total.
- GitHub variant: one of `url` or `number` must be present — enforced by a runtime check inside the handler (`source.url || typeof source.number === 'number'`), since zod allows both to be `.optional()` simultaneously.

## Interaction with proper-lockfile (Plan 02-02 observation)

The per-prKey in-memory queue makes proper-lockfile retries essentially unreachable in production. Within a single process, the queue guarantees serial `writeState` calls per prKey — no contention inside the Node process at all. proper-lockfile's retry budget (`retries: 3, minTimeout: 50`, ~150ms) only comes into play if a DIFFERENT process (e.g., a second plugin instance) is writing the same state.json concurrently.

Per Plan 02-02's SUMMARY guidance ("do NOT pass lockOptions from SessionManager.applyEvent"), Plan 02-03 uses the default 2-arg `writeState(prKey, next)` call exclusively. The widened WIDE_LOCK budget remains test-only.

## Test Counts

| Scope | Before Plan 03 | After Plan 03 | Delta |
|-------|----------------|----------------|-------|
| `ingest/__tests__/github.test.ts` | 5 | 8 | +3 |
| `ingest/__tests__/local.test.ts` | 5 | 7 | +2 |
| `session/__tests__/manager.test.ts` | 9 | 15 | +6 (1 new + 5 applyEvent) |
| `session/__tests__/manager.resume.test.ts` | 0 | 6 | +6 (new file) |
| `http/__tests__/events.test.ts` | 5 | 9 | +4 |
| `http/__tests__/session-resume.test.ts` | 0 | 8 | +8 (new file) |
| **Server total** | **137** | **166** | **+29** |

Full server suite: 27 test files, 166 tests, all green in ~1.2s.

## Phase 4/5/6 Hooks Deliberately Left Open

- **`session-resume.ts` adopt branch**: currently inlines ingest + shiki. When Phase 5 (comment drafts) or Phase 6 (review submission) need to re-ingest mid-session, extract to a shared `reingest(src): Promise<{ diffText, newHeadSha }>` helper. Not worth the abstraction now (single call site).
- **SSE Last-Event-ID**: `c.req.header('Last-Event-ID')` is read but discarded. Phase 3+ selective-replay lands here — the reader is already in place so implementing replay is a patch to the snapshot branch, not a structural change.
- **Reducer `session.reset` behavior**: Phase 2's reducer sets `pendingReset: true` on the session, but the HTTP handler bypasses that flag by calling `resetSession` directly. The flag is reserved for Phase 5+ when drafts need a "confirm reset" modal before the destructive action. Today: irreversible-action confirmation is the user clicking "Reset" in the modal, matching the threat-model T-2-03-07 "accept" disposition.
- **SessionBus listener error path**: `safeWrap` logs listener throws to stderr and continues. Phase 4 MCP tools will subscribe; if one throws, the others still see updates. This is load-bearing — do not remove.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing TS2741 at manager.ts:135**
- **Found during:** Task 2 (expected handoff from Plan 02-01)
- **Issue:** `ReviewSession` type requires `lastEventId: number` (Plan 01 widened the type), but the Phase-1 new-session construction didn't set it. `pnpm build` failed with TS2741.
- **Fix:** Added `lastEventId: 0` to the new-session object literal in `startReview`.
- **Files modified:** `server/src/session/manager.ts`
- **Commit:** `3dafd52` (folded into Task 2's commit — this fix was part of the plan's intent, not an unplanned deviation)

**2. [Rule 3 - Blocking] Test scoped prKey to the derived prKey rather than the literal 'gh:o/r#1'**
- **Found during:** Task 2 GREEN run
- **Issue:** The test's mocked `inferRepoFromCwd` returns `{ owner: 'test-owner', name: 'test-repo' }`, so `derivePrKey({ kind: 'github', number: 1 })` yields `gh:test-owner/test-repo#1` — not the `gh:o/r#1` the test originally asserted against. `manager.get('gh:o/r#1')` returned undefined in the reset-1 test, causing a spurious `toBe(before)` failure.
- **Fix:** Introduced a `DERIVED_PR_KEY` constant and used it consistently throughout the disk-load test suite. `makePersistedSession(DERIVED_PR_KEY, ...)` now matches what `derivePrKey` actually produces.
- **Files modified:** `server/src/session/__tests__/manager.resume.test.ts`
- **Commit:** `3dafd52`

No Rule 4 architectural questions surfaced.

## Authentication Gates

None. No gh/git/octokit calls made during this plan's tests (all mocked). The new POST route sits behind the existing token-validate middleware from Phase 1 — no new auth surface.

## Inputs to Plan 02-04 (Web UI)

- **SSE consumer should listen for BOTH `event: snapshot` and `event: update`.** Snapshot carries `SnapshotMessage`; update carries `UpdateMessage { type: 'update', event: SessionEvent, state: ReviewSession }`. Update payload's `state` is the FULL new session; web store replaces wholesale, no delta merging needed.
- **POST /api/session/choose-resume contract** — three string choices: `'adopt' | 'reset' | 'viewBoth'`. Must include full `source` object back in the body (the server doesn't reconstruct it from prKey).
- **staleDiff + error fields** arrive on the snapshot payload directly. Web UI shows the modal iff `session.staleDiff` is set AND `session.error` is null. If `session.error.message` starts with `head-sha-check-failed:`, show a retry error state instead.
- **Last-Event-ID handling**: EventSource reconnects will produce a full snapshot; web UI can treat every snapshot as a full replacement. No delta-replay handling needed in Phase 2.

## Known Stubs

None. Every handler branch ships functional code. The `resetSession` HTTP path, once triggered, genuinely deletes state.json and re-runs ingest. The `viewBoth` path sets `session.viewBothMode = true` via the reducer; Plan 04's UI renders "show both diffs" off that flag (consumer responsibility).

## Threat Flags

No new security-relevant surface beyond what the plan's `<threat_model>` anticipated. The three-branch POST route is a known T-2-03-01 mitigation surface; the zod `.strict()` schema and token middleware close it per the threat register. No new filesystem paths outside `stateFilePath(prKey)`; no new external subprocess invocations.

## Self-Check: PASSED

- [x] `server/src/ingest/github.ts` — `fetchCurrentHeadSha` export present
- [x] `server/src/ingest/local.ts` — `fetchCurrentHeadSha` export present
- [x] `server/src/session/manager.ts` — applyEvent + resetSession + public bus + disk-load path + lastEventId:0 in new-session
- [x] `server/src/http/routes/events.ts` — subscribe-before-snapshot + buffer + id: + Last-Event-ID read
- [x] `server/src/http/routes/session-resume.ts` — created with zod .strict() + three-branch switch
- [x] `server/src/http/server.ts` — mountSessionResume imported + called
- [x] Commits exist: `12f02e9`, `3dafd52`, `6c9e0f8`, `43c6db4`
- [x] Full server suite green: 166/166
- [x] `pnpm build` clean (TS2741 resolved)
- [x] Pre-existing Phase-1 tests still pass (regression check via full suite run)
