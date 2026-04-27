---
status: complete
---

# Quick Task 260427-da1: URL hash param for active step persistence

## Changes

- **`web/src/store.ts`**: `setActiveStep()` now writes `location.hash = step` after each state update
- **`web/src/main.tsx`**: `bootstrap()` captures hash before `history.replaceState` wipe, preserves it in the replacement URL, and restores the step on reload if the hash matches a valid step name

## Verification

- TypeScript compiles cleanly (no new errors)
- T-03 token leak mitigation preserved — query params still wiped, only hash fragment kept
- Invalid/missing hash silently defaults to `'summary'` via existing INITIAL state
