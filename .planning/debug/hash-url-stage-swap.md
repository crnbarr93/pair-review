---
status: resolved
trigger: "When swapping between stages the hash URL does not update so a refresh returns to the first stage rather than the one the user was just on."
created: 2026-04-27
updated: 2026-04-27
---

## Symptoms

- expected: URL hash updates when user swaps between stages so browser refresh returns to current stage
- actual: Hash stays stale or absent, refresh always returns to the first stage
- errors: None reported
- timeline: Never worked — hash update on stage swap was never wired up
- reproduction: Navigate to any non-first stage, refresh the browser, observe it goes back to stage 1

## Current Focus

- hypothesis: CONFIRMED — The commit 118733f added the basic mechanism (setActiveStep sets hash, bootstrap reads hash) but the implementation was incomplete: no initial hash on first load, no hashchange listener for browser back/forward, and location.hash access not defensive against test mocks.
- test: hash-persistence.test.ts — 5 tests all pass
- expecting: After fix, hash always reflects current step and browser refresh restores correct step.
- next_action: complete
- reasoning_checkpoint: Root cause confirmed, fix applied and tested.

## Evidence

- timestamp: 2026-04-27 12:30 — store.ts:328-332 setActiveStep sets location.hash = step. Verified in built output.
- timestamp: 2026-04-27 12:30 — main.tsx:66-74 bootstrap reads hash and calls setActiveStep to restore. Verified logic correct.
- timestamp: 2026-04-27 12:32 — No popstate/hashchange listeners anywhere in web/src. Browser back/forward not handled.
- timestamp: 2026-04-27 12:34 — onSnapshot and onUpdate do NOT overwrite activeStep. Confirmed via test.
- timestamp: 2026-04-27 12:36 — hash-persistence.test.ts: 5/5 tests pass confirming basic mechanism works.
- timestamp: 2026-04-27 12:38 — Fix applied: syncStepFromHash helper, hashchange listener, initial hash on first load.
- timestamp: 2026-04-27 12:41 — All 22 related tests pass (5 hash + 7 bootstrap + 10 store).

## Eliminated

- Race condition with snapshot overwriting activeStep — confirmed onSnapshot preserves activeStep via spread
- TypeScript compilation issue — main.tsx and store.ts compile cleanly
- Build optimization removing hash code — verified location.hash appears in built JS output

## Resolution

- root_cause: The hash persistence from commit 118733f had three gaps: (1) no initial hash set on first load, so the URL never showed the default step; (2) no hashchange event listener for browser back/forward navigation; (3) location.hash access was not defensive against undefined in test environments with mocked location objects.
- fix: Refactored main.tsx to extract a reusable syncStepFromHash() helper with isValidStep type guard. Added hashchange event listener for browser back/forward sync. Set initial hash to 'summary' on first load when no hash is present. Made location.hash access defensive with ?? '' fallback. Updated bootstrap test mocks to include setActiveStep and hash property.
- files_changed: web/src/main.tsx, web/src/__tests__/main-bootstrap.test.tsx, web/src/__tests__/hash-persistence.test.ts (new)
