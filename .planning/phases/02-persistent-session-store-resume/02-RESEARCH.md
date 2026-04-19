# Phase 2: Persistent Session Store + Resume — Research

**Researched:** 2026-04-19
**Domain:** Event-sourced state management, crash-safe JSON persistence, cross-process file locking, stale-diff detection/rebase UX
**Confidence:** HIGH on persistence mechanics (write-file-atomic + proper-lockfile internals verified via official docs), HIGH on event-sourced reducer pattern (ARCHITECTURE.md Pattern 1 is the canonical reference), MEDIUM on crash-interrupt testing technique (Node ecosystem convention, no single authoritative source), HIGH on SSE Last-Event-ID resume semantics.

## Summary

Phase 2 turns Phase 1's write-once atomic-JSON scaffold into the event-sourced reducer the rest of the project's mutation paths will funnel through. The work splits into five sharply scoped bodies of work:

1. **Define the event type**—a discriminated union that today only needs a small set of events (walkthrough cursor moves, comment-draft placeholders, head-SHA detection) but must be structured so Phase 5's `comment.drafted`, Phase 4's `checklist.*`, and Phase 6's `review.posted` slot in without a schema break.
2. **Wire the reducer**—a pure `applyEvent(session, event) → session` function plus a `SessionManager.applyEvent(id, event)` orchestrator that persists-then-broadcasts. Every mutation site (MCP tools + HTTP POST routes) must call this one orchestrator; direct mutation of `this.sessions.set(...)` is forbidden outside `applyEvent`.
3. **Extend persistence to per-mutation atomic writes**—keep `write-file-atomic` + `proper-lockfile` (D-04 is locked by CONTEXT) but add (a) load-on-startReview path, (b) write-after-every-event path, (c) a crash-interrupt test that SIGKILL's a child process mid-write and asserts the file is either the prior snapshot or the new snapshot (never a truncated JSON blob).
4. **Head-SHA-gated resume UX**—when `startReview` finds a persisted session, fetch the current head SHA, compare, and if different push a `snapshot` payload that includes a `staleDiff: { storedSha, currentSha }` field the front end renders as a "PR updated" modal with three buttons.
5. **SSE update fan-out**—Phase 1 sends one `event: snapshot` then idles. Phase 2 must push `event: update` on every applyEvent without changing the stream contract. EventSource reconnect with `Last-Event-ID` is the long-term recovery path per D-03; Phase 2 is where the `id:` field on SSE writes starts carrying meaningful event IDs.

**Primary recommendation:** Keep `write-file-atomic@7.0.1` + `proper-lockfile@4.1.2` (both shipped in Phase 1, D-04) [VERIFIED: npm view]. Model the event log as an in-memory array on the session plus a write-through snapshot — no append-only event log file in v1 (the reducer is deterministic from snapshot alone; an event log earns its keep only when debugging needs replay, which is deferred to v2). Use Hono's `streamSSE` `id:` field for monotonically-increasing event IDs so Phase 2+ reconnect semantics land for free. Crash-interrupt testing pattern: `node:child_process.spawn` a target script that calls `writeState` in a loop, `process.kill(pid, 'SIGKILL')` at a random point, then assert `JSON.parse(readFileSync(...))` either succeeds or reads the pre-state — following the pattern already established by Phase 1's `lifecycle.test.ts` which uses `spawn` (not `execa`) for long-lived subprocess testing in vitest worker threads.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Event type definition | Shared (`shared/types.ts`) | — | MCP tool handlers + HTTP POST routes + front-end snapshot type consumer all import from one place (D-17 precedent — opaque IDs already live in `shared/types.ts`). |
| Pure reducer (`applyEvent(session, event) → session`) | Server — `session/reducer.ts` | — | Pure function, no I/O; unit-testable in isolation with `vi.resetModules()` style already used in Phase 1 tests. |
| SessionManager orchestration (`applyEvent(id, event)`) | Server — `session/manager.ts` | — | Owns the `Map<prKey, Session>`, the persistence-then-broadcast contract, and the monotonic event-ID counter. Already exists as a class; add an `applyEvent` method. |
| Atomic JSON persistence | Server — `persist/store.ts` | — | Already implemented in Phase 1. Phase 2 adds a `loadAllSessions()` helper for resume, and optionally an `fsync` discipline review (see Pitfall "Rename atomicity is not enough"). |
| Head-SHA comparison + stale-diff surface | Server — `ingest/github.ts` + `ingest/local.ts` + `session/manager.ts` | Front end — resume modal component | Back end detects divergence; front end renders the three-choice UI. The three choices map to three events: `session.reset`, `session.adoptNewDiff`, `session.viewBoth` — so the UI's POSTs go through the same reducer. |
| Per-event SSE push | Server — `http/routes/events.ts` | Front end — `api.ts` + `store.ts` | `events.ts` today sends one `event: snapshot`. Phase 2 keeps the first snapshot, subscribes to the session bus, and pushes `event: update` with monotonic `id:` for Last-Event-ID replay. |
| Event-ID monotonic counter | Server — `session/manager.ts` | — | Per-session `lastEventId` counter on the in-memory session. Not a global counter — it's per-PR, so Phase 7 multi-session doesn't have contention. |
| Resume flow (browser reopens mid-review) | Front end — `main.tsx` bootstrap + `store.ts` | Server — `startReview` returns existing session | `main.tsx` passes `session=<prKey>` in URL; server looks up in-memory first, then disk. Already partly wired (idempotency in `startReview`); Phase 2 adds the disk-load path. |

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists yet for Phase 2 (discuss-phase has not been run). Constraints inherited from Phase 1's CONTEXT.md + PROJECT.md §Key Decisions that directly bind Phase 2:

### Locked Decisions (inherited from Phase 1, must be respected)

- **D-01 (from Phase 1):** Transport is SSE (`GET /api/events`) + HTTP POST. No WebSocket. `event: update` on the same open stream is the Phase 2 extension mechanism.
- **D-02 (from Phase 1):** Phase 1 sends one `event: snapshot` then idles. Phase 2 introduces `event: update` with the same payload-shape-for-the-changed-parts.
- **D-03 (from Phase 1):** EventSource reconnect with `Last-Event-ID` is the long-term recovery path (used from Phase 2 on).
- **D-04 (from Phase 1):** Persistence format is atomic JSON via `write-file-atomic` + `proper-lockfile`. No `better-sqlite3`, no `node:sqlite`. This is **non-negotiable** — Phase 2 does not revisit it.
- **D-05 (from Phase 1):** State lives at `${CLAUDE_PLUGIN_DATA}/reviews/<pr-key>/state.json`. PR-key sanitization `replace(/[/#:\\]/g, '_')` is already in `persist/paths.ts`.
- **D-06 (from Phase 1):** Phase 1 writes once per `startReview`. Phase 2 **lifts this restriction** — writes happen on every `applyEvent`.
- **D-07..D-13 (security, from Phase 1):** Full security chain (127.0.0.1-only, token double-submit, Host allowlist, CSP, stderr-only logging) still applies. Any new POST route Phase 2 adds (e.g., for the resume-modal choices) must carry the `X-Review-Token` header.
- **D-17 (from Phase 1):** Opaque IDs for hunks/lines already pre-populated in `DiffModel`. Phase 2 events that reference hunks/lines MUST use these IDs, not freeform strings (Pitfall 2 prevention, shipping ahead of Phase 5).
- **D-18 (from Phase 1):** Tool count cap — Phase 2 adds at most one new MCP tool. Resume is driven by `startReview` returning the restored session; no `resume` tool is needed (idempotency already covers this).
- **D-21 (from Phase 1):** `startReview` is idempotent on PR-key; reuses session, doesn't re-launch browser. Phase 2 extends idempotency to also cover the disk-load path when the in-memory map is empty (e.g., first `startReview` after plugin restart).

### Claude's Discretion (no user input yet; planner/discuss-phase will decide)

- Whether to add an on-disk append-only event log (`events.jsonl`) in addition to the snapshot. **Recommendation below:** defer (see "Alternatives Considered — Event Log on Disk"). Snapshot-only is sufficient for all Phase-2 success criteria.
- Exact shape of the "rebase drafts where possible" logic. **Recommendation below:** Phase 2 ships the detection + UI surface; the actual comment-rebase algorithm is no-op in Phase 2 because **no comments exist yet** (comment drafts ship in Phase 5). Phase 2 persists the three user choices as events and honors them; the "rebase drafts" branch degrades gracefully to "discard session" behavior in Phase 2 and gains real rebasing logic when Phase 5 lands.
- Whether the resume modal is a server-pushed state (snapshot carries `staleDiff`) or a client-side check. **Recommendation below:** server-pushed. Server already has both SHAs at startReview time; doing it server-side keeps the front end dumb.
- Whether event IDs are integers, UUIDs, or timestamps. **Recommendation below:** monotonic per-session integers as decimal strings (`"1"`, `"2"`, ...). Matches SSE spec (`id:` is a string); survives JSON round-trip without float-precision issues that timestamps have past 2^53 ms.

### Deferred Ideas (OUT OF SCOPE for Phase 2)

