---
phase: 02-persistent-session-store-resume
plan: 01
subsystem: api
tags: [typescript, event-sourcing, eventemitter, discriminated-union, reducer, sse]

# Dependency graph
requires:
  - phase: 01-plugin-skeleton-secure-vertical-slice
    provides: ReviewSession shape, SnapshotMessage SSE envelope, logger stderr pattern, @shared/types workspace alias
provides:
  - SessionEvent discriminated union (three Phase-2 variants)
  - UpdateMessage SSE envelope for per-event broadcasts
  - Extended ReviewSession with staleDiff/viewBothMode/pendingReset/lastEventId
  - Pure applyEvent reducer with exhaustive switch + never-guard
  - Typed SessionBus EventEmitter wrapper
affects: [02-02 persistence hardening, 02-03 SessionManager applyEvent + SSE update push, 02-04 web StaleDiffModal + store.onUpdate, phase-04 checklist events, phase-05 comment events, phase-06 verdict events]

# Tech tracking
tech-stack:
  added: []  # No new packages — uses node:events built-in
  patterns:
    - "Event-sourced discriminated union in shared/types.ts (co-located with domain types, not a separate events.ts)"
    - "Pure reducer pattern with const _never: never exhaustiveness guard"
    - "Typed EventEmitter wrapper with listener error isolation via safeWrap + WeakMap"

key-files:
  created:
    - server/src/session/reducer.ts
    - server/src/session/__tests__/reducer.test.ts
    - server/src/session/bus.ts
    - server/src/session/__tests__/bus.test.ts
  modified:
    - shared/types.ts

key-decisions:
  - "SessionEvent lives in shared/types.ts (not a separate server/src/session/events.ts) — co-located with ReviewSession since both are part of the shared API surface between server and web"
  - "Reducer MUST NOT touch lastEventId — that invariant is the SessionManager's responsibility per 02-RESEARCH Pattern 2, enforced by grep check (0 occurrences of lastEventId in reducer.ts)"
  - "SessionBus catches listener throws via safeWrap + logs via logger.warn to stderr; one bad listener cannot break broadcast to others (threat T-2-01-03 mitigation)"

patterns-established:
  - "Persist-then-broadcast contract prepared (bus is transport-agnostic; SessionManager in Plan 02-03 will persist before emitting)"
  - "Exhaustive-switch never-guard: adding a SessionEvent variant without handling it is a TypeScript compile error"
  - "WeakMap-stashed wrapped listeners enable off() semantics while still wrapping user listeners for error isolation"

requirements-completed: [SESS-01, SESS-02]

# Metrics
duration: 4min
completed: 2026-04-19
---

# Phase 02 Plan 01: Reducer + Bus Foundation Summary

**Event-sourced reducer contract layer: SessionEvent union, pure applyEvent reducer with exhaustive never-guard, and typed SessionBus EventEmitter wrapper ready for Plans 02/03/04 to consume.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-19T13:18:17Z
- **Completed:** 2026-04-19T13:22:19Z
- **Tasks:** 3
- **Files modified:** 4 (1 modified, 3 created)

## Accomplishments

- `shared/types.ts` extended with `SessionEvent` discriminated union (three Phase-2 variants), `UpdateMessage` SSE envelope, and four new `ReviewSession` fields (`staleDiff?`, `viewBothMode?`, `pendingReset?`, required `lastEventId: number`).
- `server/src/session/reducer.ts` ships a pure `applyEvent(session, event) -> session` function with exhaustive `switch` + `const _never: never` guard. Reducer does NOT touch `lastEventId` — that's the SessionManager's responsibility.
- `server/src/session/bus.ts` ships `SessionBus` — a typed wrapper over Node's built-in `EventEmitter` on the single `session:updated` channel. Listener throws are caught via `safeWrap`, logged via `logger.warn`, and do not propagate to other listeners.
- 6 reducer tests + 5 bus tests (11 new unit tests), all green in ~20ms total.

## Final Type Shapes

**ReviewSession additions** (appended to existing 7-field interface in `shared/types.ts`):

```typescript
  // Phase 2 additions
  staleDiff?: { storedSha: string; currentSha: string };
  viewBothMode?: boolean;
  pendingReset?: boolean;
  lastEventId: number;   // monotonic per-session counter; starts at 0 on first persist
```

**SessionEvent discriminated union**:

```typescript
export type SessionEvent =
  | {
      type: 'session.adoptNewDiff';
      newDiff: DiffModel;
      newHeadSha: string;
      newShikiTokens: Record<string, ShikiFileTokens>;
    }
  | { type: 'session.reset' }
  | { type: 'session.viewBoth' };
```

**SessionBus public API** (`server/src/session/bus.ts`):

```typescript
export interface SessionUpdatedPayload {
  id: string; // prKey
  event: SessionEvent;
  state: ReviewSession;
}

export class SessionBus {
  on(event: 'session:updated', listener: (p: SessionUpdatedPayload) => void): void;
  off(event: 'session:updated', listener: (p: SessionUpdatedPayload) => void): void;
  emit(event: 'session:updated', payload: SessionUpdatedPayload): void;
}
```

## Task Commits

Each task was committed atomically. TDD tasks (2 and 3) produced RED + GREEN commit pairs:

