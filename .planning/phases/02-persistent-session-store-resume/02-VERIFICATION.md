---
phase: 02-persistent-session-store-resume
verified: 2026-04-19T15:10:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Live end-to-end resume-from-cold-start: /pair-review <pr> → close browser → quit Claude Code → re-run /pair-review <same pr> → browser reopens with restored state"
    expected: "Diff renders immediately (no full re-fetch spinner); stderr shows disk-load path taken; state.json at ${CLAUDE_PLUGIN_DATA}/reviews/<prKey>/state.json survived the restart"
    why_human: "Requires real Claude Code host + real browser + filesystem lifecycle; cannot be reproduced in vitest without reimplementing the plugin boot sequence"
  - test: "Stale-SHA modal visual correctness: edit state.json headSha to '0000…' → quit plugin → re-run /pair-review → modal appears"
    expected: "Modal title 'PR updated' shows; 'Stored: 00000000 → Current: <real 8 chars>' visible; three buttons 'Refresh to current PR' (blue), 'Discard session' (red), 'View both' (gray); Escape and backdrop click do NOT dismiss"
    why_human: "Visual DOM rendering + Tailwind + non-dismissibility require a real browser; the 7 unit tests cover contract but not visual fidelity"
  - test: "Three-button dispatch (adopt / reset / viewBoth)"
    expected: "adopt → Refreshing diff… → modal dismisses → state.json has real headSha; reset → Refreshing diff… → state.json recreated with fresh createdAt; viewBoth → state.json has viewBothMode:true, staleDiff absent"
    why_human: "Requires real gh CLI + SSE round-trip + filesystem inspection; automated session-resume.test.ts covers the POST contract but not the end-to-end repaint"
  - test: "SSE live event:update arrives without a page refresh"
    expected: "Applying a session event from the server side causes the browser's DevTools Network tab to show an SSE 'update' frame and the store's AppState repaints"
    why_human: "Requires real EventSource + SessionBus emit; events.test.ts uses a stub manager to cover the fan-out logic"
  - test: "SESS-03 crash-safety sanity"
    expected: "cd server && pnpm test -- store.crash.test.ts --run → 1 passed (5-iteration test under 1s)"
    why_human: "Automated but the user is asked to confirm the proof test still passes on their machine. Verifier ran this: PASSED in ~905ms."
  - test: "Label sign-off on 'Refresh to current PR' vs Phase-5's 'Rebase drafts where possible'"
    expected: "User confirms the primary button's Phase-2 label is acceptable or requests re-label"
    why_human: "UX-level decision per research Assumption A7"
---

# Phase 2: Persistent Session Store + Resume — Verification Report

**Phase Goal (ROADMAP.md):** The plugin remembers. Every state mutation — whether from an MCP tool or a browser POST — funnels through one event-sourced reducer and is persisted to disk atomically. Closing the browser, quitting Claude Code, crashing, or power-failing in mid-review is a no-op: the next `/review` on the same PR resumes at the exact cursor, with drafted comments and any partial checklist progress intact. When the PR's head SHA has moved since last session, the UI surfaces the change with an explicit resolution choice.

