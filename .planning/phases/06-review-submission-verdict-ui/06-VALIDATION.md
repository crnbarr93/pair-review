---
phase: 06
slug: review-submission-verdict-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (configured via server/vitest.config.ts) |
| **Config file** | server/vitest.config.ts |
| **Quick run command** | `pnpm --filter server test --run` |
| **Full suite command** | `pnpm --filter server test --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter server test --run`
- **After every plan wave:** Run `pnpm --filter server test --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-XX-01 | TBD | TBD | SUB-01 | T-06-01 | Anchor uses line+side only, never position | unit | `pnpm --filter server test --run anchor` | ❌ W0 | ⬜ pending |
| 06-XX-02 | TBD | TBD | SUB-01 | — | createReview comments land on expected lines | integration | `pnpm --filter server test --run submit-review` | ❌ W0 | ⬜ pending |
| 06-XX-03 | TBD | TBD | SUB-02 | — | Signal-ratio computation correct; isNitHeavy flag | unit | `pnpm --filter server test --run confirm-submit` | ❌ W0 | ⬜ pending |
| 06-XX-04 | TBD | TBD | SUB-03 | T-06-02 | Duplicate submit refused when submissionState=submitted | unit | `pnpm --filter server test --run confirm-submit` | ❌ W0 | ⬜ pending |
| 06-XX-05 | TBD | TBD | SUB-03 | — | Pending-review detection filters by PENDING + login | unit | `pnpm --filter server test --run pending-review` | ❌ W0 | ⬜ pending |
| 06-XX-06 | TBD | TBD | SUB-04 | — | Local markdown export writes correct format | unit | `pnpm --filter server test --run markdown-export` | ❌ W0 | ⬜ pending |
| 06-XX-07 | TBD | TBD | SUB-01 | T-06-03 | confirm-submit validates zod body; rejects malformed | unit | `pnpm --filter server test --run confirm-submit` | ❌ W0 | ⬜ pending |
| 06-XX-08 | TBD | TBD | SUB-04 | T-06-04 | exportPath validated: absolute, .md extension, no .. | unit | `pnpm --filter server test --run markdown-export` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/src/submit/__tests__/anchor.test.ts` — SUB-01 Anchor adapter unit tests
- [ ] `server/src/submit/__tests__/pending-review.test.ts` — SUB-03 pending-review detection
- [ ] `server/src/submit/__tests__/markdown-export.test.ts` — SUB-04 local export
- [ ] `server/src/http/routes/__tests__/confirm-submit.test.ts` — SUB-01 idempotency, SUB-02 signal-ratio
- [ ] `server/src/mcp/tools/__tests__/submit-review.test.ts` — MCP tool handler
- [ ] `pnpm add octokit@5.0.5` — install Octokit dependency (server workspace)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Integration test: post review to fixture PR, read back each comment, assert line placement | SUB-01 | Requires real GitHub auth + fixture PR | Run with `gh` auth active: `pnpm --filter server test --run submit-review.integration` |
| Submit modal visual layout matches design.html mockup | SUB-02 | Visual verification | Open browser, click Submit, compare with design.html "Submit review" modal |
| Keyboard shortcuts `v`/`s` work as expected | — | Interactive behavior | Press `v` to open verdict picker, `s` to open submit modal |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
