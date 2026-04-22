---
phase: 5
slug: walkthrough-inline-threaded-comments
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `server/vitest.config.ts` |
| **Quick run command** | `cd server && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd server && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd server && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd server && npx vitest run --reporter=verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | LLM-03 | — | N/A | unit | `cd server && npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LLM-04 | — | N/A | unit | `cd server && npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LLM-05 | — | N/A | unit+integration | `cd server && npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Reducer test stubs for 6 new walkthrough/comment event types
- [ ] MCP tool handler test stubs for `set_walkthrough`, `draft_comment`, `reply_in_thread`, `resolve_thread`
- [ ] Integration test for opaque ID validation (garbage ID → schema error)

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Walkthrough narrative ordering is visible before walkthrough starts | LLM-03 | UI rendering + LLM output quality | Open browser, trigger walkthrough, verify order pane shows before first hunk |
| "Show all" toggle preserves curated-set progress | LLM-03 | UI state + visual verification | Mid-walkthrough, toggle "show all", verify curated hunks still marked |
| Thread flattens to editable post-body | LLM-05 | UX interaction pattern | Draft thread with 2+ replies, verify single editable body slot |
| Browser refresh restores thread state | LLM-05 | Browser lifecycle + persistence | Draft comment, refresh browser, verify comment restored at anchor |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