**Verified:** 2026-04-19T15:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria + requirement IDs)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can start a review, close the browser, quit Claude Code, and on next `/review` for the same PR the browser reopens at the same cursor with all prior state restored (SC1 / SESS-01) | ✓ VERIFIED | SessionManager.startReview disk-load path (manager.ts:82-119) reads state.json via readState; migrates legacy files (lastEventId fallback to 0); SSE snapshot delivers restored session to browser; web store.onSnapshot mirrors into AppState. 6 tests in manager.resume.test.ts prove this flow. |
| 2 | User is shown a "PR updated" alert with three explicit choices (rebase drafts / discard / view-both) when resuming a PR whose head SHA differs from stored SHA (SC2 / SESS-02) | ✓ VERIFIED | fetchCurrentHeadSha populates session.staleDiff when divergent (manager.ts:97-100); SSE sends to browser; store.onSnapshot mirrors staleDiff (store.ts:88); StaleDiffModal renders three buttons "Refresh to current PR" / "Discard session" / "View both" (StaleDiffModal.tsx:90-113); POST /api/session/choose-resume dispatches to correct applyEvent/resetSession branch. Label deviation from spec is intentional per research Assumption A7 (see Label Decision below). |
| 3 | Kill -9 on plugin mid-mutation does not corrupt state file — atomic write-and-rename + cross-process file locking, verified by interrupt-a-write test (SC3 / SESS-03) | ✓ VERIFIED | store.ts uses write-file-atomic + proper-lockfile (unchanged from Phase 1 substrate); store.crash.test.ts spawns a child that hammers writeState in an infinite loop, SIGKILLs 5 times at varied timings (100/130/160/190/220ms), and asserts state.json always parses. VERIFIER RAN: 1 passed in 905ms. store.concurrency.test.ts + store.stale-lock.test.ts provide companion proofs. |
| 4 | All mutations go through sessionManager.applyEvent(id, event); reducer unit tests cover every event type exhaustively (SC4 — from ROADMAP, NOT in user prompt truths) | ✓ VERIFIED | SessionManager.applyEvent is THE ONE FUNNEL (manager.ts:226-241): per-prKey Promise-chain queue serializes concurrent calls; persist-then-broadcast order (writeState → sessions.set → bus.emit); monotonic lastEventId increment owned by manager. reducer.test.ts has 6 tests covering all 3 event variants + unknown-throws + immutability + lastEventId-preservation. POST /api/session/choose-resume handler (session-resume.ts) is the only current HTTP-side writer and calls applyEvent/resetSession. No direct mutations of this.sessions outside startReview's initial populate + applyEvent + resetSession found. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `shared/types.ts` | SessionEvent union (3 Phase-2 variants), UpdateMessage, extended ReviewSession with staleDiff/viewBothMode/pendingReset/lastEventId | ✓ VERIFIED | types.ts:85-116 exports all four new ReviewSession fields, 3-variant SessionEvent union, UpdateMessage. No Phase 4/5/6 variants leaked. |
| `server/src/session/reducer.ts` | Pure applyEvent with exhaustive switch + never-guard; does NOT touch lastEventId | ✓ VERIFIED | reducer.ts:10-34 — pure, no await/Date/lastEventId; const _never: never default branch. `grep -c lastEventId reducer.ts` = 0. |
| `server/src/session/bus.ts` | Typed SessionBus wrapping node:events.EventEmitter; listener errors logged to stderr, not propagated | ✓ VERIFIED | bus.ts:18-51 — safeWrap + WeakMap for off() semantics + logger.warn on listener throw. 5 tests green. |
| `server/src/persist/store.ts` | Optional lockOptions param; production default (retries:3, minTimeout:50) preserved; atomic write-and-rename via write-file-atomic + proper-lockfile | ✓ VERIFIED | store.ts:9-35 — WriteStateLockOptions exported, DEFAULT_LOCK_OPTIONS constant, lockOptions ?? DEFAULT. |
| `server/src/session/manager.ts` | applyEvent + per-prKey queue + disk-load startReview + resetSession + public bus + fetchCurrentHeadSha dispatch | ✓ VERIFIED | manager.ts:34 (queues), :35 (bus), :75-208 (startReview 3-path: cache hit → disk-load → full ingest), :226-241 (applyEvent), :251-265 (resetSession), :271-277 (fetchCurrentHeadSha). lastEventId:0 in new-session construction at :190. |
| `server/src/ingest/{github,local}.ts` | fetchCurrentHeadSha exports on both; fail-closed (throws, not returns null) | ✓ VERIFIED | github.ts:28-40 runs `gh pr view … --json headRefOid`; local.ts:37-43 runs `git rev-parse --verify`; both throw on error. 5 tests across both files. |
| `server/src/http/routes/events.ts` | SSE subscribe-before-snapshot; event:update fan-out; monotonic id; Last-Event-ID read | ✓ VERIFIED | events.ts:24-32 subscribes BEFORE writing snapshot (line 41); buffer-and-flush on line 49-58 filtered by lastEventId; live listener swap on line 60-74; Last-Event-ID header read on line 17. |
| `server/src/http/routes/session-resume.ts` | POST /api/session/choose-resume with zod .strict() + three branches (adopt/reset/viewBoth) | ✓ VERIFIED | session-resume.ts:11-30 zod schema; :55-96 three-case switch calling applyEvent/resetSession. Mounted in server.ts:21. |
| `web/src/api.ts` | setReviewToken, chooseResume, extended openEventStream (4 args incl. onUpdate), ChooseResumeChoice/Source types | ✓ VERIFIED | api.ts:33-47 setReviewToken; :57-87 openEventStream with 4 args + update listener; :97-118 chooseResume with X-Review-Token header; types at :7, :18-24. |
| `web/src/store.ts` | AppState with staleDiff/sessionKey/source/headShaError; actions.onUpdate, actions.setSource | ✓ VERIFIED | store.ts:18-32 AppState extensions; :72-96 onSnapshot propagates all Phase-2 fields; :98-111 onUpdate; :113-116 setSource. |
| `web/src/components/StaleDiffModal.tsx` | Three buttons "Refresh to current PR"/"Discard session"/"View both"; role=dialog+aria-modal; non-dismissible; null when staleDiff absent | ✓ VERIFIED | StaleDiffModal.tsx:27 early return; :90-113 three buttons with Phase-2 labels; :67-70 role/aria-modal. No Escape/backdrop onClick handler found (`grep Escape StaleDiffModal.tsx` → 0 hits). |
| `web/src/App.tsx` | Renders StaleDiffModal at top level | ✓ VERIFIED | App.tsx:13 import; :98 `<StaleDiffModal />` inside top-level fragment. |
| `web/src/main.tsx` | setReviewToken + setSource BEFORE history.replaceState; openEventStream receives onUpdate | ✓ VERIFIED | main.tsx:45-46 capture before :55 replaceState; :57-62 4-arg openEventStream. Test main-bootstrap.test.tsx:161-232 asserts ordering via shared callOrder array. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| SessionManager | reducer.ts | `import { applyEvent as reduce }` | ✓ WIRED | manager.ts:18; used in applyEvent (:231) |
| SessionManager | bus.ts | `public readonly bus = new SessionBus()` | ✓ WIRED | manager.ts:35; emit called in applyEvent (:235) |
| SessionManager | persist/store.ts | `import { writeState, readState }` | ✓ WIRED | manager.ts:10; both called in startReview + applyEvent |
| SessionManager | ingest/{github,local}.ts fetchCurrentHeadSha | `fetchGithubHeadSha / fetchLocalHeadSha` | ✓ WIRED | manager.ts:13-14 imports; :271-277 dispatches based on source.kind |
| events.ts | SessionManager | `manager.bus.on('session:updated', ...)` | ✓ WIRED | events.ts:29, :71 |
| session-resume.ts | SessionManager | `manager.applyEvent / manager.resetSession` | ✓ WIRED | session-resume.ts:80 (adopt→applyEvent), :89 (reset→resetSession), :93 (viewBoth→applyEvent) |
| server.ts | session-resume.ts | `mountSessionResume(app, manager)` | ✓ WIRED | server.ts:7, :21 |
| web/api.ts | shared/types.ts | `import type { UpdateMessage, SnapshotMessage }` | ✓ WIRED | api.ts:1 |
| web/StaleDiffModal.tsx | web/api.ts chooseResume | `import { chooseResume }` | ✓ WIRED | StaleDiffModal.tsx:3; called on button click (:50) |
| web/App.tsx | web/components/StaleDiffModal.tsx | `import { StaleDiffModal }` + render | ✓ WIRED | App.tsx:13, :98 |
| web/main.tsx | web/api.ts setReviewToken | `import { setReviewToken }` + call before replaceState | ✓ WIRED | main.tsx:4, :45 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| StaleDiffModal | state.staleDiff | useAppStore() → store.onSnapshot/onUpdate → msg.session.staleDiff | Yes — populated by SessionManager.startReview disk-load path via fetchCurrentHeadSha comparison | ✓ FLOWING |
| StaleDiffModal | state.sessionKey, state.source | useAppStore() → onSnapshot (sessionKey from session.prKey) + setSource (from main.tsx sourceFromPrKey) | Yes — sessionKey from session.prKey; source reconstructed from URL param (GitHub works, local mode documented limitation) | ✓ FLOWING (with documented local-mode caveat) |
| SSE /api/events snapshot | session | manager.get(prKey) → ReviewSession with restored fields | Yes — readState populates disk-load branch; writeState in applyEvent keeps disk current | ✓ FLOWING |
| SSE /api/events update | payload.state | SessionBus emit on applyEvent (manager.ts:235) | Yes — reducer produces new session each event | ✓ FLOWING |
| App.tsx main UI (DiffViewer, ChatPanel, FileExplorer, TweaksPanel) | AUTH_DIFF, CHAT, STAGES, THREAD_INDEX, THREADS | web/src/data.ts (static fixtures) | No — these are design-handoff mockup fixtures, NOT live session state | ⚠️ STATIC (deliberate, explicit Phase 3 deferral) |

