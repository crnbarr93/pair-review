# Phase 7: Polish + Verification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 7-Polish + Verification
**Areas discussed:** Session switcher UX, Papercut scope, Auth identity display, Verification depth

---

## Session Switcher UX (→ dropped)

| Option | Description | Selected |
|--------|-------------|----------|
| URL-routed tabs | Each /pair-review opens a new tab with prKey in URL. OS tab bar is the switcher. | |
| TopBar dropdown switcher | Single tab, dropdown in TopBar shows all sessions. Click to switch. | ✓ |
| URL-routed + session list page | Tab-per-PR plus a /sessions landing page for discovery. | |

**User's choice:** TopBar dropdown switcher (initially)
**Notes:** User then reconsidered whether concurrency is necessary at all. Follow-up question on scope:

### Scope: Drop concurrency?

| Option | Description | Selected |
|--------|-------------|----------|
| Drop concurrency (Recommended) | Phase 7 becomes pure polish. SESS-04 to backlog. | ✓ |
| Keep concurrency | Keep SESS-04 with dropdown switcher + full context switching. | |
| Concurrency as separate phase | Ship Phase 7 as polish, add Phase 7.1 for concurrency if needed. | |

**User's choice:** Drop concurrency
**Notes:** SESS-04 moved to backlog. Phase 7 refocused on verification + auth + papercuts.

### LLM scope on switch (moot — concurrency dropped)

| Option | Description | Selected |
|--------|-------------|----------|
| UI-only switching | Dropdown switches rendered state; LLM stays on most recent session. Others view-only. | |
| Full context switch | Browser tells LLM to detach/re-attach via switch_session request type. | ✓ |

**User's choice:** Full context switch (but concurrency was then dropped entirely)
**Notes:** Recorded for future reference if SESS-04 is ever revived.

---

## Papercut Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Haven't used it yet | No real-world usage; minimize papercut scope. | |
| Used it, have a list | Tried on real PRs; has specific items to fix. | |
| Used it, nothing major | Mostly works; let verification pass surface issues. | ✓ |

**User's choice:** Used it, nothing major
**Notes:** No specific papercuts logged. Papercut scope is emergent from the verification pass.

---

## Auth Identity Display

| Option | Description | Selected |
|--------|-------------|----------|
| TopBar avatar badge | Small avatar + username in TopBar row 1 right side. Warning icon on mismatch. | ✓ |
| Submission panel only | Identity shown only on submit step as "Posting as @username". | |
| Skip auth display | Don't add identity display at all. | |

**User's choice:** TopBar avatar badge
**Notes:** Mismatch tooltip: "gh auth and GITHUB_TOKEN resolve to different users"

---

## Verification Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Automated integration tests | Write integration tests for all 11 PITFALLS items. | |
| Manual walkthrough + fix | Run through all 11 manually against a real PR. | |
| Mix: automate mechanical, manual subjective | Automate objectively testable items; manual-verify subjective ones. | ✓ |

**User's choice:** Mix approach
**Notes:** Automate: Pitfalls 1, 6, 8, 9, 10, 16. Manual: Pitfalls 3, 4, 5, 12, 14.

### Phase 06.3 Visual Gaps

| Option | Description | Selected |
|--------|-------------|----------|
| Fold into Phase 7 | Include 06.3 visual items in Phase 7 manual pass. | |
| Defer to usage | Skip formal verification; fix visual issues during daily use. | ✓ |

**User's choice:** Defer to usage

---

## Claude's Discretion

- Test infrastructure choices (extend existing vs new verification test file)
- Port-in-use fallback implementation details
- GitHub identity fetch mechanism
- Where to hook identity fetch in the server flow

## Deferred Ideas

- SESS-04 multi-session concurrency → backlog (user's preferred design if revived: TopBar dropdown + full LLM context switching)
- Phase 06.3 visual verification → organic daily use
