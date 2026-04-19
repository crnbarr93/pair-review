# Phase 3 Deferred Items

## Pre-existing test failures (out of scope for 03-01)

- `server/src/__tests__/end-to-end.test.ts` — fails with MODULE_NOT_FOUND error before ever reaching plan-03 changes. Verified by `git stash && npx vitest run src/__tests__/end-to-end.test.ts` reproducing the same failure on the pre-change worktree. Not caused by Phase 3 work; deferred.
