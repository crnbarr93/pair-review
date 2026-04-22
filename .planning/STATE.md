---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 5 UI-SPEC approved
last_updated: "2026-04-22T10:27:55.257Z"
last_activity: 2026-04-22 -- Phase --phase execution started
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 31
  completed_plans: 30
  percent: 97
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-21)

**Core value:** A pair-review workflow that produces a posted GitHub review of real reviewer quality, faster and with better coverage than reviewing alone or chatting with an LLM in a generic UI.
**Current focus:** Phase --phase — 05

## Current Position

Phase: --phase (05) — EXECUTING
Plan: 1 of --name
Status: Executing Phase --phase
Last activity: 2026-04-22 -- Phase --phase execution started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 25
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| — | — | — | — |
| 01 | 7 | - | - |
| 02 | 4 | - | - |
| 03 | 6 | - | - |
| 04 | 8 | - | - |

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
- [Phase 04]: Default verdict request_changes (D-05) — adversarial framing forces LLM to argue down from "Request changes"
- [Phase 04]: Tool descriptions as sole prompt surface (D-20) — no system prompt injection; prompt engineering visible in tool registration code
- [Phase 04]: FindingsSidebar auto-opens on first selfReview.set (D-12); stays open on regenerate
- [Phase 04]: Generated-file filtering at list_files enumeration level only (D-16); get_hunk does not filter
- [Phase 04]: Nit cap (≤3) enforced handler-side — MCP SDK drops zod .refine() refinements from Input.shape
- [Phase 04]: lineId resolution maps opaque anchors to (path, line, side) server-side before emitting selfReview.set — Phase 5 reuses this pattern for draft_comment

### Pending Todos

None yet.

### Blockers/Concerns

- **Pitfall 1** (GitHub `position` vs `line`/`side` confusion) — addressed in Phase 6, but the internal `Anchor` type should be designed with `line`+`side` from the start of Phase 5.
- **Pitfall 2** (LLM hallucinated line numbers) — Phase 4 proved the opaque-ID + server-side resolution pattern (lineId regex gate + resolveLineId). Phase 5 must extend this to draft_comment/reply_in_thread — never expose freeform path/line strings in MCP tool schemas.

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

Last session: --stopped-at
Stopped at: Phase 5 UI-SPEC approved
Resume file: --resume-file

**Planned Phase:** 05 (Walkthrough + Inline Threaded Comments) — 6 plans — 2026-04-22T10:26:53.583Z
