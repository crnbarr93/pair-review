---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
stopped_at: Completed 02-04-PLAN.md
last_updated: "2026-04-19T14:03:01.334Z"
last_activity: 2026-04-19
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 11
  completed_plans: 11
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-16)

**Core value:** A pair-review workflow that produces a posted GitHub review of real reviewer quality, faster and with better coverage than reviewing alone or chatting with an LLM in a generic UI.
**Current focus:** Phase 02 — persistent-session-store-resume

## Current Position

Phase: 02 (persistent-session-store-resume) — EXECUTING
Plan: 4 of 4
Status: Phase complete — ready for verification
Last activity: 2026-04-19

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 7
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| — | — | — | — |
| 01 | 7 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P07 | 12 minutes | 1 tasks | 5 files |
| Phase 02 P01 | 4 minutes | 3 tasks | 5 files |
| Phase 02 P02 | 19 min | 4 tasks | 6 files |
| Phase 02 P03 | 8 min | 4 tasks | 11 files |
| Phase 02 P04 | 7 min | 4 tasks | 10 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Project scope: Claude Code plugin + local web UI, GitHub + local branches only, single user on macOS (see PROJECT.md Key Decisions).
- Phase 1 must resolve Open Decisions 2 (transport: WebSocket vs SSE + HTTP POST) and 3 (persistence: `better-sqlite3` vs atomic JSON) during planning.
- Phase 3 must resolve Open Decision 1 (diff viewer library) during planning via a spike on a real fixture PR.
- [Phase 01]: paraphrase-split-first: Split description paragraphs on newlines before stripping markdown to preserve paragraph boundaries
- [Phase 01]: spawn-not-execa-in-vitest: Use node:child_process.spawn for long-lived server subprocess in e2e tests (execa v9 streams don't emit data events in vitest worker threads)
- [Phase 01]: zod-v4-union: Zod v4 rejects duplicate discriminator values — use nested z.union for github url/number variants
- [Phase 02]: SessionEvent co-located in shared/types.ts (not server/src/session/events.ts) — event type is part of the server↔web SSE contract via UpdateMessage
- [Phase 02]: Reducer must NOT touch lastEventId — that invariant belongs to SessionManager.applyEvent (Plan 02-03); grep-enforced to 0 occurrences in reducer.ts
- [Phase 02]: SessionBus uses WeakMap to preserve off() semantics while wrapping listeners with safeWrap for error isolation
- [Phase 02]: writeState signature widened with optional lockOptions?: WriteStateLockOptions — production defaults identical to Phase 1, tests pass widened retry budget only where stale-detection requires it
- [Phase 02]: Crash-safety proven via spawn('node', ['--import', 'tsx/esm', crash-fixture.ts]) + SIGKILL — reuses Phase-1 spawn-not-execa-in-vitest pattern
- [Phase 02]: WIDE_LOCK (retries: 20, minTimeout: 100) is a test-only override — do NOT pass from SessionManager.applyEvent; production fail-fast 150ms budget is a feature
- [Phase 02]: Plan 03: applyEvent owns lastEventId increment; reducer never touches it (grep-enforced)
- [Phase 02]: Plan 03: per-prKey Promise-chain queue serializes applyEvent calls (closes Pitfall D)
- [Phase 02]: Plan 03: SSE subscribe-before-snapshot + buffer-and-flush closes Pitfall E; Phase 2 always re-sends full snapshot on reconnect (Last-Event-ID read but ignored)
- [Phase 02]: Plan 03: fetchCurrentHeadSha fails closed — errors surface as session.error (variant: 'fetch-failed', message prefix 'head-sha-check-failed'), NOT a false-positive staleDiff
- [Phase 02]: Plan 03: choose-resume handler coerces client-supplied source to SourceArg rather than reconstructing from session.pr — server validates shape via zod .strict() + discriminatedUnion
- [Phase 02]: Plan 04: Kept 'Refresh to current PR' label for Phase 2 per Assumption A7; relabel to 'Rebase drafts where possible' deferred to Phase 5
- [Phase 02]: Plan 04: AppState redefined locally in web/src/store.ts as the authoritative web shape; shared/types AppState preserved for backward compat
- [Phase 02]: Plan 04: Modal auto-unmount via SSE round-trip — click button → chooseResume POST → server applyEvent → SSE snapshot/update → store clears staleDiff → modal's early-return fires
- [Phase 02]: Plan 04: Token-capture ordering gate in main.tsx — setReviewToken + actions.setSource happen BEFORE history.replaceState (T-2-04-03 mitigation), enforced by a main-bootstrap call-order test

### Pending Todos

None yet.

### Blockers/Concerns

From research — items to watch but not blocking Phase 1 start:

- **Pitfall 1** (GitHub `position` vs `line`/`side` confusion) — addressed in Phase 6, but the internal `Anchor` type should be designed with `line`+`side` from the start of Phase 5.
- **Pitfall 2** (LLM hallucinated line numbers) — opaque-ID MCP schema must ship in Phase 5; do not let Phase 4's `file:line` refs in self-review become a freeform-string shortcut that Phase 5 has to undo.
- **Pitfall 6** (DNS-rebinding / CSRF) — must ship day-one in Phase 1; no "hardening pass later".

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Checklist | `CHECK-V2-01`: repo-level `.review/checklist.md` override | Deferred to v2 | 2026-04-16 (requirements phase) |
| Diff UI | `DIFF-V2-01..04`: multi-line ranges, in-diff search, suggestion blocks, incremental review | Deferred to v2 | 2026-04-16 (requirements phase) |
| Context | `CTX-V2-01..03`: LSP/tree-sitter, previous-review memory, CODEOWNERS | Deferred to v2 | 2026-04-16 (requirements phase) |
| Integration | `INT-V2-01..02`: GitHub "Viewed" sync, Zed via shared MCP | Deferred to v2 | 2026-04-16 (requirements phase) |
| Plugin UX | `PLUG-V2-01`: authenticated user display | Deferred to v2 | 2026-04-16 (requirements phase) |

## Session Continuity

Last session: 2026-04-19T14:02:48.913Z
Stopped at: Completed 02-04-PLAN.md
Resume file: None