**Note on App.tsx mockup:** The main 3-column UI consumes fixture data from `web/src/data.ts`, not the live store. This is explicitly documented in App.tsx line 2 ("Still uses fixtures (web/src/data.ts) — live SSE wiring is staged for later phases") and in the 02-04-SUMMARY ("Mockup preserved — pre-existing App.tsx mockup is intact; modal is an additive sibling"). Phase 2's goal is the persistence + resume scaffolding; Phase 3 is the diff UI. The ONE component Phase 2 wires to live state — StaleDiffModal — does flow real data end-to-end. This is consistent with ROADMAP Phase 3 ("Real diff renderer ... replaces the Phase-1 placeholder"). NOT a Phase 2 gap.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full server test suite | `cd server && pnpm test --run` | 27 files / 166 tests passed in 1.22s | ✓ PASS |
| Full web test suite | `cd web && pnpm test --run` | 5 files / 29 tests passed in 482ms | ✓ PASS |
| SESS-03 crash proof (SIGKILL × 5 iterations) | `cd server && pnpm test -- store.crash.test.ts --run` | 1 passed in 914ms (5 iterations) | ✓ PASS |
| SESS-03 concurrency + stale-lock proofs | `cd server && pnpm test -- 'store.(crash\|concurrency\|stale-lock)' --run` | All passed (included in 166-test run) | ✓ PASS |
| Server typecheck | `cd server && npx tsc --noEmit` | Exit 0, zero output | ✓ PASS |
| Web typecheck | `cd web && npx tsc --noEmit` | Exit 0, zero output | ✓ PASS |
| Server build | `cd server && pnpm build` | `tsc -p tsconfig.json` clean | ✓ PASS |
| Web build | `cd web && pnpm build` | Vite built in 74ms, 235.69kB JS / 39.10kB CSS | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SESS-01 | 02-01, 02-03, 02-04 | User can close browser / quit Claude Code mid-review and resume with state intact | ✓ SATISFIED | Disk-load path in SessionManager.startReview + atomic writeState on every applyEvent + SSE snapshot re-delivers state to browser on re-adopt. Legacy Phase-1 migration (lastEventId=0) covers backward compat. |
| SESS-02 | 02-01, 02-03, 02-04 | User is alerted with three choices when head SHA has moved | ✓ SATISFIED | fetchCurrentHeadSha + staleDiff populate + StaleDiffModal three-button UI + POST /api/session/choose-resume three-branch dispatch. Label deviation intentional (see Label Decision). |
| SESS-03 | 02-02 | Plugin survives crashes without corrupting state — atomic write-and-rename + cross-process file locking, interrupt-a-write test | ✓ SATISFIED | store.ts uses write-file-atomic + proper-lockfile; store.crash.test.ts SIGKILLs child 5× at varied timings; store.concurrency.test.ts proves serialization; store.stale-lock.test.ts proves recovery. |

