---
phase: 07-polish-concurrency
verified: 2026-04-28T10:45:00Z
status: human_needed
score: 3/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Launch a real review session against a GitHub PR and verify the TopBar shows the auth badge (20px circle avatar + username) in row 1 to the right of the spacer. Refresh the browser and confirm badge survives the reload."
    expected: "Auth badge visible with avatar and login. Badge persists after browser refresh (served from SSE snapshot)."
    why_human: "Visual correctness and real-browser rendering cannot be verified with grep or automated tests."
  - test: "Run the self-review on a real PR and confirm the default verdict presented to Claude is 'request_changes', not 'approve'. The LLM should default to requesting changes and argue down."
    expected: "Default verdict is 'Request changes'. Claude argues down from request_changes, not up from approve."
    why_human: "LLM behavior and default verdict stance depend on prompt wording and runtime behavior, not static code."
  - test: "Review a PR where nit-level findings dominate (or add > 3 nit findings manually). Before submission, verify the pre-submit signal-ratio check warns about nit floods."
    expected: "Warning visible before submission when > 3 nits or signal ratio < 40%."
    why_human: "The signal-ratio check is a UI interaction that requires a real session with findings — cannot verify statically."
  - test: "Review a larger PR (20+ files if available). Confirm the walkthrough loads completely without context exhaustion or missing hunks."
    expected: "All hunks present, no truncation or error about context limits."
    why_human: "Large-PR handling depends on real LLM session context limits, not automatable."
  - test: "During walkthrough, attempt to comment on an unchanged context line. Verify it is rejected unless explicitly flagged with pre_existing."
    expected: "Comment on unchanged line rejected or flagged unless pre_existing is set."
    why_human: "Runtime behavior of the walkthrough comment guard requires a live session."
  - test: "Inspect the walkthrough ordering for a PR that includes both core logic changes and churn files (tests, lockfiles). Verify the curated hunk order starts with core logic, not churn."
    expected: "Walkthrough narrative covers core change files before snapshot/lockfile/test churn."
    why_human: "Ordering is determined by LLM curation at runtime — cannot verify from static code."
---

# Phase 7: Polish + Verification — Verification Report

**Phase Goal:** v1 shake-out. Auth identity display in TopBar, mixed automated + manual PITFALLS verification pass, papercut repairs. SESS-04 deferred to backlog per D-01.
**Verified:** 2026-04-28T10:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Authenticated GitHub user identity is visible in the UI chrome (avatar + username badge in TopBar row 1, with token mismatch warning when tokens differ) | ? UNCERTAIN | Code fully wired and passing all automated tests; visual correctness requires human confirmation (see Human Verification section) |
| 2 | PITFALLS checklist walked through: automated items (1, 6, 8, 9, 10, 16) verified; manual items (3, 4, 5, 12, 14) verified against a real PR | ✗ FAILED | Automated items fully verified (test files exist and pass). Manual items (Pitfalls 3/4/5/12/14) were auto-approved in --auto mode — never verified by a human against a real PR. Plan 03 Task 2 is a `gate="blocking"` checkpoint:human-verify that was auto-bypassed. |
| 3 | Daily-use papercuts captured during verification are fixed or explicitly deferred | ✓ VERIFIED | Plans 01/02/03 SUMMARYs report no papercuts surfaced. No deviations requiring fixes were found. |
| 4 | SESS-04 (multi-session concurrency) is acknowledged as deferred to backlog — not implemented in Phase 7 | ✓ VERIFIED | Zero session-switcher implementation in codebase (grep confirms). ROADMAP.md Phase 7 states "SESS-04 deferred to backlog per D-01". All three PLAN files acknowledge deferral. SC 4 requires only acknowledgement, not implementation. |

**Score:** 3/4 truths verified (SC 2 is FAILED due to unexecuted blocking human checkpoint; SC 1 is UNCERTAIN — code is wired, visual confirmation pending)