- **SESS-04 multi-session switcher** — Phase 7 per ROADMAP. Phase 2 handles ONE session per plugin process; multi-session is a different beast because today's `SessionManager` has ONE token and ONE launch URL.
- **On-disk append-only event log (`events.jsonl`)** — not needed for v1. Defer until replay-for-debugging has a concrete use case.
- **Comment-rebase algorithm** — Phase 5 introduces comments; Phase 2 only persists walkthrough cursor and the persistence scaffolding. The "rebase drafts where possible" button ships a no-op in Phase 2 (no drafts to rebase yet) — it becomes functional when Phase 5 lands.
- **Durability across OS crashes / power loss** (beyond kill -9) — the existing `write-file-atomic` with default `fsync: true` gets us most of the way there [VERIFIED: write-file-atomic docs]. Phase 2 does NOT pursue parent-directory fsync discipline (see Pitfall "Rename atomicity is not enough"); that's a v2 hardening pass if the author ever hits a real post-power-loss corruption.
- **Full event-sourced replay** — the on-disk snapshot is the source of truth. Events exist to drive in-memory transitions + SSE fan-out; they are not the system of record.
- **Stale-SHA detection in local-branch mode** — local refs move differently from PR heads; debate whether to track HEAD movement on the head ref is a DISCUSS-PHASE decision, not a RESEARCH decision. Recommendation: same logic applies — `git rev-parse <headRef>` at resume time, compare, surface same modal.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SESS-01 | User can close the browser or quit Claude Code mid-review and, on next `/review` invocation for the same PR, resume with walkthrough cursor, drafted comments, summary, self-review findings, and checklist state intact | Sections: "Pattern 1 — Event-Sourced Reducer", "Pattern 3 — Resume via startReview Disk-Load Path", "Architecture Patterns — SessionManager applyEvent". Note: walkthrough cursor + drafted comments + summary + checklist state are future-phase artifacts; Phase 2 ships the **persistence scaffolding** that will hold them, plus whatever in-flight UI state actually exists today (which is just the Phase-1 session shape: `pr`, `diff`, `shikiTokens`, `headSha`, `error`). Resume-for-future-state is the load-on-start path shipping here. |
| SESS-02 | User is alerted and given a resolution choice (rebase drafts / discard / view-both) when resuming a PR whose head SHA has changed since last session | Sections: "Pattern 4 — Head-SHA-Gated Stale-Diff Detection", "Code Examples — Stale-Diff Modal UX Contract". The three choices map to three reducer events: `session.adoptNewDiff`, `session.reset`, `session.viewBoth`. Phase 2 ships the detection + all three choice events; the "rebase drafts" branch is a no-op in Phase 2 because drafts land in Phase 5. |
| SESS-03 | Plugin survives crashes, kills, and power loss without corrupting review state, using atomic write-and-rename and cross-process file locking | Sections: "Pattern 5 — Atomic JSON Persistence Internals", "Common Pitfalls — Partial-Write Corruption", "Validation Architecture — Crash-Interrupt Test". Already shipping via `write-file-atomic` (atomic via temp-file + `rename`) + `proper-lockfile` (cross-process via atomic `mkdir`). Phase 2 adds the proof-test that SIGKILL during writeState leaves the file in a consistent state. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `write-file-atomic` | `7.0.1` | Write-to-temp + fsync + rename wrapper [VERIFIED: `npm view write-file-atomic version` → 7.0.1, published 2026-03-19] | Industry standard for crash-safe JSON writes in Node. Default `fsync: true` calls `fsync()` on the temp file before `rename` so content is durable on disk before the atomic swap [CITED: https://github.com/npm/write-file-atomic/blob/main/README.md]. Already installed in Phase 1. |
| `proper-lockfile` | `4.1.2` | Cross-process advisory locking via atomic `mkdir` of `<file>.lock/` [VERIFIED: `npm view proper-lockfile version` → 4.1.2] | Uses `mkdir` not `O_EXCL`, which is safe on network filesystems AND local ones; mtime-refresh stale detection with `onCompromised` callback for the hard-crash scenario [CITED: https://github.com/moxystudio/node-proper-lockfile]. Already installed in Phase 1. |
| `@modelcontextprotocol/sdk` | `1.29.0` | MCP server — already installed; Phase 2 adds no new tools | No change — Phase 2 extends `startReview`'s internal behavior (disk-load path) without changing its schema. |
| `hono` / `@hono/node-server` | `4.12.14` | HTTP + SSE transport — already installed | Phase 2 uses Hono's `streamSSE` helper's `id` field for monotonic event IDs. The helper supports `stream.onAbort` for cleanup on browser disconnect, which Phase 2 uses to unsubscribe from the bus. `c.req.header('Last-Event-ID')` is the documented way to read the reconnect marker [CITED: https://hono.dev/docs/helpers/streaming, standard SSE spec]. |
| `zod` | `4.3.6` | MCP tool + HTTP POST body schemas — already installed | Phase 2 adds zod schemas for any new HTTP POST routes the resume-modal buttons hit. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `nanoid` | `5.1.9` | Stable IDs for future threads/comments | **Not needed in Phase 2** — event IDs are monotonic per-session integers, not nanoids. Keep installed for Phase 5. |
| `node:fs/promises` (built-in) | — | `readdir` for loading all persisted sessions on startup | Phase 2 adds a `loadAllSessions()` helper that reads `${CLAUDE_PLUGIN_DATA}/reviews/*/state.json`. Built-in only; no new dep. |
| `node:child_process.spawn` (built-in) | — | Crash-interrupt test harness | Phase 1's `lifecycle.test.ts` already uses `spawn` (not `execa`) for long-lived subprocess tests because execa v9 streams don't emit `data` events inside vitest worker threads [VERIFIED: Phase 1 Plan 07 SUMMARY decision "spawn-not-execa-in-vitest"]. Reuse this pattern for SESS-03. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Snapshot-only persistence | Append-only event log (`events.jsonl`) + periodic snapshot | Event log gives replay/debug-time-travel; but the reducer is deterministic from snapshot alone, there's no "replay old events on new code" migration scenario in a personal tool, and doubling the write load (snapshot + log) doubles the crash-corruption surface area. **Defer to v2.** |
| `write-file-atomic@7` + `proper-lockfile@4` | `better-sqlite3@12.9.0` | Already decided against in Phase 1 D-04 (native addon + reducer-is-the-transaction). **Do not revisit.** |
| Hono `streamSSE` keep-alive sleep | `stream.writeSSE({ event: 'ping', data: '' })` loop | Already implemented in Phase 1's `events.ts`; keep as-is. Phase 2 adds the update-push loop alongside the ping loop. |
| Monotonic integer event IDs | ULIDs / timestamps | Integers are smaller, compare correctly as strings for SSE, and a per-session counter can't collide even under Phase 7's multi-session world. Timestamps past 2^53 ms are a 2255 AD problem and are fine; ULIDs add a dep for a problem we don't have. |
| Server-pushed `staleDiff` in snapshot | Client-side fetch of current SHA | Client-side means the client needs a GitHub-API credential path — already has one (cookie-authenticated POST to a server endpoint), but the server has both SHAs in hand at `startReview` time. Simpler to push from server. |

**Installation:** No new packages required — Phase 2 uses libraries already shipped in Phase 1.

**Version verification performed 2026-04-19:**
- `write-file-atomic@7.0.1` — current, published 2026-03-19 [VERIFIED: npm view]
- `proper-lockfile@4.1.2` — current (last update 2022-06-24 but API is stable and the package still holds its ecosystem position) [VERIFIED: npm view]
- `@modelcontextprotocol/sdk@1.29.0` — current [VERIFIED: npm view]
- `hono@4.12.14` — current [VERIFIED: npm view]
- `parse-diff@0.11.1` (installed) vs `0.12.0` (latest) — minor lag; not load-bearing for Phase 2, no need to bump unless a bug bites.

## Architecture Patterns

### System Architecture Diagram

```
     ┌──────────────── MCP tool call (startReview, future: cursor.moved, etc.) ─────────────┐
     │                                                                                      │
     ▼                                                                                      │
┌────────────────────────────────────────────────────────────────────────────────────────┐ │
│                           SessionManager.applyEvent(id, event)                          │ │
│                                    (THE ONE FUNNEL)                                     │ │
│                                                                                         │ │
│   1. session = this.sessions.get(id) ?? (await load-from-disk) ?? throw                │ │
│   2. next = applyEvent(session, event)      ← pure reducer in session/reducer.ts        │ │
│   3. next.lastEventId = session.lastEventId + 1                                         │ │
│   4. await writeState(id, next)             ← atomic JSON via write-file-atomic         │ │
│   5. this.sessions.set(id, next)            ← only after disk confirms                  │ │
│   6. this.bus.emit('session:updated', { id, event, state: next })                       │ │
└────────────────────────────────────────────────────────────────────────────────────────┘ │
     ▲                                                             │                        │
     │                                                             ▼                        │
┌────┴───────────────── HTTP POST (resume modal choice; Phase 5+: draft_comment) ──┐  ┌────┴────────────┐
│                        /api/session/choose-resume                                 │  │  SSE route      │
│                        Hono handler → manager.applyEvent(prKey, event)            │  │  /api/events    │
└───────────────────────────────────────────────────────────────────────────────────┘  │  subscribes to  │
                                                                                        │  bus; pushes to │
                                                                                        │  all browsers   │
                                                                                        │  with monotonic │
                                                                                        │  id: for        │
                                                                                        │  Last-Event-ID  │
                                                                                        └─────────────────┘

On plugin boot:
┌──────────────────────────────────────────────────────────────────────────────────┐
│ SessionManager.startReview(source)                                                │
│                                                                                   │
│  1. prKey = derivePrKey(source)                                                   │
│  2. if in-memory: return existing (D-21 idempotency)                              │
│  3. else: persisted = await readState(prKey)                                      │
│     ├─ if persisted:                                                              │
│     │    currentSha = await fetchCurrentHeadSha(source)                           │
│     │    if persisted.headSha !== currentSha:                                     │
│     │       session = { ...persisted, staleDiff: { stored, current } }            │
│     │    else:                                                                    │
│     │       session = persisted                                                   │
│     │    this.sessions.set(prKey, session)                                        │
│     │    launchBrowser(sessionLaunchUrl(prKey))                                   │
│     │    return session                                                           │
│     └─ else: (first-ever review for this PR)                                      │
│          session = <run full ingest pipeline — current Phase-1 behavior>          │
│          await writeState(prKey, session)                                         │
│          launchBrowser(...)                                                       │
│          return session                                                           │
└──────────────────────────────────────────────────────────────────────────────────┘

On browser reconnect (EventSource auto-reconnect with Last-Event-ID):
┌──────────────────────────────────────────────────────────────────────────────────┐
│ GET /api/events?session=<prKey>                                                   │
│ (cookie-authenticated per D-10; Host-validated per D-11)                          │
│                                                                                   │
│  Last-Event-ID: "42"   ← sent by EventSource automatically on reconnect           │
│                                                                                   │
│  1. session = manager.get(prKey) ?? 404                                           │
│  2. lastId = parseInt(c.req.header('Last-Event-ID') ?? '0', 10)                   │
│  3. if lastId < session.lastEventId:                                              │
│        writeSSE({ event: 'snapshot', id: session.lastEventId, data: session })    │
│     // (Phase 2 ships snapshot-always-on-reconnect; a replay event log is v2)     │
│  4. subscribe to bus; push each update with id: <new lastEventId>                 │
│  5. onAbort: unsubscribe                                                          │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

New/modified files in Phase 2 only:

```
server/
├── src/
│   ├── session/
│   │   ├── manager.ts           # MODIFIED: add applyEvent(id, event), add resume-from-disk path in startReview, add bus subscription support
│   │   ├── reducer.ts           # NEW: pure applyEvent(session, event) → session
│   │   ├── events.ts            # NEW: SessionEvent discriminated union type
│   │   └── bus.ts               # NEW: tiny typed EventEmitter wrapper (session:updated { id, event, state })
│   ├── persist/
│   │   └── store.ts             # MODIFIED: add loadAllSessions() helper for startup scan of ${CLAUDE_PLUGIN_DATA}/reviews/*
│   └── http/
│       └── routes/
│           ├── events.ts        # MODIFIED: subscribe to bus; push update events with monotonic id; handle Last-Event-ID on reconnect
│           └── session-resume.ts # NEW: POST /api/session/choose-resume { choice: 'adopt' | 'reset' | 'viewBoth' }

shared/
└── types.ts                     # MODIFIED: add SessionEvent union, add staleDiff field to ReviewSession, add UpdateMessage SSE envelope

web/
├── src/
│   ├── api.ts                   # MODIFIED: add chooseResume(choice); store subscribes to update events
│   ├── store.ts                 # MODIFIED: add onUpdate reducer; show/hide stale-diff modal based on session.staleDiff
│   └── components/
│       └── StaleDiffModal.tsx   # NEW: three-button modal ("Rebase drafts / Discard / View both")
```

### Pattern 1: Event-Sourced Reducer (Pure Function)

**What:** A single `applyEvent(session, event) → session` pure function handles every mutation path. Discriminated-union events narrow cleanly with a `switch` on `event.type`.

**When to use:** Here. Every Phase-2-and-beyond mutation MUST go through this reducer. No direct `session.foo = bar` in any tool handler or HTTP route.

**Example (reducer shape):**

```typescript
// shared/types.ts — the event type grows over phases but the shape is set in Phase 2
export type SessionEvent =
  // Phase 2:
  | { type: 'session.adoptNewDiff'; newDiff: DiffModel; newHeadSha: string; newShikiTokens: Record<string, ShikiFileTokens> }
  | { type: 'session.reset' }
  | { type: 'session.viewBoth' }
  // Phase 4 will add:
  //   | { type: 'summary.set'; body: string }
  //   | { type: 'checklist.itemScored'; itemId: string; verdict: 'pass'|'partial'|'fail'; note: string }
  // Phase 5 will add:
  //   | { type: 'cursor.moved'; hunkId: string }
  //   | { type: 'comment.drafted'; threadId: string; hunkId: string; lineId: string; body: string }
  //   | { type: 'thread.replied'; threadId: string; author: 'user'|'llm'; body: string }
  // Phase 6 will add:
  //   | { type: 'verdict.set'; verdict: 'approve'|'request_changes'|'comment' }
  //   | { type: 'review.posted'; githubReviewId: string; postedAt: string };

// server/src/session/reducer.ts
export function applyEvent(s: ReviewSession, e: SessionEvent): ReviewSession {
  switch (e.type) {
    case 'session.adoptNewDiff':
      return {
        ...s,
        diff: e.newDiff,
        headSha: e.newHeadSha,
        pr: { ...s.pr, headSha: e.newHeadSha },
        shikiTokens: e.newShikiTokens,
        staleDiff: undefined,
      };
    case 'session.reset':
      // Phase 2: reset means drop persisted state and re-ingest on next startReview.
      // Implementation: mark the session with a reset flag; the HTTP handler that
      // triggered this then removes the state.json file and clears the in-memory session.
      return { ...s, pendingReset: true };
    case 'session.viewBoth':
      // Phase 2 stub: toggle a flag the UI can render later. In Phase 2 there's no
      // "old diff" UI surface; this is a placeholder that lands the event in the reducer.
      return { ...s, viewBothMode: true, staleDiff: undefined };
    default: {
      // Exhaustiveness: unreachable if the switch covers all event types.
      const _never: never = e;
      throw new Error(`Unknown event type: ${JSON.stringify(_never)}`);
    }
  }
}
```

**Reducer contract:**

1. Pure — no `await`, no I/O, no `Date.now()` on the reducer's critical path (if you need a timestamp, put it on the event itself so tests can fix it).
2. Returns a NEW session object (`{ ...s, ... }`) — never mutates `s`. Preserves deep equality semantics for React hooks + makes tests trivial.
3. Exhaustive — `default` is `const _never: never = e` so adding an event to the union without handling it is a TypeScript compile error.

### Pattern 2: SessionManager.applyEvent — Persist-Then-Broadcast

**What:** The SessionManager's `applyEvent(id, event)` method is the single orchestrator. Persists first (disk = source of truth), then updates the in-memory Map, then broadcasts on the bus. Order matters: if disk write fails, the in-memory state is untouched, so the browser's view doesn't diverge from disk.

**Example:**

```typescript
// server/src/session/manager.ts (new method)
async applyEvent(id: string, event: SessionEvent): Promise<ReviewSession> {
  const current = this.sessions.get(id);
  if (!current) throw new Error(`No session for prKey: ${id}`);
  const next: ReviewSession = {
    ...applyEvent(current, event),
    lastEventId: current.lastEventId + 1,
  };
  await writeState(id, next);              // disk first
  this.sessions.set(id, next);             // memory second
  this.bus.emit('session:updated', { id, event, state: next });   // broadcast last
  return next;
}
```

**Why persist-first:** If the process SIGKILL's between `writeState` and `sessions.set`, on restart the disk state is ahead of the in-memory state — but the in-memory state is empty at startup, so the startup `readState` pulls the post-event state. Zero drift. The inverse (memory-first, disk-second) would produce a window where a crash leaves the disk BEHIND the browser's cached state, and the next reconnect would see a snapshot older than the browser already rendered.

**Why broadcast-last:** The bus is in-process, not persisted; if the broadcast throws, the persist succeeded but the SSE push failed. EventSource reconnect + Last-Event-ID recovers — the next `event: snapshot` on reconnect gets the client caught up.

### Pattern 3: Resume via startReview Disk-Load Path

**What:** `SessionManager.startReview` already handles the in-memory cache hit (D-21 idempotency). Phase 2 adds a disk-load path between the cache miss and the full ingest pipeline.

**When to use:** First `startReview(source)` after plugin restart.

**Example:**

```typescript
// server/src/session/manager.ts — modified startReview
async startReview(source: SourceArg): Promise<ReviewSession> {
  const prKey = await this.derivePrKey(source);

  // (1) in-memory cache hit — D-21 idempotency (unchanged)
  const existing = this.sessions.get(prKey);
  if (existing) return existing;

  // (2) NEW: disk load before running ingest
  const persisted = await readState(prKey) as ReviewSession | null;
  if (persisted) {
    // Head-SHA gate — see Pattern 4
    const currentHeadSha = await this.fetchCurrentHeadSha(source);
    const staleDiff = persisted.headSha !== currentHeadSha
      ? { storedSha: persisted.headSha, currentSha: currentHeadSha }
      : undefined;
    const session: ReviewSession = { ...persisted, staleDiff };
    this.sessions.set(prKey, session);
    if (!this.launched.has(prKey)) {
      this.launched.add(prKey);
      await launchBrowser(this.sessionLaunchUrl(prKey));
    }
    return session;
  }

  // (3) fall-through: full ingest (current Phase-1 behavior, unchanged)
  // ... existing startReview body ...
}
```

**Important:** `fetchCurrentHeadSha` is cheap — for GitHub, it's `gh pr view --json headRefOid` (already used in `ingestGithub`); for local, it's `execa('git', ['rev-parse', headRef])`. Do NOT re-fetch the full diff here — that's a Phase-1-cost operation only justified on the adoptNewDiff path.

### Pattern 4: Head-SHA-Gated Stale-Diff Detection

**What:** At startup resume, compare stored `headSha` against current. If different, flag it in the session's `staleDiff` field, which the snapshot SSE payload carries to the browser, which renders a three-button modal.

**Contract:**

| Button | UI label | Event posted to server | Server behavior |
|--------|----------|------------------------|-----------------|
| "Rebase drafts where possible" | Primary, because it's the nondestructive choice | POST `/api/session/choose-resume` `{ choice: "adopt" }` | Server runs the full ingest pipeline against current head; applies `session.adoptNewDiff` event with the new `diff`, `headSha`, `shikiTokens`. In Phase 2, with no drafts existing yet, this is equivalent to "refresh" — the rebase logic lights up in Phase 5. |
| "Discard session" | Secondary, destructive-styled | POST `/api/session/choose-resume` `{ choice: "reset" }` | Server deletes `${CLAUDE_PLUGIN_DATA}/reviews/<prKey>/state.json`, clears in-memory entry, re-runs full ingest. Next state is a fresh session at the new head. |
| "View both" | Tertiary | POST `/api/session/choose-resume` `{ choice: "viewBoth" }` | Server applies `session.viewBoth` event which clears `staleDiff` and sets `viewBothMode: true` on the session. **Phase 2 UI implication:** viewBothMode is a state flag only; no UI renders differently based on it in Phase 2 (no "old diff" surface exists). Documented for Phase 3+ to consume. |

**Modal dismissibility:** The modal is not dismissible without choosing — SESS-02 specifies three **explicit** choices. No Escape-to-close, no click-outside-to-dismiss.

**Snapshot payload shape:**

```typescript
// shared/types.ts
export interface ReviewSession {
  // ... existing fields ...
  staleDiff?: {
    storedSha: string;
    currentSha: string;
  };
  viewBothMode?: boolean;
  lastEventId: number;      // monotonic; starts at 0 on first write
}
```

### Pattern 5: Atomic JSON Persistence — Internals We Rely On

**What write-file-atomic actually does** [CITED: https://github.com/npm/write-file-atomic]:

1. Generates a temp filename: `filename + "." + murmurhex(__filename, process.pid, ++invocations)` (plus `worker_threads.threadId` if applicable). Collision-avoidant in multi-worker runtimes.
2. `fs.writeFile` to the temp path.
3. `fsync()` the temp file (default `fsync: true`) — forces the write to physical disk, not just the page cache.
4. `fs.rename(temp, target)` — on POSIX, this is atomic: either the rename happened and `target` is the new content, or it didn't and `target` is the old content. No intermediate state is visible to concurrent readers.
5. On error at any step, best-effort unlink the temp file and rethrow.

**What proper-lockfile actually does** [CITED: https://github.com/moxystudio/node-proper-lockfile]:

1. Attempts atomic `mkdir(<file>.lock/)` — `mkdir` is atomic on POSIX and works across network filesystems (unlike `O_EXCL` which some NFS mounts don't honor).
2. On success, writes its PID into the lock dir and starts a periodic mtime refresh (default every 5s, half of the 10s stale threshold).
3. If the mtime falls behind the stale threshold, future lock attempts will consider it stale and break it.
4. `onCompromised` callback fires if the holder's own periodic mtime refresh fails — by default it throws, which on most processes terminates them. For Phase 2, accept the default (the loud failure is the right thing).

**What we rely on for SESS-03:**

- `fs.rename` atomicity on APFS (the macOS target filesystem) — confirmed: "Atomic Safe-Save performs renames in a single transaction such that, from the user's perspective, the operation either is completed or does not happen at all" [CITED: Apple's APFS Features guide]. APFS's redirect-on-write design additionally makes metadata crash-safe.
- `write-file-atomic`'s `fsync: true` default — without this, the rename could land while the temp file's contents are still in the page cache, giving an atomic rename of a physically-empty file post-power-loss. **Keep the default; do not pass `fsync: false`.**
- `proper-lockfile`'s stale-detection — so if a prior plugin process was SIGKILL'd holding the lock, the next process breaks the lock on a timeout rather than hanging forever.

### Anti-Patterns to Avoid

- **Direct mutation of `this.sessions.get(id)`** — Phase 1's `startReview` sets a brand-new session; that's fine. Post-Phase-2, any other code doing `session.foo = x` bypasses persistence and SSE fan-out. Use `applyEvent` or go through a field that's re-persisted at `startReview` time only.
- **`console.log` on the reducer's critical path** — AP2 from Phase 1: stdout is the JSON-RPC channel. `logger.error` / `logger.info` (stderr) only.
- **`position`-based comment anchors (Pitfall 1)** — not a Phase 2 concern yet; the `staleDiff` resolution events don't carry coordinates. But when `session.adoptNewDiff` fires, the NEW diff's opaque IDs (per D-17) are what go in the session — don't preserve old Hunk IDs that no longer map to anything.
- **Passing `fsync: false` to `write-file-atomic`** — the speedup is microseconds; the correctness cost is exactly the scenario SESS-03 promises to handle.
- **Deleting `state.json` by hand** without going through `session.reset` — the three resume choices are the only path; any other "oh just remove the file" code must go through the reducer so the in-memory map + bus get notified. (Exception: the initial ingest path at `startReview` step 3 creates the file; no delete is needed.)
- **Stale-diff silent submission** — if for some reason `headSha` comparison is skipped (e.g., because `fetchCurrentHeadSha` threw and was swallowed), submitting new-diff-coordinates against an old-diff session is the Pitfall 9 failure mode. Plan: if `fetchCurrentHeadSha` throws, **fail closed** — surface a "couldn't verify PR is up to date" error state rather than assuming no drift.
- **Event log on disk as write-through** — appending to `events.jsonl` on every `applyEvent` doubles the write load AND introduces a new corruption surface. Stick with snapshot-only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic file writes | Your own write-then-rename wrapper | `write-file-atomic` | Already installed. Handles temp-file naming collisions, fsync, error cleanup, and multi-worker edge cases. `writeFileSync` followed by `rename` is the naive version and loses to process-crash-between-write-and-fsync [CITED: write-file-atomic issue #16]. |
| Cross-process locking | `fs.open(O_EXCL)` or `fs.writeFile` with mode flags | `proper-lockfile` | `O_EXCL` is unreliable on network filesystems; `mkdir`-based locking is the standard. Also gives you stale-lock breakage for free. |
| Event bus / pub-sub | A global `Set<listener>` + forEach | Node's built-in `EventEmitter` + a thin typed wrapper | EventEmitter handles once-listener removal, error propagation, and the `.off()` semantics correctly. Wrap it in a typed helper so `bus.emit('session:updated', payload)` narrows payload. |
| SSE envelope | String-concatenating `data:\n\n` | Hono's `streamSSE` + `writeSSE({ event, data, id })` | Already used in Phase 1's `events.ts`. Handles SSE framing correctly and gives you `onAbort` for unsubscribe. |
| JSON equality / change detection | `JSON.stringify(a) === JSON.stringify(b)` as a dedup heuristic | Don't — just write unconditionally | Stringify-compare is slow on big sessions (shikiTokens can be huge) and gets you no real benefit; the next `applyEvent` call already has the right intent. Write every time. |
| Monotonic event IDs | Your own counter module | A field on the session itself (`session.lastEventId: number`) | Per-session monotonic counter, persisted as part of the session snapshot. Crash-safe (resumes from the last successful writeState), reconnect-friendly (sent as SSE `id:` field), test-friendly (predictable). |
| Parent-directory fsync | `fs.open(dir) + fsync(fd) + close(fd)` dance after rename | Don't — not for v1 | `write-file-atomic` doesn't do this, and for a personal-tool-on-APFS the return is vanishingly small. Treated as deferred hardening if a real post-power-loss corruption ever surfaces [VERIFIED: write-file-atomic issue #64 "Rename atomicity is not enough" — acknowledged but not addressed in the library]. |

**Key insight:** Custom persistence is a bug generator. Every line of hand-rolled `fs.writeFile` + `fs.rename` introduces a new scenario where `kill -9` at the wrong moment produces a truncated JSON. The libraries exist precisely because everyone making their own version of this has tripped on the same rakes.

## Runtime State Inventory

> Phase 2 is not a rename/refactor phase, but it DOES introduce persistence semantics that future phases will read back. Inventorying the NEW state this phase introduces on the filesystem:

| Category | Items Added by Phase 2 | Action Required |
|----------|------------------------|------------------|
| Stored data | `${CLAUDE_PLUGIN_DATA}/reviews/<safe-prKey>/state.json` — already exists from Phase 1 (D-06); Phase 2 extends the shape with `lastEventId`, `staleDiff`, `viewBothMode`, `pendingReset` optional fields | Backward-compatible: reading a Phase-1 `state.json` (no `lastEventId`) must tolerate missing fields. Initialize `lastEventId = 0` if absent. |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | `CLAUDE_PLUGIN_DATA` (already read in Phase 1); no new vars | None |
| Build artifacts | None — no new compiled outputs | None |

**Legacy Phase-1 `state.json` files:** Phase 1 wrote one-shot snapshots without `lastEventId`. On resume, the manager must initialize `lastEventId = 0` on load if the field is missing — this is a one-time forward-migration handled in the readState adapter.

## Common Pitfalls

### Pitfall A: Partial-Write Corruption on kill -9

**What goes wrong:** User SIGKILL's the plugin process (or power dies) at the exact moment `writeState` is midway through `fs.writeFile` to the temp file. On restart, the state.json file is either (a) the prior complete snapshot or (b) should be — but an incompetent implementation might have overwritten `state.json` in-place, leaving a truncated blob.

**Why it happens:** The classic naive implementation is `fs.writeFile(state.json, JSON.stringify(x))` — which opens-truncates-writes. A crash mid-write leaves zero, half, or all the bytes.

**How to avoid:** We already are avoiding it — `write-file-atomic` writes to a temp file with a murmurhex'd name, fsyncs it, then does an atomic `rename()`. Post-crash, the old `state.json` is untouched (if rename never happened) or completely replaced (if rename completed). There's no partial-state window. SESS-03 is structurally satisfied by the library; Phase 2 adds the PROOF-test.

**Warning signs:** `JSON.parse` failures on startup; `SyntaxError: Unexpected end of JSON input`; `{` with nothing after it. If you ever see these in production, it means either (1) someone bypassed `write-file-atomic` and called `fs.writeFile` directly, or (2) the disk itself is lying about durability (post-power-loss; see Pitfall B).

### Pitfall B: "Rename atomicity is not enough" — fsync of the parent directory

**What goes wrong:** `rename()` is atomic at the syscall level, but the directory's own inode update (the rename's effect) may still be in the OS's page cache. A power loss after `rename()` returns but before the directory inode is flushed can leave the filesystem in a state where the rename is "lost" even though it appeared to succeed — user sees the OLD state.json, not the new one.

**Why it happens:** POSIX doesn't require `rename()` to fsync the parent directory. Write-ahead-logged filesystems (ext4 with default ordering, APFS with its redirect-on-write design) mitigate this, but the guarantee is filesystem-specific, not POSIX-mandated.

**How to avoid (v2, not Phase 2):** After `rename()`, `open(parent_dir, O_RDONLY)` + `fsync(fd)` + `close(fd)`. [VERIFIED: write-file-atomic GitHub issue #64 — acknowledged in the library's own issue tracker but not implemented because the use case matrix doesn't justify the complexity for most consumers.]

**Phase 2 decision:** **Do not pursue parent-directory fsync.** APFS on macOS has redirect-on-write metadata [CITED: Apple APFS Features guide], so the risk window is small on the target platform. Document the gap for v2 hardening if a real corruption ever surfaces. `write-file-atomic`'s default behavior is what we ship.

**Warning signs:** Rebooting the Mac mid-review (power button hold) and seeing an OLD state.json on restart even though the UI showed a newer state. Has not been observed in Phase 1; if it becomes reproducible, this moves from "deferred" to "active."

### Pitfall C: Lock-holder SIGKILL leaves stale lockfile

**What goes wrong:** Plugin process A holds `proper-lockfile` lock, gets SIGKILL'd, never calls `release()`. Plugin process B starts, tries to acquire lock, sees existing lockdir, and... what?

**Why it happens:** The lock file is a directory on disk; SIGKILL has no chance to unlink it.

**How to avoid:** `proper-lockfile`'s stale detection handles this. The library periodically refreshes the lockdir's mtime; a lockdir whose mtime is >10s (default) stale is considered breakable. Next `lockfile.lock(file)` call sees the stale lock and takes over. The Phase-1 `store.ts` already passes `retries: { retries: 3, minTimeout: 50 }`, which gives the stale-detection a few cycles to kick in.

**Warning signs:** `Error: Lock file is already being held` on every writeState for more than 10s after a crashed process. If observed, double-check the stale/retries config.

### Pitfall D: Event-ordering skew under concurrent MCP tool + HTTP POST

**What goes wrong:** MCP tool calls `applyEvent(id, E1)`. Milliseconds later, HTTP POST handler calls `applyEvent(id, E2)`. Both reduce from the same `current` session. Depending on when `writeState` yields, they could interleave such that E2's reducer input is pre-E1, and E1's effect gets clobbered.

**Why it happens:** Node is single-threaded, but `applyEvent` is async (because `writeState` is async). If two callers both read `current` before either's `writeState` resolves, both compute their `next` from the same pre-state, and whichever writes second wins.

**How to avoid:** Serialize `applyEvent` calls per session via a promise chain on the SessionManager:

```typescript
private queues = new Map<string, Promise<unknown>>();

async applyEvent(id: string, event: SessionEvent): Promise<ReviewSession> {
  const prev = this.queues.get(id) ?? Promise.resolve();
  const next = prev.then(async () => {
    // ... actual applyEvent body — read, reduce, persist, emit
  }).catch((e) => {
    // log, rethrow so callers see the error
    throw e;
  });
  // Don't leak rejected promises into the queue chain
  this.queues.set(id, next.catch(() => undefined));
  return next;
}
```

Simple per-prKey serialization; no external library needed. Vitest unit tests cover the concurrent-call-path.

**Warning signs:** Test case "fire two applyEvents with no await, then await both" ends with only one event's effect visible. This is the regression test that flushes this pitfall into the open.

### Pitfall E: SSE client missed an event between snapshot and subscribe

**What goes wrong:** SSE route sends initial snapshot, then subscribes to the bus. An `applyEvent` fires between step 1 and step 2 — the push happens, but this client isn't subscribed yet, so it misses the update. Browser sits on stale state.

**Why it happens:** "Send snapshot then subscribe" has a window where in-process events can slip through.

**How to avoid:** Subscribe FIRST, then send the snapshot. Any event that fires between subscribe-moment and snapshot-send is queued locally in the SSE handler's scope and replayed after the snapshot. Simpler: subscribe to bus, buffer events in an array, send snapshot with `lastEventId`, flush the buffer (dropping events with `event.lastEventId <= snapshot.lastEventId`), then go live.

```typescript
// Sketch for events.ts
return streamSSE(c, async (stream) => {
  const buffer: UpdateMessage[] = [];
  const sub = manager.bus.on('session:updated', (payload) => {
    if (payload.id === prKey) buffer.push(toUpdateMessage(payload));
  });
  stream.onAbort(() => manager.bus.off('session:updated', sub));

  const session = manager.get(prKey)!;
  await stream.writeSSE({
    event: 'snapshot',
    id: String(session.lastEventId),
    data: JSON.stringify({ type: 'snapshot', session, launchUrl: ..., tokenLast4: ... }),
  });
  // Flush any updates that fired between subscribe and snapshot
  for (const u of buffer) {
    if (u.lastEventId > session.lastEventId) {
      await stream.writeSSE({ event: 'update', id: String(u.lastEventId), data: JSON.stringify(u) });
    }
  }
  buffer.length = 0; // go live
  // ... subsequent events write directly ...
});
```

**Warning signs:** Browser's view of session is one `applyEvent` behind the server after reconnect.

### Pitfall F: `fetchCurrentHeadSha` network blip masquerades as stale-diff

**What goes wrong:** `gh pr view --json headRefOid` fails transiently on resume; code swallows the error and falls back to "stale" — user sees the modal for nothing.

**How to avoid:** `fetchCurrentHeadSha` surfaces errors, doesn't pretend-success. If it throws, the snapshot carries an `error: { variant: 'head-sha-check-failed' }` (extends the existing `ReviewSession.error` field) and the UI shows a "couldn't verify PR is up to date" error — user can retry. Do NOT default to showing the stale-diff modal when we can't prove staleness.

**Warning signs:** Modal appears on every resume for a few hours when GitHub has an incident. Symptom is visible; fix is to check `fetchCurrentHeadSha` error branch.

## Code Examples

Verified patterns from official sources + the existing codebase:

### SSE update loop with Last-Event-ID replay gap

```typescript
// server/src/http/routes/events.ts — Phase 2 extension
import { streamSSE } from 'hono/streaming';

export function mountEvents(app: Hono, manager: SessionManager) {
  app.get('/api/events', (c) => {
    const prKey = c.req.query('session');
    if (!prKey) return c.text('Missing session', 400);
    const session = manager.get(prKey);
    if (!session) return c.text('Unknown session', 404);

    // Standard SSE reconnect: client may send Last-Event-ID
    const lastEventIdHeader = c.req.header('Last-Event-ID');
    const clientLastId = lastEventIdHeader ? parseInt(lastEventIdHeader, 10) : 0;

    return streamSSE(c, async (stream) => {
      // Subscribe BEFORE sending snapshot to avoid the gap in Pitfall E
      const buffer: UpdateMessage[] = [];
      const onUpdate = (payload: { id: string; event: SessionEvent; state: ReviewSession }) => {
        if (payload.id === prKey) {
          buffer.push({ type: 'update', event: payload.event, state: payload.state });
        }
      };
      manager.bus.on('session:updated', onUpdate);
      stream.onAbort(() => manager.bus.off('session:updated', onUpdate));

      // Snapshot — always sent on (re)connect so clients catch up from any prior id
      await stream.writeSSE({
        event: 'snapshot',
        id: String(session.lastEventId),
        data: JSON.stringify({
          type: 'snapshot',
          session,
          launchUrl: manager.sessionLaunchUrl(prKey),
          tokenLast4: manager.getTokenLast4(),
        } satisfies SnapshotMessage),
      });

      // Drain buffer for events that landed during subscribe-to-snapshot window
      while (buffer.length) {
        const u = buffer.shift()!;
        await stream.writeSSE({
          event: 'update',
          id: String(u.state.lastEventId),
          data: JSON.stringify(u),
        });
      }

      // Keep-alive + live push — bus emits push new updates as writeSSE
      // (push is driven by subscription callback; the ping loop is separate)
      while (true) {
        await stream.sleep(15_000);
        await stream.writeSSE({ event: 'ping', data: '' });
      }
    });
  });
}
```

*Sources: hono.dev/docs/helpers/streaming, MDN SSE reconnect semantics.*

### Crash-interrupt test for SESS-03 (kill -9 during writeState)

```typescript
// server/src/persist/__tests__/store.crash.test.ts — NEW in Phase 2
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

describe('store crash-interrupt (SESS-03)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'store-crash-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('kill -9 during writeState loop leaves state.json either pristine or advanced, never truncated', async () => {
    const stateFile = path.join(tmpDir, 'reviews', 'gh_test_1', 'state.json');
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    // Seed a known-good state
    const seedState = { lastEventId: 0, seeded: true };
    await fs.writeFile(stateFile, JSON.stringify(seedState));

    // Spawn a child that writes in a tight loop, then SIGKILL it
    const child = spawn(
      'node',
      ['--import', 'tsx/esm', path.resolve(__dirname, 'crash-fixture.ts')],
      { env: { ...process.env, CLAUDE_PLUGIN_DATA: tmpDir, CRASH_PR_KEY: 'gh:test/1' }, stdio: 'pipe' }
    );
    // Give the child ~100ms to spin up and start writing, then SIGKILL
    await new Promise((r) => setTimeout(r, 100));
    child.kill('SIGKILL');
    await new Promise((r) => child.on('exit', r));

    // File must exist and parse as valid JSON
    const raw = await fs.readFile(stateFile, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
    const parsed = JSON.parse(raw) as { lastEventId: number };
    // Either the seed state (no writes landed) or one of the loop's writes landed.
    // NEVER a truncated blob.
    expect(typeof parsed.lastEventId).toBe('number');
    expect(parsed.lastEventId).toBeGreaterThanOrEqual(0);
  });
});

// server/src/persist/__tests__/crash-fixture.ts — long-lived child
import { writeState } from '../store.js';
const prKey = process.env.CRASH_PR_KEY!;
let n = 1;
(async () => {
  while (true) {
    await writeState(prKey, { lastEventId: n++, hammer: 'x'.repeat(1024) });
  }
})();
```

*Pattern source: Phase 1's `lifecycle.test.ts` uses `spawn` not `execa` because execa v9 streams don't emit `data` events in vitest worker threads — same constraint applies to this test.*

### Reducer unit test (exhaustive per SESS-compliance)

```typescript
// server/src/session/__tests__/reducer.test.ts — NEW in Phase 2
import { describe, it, expect } from 'vitest';
import { applyEvent } from '../reducer.js';
import type { ReviewSession, SessionEvent } from '@shared/types';

const fixture = (): ReviewSession => ({
  prKey: 'gh:o/r#1',
  pr: { /* ... minimal PR meta ... */ } as any,
  diff: { files: [], totalHunks: 0 },
  shikiTokens: {},
  createdAt: '2026-04-19T00:00:00.000Z',
  headSha: 'abc123',
  error: null,
  lastEventId: 5,
});

describe('applyEvent', () => {
  it('session.adoptNewDiff replaces diff/headSha/shikiTokens and clears staleDiff', () => {
    const s0: ReviewSession = { ...fixture(), staleDiff: { storedSha: 'abc123', currentSha: 'def456' } };
    const s1 = applyEvent(s0, {
      type: 'session.adoptNewDiff',
      newDiff: { files: [], totalHunks: 0 },
      newHeadSha: 'def456',
      newShikiTokens: {},
    });
    expect(s1.headSha).toBe('def456');
    expect(s1.pr.headSha).toBe('def456');
    expect(s1.staleDiff).toBeUndefined();
  });

  it('session.reset sets pendingReset flag (drives HTTP handler to delete state.json)', () => {
    const s0 = fixture();
    const s1 = applyEvent(s0, { type: 'session.reset' });
    expect(s1.pendingReset).toBe(true);
  });

  it('session.viewBoth sets viewBothMode and clears staleDiff', () => {
    const s0: ReviewSession = { ...fixture(), staleDiff: { storedSha: 'a', currentSha: 'b' } };
    const s1 = applyEvent(s0, { type: 'session.viewBoth' });
    expect(s1.viewBothMode).toBe(true);
    expect(s1.staleDiff).toBeUndefined();
  });

  it('unknown event type throws (exhaustiveness guard)', () => {
    const s0 = fixture();
    // @ts-expect-error — we're deliberately feeding an unknown type
    expect(() => applyEvent(s0, { type: 'not-a-real-event' })).toThrow();
  });
});
```

*Sources: ARCHITECTURE.md Pattern 1 testing examples; Phase 1's `manager.test.ts` mocking conventions.*

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-place `fs.writeFile(path, data)` for JSON persistence | `write-file-atomic` temp+fsync+rename | Long-standing best practice; reinforced by [VERIFIED: write-file-atomic issue #16 (2015)] documenting the failure mode | Every crash-safe Node tool uses this pattern or equivalent. |
| Single-snapshot persistence | Snapshot + append-only event log | Event sourcing pattern [CITED: Azure Architecture Center — Event Sourcing Pattern] | In Phase 2 we DO NOT adopt event log — reducer is deterministic from snapshot alone. Revisit in v2 if replay becomes a debug need. |
| `O_EXCL`-based locking | `mkdir`-based locking (proper-lockfile) | Ecosystem-wide when NFS / network-FS scenarios became common | Even for local-only use, `mkdir` is as fast and more portable. |
| WebSocket for all realtime | SSE for server-pushed state + POST for client mutations | D-01 from Phase 1 | Keeps the transport curl-debuggable and the server stateless. |
| Timestamp-based event IDs | Monotonic per-session integer IDs | Keeps IDs small, string-comparable, and collision-free under Phase 7's multi-session expansion | No external library, no clock-skew concerns. |

**Deprecated/outdated:**
- **`better-sqlite3` for this specific use case** — not deprecated as a library, just deprecated as the persistence choice for this project per Phase 1 D-04.
- **`node:sqlite` built-in** — still experimental in Node 22/24 as of 2026-04 [CITED: STACK.md WebSearch 2026-04]; revisit only when it exits experimental, and even then D-04's reducer-is-the-transaction argument stands.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `proper-lockfile`'s default `stale: 10000ms` + `retries: { retries: 3, minTimeout: 50 }` combination will reliably break a stale lock from a SIGKILL'd prior process within a few hundred ms of the restart | Pitfall C | If retries exhaust before stale detection kicks in, the new process errors out on first writeState. Mitigation: bump retries or `minTimeout` if the real test shows the current Phase-1 setting is too aggressive. Low blast radius — test catches it. |
| A2 | Comment-rebase logic in Phase 5 can cleanly map hunk-content hashes from old diff to new diff for the subset of drafts whose anchor line is still present | Pattern 4, "Rebase drafts" button | If it can't, the Phase-2 `session.adoptNewDiff` event handler will need to drop orphaned drafts with a visible notice (per PITFALLS.md Pitfall 9). For Phase 2, this assumption is inert because no drafts exist yet; flagged here so Phase 5's planner sees it. |
| A3 | APFS's `rename()` atomicity + `write-file-atomic`'s default `fsync: true` is sufficient crash-safety for a personal-tool-on-macOS, without parent-directory fsync | Pitfall B | If the author ever reboots the Mac mid-review (power button hold) and sees an old state.json post-reboot, this assumption breaks and we'd need to add parent-dir fsync. Low probability; forensic signature is clear. |
| A4 | Monotonic per-session integer event IDs (starting at 0, incrementing on every applyEvent) are sufficient for SSE Last-Event-ID semantics given only one browser tab per session in Phase 2 | Pattern 1 + Pitfall E | If a future UI feature requires multiple tabs on the SAME session (not multiple sessions — that's Phase 7), per-session monotonic IDs still work. If the same client reconnects mid-stream and Last-Event-ID is higher than the server's current `lastEventId`, treat as 0 and send full snapshot. |
| A5 | Local-branch mode tracks HEAD drift the same way — `git rev-parse <headRef>` at resume time compared to stored `headSha` | Pattern 4 Claude's Discretion | If local refs are deliberately not tracked for drift, the planner can scope this to GitHub-source-only in DISCUSS-PHASE. Flagged here so discuss sees it. |
| A6 | The `ReviewSession` field additions (`staleDiff?`, `viewBothMode?`, `pendingReset?`, `lastEventId: number`) don't break Phase 1 behavior or tests | Runtime State Inventory | If Phase 1 tests assert full-shape equality on `ReviewSession`, those assertions need updating to allow the new optional fields. Low-risk; reading Phase 1's manager.test.ts shows equality is spot-check, not full-shape. |
| A7 | The "rebase drafts where possible" button in Phase 2 can ship as a no-op (currently equivalent to "discard session" since no drafts exist) without misleading the user | Pattern 4 | The button's UI label promises rebase; in Phase 2 the actual behavior is refresh-to-new-diff which is close enough. Mitigation: consider showing the button as "Refresh to current PR" in Phase 2 and renaming to "Rebase drafts" when Phase 5 wires up the rebase logic. DISCUSS-PHASE decision. |

## Open Questions

1. **Should `session.reset` delete the state.json file on disk or just reset its contents to a fresh-ingest shape?**
   - What we know: the user chose "discard" for a reason — they want this session gone. Deleting the file is cleaner; rewriting it to an empty-ingest shape is faster (no re-fetch loss window).
   - What's unclear: whether "discard + re-ingest" should happen as one atomic server action (feels cleanest) or two steps (delete, then let startReview handle re-ingest idempotently).
   - Recommendation: one atomic server action — the POST handler for `{ choice: 'reset' }` calls `manager.resetSession(prKey)` which deletes the file + clears the in-memory map + re-runs the full ingest. Returns the new snapshot. Front end's SSE subscription picks up the new snapshot and re-paints.

2. **Where does the head-SHA comparison live — in the session-manager or in the ingest adapters?**
   - What we know: the ingest adapters (`ingestGithub`, `ingestLocal`) already know how to reach GitHub / git. A "fetchCurrentHeadSha" helper is a subset of their logic.
   - What's unclear: whether adding a standalone `fetchCurrentHeadSha(source)` helper in the ingest module is cleaner than teaching the manager to call `ingestGithub` / `ingestLocal` in a metadata-only mode.
   - Recommendation: new helper `fetchCurrentHeadSha(source)` co-located with the full ingest; shares the execa-argv pattern. Avoids pulling the full diff just to check a SHA.

3. **How does the reset path coordinate with browser tabs that were already showing the old snapshot?**
   - What we know: SSE pushes the new snapshot; the store's `onSnapshot` handler replaces state. The stale-diff modal disappears naturally.
   - What's unclear: whether the modal should visually animate to success / indicate "refreshing" during the re-ingest round-trip (which could take seconds on a big PR) or just freeze.
   - Recommendation: show a lightweight "Refreshing diff..." overlay while the POST is in flight; the subsequent snapshot arrival removes the overlay. UX detail; not load-bearing.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | >=22 (verified — Phase 1 runs) | — |
| `write-file-atomic` | Persistence | ✓ | 7.0.1 (installed in Phase 1) | — |
| `proper-lockfile` | Persistence | ✓ | 4.1.2 (installed in Phase 1) | — |
| `hono` + `@hono/node-server` | HTTP + SSE | ✓ | 4.12.14 (installed in Phase 1) | — |
| `@modelcontextprotocol/sdk` | MCP surface | ✓ | 1.29.0 (installed in Phase 1) | — |
| `vitest` | Test runner | ✓ | installed in Phase 1 | — |
| `gh` CLI | Phase 2 `fetchCurrentHeadSha` (GitHub mode) | ✓ | 2.x (assumed per PROJECT.md constraints + Phase 1 ingestGithub works) | — |
| `git` CLI | Phase 2 `fetchCurrentHeadSha` (local mode) | ✓ | present (Phase 1 ingestLocal uses it) | — |
| `${CLAUDE_PLUGIN_DATA}` env var | Persistence path | ✓ at runtime / fallback to `.planning/.cache` at dev time (Phase 1 paths.ts already handles this) | — | Existing fallback already implemented |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — Phase 2 adds zero new dependencies to a working Phase-1 install.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` (latest, installed in server/package.json and web/package.json) |
| Config file | `server/vitest.config.ts` (Phase 1) |
| Quick run command | `cd server && pnpm test` (runs all server tests in ~seconds) |
| Full suite command | `pnpm -r test` from repo root (runs server + web test suites) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SESS-01 | applyEvent reducer exhaustively covers every event type (success criterion #4) | unit | `cd server && pnpm test -- reducer.test.ts` | ❌ Wave 0 (reducer.ts does not exist yet) |
| SESS-01 | SessionManager.applyEvent persists-then-broadcasts; state survives plugin restart | integration | `cd server && pnpm test -- manager.resume.test.ts` | ❌ Wave 0 (new test file) |
| SESS-01 | startReview disk-load path returns the persisted session when in-memory Map is empty | integration | `cd server && pnpm test -- manager.resume.test.ts::disk-load` | ❌ Wave 0 |
| SESS-01 | Per-session monotonic lastEventId increments on each applyEvent and persists | unit | `cd server && pnpm test -- manager.test.ts::monotonic-event-id` | ❌ Wave 0 (new test case in existing file) |
| SESS-01 | Legacy Phase-1 state.json (no lastEventId) loads cleanly with lastEventId=0 | unit | `cd server && pnpm test -- manager.resume.test.ts::legacy-load` | ❌ Wave 0 |
| SESS-02 | fetchCurrentHeadSha returns divergent SHA → staleDiff populated on loaded session | integration | `cd server && pnpm test -- manager.stale-sha.test.ts` | ❌ Wave 0 |
| SESS-02 | POST /api/session/choose-resume {choice: adopt} runs new ingest + session.adoptNewDiff event | integration | `cd server && pnpm test -- session-resume.route.test.ts::adopt` | ❌ Wave 0 |
| SESS-02 | POST /api/session/choose-resume {choice: reset} deletes state.json + re-ingests | integration | `cd server && pnpm test -- session-resume.route.test.ts::reset` | ❌ Wave 0 |
| SESS-02 | POST /api/session/choose-resume {choice: viewBoth} sets viewBothMode flag | integration | `cd server && pnpm test -- session-resume.route.test.ts::viewBoth` | ❌ Wave 0 |
| SESS-02 | UI renders StaleDiffModal when session.staleDiff is present | unit (web) | `cd web && pnpm test -- StaleDiffModal.test.tsx` | ❌ Wave 0 |
| SESS-02 | fetchCurrentHeadSha error surfaces as session.error, NOT as false staleDiff signal | unit | `cd server && pnpm test -- manager.stale-sha.test.ts::fail-closed` | ❌ Wave 0 |
| SESS-03 | kill -9 child process mid-writeState leaves state.json either pristine-old or pristine-new (never truncated) | integration | `cd server && pnpm test -- store.crash.test.ts` | ❌ Wave 0 (see Code Example "Crash-interrupt test") |
| SESS-03 | Concurrent writeState calls from two threads serialize cleanly (proper-lockfile semantics) | unit | `cd server && pnpm test -- store.concurrency.test.ts` | ❌ Wave 0 |
| SESS-03 | Stale-lockfile recovery (pre-existing lock dir with old mtime gets broken by new process) | integration | `cd server && pnpm test -- store.stale-lock.test.ts` | ❌ Wave 0 |
| SESS-01+SESS-02+SESS-03 | Per-prKey serialization queue prevents event-ordering skew (Pitfall D) | unit | `cd server && pnpm test -- manager.test.ts::concurrent-apply-event` | ❌ Wave 0 |
| All | SSE `event: update` fires after each applyEvent with monotonic `id:` | integration | `cd server && pnpm test -- events.route.test.ts::update-push` | ❌ Wave 0 |
| All | SSE reconnect with Last-Event-ID replays from snapshot (Phase 2 always replays full snapshot) | integration | `cd server && pnpm test -- events.route.test.ts::last-event-id` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd server && pnpm test -- <relevant-test-file>.ts` (seconds; ~10 tests per file)
- **Per wave merge:** `pnpm -r test` (full server + web suite; ~20 seconds with current Phase-1 154-test baseline; Phase 2 will add ~30-40 more)
- **Phase gate:** Full suite green + `scripts/security-probes.sh` still passes (Phase 2 adds no new HTTP surfaces that change security posture, but the new POST route MUST be covered by the token-validation test suite) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `server/src/session/reducer.ts` — NEW file, pure applyEvent function
- [ ] `server/src/session/reducer.test.ts` — NEW file, exhaustive reducer coverage
- [ ] `server/src/session/events.ts` — NEW file, SessionEvent discriminated union type (or co-locate in shared/types.ts)
- [ ] `server/src/session/bus.ts` — NEW file, tiny typed EventEmitter wrapper
- [ ] `server/src/session/__tests__/manager.resume.test.ts` — NEW, exercises startReview disk-load + fetchCurrentHeadSha integration
- [ ] `server/src/session/__tests__/manager.stale-sha.test.ts` — NEW, SESS-02 staleDiff detection
- [ ] `server/src/persist/__tests__/store.crash.test.ts` — NEW, SIGKILL during writeState
- [ ] `server/src/persist/__tests__/crash-fixture.ts` — NEW, child-process fixture for crash test
- [ ] `server/src/persist/__tests__/store.concurrency.test.ts` — NEW, concurrent writeState serialization
- [ ] `server/src/persist/__tests__/store.stale-lock.test.ts` — NEW, stale-lockfile recovery
- [ ] `server/src/http/routes/session-resume.ts` — NEW, POST /api/session/choose-resume handler
- [ ] `server/src/http/routes/__tests__/session-resume.route.test.ts` — NEW, three-choice routing
- [ ] `server/src/http/routes/__tests__/events.route.test.ts` — NEW (or extend existing), update-push + Last-Event-ID replay
- [ ] `web/src/components/StaleDiffModal.tsx` — NEW, modal component
- [ ] `web/src/components/__tests__/StaleDiffModal.test.tsx` — NEW, three-button rendering + choice callback
- [ ] Modifications to `shared/types.ts`, `server/src/session/manager.ts`, `server/src/persist/store.ts`, `server/src/http/routes/events.ts`, `web/src/store.ts`, `web/src/api.ts` — existing files, tests likely need extension rather than net-new files

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no identity introduction in Phase 2) | — |
| V3 Session Management | yes (Phase 2 extends the per-launch session token semantics that Phase 1 shipped) | Reuse Phase 1's `tokenValidate` middleware on the new POST `/api/session/choose-resume` route — double-submit cookie + header. No new auth surface. |
| V4 Access Control | yes | The new POST route must validate `prKey` refers to a session this token launched — Phase 1 middleware already scopes the token per-launch, so any in-memory session under this process's `SessionManager` is fair game. |
| V5 Input Validation | yes | zod schema for `{ choice: 'adopt' \| 'reset' \| 'viewBoth' }` on the new POST body. Rejects any other value with 400. |
| V6 Cryptography | no (no new tokens, no new hashing) | — |
| V7 Error Handling | yes | `fetchCurrentHeadSha` errors MUST fail closed per Pitfall F — don't silently default to "stale". |

### Known Threat Patterns for {node + hono + atomic JSON}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via prKey into state.json | Tampering | Already mitigated: `prKey.replace(/[/#:\\]/g, '_')` in `persist/paths.ts` (Phase 1 T-07). Any new code Phase 2 writes that takes a prKey from a request MUST route through `stateFilePath()` rather than concatenating paths directly. |
| Symlink race on state.json | Tampering | `write-file-atomic` handles the temp-file write on the target directory, not through user-supplied paths. Phase 2's new routes don't take filesystem paths from user input. |
| CSRF on new POST `/api/session/choose-resume` | Tampering | Token double-submit (X-Review-Token header + cookie) via existing `tokenValidate` middleware. |
| Request body JSON bombs / prototype pollution | Tampering | zod schema with strict `.object({ choice: z.enum([...]) }).strict()`. |
| TOCTOU between head-SHA check and new-diff ingest | Tampering (race) | Between `fetchCurrentHeadSha` and the adoptNewDiff ingest, a push could move HEAD again. Accept: we show the user what we had when they chose; next resume will detect the new delta. Document, don't try to atomic-clamp. |
| Disclosure via error messages | Information Disclosure | Existing Phase-1 logger practice: `logger.warn('persist write failed', err)` — internal error details to stderr, not to HTTP response bodies. Continue. |

## Sources

### Primary (HIGH confidence)

- [write-file-atomic on GitHub](https://github.com/npm/write-file-atomic) — Temp-file + fsync + rename internals, fsync default is `true`. Checked 2026-04-19.
- [write-file-atomic on npm](https://www.npmjs.com/package/write-file-atomic) — Version 7.0.1 confirmed via `npm view`.
- [proper-lockfile on GitHub](https://github.com/moxystudio/node-proper-lockfile) — `mkdir`-based cross-process locking, stale detection via mtime refresh, `onCompromised` callback.
- [Apple APFS Guide — Features](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/APFS_Guide/Features/Features.html) — Atomic Safe-Save, redirect-on-write metadata, atomic rename.
- [Hono streamSSE documentation](https://hono.dev/docs/helpers/streaming) — `writeSSE({ event, data, id })`, `stream.onAbort`, keep-alive pattern.
- [MDN — Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) — Last-Event-ID reconnect semantics.
- [ARCHITECTURE.md Pattern 1 (in-repo)](/Users/connorbarr/dev/personal/git-review-plugin/.planning/research/ARCHITECTURE.md) — canonical event-sourced reducer shape for this project.
- [PITFALLS.md Pitfalls 8, 9 (in-repo)](/Users/connorbarr/dev/personal/git-review-plugin/.planning/research/PITFALLS.md) — BLOCKER-severity pitfalls this phase must close.
- [Phase 1 PROJECT.md Key Decisions D-01, D-04 (in-repo)](/Users/connorbarr/dev/personal/git-review-plugin/.planning/PROJECT.md) — Locks SSE+POST and atomic-JSON decisions.
- [Phase 1 CONTEXT.md (in-repo)](/Users/connorbarr/dev/personal/git-review-plugin/.planning/phases/01-plugin-skeleton-secure-vertical-slice/01-CONTEXT.md) — D-01 through D-24 inherited constraints.
- [Phase 1 server/src/persist/store.ts (in-repo)](/Users/connorbarr/dev/personal/git-review-plugin/server/src/persist/store.ts) — existing writeState/readState — Phase 2 extends, doesn't replace.

### Secondary (MEDIUM confidence)

- [Crash-Safe JSON at scale — dev.to article](https://dev.to/constanta/crash-safe-json-at-scale-atomic-writes-recovery-without-a-db-3aic) — Atomic write recovery patterns (Python-centric but principles translate); rolling backup idea NOT adopted but informs thinking.
- [write-file-atomic issue #16 (2015) — crash mid-write corruption scenario](https://github.com/npm/write-file-atomic/issues/16) — Original issue driving the temp+rename design.
- [write-file-atomic issue #64 — Rename atomicity is not enough](https://github.com/npm/write-file-atomic/issues/64) — Parent-directory fsync acknowledged but not implemented; informs Pitfall B.
- [Azure Architecture Center — Event Sourcing Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing) — General pattern reference; Phase 2 picks snapshot-only, not event-log, per reasoning in "Alternatives Considered".
- Phase 1 `01-02-SUMMARY.md` decision log for proper-lockfile pre-touch constraint (target file must exist before locking).
- Phase 1 `01-07-SUMMARY.md` decision log for spawn-not-execa-in-vitest (drives the crash-interrupt test harness design).

### Tertiary (LOW confidence)

- WebSearch 2026-04 — Vitest SIGINT/SIGKILL test patterns — no single authoritative result; synthesized from Phase 1's existing `lifecycle.test.ts` pattern which already demonstrates the spawn+kill approach in this codebase.
- WebSearch 2026-04 — force-push detection + comment rebase — surveyed but Phase 2 doesn't implement the rebase side yet (drafts land in Phase 5). Flagged as Assumption A2 for later.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already shipped in Phase 1, versions verified against npm registry 2026-04-19.
- Architecture (event-sourced reducer, applyEvent orchestration, persist-then-broadcast): HIGH — ARCHITECTURE.md Pattern 1 is this project's explicit design intent; Phase 1 D-04 locks the persistence substrate.
- Stale-diff UX: MEDIUM — the three choices are prescribed by SESS-02; the exact button labels and modal UX are planner/discuss-phase territory; the event-naming and server contract are locked in this research.
- Crash-interrupt test technique: MEDIUM — the pattern (spawn + SIGKILL + parse) is ecosystem-standard but there's no single authoritative blog post; the Phase 1 `lifecycle.test.ts` precedent in this codebase is the strongest local signal.
- Last-Event-ID / SSE resume: HIGH on spec semantics (MDN is authoritative), MEDIUM on Hono-specific read of the header (not explicitly in Hono docs but `c.req.header('Last-Event-ID')` is standard Hono API for reading any request header).
- Security (V5 zod validation + V3 token double-submit): HIGH — reuses exact Phase 1 middleware chain; no new attack surface.

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (30 days — the persistence substrate is stable; library versions unlikely to matter-for-correctness-shift in under a month; re-verify proper-lockfile / write-file-atomic versions if the planner needs to bump anything).
