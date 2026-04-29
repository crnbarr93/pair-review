# Milestones

## v1.0 MVP (Shipped: 2026-04-29)

**Phases completed:** 10 phases, 51 plans, 95 tasks

**Key accomplishments:**

- One-liner:
- One-liner:
- One-liner:
- One-liner:
- React 19 SPA with Vite 8 + Tailwind 4 @theme tokens, token-adopt bootstrap (T-03 ordering), useSyncExternalStore state machine, and chrome components (AppShell/Header/Footer/SessionStatusPill) — all per UI-SPEC, 22 tests green
- 4-state diff canvas with @git-diff-view/react@0.1.3 wiring verified by spike — LoadingState skeleton, EmptyState with UI-SPEC copy, ErrorState with 2 variants and no retry button, DiffView wrapping the confirmed named-export DiffView component; App.tsx replaced with real 4-phase router; 37 tests green, build exits 0
- One-liner:
- Event-sourced reducer contract layer: SessionEvent union, pure applyEvent reducer with exhaustive never-guard, and typed SessionBus EventEmitter wrapper ready for Plans 02/03/04 to consume.
- writeState is now proven crash-safe, serialization-correct, and stale-lock-recoverable — with zero behavior drift on any existing caller.
- The contracts from Plan 01 and the persistence proofs from Plan 02 become live behavior: every session mutation now flows through `applyEvent` → disk → memory → bus → SSE client, in that order, serialized per prKey.
- The browser half of SESS-02 shipped: SSE `event: update` round-trips to the store, `chooseResume` POST honors the double-submit token contract, and the three-button "PR updated" modal renders when the server reports a stale head SHA — all while preserving the in-progress UI-redesign mockup on App.tsx.
- Cross-cutting type, reducer, Shiki theme, test-mock, and decision-record foundations for the Phase 3 diff UI — no downstream plan can start until these land.
- Populates the Phase 3 INGEST adapter surface on the server side — generated-file detection wired into parse, plus fetchExistingComments + resolveCommentAnchor + fetchCIChecks exported from github.ts with correct field names and exit-code-8 handling.
- Wires Plan 03-02a's ingest adapters into the session manager (`startReview` fires `existingComments.loaded` + `ciChecks.loaded` for GitHub sessions), opens the client-side event channel via `POST /api/session/events` (zod-restricted to the two user-triggered SessionEvent variants, behind the existing Phase-1 X-Review-Token CSRF gate), and lands the canonical fixture-capture generator alongside documentation updates for the committed fixtures.
- Live multi-file DiffViewer consuming DiffModel + ShikiFileTokens + ReadOnlyComment[] with Shiki-safe innerHTML, unified+split modes (real pair-emission, not stub), generated-file collapse, and read-only comment markers — Open Decision 1 operationally validated at ~20ms first paint on the 32-hunk fixture.
- Replaces `data.ts` fixture imports in FileExplorer, TopBar, and the web store/api modules with live Phase-2-store data — landing the three remaining UI surfaces Plan 03-03 (DiffViewer) does not touch. Plan 03-05 assembles them into the AppShell with keyboard + IntersectionObserver plumbing.
- Final Phase-3 AppShell: App.tsx rewritten to a 2-column TopBar-over-(FileExplorer | DiffViewer) layout with a single global keydown listener (PLUG-04), an IntersectionObserver for auto-untouched→in-progress transitions (D-11), bottom-center toast + bottom-right footer hint, and three `postSessionEvent` call sites — each reading `state.prKey` directly with an explicit `if (!prKey) return;` guard (T-3-13). `web/src/data.ts` deleted as the terminal act of Phase 3.
- 24-item criticality-ranked TypeScript const across 5 categories (correctness, security, tests, performance, style) with zero I/O -- ready for run_self_review tool interpolation
- Phase 5 type contracts defined with 6 new SessionEvent variants, extended reducer with walkthrough/thread case branches, and shared resolve-ids.ts utility for downstream MCP tools
- set_walkthrough validates hunk arrays against session diff and emits walkthrough.set; reply_in_thread routes new vs existing threads with context-line preExisting gate and server-generated nanoid threadIds
- draft_comment and resolve_thread MCP tools with threadId validation, all 9 Phase 5 MCP tools registered in server.ts, and session-events.ts extended with browser walkthrough navigation events
- Walkthrough/thread state flows into React store with draftBody-overwrite protection; WalkthroughBanner and WalkthroughStepList components render LLM narrative safely as text nodes
- ThreadCard
- One-liner:
- Task 1 — Phase 6 Types (shared/types.ts)
- Octokit-based GitHub review submission engine with Anchor adapter (line+side only), paginated pending-review detection, path-traversal-safe markdown export, and 33 passing unit tests.
- submit_review MCP tool (10th tool) proposes reviews for browser confirmation, /api/confirm-submit handler executes GitHub or local submission with full submission state transitions and idempotency gate.
- Complete submit flow UI: SubmitModal with verdict picker, signal-ratio stats, D-03 retype gate, and threads list; PendingReviewModal for session-start adopt/clear; TopBar Submit button replacing stubs; v/s keyboard shortcuts wired.
- Phase 06.1 type contracts, 5 new reducer branches, and the in-memory SessionRequestQueue that powers the await_user_request long-poll mechanism — all TypeScript-clean with 491 tests passing
- Long-poll `await_user_request` + `respond_chat` MCP tools, POST /api/user-request route, and RequestQueueManager wiring through HTTP and MCP layers complete the browser-to-LLM reverse channel
- Collapsible ChatPanel component wired to postUserRequest API helper, 6 new store actions, and SSE routing for all 5 bidirectional events — delivering the user-facing chat surface for LLM collaboration
- Gutter + icon on diff line hover opens InlineComposer with @claude detection chip, dynamic button label (Add comment / Ask Claude), and two-path submit via postUserRequest; 7 unit tests validate D-12 and D-13.
- One-liner:
- One-liner:
- One-liner:
- ThreadCard (D-06, D-07, D-08):
- Pixel-matched walkthrough step cards with VIEWING badge and Ask button, findings cards with dual severity+category badges and validity dimming, and SubmissionPanel recap table with CI status and Claude verdict card
- Full wiring of Phase 06.3 design: gutter finding markers, severity line tints, walkthrough hunk highlight, finding validity toggle with collapse-to-dismissed, WalkthroughStepBanner above diff, and complete CSS for all new component classes
- Green test baseline restored (5 stale assertions fixed), AuthIdentity type + fail-open fetchAuthIdentity module created, Pitfalls 8/9/16 automated with 4 integration tests — 532 total tests passing
- GitHub auth identity wired end-to-end: fetchAuthIdentity runs parallel with ingest, CSP allows avatar images, TopBar badge shows avatar + username with token-mismatch warning
- 533 server tests passing (0 failures), web build green, all automated pitfall evidence confirmed — Phase 7 verification complete

---