### Requirement Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SESS-04 | 07-01, 07-02, 07-03 | Multi-session concurrent review sessions with session-switcher UI | DEFERRED | Explicitly deferred to backlog per D-01. No implementation exists. ROADMAP Phase 7 SC 4 requires acknowledgement only — that criterion is satisfied. Note: REQUIREMENTS.md line 49 incorrectly marks SESS-04 as `[x]` (complete), but ROADMAP.md overrides this — the requirement is deferred, not implemented. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/src/ingest/identity.ts` | fetchAuthIdentity with fail-open + mismatch detection | VERIFIED | Exports `fetchAuthIdentity`, outer try returns null, inner detectTokenMismatch returns false on failure |
| `server/src/ingest/__tests__/identity.test.ts` | 7 unit tests: success, fail-open, mismatch true/false/error, env-token skip | VERIFIED | 7 tests, all passing |
| `server/src/__tests__/pitfall-verify.test.ts` | Integration tests for Pitfalls 8, 9, 16 | VERIFIED | 4 tests across 3 describe blocks, all passing |
| `server/src/mcp/tools/__tests__/start-review.test.ts` | Fixed stale 'git-review-plugin' → 'gr' assertions | VERIFIED | Zero occurrences of 'git-review-plugin'; 'gr' present at lines 190-193 and 239 |
| `shared/types.ts` | AuthIdentity interface + ReviewSession.authenticatedUser field | VERIFIED | `export interface AuthIdentity` at line 119; `authenticatedUser?: AuthIdentity | null` at line 109 |
| `server/src/session/manager.ts` | fetchAuthIdentity called in Promise.all with ingest | VERIFIED | Import at line 21; Promise.all for both GitHub and local paths |
| `server/src/http/middleware/secure-headers.ts` | CSP img-src allows avatars.githubusercontent.com | VERIFIED | `'https://avatars.githubusercontent.com'` at line 10 |
| `server/src/http/__tests__/secure-headers.test.ts` | Test asserting avatar domain in CSP | VERIFIED | Line 83: `expect(csp).toContain('https://avatars.githubusercontent.com')` |
| `web/src/store.ts` | authenticatedUser in AppState, INITIAL, onSnapshot, onUpdate | VERIFIED | 4 occurrences: interface (line 76), INITIAL (line 105), onSnapshot (line 190), onUpdate (line 220) |
| `web/src/components/TopBar.tsx` | Auth badge with avatar + username + mismatch warning | VERIFIED | auth-badge, auth-avatar, auth-login CSS classes; D-03 tooltip text; no dangerouslySetInnerHTML |
| `web/src/components/icons.tsx` | Ic.warning SVG icon | VERIFIED | Triangle SVG at line 141 |
| `web/src/index.css` | .auth-badge, .auth-avatar (border-radius:50%), .auth-login CSS | VERIFIED | Rules at lines 166, 174, 181; gap:6px and border-radius:50% present |
| `web/src/App.tsx` | authenticatedUser prop passed to TopBar | VERIFIED | Line 581: `authenticatedUser={state.authenticatedUser}` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `server/src/session/manager.ts` | `server/src/ingest/identity.ts` | import + Promise.all | WIRED | Import at line 21; Promise.all at lines 141-147 (GitHub) and 150-155 (local) |
| `server/src/ingest/__tests__/identity.test.ts` | `server/src/ingest/identity.ts` | dynamic import | WIRED | `await import('../identity.js')` in every test |
| `server/src/http/routes/events.ts` | `ReviewSession.authenticatedUser` | session object sent in SSE snapshot | WIRED | Line 37: `session,` — full ReviewSession sent; authenticatedUser is a ReviewSession field |
| `web/src/store.ts` | `web/src/components/TopBar.tsx` | authenticatedUser prop via App.tsx | WIRED | store.ts → App.tsx line 581 → TopBar prop at line 22 |
| `server/src/http/middleware/secure-headers.ts` | `web/src/components/TopBar.tsx` | CSP permits avatar img load | WIRED | img-src includes specific domain; TopBar uses `<img src={avatarUrl}>` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `web/src/components/TopBar.tsx` | `authenticatedUser` | `web/src/store.ts` onSnapshot → ReviewSession.authenticatedUser → set by `manager.ts` via `fetchAuthIdentity()` | Yes — gh CLI call in identity.ts | FLOWING |
| `server/src/ingest/identity.ts` | `fetchAuthIdentity()` return | `execa('gh', ['api', 'user', ...])` | Yes — real gh CLI call | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full server test suite passes | `cd server && npx vitest run` | 533 tests, 65 files, 0 failures | PASS |
| Web Vite build succeeds | `cd web && npx vite build` | 3 output files, 0 errors | PASS |
| Pitfall 8 round-trip test | `vitest run pitfall-verify.test.ts` | 1 test PASSING | PASS |
| Pitfall 9 stale-diff detection | `vitest run pitfall-verify.test.ts` | 2 tests PASSING (mismatch + match) | PASS |
| Pitfall 16 ephemeral port | `vitest run pitfall-verify.test.ts` | 1 test PASSING (distinct ports) | PASS |
| Pitfall 1 anchor position | `vitest run anchor.test.ts` | 10 tests PASSING | PASS |
| Pitfall 6 security headers | `vitest run secure-headers.test.ts` | 10 tests PASSING | PASS |
| Pitfall 10 duplicate submission | `vitest run confirm-submit.test.ts` | 409 test PASSING | PASS |
| Identity unit tests | `vitest run identity.test.ts` | 7 tests PASSING | PASS |
| Manual Pitfalls 3/4/5/12/14 | Requires real PR session | Auto-approved in --auto mode, not human-tested | SKIP (needs human) |
| Auth badge visual correctness | Requires browser | Cannot verify statically | SKIP (needs human) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/REQUIREMENTS.md` | 49, 142 | SESS-04 marked `[x]` (complete) and "Phase 7 \| Complete" — but the feature is not implemented; deferred to backlog | Warning | Documentation inconsistency only; ROADMAP.md is authoritative and correctly describes SESS-04 as deferred |

### Human Verification Required

#### 1. Auth Identity Badge Visual Confirmation

**Test:** Launch a review session via `/pair-review <github-url>`. Look at the TopBar row 1 (right side, next to Settings button). Confirm a circular avatar image and GitHub username are visible.
**Expected:** 20px circular avatar and login text appear in the TopBar when `gh auth` succeeds. Badge is absent when running offline or when the `gh` CLI call fails.
**Why human:** Visual rendering in a real browser cannot be verified by grep or test harness.

#### 2. Pitfall 3 — Signal-Ratio Check

**Test:** Use the walkthrough on a PR and add several nit-level comments (or use a PR that produces many nit-severity self-review findings). Proceed to the submission panel.
**Expected:** A visible warning about nit floods before submission when > 3 nits or signal ratio < 40%.
**Why human:** Requires a real session with LLM-generated findings populating the review state.

#### 3. Pitfall 4 — Self-Review Default Verdict

**Test:** Run the self-review step on any GitHub PR. Observe what default verdict the LLM uses when forming its assessment.
**Expected:** Default verdict is "Request changes" (not "Approve"). The LLM should argue down from request_changes.
**Why human:** LLM behavior at runtime depends on prompt wording that cannot be tested without a live Claude Code session.

#### 4. Pitfall 5 — Large-PR Handling

**Test:** Load a PR with 20+ files via `/pair-review`. Navigate through the walkthrough to all curated hunks.
**Expected:** All hunks load without context exhaustion. No missing hunks, no tool errors about context limits.
**Why human:** Context exhaustion depends on real LLM session context window behavior.

#### 5. Pitfall 12 — Pre-Existing Code Guard

**Test:** During walkthrough, attempt to add a comment anchored to a context line (unchanged line, not an added or removed line).
**Expected:** The comment is rejected or flagged unless explicitly marked as `pre_existing`. A warning or error message should appear.
**Why human:** Runtime rejection logic for comments on unchanged lines requires a live walkthrough session to test.

#### 6. Pitfall 14 — Walkthrough Ordering

**Test:** Use a PR that includes both core logic changes and churn files (e.g., `package-lock.json`, test snapshots, generated files). Observe the walkthrough curation order.
**Expected:** Core logic change files appear first in the curated walkthrough. Lockfiles, snapshots, and test churn appear later or are omitted from curation.
**Why human:** Walkthrough curation order is determined by LLM at runtime and cannot be verified statically.

### Gaps Summary

**SC 2 (PITFALLS checklist — manual items):** The Plan 03 task for manual D-07 verification was defined as `type="checkpoint:human-verify" gate="blocking"`. The SUMMARY.md reports it was "auto-approved per --auto mode." The 6 manual verification items — auth badge visual, Pitfall 3 (signal-ratio), Pitfall 4 (self-review stance), Pitfall 5 (large-PR), Pitfall 12 (pre-existing guard), Pitfall 14 (walkthrough ordering) — were never executed by a human against a real PR. These items cannot be verified programmatically and remain open.

**Documentation inconsistency (not a code gap):** REQUIREMENTS.md marks SESS-04 as `[x]` complete at line 49 and the Traceability table at line 142 shows "Phase 7 \| Complete". This is incorrect — SESS-04 is explicitly deferred to backlog per D-01 and has no implementation. The ROADMAP.md Phase 7 requirement section is authoritative and correctly describes the deferral. The REQUIREMENTS.md traceability table should be updated to reflect "Deferred to backlog" rather than "Complete."

---

_Verified: 2026-04-28T10:45:00Z_
_Verifier: Claude (gsd-verifier)_