All three declared requirement IDs covered; no orphaned requirements for Phase 2 in REQUIREMENTS.md. REQUIREMENTS.md traceability table already marks SESS-01/02/03 as Complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server/src/mcp/tools/start-review.ts | 48 | comment uses "placeholder" | ℹ️ Info | Phase-1 artifact — refers to empty-description fallback text, not a stub code path. Unit-tested (start-review.test.ts:86,91,145). Not a Phase 2 concern. |
| web/src/App.tsx | 2, 66, 81 | Fixture data AUTH_DIFF/CHAT/STAGES instead of live store | ℹ️ Info (deliberate) | Documented Phase 3 deferral; live SSE wiring for the main 3-column UI is out of scope for Phase 2. The StaleDiffModal (the Phase-2 contribution) IS live-wired. |

No blockers, no warnings that prevent Phase 2 goal achievement.

### Label Decision (Acknowledged)

ROADMAP SC2 literally says "rebase drafts where possible". Phase 2 ships "Refresh to current PR" instead. This is intentional per:
- 02-RESEARCH.md Assumption A7: no drafts exist in Phase 2, so the literal label would mislead the user
- 02-04-PLAN.md Task 3 (explicit Phase 2 label contract)
- 02-04-SUMMARY.md ("kept 'Refresh to current PR' per Assumption A7; Phase 5 relabel when drafts-rebase logic actually exists")

