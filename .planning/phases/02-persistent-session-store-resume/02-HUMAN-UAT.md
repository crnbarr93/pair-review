---
status: partial
phase: 02-persistent-session-store-resume
source: [02-VERIFICATION.md]
started: 2026-04-19T15:10:00Z
updated: 2026-04-19T15:10:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live end-to-end resume-from-cold-start
expected: `/pair-review <pr>` → close browser → quit Claude Code → re-run `/pair-review <same pr>` → browser reopens with restored state. Diff renders immediately (no full re-fetch spinner); stderr shows disk-load path taken; state.json at `${CLAUDE_PLUGIN_DATA}/pair-reviews/<prKey>/state.json` survived the restart.
result: [pending]

### 2. Stale-SHA modal visual correctness
expected: Edit state.json headSha to `'0000…'` → quit plugin → re-run `/pair-review` → modal appears. Title "PR updated" shows; "Stored: 00000000 → Current: <real 8 chars>" visible; three buttons "Refresh to current PR" (blue), "Discard session" (red), "View both" (gray); Escape and backdrop click do NOT dismiss.
result: [pending]

### 3. Three-button dispatch (adopt / reset / viewBoth)
expected: adopt → "Refreshing diff…" → modal dismisses → state.json has real headSha. reset → "Refreshing diff…" → state.json recreated with fresh createdAt. viewBoth → state.json has `viewBothMode: true`, `staleDiff` absent.
result: [pending]

### 4. SSE live event:update arrives without a page refresh
expected: Applying a session event from the server side causes the browser's DevTools Network tab to show an SSE `update` frame and the store's AppState repaints without a reload.
result: [pending]

### 5. SESS-03 crash-safety sanity (local re-run)
expected: `cd server && pnpm test -- store.crash.test.ts --run` → 1 passed (5-iteration test under 1s). Verifier ran this and got PASSED in ~905ms; confirm on your machine.
result: [pending]

### 6. Label sign-off on "Refresh to current PR" vs Phase-5's "Rebase drafts where possible"
expected: Confirm the primary button's Phase-2 label is acceptable, or request re-label. Per research Assumption A7, Phase 2 has no drafts to rebase so "Refresh" is the intentional deviation from the ROADMAP success-criterion phrasing.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
