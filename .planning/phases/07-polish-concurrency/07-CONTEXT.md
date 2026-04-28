# Phase 7: Polish + Verification - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

v1 shake-out focused on daily-driver quality. Three deliverables: (1) authenticated GitHub user identity visible in the TopBar, (2) mixed automated + manual PITFALLS verification pass across the 11 checklist items from the roadmap, (3) papercut repairs surfaced during the verification pass. Multi-session concurrency (SESS-04) has been dropped from this phase and moved to backlog.

**Explicitly in scope:**
- Auth identity display in TopBar (avatar + username + mismatch warning)
- PITFALLS verification pass: automated integration tests for mechanical items, manual walkthrough for subjective items
- Fix whatever the verification pass surfaces
- Port-in-use fallback (Pitfall 16)

**Explicitly NOT in scope:**
- Multi-session concurrency / session switcher (SESS-04 → backlog)
- Phase 06.3 human-needed visual verification items (deferred to daily use)
- New features, new MCP tools, new server capabilities

</domain>

<decisions>
## Implementation Decisions

### Scope change: drop SESS-04
- **D-01:** Multi-session concurrency (SESS-04) is dropped from Phase 7 and moved to backlog. The tool works well enough with single-session usage. If the need arises in daily use, it can be added as a future phase.

### Auth identity display
- **D-02:** Show authenticated GitHub user as a TopBar avatar badge in the top-right of row 1. Format: small avatar circle + username text. Fetch identity via `gh api user` (or equivalent) at session start; cache it.
- **D-03:** On token mismatch (when `gh auth token` and `GITHUB_TOKEN` env var resolve to different GitHub users), show a warning icon on the avatar badge with a tooltip: "gh auth and GITHUB_TOKEN resolve to different users".
- **D-04:** Identity fetch is fail-open — if it fails (no network, gh not installed for local-only mode), the badge simply doesn't render. Never blocks session start.

### PITFALLS verification approach
- **D-05:** Mixed verification — automate the mechanically testable items, manually verify the subjective ones.
- **D-06:** **Automate with integration tests:**
  - Pitfall 1: Comment line correctness (`line`+`side`, never `position`) — already has anchor.test.ts; verify coverage is sufficient
  - Pitfall 6: Security headers — already has host-validate, token-validate, secure-headers tests; verify CSP completeness
  - Pitfall 8: Resume across browser close — event-sourced state survives restart
  - Pitfall 9: Resume after force-push / new commits — stale-SHA detection + resolution choices
  - Pitfall 10: Duplicate-submission guard — submissionId idempotency + pending-review detection
  - Pitfall 16: Port-in-use fallback — server retries on EADDRINUSE
- **D-07:** **Manual verification (against a real PR):**
  - Pitfall 3: Signal-ratio check — nit flood warning actually fires on a nit-heavy review
  - Pitfall 4: Self-review adversarial stance — default verdict is request_changes, not approve
  - Pitfall 5: Large-PR handling — walkthrough on a 50+ file PR doesn't choke or lose context
  - Pitfall 12: Pre-existing code guard — comments on unchanged lines are rejected unless flagged
  - Pitfall 14: Walkthrough ordering — narrative ordering covers the "core change" first
- **D-08:** Fix whatever the verification pass surfaces as broken or missing. Papercut scope is emergent, not pre-planned.

### Phase 06.3 visual gaps
- **D-09:** The 5 human-needed visual verification items from Phase 06.3 (pixel-match, validity toggle, finding click scroll, gutter marker click) are NOT formally verified in Phase 7. Fix any visual issues that surface organically during daily use.

### Claude's Discretion
- Test infrastructure choices (extend existing test files vs new dedicated verification test file)
- Port-in-use fallback implementation details (retry count, port increment vs random)
- How to fetch GitHub user identity efficiently (gh api user, gh auth status, or parse from token)
- Whether to bundle the auth identity fetch into the existing start_review flow or as a separate server endpoint

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pitfalls reference
- `.planning/research/PITFALLS.md` — All 24 pitfalls with severity, avoidance strategies, and phase assignments. The 11 items from the roadmap's Phase 7 success criteria map to Pitfalls 1, 3, 4, 5, 6, 8, 9, 10, 12, 14, 16.

### Existing test infrastructure
- `server/src/__tests__/` — Integration tests (end-to-end, lifecycle, browser-launch)
- `server/src/submit/__tests__/anchor.test.ts` — Pitfall 1 coverage (comment line correctness)
- `server/src/submit/__tests__/pending-review.test.ts` — Pitfall 10 coverage (duplicate submission)
- `server/src/http/__tests__/` — Security middleware tests (host-validate, token-validate, secure-headers)
- `server/src/persist/__tests__/` — Crash/resume tests (store.crash, store.stale-lock, store.concurrency)

### UI components to modify
- `web/src/components/TopBar.tsx` — Where the auth identity badge goes

### Session management
- `server/src/session/manager.ts` — SessionManager with `derivePrKey`, `startOrResume`, `applyEvent`
- `server/src/http/server.ts` — HTTP server setup, middleware chain

### Prior decisions (relevant)
- Phase 1 D-01: SSE + HTTP POST transport (not WebSocket)
- Phase 1 D-04: Atomic JSON persistence (not SQLite)
- Phase 6 D-09: Anchor adapter uses line+side only, never position
- Phase 6 D-10: submissionId embedded as HTML comment for idempotency
- Phase 6 D-08: Pending-review detection at session start (fail-open)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/src/submit/anchor.ts` — Anchor adapter mapping `{path, line, side}` to Octokit params (Pitfall 1)
- `server/src/submit/pending-review.ts` — Pending review detection + clear (Pitfall 10)
- `server/src/submit/octokit-submit.ts` — Review submission with submissionId idempotency (Pitfall 10)
- `server/src/persist/store.ts` — Atomic write-and-rename + file locking (Pitfall 8)
- `server/src/http/middleware/` — All three security middlewares (Pitfall 6)

### Established Patterns
- TopBar row 1 has Settings button on the right — auth badge goes next to it
- `gh` CLI interaction via `execa` throughout `server/src/ingest/github.ts` — reuse for identity fetch
- Fail-open pattern: CI checks, existing comments, pending reviews all fail-open; auth identity should too
- SSE snapshot delivery: new identity data should flow through `ReviewSession` → SSE → store

### Integration Points
- `server/src/session/manager.ts:startOrResume` — hook identity fetch here (after `derivePrKey`, before browser launch)
- `shared/types.ts:ReviewSession` — add optional `authenticatedUser` field
- `web/src/store.ts` — expose identity to components
- `web/src/components/TopBar.tsx` — render the badge

</code_context>

<specifics>
## Specific Ideas

- Auth badge: small GitHub avatar circle + username, top-right of TopBar row 1, next to Settings
- Mismatch warning: swap avatar for warning icon, tooltip explains the discrepancy
- Verification: no need for formal VERIFICATION.md ceremony — fix issues as they're found during the pass

</specifics>

<deferred>
## Deferred Ideas

- **SESS-04 (multi-session concurrency)** — Dropped from Phase 7, moved to backlog. If daily use surfaces a need for concurrent reviews, add as a future phase. The user's preferred design (if ever built): TopBar dropdown switcher with full LLM context switching via a `switch_session` request type through the user-request queue.
- **Phase 06.3 visual verification** — 5 human-needed items deferred to organic daily-use discovery rather than formal Phase 7 verification.

</deferred>

---

*Phase: 7-Polish + Verification*
*Context gathered: 2026-04-28*