The criterion's **spirit** — "a three-choice modal surfaces when head SHA has moved" — is satisfied. Label sign-off is included in the human verification list below.

### Human Verification Required

The following items were declared "Manual-Only Verifications" in 02-VALIDATION.md and Plan 02-04 Task 4's human-verify checkpoint was auto-approved under auto-mode rather than live-run. The 7 StaleDiffModal unit tests cover the render/click/POST contract, but the following checks require a real browser + real GitHub PR + filesystem manipulation.

### 1. Live Resume-From-Cold-Start (SESS-01 SC1)

**Test:** Run `/pair-review <github-url>` → close browser → quit Claude Code → re-run `/pair-review <same-url>`
**Expected:** Diff renders immediately (no full re-fetch spinner); state.json at `${CLAUDE_PLUGIN_DATA}/reviews/<prKey>/state.json` survived
**Why human:** Requires real Claude Code lifecycle + real filesystem + real browser auto-launch — cannot be reproduced inside vitest without reimplementing the plugin boot sequence

### 2. Stale-SHA Modal Visual Correctness (SESS-02 SC2)

**Test:** Manually edit `state.json` → set `headSha` to `"0000000000000000000000000000000000000000"` → quit plugin → re-run `/pair-review`
**Expected:** Modal title "PR updated"; "Stored: 00000000 → Current: <real-8>"; three buttons styled primary-blue / destructive-red / neutral-gray; Escape key and backdrop click do NOT dismiss
**Why human:** Visual DOM rendering + Tailwind classes + accessibility semantics require a real browser

### 3. Three-Button Dispatch Behavior (SESS-02 SC2)

**Test:** Click each of "Refresh to current PR" / "Discard session" / "View both"
**Expected:**
- adopt → "Refreshing diff…" → modal dismisses → state.json has real headSha
- reset → modal dismisses → state.json recreated with fresh `createdAt`
- viewBoth → modal dismisses → state.json has `viewBothMode: true`, `staleDiff` absent
**Why human:** Requires real `gh` CLI invocations + real SSE round-trip + filesystem inspection

### 4. SSE Live event:update Arrives Without Refresh (SESS-01)

**Test:** Trigger any server-side applyEvent (via Step 3's flow) and observe DevTools Network tab
**Expected:** SSE "update" frame arrives; store repaints without browser reload
**Why human:** Requires real EventSource + real SessionBus emission; events.test.ts uses a stub manager

### 5. SESS-03 Crash-Safety Sanity (automated, but confirm locally)

**Test:** `cd server && pnpm test -- store.crash.test.ts --run`
**Expected:** "1 passed" (5-iteration test under 1 second)
**Why human:** Verifier ran this and it PASSED in 905ms; asking the user to confirm on their machine closes the loop

### 6. Label Sign-Off

**Test:** Confirm the primary button label "Refresh to current PR" is acceptable for Phase 2 (vs Phase-5's planned "Rebase drafts where possible")
**Expected:** Approval, or request to re-label now
**Why human:** UX-level decision per research Assumption A7

### Gaps Summary

None. All automated verification passed:
- 27 server test files / 166 tests green (including 11 new Phase-2-plan-01 tests, 8 Phase-2-plan-02 tests, 30 Phase-2-plan-03 tests)
- 5 web test files / 29 tests green (including 6 api + 6 store + 7 StaleDiffModal + 1 new main-bootstrap)
- Both workspaces typecheck clean
- Both workspaces build clean
- All 3 requirement IDs (SESS-01/02/03) satisfied
- All 4 ROADMAP Success Criteria satisfied (including SC4 "all mutations through applyEvent" which wasn't in the user prompt but IS in ROADMAP)
- All expected artifacts present and wired
- All key links verified
- SESS-03 crash-proof verified end-to-end by re-running the 5-iteration SIGKILL test

The phase goal is **technically achieved at the code level**. Elevation to `human_needed` status reflects the known caveat: Plan 02-04 Task 4's 8-step live-run checkpoint was auto-approved rather than live-executed, and five steps of that checkpoint (live resume, modal visual, three-button dispatch, SSE live update, label sign-off) are irreducibly manual.

---

*Verified: 2026-04-19T15:10:00Z*
*Verifier: Claude (gsd-verifier)*