1. **Task 1: Extend shared/types.ts** — `7b54cfd` (feat)
2. **Task 2: Pure applyEvent reducer**
   - RED: `60a7dc5` (test — 6 failing reducer tests)
   - GREEN: `46bcbfa` (feat — reducer implementation)
3. **Task 3: SessionBus EventEmitter wrapper**
   - RED: `8ef7345` (test — 5 failing bus tests)
   - GREEN: `6ef0d7f` (feat — SessionBus implementation)

## Files Created/Modified

- `shared/types.ts` (M) — Added 4 `ReviewSession` fields, `SessionEvent` union, `UpdateMessage` envelope. No existing types altered.
- `server/src/session/reducer.ts` (A) — 35 lines. Pure `applyEvent` reducer with exhaustive switch + never-guard.
- `server/src/session/__tests__/reducer.test.ts` (A) — 6 vitest cases covering all three event types + unknown-throws + immutability + lastEventId-preservation invariant.
- `server/src/session/bus.ts` (A) — 51 lines. Typed `SessionBus` over `node:events.EventEmitter` with `safeWrap`/WeakMap for listener error isolation.
- `server/src/session/__tests__/bus.test.ts` (A) — 5 vitest cases: register+emit, payload shape, off, registration-order broadcast, listener-throw isolation + logger.warn.

## Test Counts

- Reducer unit tests: **6 passing** (4ms total)
- Bus unit tests: **5 passing** (16ms total)
- Full server suite: **128 passing** / 22 files / ~1.1s (was 117 passing / 20 files before this plan — 11 new tests land clean with no regressions)

## Decisions Made

- **SessionEvent co-located in shared/types.ts** — Plan contemplated `server/src/session/events.ts` as an alternative, but research allows co-location and the event type is part of the server↔web SSE contract surface (via `UpdateMessage`), so shared/types.ts is the natural home. Avoids a second import site.
- **Reducer explicitly does NOT touch `lastEventId`** — enforced by grep check (`grep -c "lastEventId" reducer.ts` returns 0). Even the doc comment avoids the literal string to make the grep guarantee robust against future well-intentioned comment drift. Pattern 2 in the research explicitly assigns `lastEventId` to the SessionManager orchestrator.
- **SessionBus uses WeakMap to preserve `off()` semantics** — wrapping every listener for error isolation means Node's EventEmitter.off() can't find the user-provided reference. A WeakMap<Listener, wrappedListener> bridge fixes this; the test suite verifies `off()` actually removes listeners.

## Deviations from Plan

None — plan executed exactly as written.

The plan explicitly flagged one expected pre-existing compile error that this plan would surface: `server/src/session/manager.ts(135,11): Property 'lastEventId' is missing in type ... but required in type 'ReviewSession'`. This is documented as Plan 02-03's responsibility.

## Expected Downstream Issues for Plan 02-03

**`server/src/session/manager.ts(135,11)`** surfaces a required-field compile error:

```
error TS2741: Property 'lastEventId' is missing in type
'{ prKey: string; pr: PullRequestMeta; diff: DiffModel; shikiTokens: ...;
   createdAt: string; headSha: string; error: null; }'
but required in type 'ReviewSession'.
```

Plan 02-03 must initialize `lastEventId: 0` on the fresh-ingest session object literal in `startReview` (line 135 of `manager.ts`), AND must handle the backward-compat path for legacy Phase-1 `state.json` files that have no `lastEventId` field — per 02-RESEARCH Runtime State Inventory: "When a future plan reads these, it must tolerate the missing field and initialize `lastEventId = 0`".

No other compile errors surfaced in either the `server/` or `web/` workspace.

## Threat Flags

None — this plan ships no new runtime surface (no new HTTP routes, no new MCP tools). The reducer and bus are internal server modules that Plan 02-03's SessionManager will invoke. Zod validation of `SessionEvent` payloads at the HTTP boundary is Plan 02-03's responsibility (T-2-01-01 mitigation; documented in the threat register).

## Issues Encountered

- Initial reducer implementation included doc comments mentioning `Date.now()` and `lastEventId` as invariants — acceptance criteria required `grep -c` of these strings to return 0 (strict). Rewrote comments to use "timestamp reads" and "monotonic event counter" phrasing instead. This preserved the invariant documentation while meeting the mechanical grep gate. This was a single iteration and didn't affect correctness.

## Next Plan Readiness

- Plan 02-02 (persistence hardening) is unblocked: no type changes required there.
- Plan 02-03 (SessionManager applyEvent + SSE update push) is unblocked: can import `applyEvent` from `../reducer.js`, `SessionBus` from `../bus.js`, and `SessionEvent`/`UpdateMessage` from `@shared/types`. Must fix the surfaced `lastEventId` compile error in `manager.ts` line 135.
- Plan 02-04 (web StaleDiffModal + store.onUpdate) is unblocked: can import `UpdateMessage` and the extended `ReviewSession.staleDiff` from `@shared/types`.

## Self-Check: PASSED

All 5 created/modified files exist on disk. All 5 task commits (7b54cfd, 60a7dc5, 46bcbfa, 8ef7345, 6ef0d7f) are present in `git log`.

---

*Phase: 02-persistent-session-store-resume*
*Completed: 2026-04-19*
