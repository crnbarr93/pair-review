---
phase: 7
slug: polish-concurrency
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-28
---

# Phase 7 — Validation Strategy

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
| 07-01-01 | 01 | 1 | SESS-04 (deferred) | — | N/A | unit | `cd server && npx vitest run` | ✅ | ⬜ pending |
| 07-02-01 | 02 | 1 | D-02 (auth badge) | — | Identity fetch fail-open | integration | `cd server && npx vitest run` | ❌ W0 | ⬜ pending |
| 07-03-01 | 03 | 2 | D-06 (pitfall verify) | — | Security headers complete | integration | `cd server && npx vitest run` | ✅ partial | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/src/__tests__/pitfall-verify.test.ts` — new integration test file for Pitfalls 8, 9, 16 coverage gaps
- [ ] Extend `server/src/http/__tests__/secure-headers.test.ts` — CSP img-src for avatars.githubusercontent.com

*Existing infrastructure covers most phase requirements. Only pitfall coverage gaps need new test stubs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Signal-ratio check fires on nit-heavy review | D-07 (Pitfall 3) | Requires subjective evaluation of warning UX | Start review on nit-heavy PR, verify warning appears before submit |
| Self-review adversarial stance | D-07 (Pitfall 4) | Requires LLM behavior observation | Run self-review, verify default verdict is request_changes |
| Large-PR walkthrough handling | D-07 (Pitfall 5) | Requires real 50+ file PR | Open walkthrough on large PR, verify no context loss |
| Pre-existing code guard | D-07 (Pitfall 12) | Requires LLM + diff interaction | Draft comment on unchanged line, verify rejection unless pre_existing flag |
| Walkthrough ordering quality | D-07 (Pitfall 14) | Requires subjective ordering evaluation | Run walkthrough, verify core changes come first |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
