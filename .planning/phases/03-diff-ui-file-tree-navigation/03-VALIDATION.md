---
phase: 3
slug: diff-ui-file-tree-navigation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (web + server workspaces) |
| **Config file** | `web/vitest.config.ts`, `server/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @review/web test -- --run` |
| **Full suite command** | `pnpm -r test -- --run` |
| **Estimated runtime** | ~{to be measured in Wave 0} seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command on the affected workspace
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

*To be filled by planner from RESEARCH.md's Validation Architecture section (Signal/Response pairs 1-10) + plan-level tasks. Executor populates `Status` column during execution.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| — | — | — | — | — | — | — | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/src/test/setup.ts` — add `IntersectionObserver` + `scrollIntoView` mocks alongside existing `EventSource` mock (per RESEARCH.md finding #6)
- [ ] Fixture PR cache — capture 1 small + 1 medium unified diff via `gh pr diff > .planning/phases/03-diff-ui-file-tree-navigation/fixtures/*.diff` for replayable tests (per RESEARCH.md Question 8)
- [ ] Vitest workspaces already installed (Phase 01/02 baseline) — no new framework install required

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Syntax-highlighted diff visually readable with light-mode paper palette | DIFF-01 | Visual regression not automated in v1 | Open a fixture PR in the review UI; confirm Shiki `github-light` tokens render (not `github-dark` white-on-white) |
| Keyboard shortcut discoverability via `?` help overlay | DIFF-04 | Overlay visual polish not unit-tested | Press `?`; confirm all shortcuts listed and overlay closes on second `?` or Esc |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
