---
phase: 07-polish-concurrency
plan: 02
subsystem: ui
tags: [react, auth, csp, hono, topbar, identity, avatar]

# Dependency graph
requires:
  - phase: 07-01
    provides: fetchAuthIdentity module + AuthIdentity type in shared/types.ts

provides:
  - fetchAuthIdentity wired into SessionManager.startReview via Promise.all (parallel with ingest)
  - authenticatedUser field set on new ReviewSession objects (D-02, D-04)
  - CSP img-src extended to allow https://avatars.githubusercontent.com (T-07-04)
  - store.ts AppState.authenticatedUser mirrored from SSE snapshot and update events
  - TopBar auth badge: avatar circle + username + mismatch warning icon (D-02, D-03)
  - Ic.warning SVG icon added to icons.tsx
  - Auth badge CSS in index.css

affects: [07-03-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promise.all([ingest, fetchAuthIdentity()]) — identity fetch in parallel with ingest, fail-open"
    - "Optional prop pattern for auth badge: absent=null/undefined hides component, present=AuthIdentity renders it"

key-files:
  created: []
  modified:
    - server/src/session/manager.ts
    - server/src/http/middleware/secure-headers.ts
    - server/src/http/__tests__/secure-headers.test.ts
    - web/src/store.ts
    - web/src/components/TopBar.tsx
    - web/src/components/icons.tsx
    - web/src/index.css
    - web/src/App.tsx

key-decisions:
  - "fetchAuthIdentity runs in Promise.all with both ingestGithub and ingestLocal — never blocking session startup (RESEARCH.md Pitfall C)"
  - "authenticatedUser: null on disk-load path (path 2) is a no-op — spread operator preserves the persisted field as-is"
  - "CSP img-src uses specific domain https://avatars.githubusercontent.com (not wildcard) per T-07-04 mitigate disposition"

patterns-established:
  - "Auth badge conditional render: {authenticatedUser && <div className='auth-badge'>...} — falsy check handles both null and undefined (D-04 fail-open)"

requirements-completed: [SESS-04]

# Metrics
duration: 5min
completed: 2026-04-28
---

# Phase 07 Plan 02: Auth Identity Badge Summary

**GitHub auth identity wired end-to-end: fetchAuthIdentity runs parallel with ingest, CSP allows avatar images, TopBar badge shows avatar + username with token-mismatch warning**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-28T10:25:00Z
- **Completed:** 2026-04-28T10:28:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Wired `fetchAuthIdentity` into `SessionManager.startReview` via `Promise.all` alongside both `ingestGithub` and `ingestLocal` — identity fetch never blocks session startup
- Set `authenticatedUser: authIdentity` on new `ReviewSession` objects; disk-load path (path 2) preserves persisted field via spread operator unchanged
- Patched CSP `img-src` to include `https://avatars.githubusercontent.com` (T-07-04 mitigate); test assertion added — all 533 server tests pass
- Extended `AppState` with `authenticatedUser: AuthIdentity | null`; mirrored in `INITIAL`, `onSnapshot`, and `onUpdate` handlers
- Added `Ic.warning` triangle SVG icon to `icons.tsx`
- Rendered auth badge in TopBar row 1 between spacer and Settings button: avatar `<img>`, `<span>` login, conditional `Ic.warning` when `mismatch === true` — no `dangerouslySetInnerHTML` (T-07-05)
- Web build succeeds (Vite, 0 errors)

## Task Commits

1. **Task 1: Server integration — identity fetch in manager.ts + CSP fix + CSP test** - `28f944e` (feat)
2. **Task 2: Web integration — store extension + TopBar badge + warning icon + CSS** - `ae1ae6c` (feat)

**Plan metadata:** (final docs commit to follow)

## Files Created/Modified

- `server/src/session/manager.ts` — fetchAuthIdentity imported and called in Promise.all with ingest; authenticatedUser set on session object
- `server/src/http/middleware/secure-headers.ts` — img-src extended with https://avatars.githubusercontent.com
- `server/src/http/__tests__/secure-headers.test.ts` — new CSP img-src avatar domain test
- `web/src/store.ts` — AuthIdentity import, AppState.authenticatedUser field, INITIAL value, onSnapshot + onUpdate merge
- `web/src/components/TopBar.tsx` — AuthIdentity import, authenticatedUser prop, auth-badge JSX with avatar+login+mismatch warning
- `web/src/components/icons.tsx` — Ic.warning triangle SVG icon
- `web/src/index.css` — .topbar .auth-badge, .topbar .auth-avatar (border-radius: 50%), .topbar .auth-login CSS
- `web/src/App.tsx` — authenticatedUser={state.authenticatedUser} passed to TopBar

## Decisions Made

- `fetchAuthIdentity` placed in `Promise.all` with ingest rather than sequentially — avoids adding latency to session startup; identity fetch is non-blocking by design (D-04 fail-open).
- Disk-load path (path 2) requires no change — `authenticatedUser` is an optional field on `ReviewSession`; the spread operator `{ ...persisted as ReviewSession }` preserves whatever was stored (or leaves it undefined if the field didn't exist in older state files).
- CSP uses specific domain string `https://avatars.githubusercontent.com` not a wildcard per T-07-04 threat mitigate disposition.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Threat Surface Scan

- T-07-04 (CSP img-src wildcard risk) — mitigated as planned: `https://avatars.githubusercontent.com` only, test-asserted.
- T-07-05 (XSS via dangerouslySetInnerHTML) — mitigated as planned: login renders as React text node `<span>{login}</span>`, avatarUrl as `<img src={...}>` attribute. Verified: grep for `dangerouslySetInnerHTML` in TopBar.tsx returns empty.
- No new network endpoints, auth paths, or file access patterns introduced beyond the plan's threat model.

## Next Phase Readiness

- Auth badge visible in TopBar when identity is available; absent when identity fetch fails (fail-open, D-04)
- Mismatch warning (D-03) renders correctly when `mismatch === true`
- Plan 03 can proceed with the auth surface fully in place

## Self-Check: PASSED

- manager.ts contains fetchAuthIdentity: FOUND (import + Promise.all)
- manager.ts contains authenticatedUser: authIdentity: FOUND
- secure-headers.ts contains avatars.githubusercontent.com: FOUND
- secure-headers.test.ts contains avatar domain test: FOUND
- store.ts authenticatedUser in AppState: FOUND
- store.ts authenticatedUser in INITIAL: FOUND
- store.ts onSnapshot authenticatedUser: FOUND
- store.ts onUpdate authenticatedUser: FOUND
- icons.tsx warning icon: FOUND
- TopBar.tsx auth-badge: FOUND
- TopBar.tsx auth-avatar: FOUND
- TopBar.tsx auth-login: FOUND
- TopBar.tsx D-03 tooltip text: FOUND
- TopBar.tsx no dangerouslySetInnerHTML: CONFIRMED ABSENT
- index.css .auth-badge gap:6px: FOUND
- index.css .auth-avatar border-radius:50%: FOUND
- App.tsx authenticatedUser prop passed: FOUND
- Commit 28f944e: FOUND
- Commit ae1ae6c: FOUND
- All 533 server tests: PASSING
- Web build: PASSING

---
*Phase: 07-polish-concurrency*
*Completed: 2026-04-28*
