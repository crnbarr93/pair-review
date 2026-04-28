---
status: partial
phase: 07-polish-concurrency
source: [07-VERIFICATION.md]
started: 2026-04-28T10:30:00Z
updated: 2026-04-28T10:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Auth badge visual
expected: 20px circular avatar + username visible in TopBar during a real session; survives browser refresh
result: [pending]

### 2. Pitfall 3 — Signal-ratio check
expected: Pre-submit warning fires when nit findings dominate (> 3 nits or signal ratio < 40%)
result: [pending]

### 3. Pitfall 4 — Self-review adversarial stance
expected: Default verdict is "Request changes", not "Approve"
result: [pending]

### 4. Pitfall 5 — Large-PR handling
expected: Walkthrough loads 20+ file PR without context exhaustion or missing hunks
result: [pending]

### 5. Pitfall 12 — Pre-existing code guard
expected: Comments on unchanged context lines are rejected unless pre_existing flag is set
result: [pending]

### 6. Pitfall 14 — Walkthrough ordering
expected: Core logic files appear before churn in the curated walkthrough order
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
