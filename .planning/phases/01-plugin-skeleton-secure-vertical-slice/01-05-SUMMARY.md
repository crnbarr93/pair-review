---
phase: 01-plugin-skeleton-secure-vertical-slice
plan: "05"
subsystem: web-spa
tags: [react, vite, tailwind, typescript, sse, spa, bootstrap, component]
dependency_graph:
  requires:
    - phase: 01-01
      provides: web/package.json with all deps (vite, react, tailwind, lucide-react, @git-diff-view/react)
    - phase: 01-03
      provides: /api/session/adopt (POST) and /api/events (SSE) server endpoints
  provides:
    - web/vite.config.ts — Vite 8 + React + Tailwind 4 + nonce-inject plugin
    - web/index.html — single nonce'd script entry with __NONCE__ placeholder
    - web/src/index.css — verbatim UI-SPEC @theme {} token block (24 tokens)
    - web/src/types.ts — re-export of AppState, SnapshotMessage, etc. from @shared/types
    - web/src/main.tsx — bootstrap (adopt → replaceState → EventSource → render), exports bootstrap()
    - web/src/api.ts — adoptSession() + openEventStream()
    - web/src/store.ts — useSyncExternalStore AppState machine (loading/empty/error/diff)
    - web/src/App.tsx — minimal stub wrapping AppShell/Header/Footer; Plan 06 replaces main slot
    - web/src/components/AppShell.tsx — 3-slot viewport layout
    - web/src/components/AppHeader.tsx — 48px bar with PR title, source badge, SessionStatusPill
    - web/src/components/AppFooter.tsx — 28px bar with token last4 + click-to-copy URL
    - web/src/components/SessionStatusPill.tsx — Active/Expired pill per UI-SPEC copy contract
    - web/src/__tests__/ — 22 component + bootstrap tests (3 files)
  affects: [01-06, 01-07]
tech_stack:
  added:
    - "@types/react + @types/react-dom devDeps — required by tsc --noEmit (not in original web/package.json)"
  patterns:
    - "noncePlugin(): Vite 8 transformIndexHtml post-hook injects nonce='__NONCE__' on emitted <script> tag — Hono render-index.ts replaces at serve time"
    - "useSyncExternalStore for client state — no Zustand/Redux, module-level state + emit() pattern"
    - "bootstrap() exported for test isolation — window.__TEST__ guard suppresses auto-run"
    - "Class-based EventSource mock in tests — vi.fn().mockImplementation() cannot be used as new-able constructor"
    - "navigator.clipboard defineProperty in tests — happy-dom exposes clipboard as getter-only"
key_files:
  created:
    - path: "web/vite.config.ts"
      role: "Vite 8 config with noncePlugin + @shared alias + Tailwind 4 plugin"
    - path: "web/tailwind.config.ts"
      role: "Minimal CSS-first config for IDE detection; tokens live in @theme {}"
    - path: "web/index.html"
      role: "SPA entry HTML — single nonce'd script tag, body uses CSS vars"
    - path: "web/src/index.css"
      role: "Verbatim UI-SPEC @theme {} block: 7 spacing + 15 color + 2 font tokens"
    - path: "web/src/types.ts"
      role: "Re-exports AppState, SnapshotMessage, PullRequestMeta, etc. from @shared/types"
    - path: "web/src/main.tsx"
      role: "Bootstrap: adoptSession → replaceState (T-03) → openEventStream → createRoot"
    - path: "web/src/api.ts"
      role: "adoptSession(token): Promise<boolean> + openEventStream() → unsubscribe fn"
    - path: "web/src/store.ts"
      role: "useAppStore() hook + actions.onAdoptFailed/onSnapshot/onSessionExpired"
    - path: "web/src/App.tsx"
      role: "Minimal stub — AppShell+Header+Footer wired; Plan 06 replaces main slot with DiffCanvas"
    - path: "web/src/components/AppShell.tsx"
      role: "h-screen flex-col 3-slot layout — header/main/footer"
    - path: "web/src/components/AppHeader.tsx"
      role: "48px bar: PR title (16px semibold), source badge (12px), SessionStatusPill"
    - path: "web/src/components/AppFooter.tsx"
      role: "28px bar: Token:••••[last4] + click-to-copy local URL"
    - path: "web/src/components/SessionStatusPill.tsx"
      role: "Rounded-full pill: Active (accent-muted/accent) / Expired (destructive-muted/destructive)"
    - path: "web/src/__tests__/session-status-pill.test.tsx"
      role: "10 tests: copy verbatim, bg colors, aria-label, icons"
    - path: "web/src/__tests__/app-footer.test.tsx"
      role: "6 tests: token format, URL display, click-to-copy"
    - path: "web/src/__tests__/main-bootstrap.test.tsx"
      role: "6 tests: fetch call, ordering (fetch→replaceState→EventSource), failure paths"
key_decisions:
  - "nonce-inject-plugin: Vite 8 drops nonce= from rewritten script tags; added transformIndexHtml post-hook to re-inject nonce='__NONCE__' on the emitted <script type=module crossorigin> element"
  - "github-icon-fallback: lucide-react@1.8.0 does not export Github icon; replaced with GitBranch for the source badge — text label #N on owner/repo already conveys the GitHub context"
  - "types-react-devdep: @types/react and @types/react-dom were absent from web/package.json; added as devDeps — tsc --noEmit requires them even though Vite builds without them"
  - "bootstrap-test-guard: main.tsx auto-run guard uses window.__TEST__ flag; tests stub the global before importing the module via vi.resetModules() in afterEach"
  - "class-based-es-mock: vi.fn().mockImplementation cannot be used with new EventSource(); replaced with class MockES{} pattern in tests"
requirements_completed: [PLUG-02, SEC-02, SEC-04]
duration: "~7min"
completed: "2026-04-16"
---

# Phase 01 Plan 05: Web SPA Foundation Summary

**React 19 SPA with Vite 8 + Tailwind 4 @theme tokens, token-adopt bootstrap (T-03 ordering), useSyncExternalStore state machine, and chrome components (AppShell/Header/Footer/SessionStatusPill) — all per UI-SPEC, 22 tests green**

## Performance

- **Duration:** ~7 minutes
- **Started:** 2026-04-16T16:38:06Z
- **Completed:** 2026-04-16T16:44:31Z
- **Tasks:** 2
- **Files modified:** 17 (13 created, 4 modified including package.json + pnpm-lock.yaml)

## Accomplishments

- Vite 8 build produces `web/dist/index.html` with `__NONCE__` placeholder preserved (via post-transform plugin) and exactly one `<script>` tag — ready for Hono's `render-index.ts` nonce substitution
- Bootstrap ordering verified by test: fetch `/api/session/adopt` → `history.replaceState('', '', '/')` → `new EventSource(...)` — T-03 token-leak mitigation enforced
- All 24 UI-SPEC @theme tokens present verbatim in `web/src/index.css`
- SessionStatusPill renders "Session active" / "Session expired" (UI-SPEC Copywriting Contract exact copy), no global keydown listeners anywhere
- 22 tests pass across 3 test files (session-status-pill, app-footer, main-bootstrap)

## Build Output

```
dist/index.html                   0.48 kB │ gzip:  0.32 kB
dist/assets/index-CuQAqO48.css    6.09 kB │ gzip:  2.13 kB
dist/assets/index-MMH5l6dk.js   196.71 kB │ gzip: 62.45 kB
```

- `dist/index.html` contains `__NONCE__` exactly once: YES
- `dist/index.html` has exactly one `<script>` tag: YES
- `pnpm --filter web exec tsc --noEmit`: exits 0

## Task Commits

1. **Task 1: Vite + Tailwind config + index.html + @theme tokens** — `e719277` (feat)
2. **Task 2 RED: failing tests** — `41d7565` (test)
3. **Task 2 GREEN: bootstrap + api + store + components** — `616d0da` (feat)

## Files Created

- `web/vite.config.ts` — Vite 8 + React + Tailwind 4 + noncePlugin (post-transform nonce injection)
- `web/tailwind.config.ts` — Minimal CSS-first config
- `web/index.html` — Single nonce'd script entry
- `web/src/index.css` — Verbatim UI-SPEC @theme {} block (24 tokens)
- `web/src/types.ts` — Re-exports from @shared/types
- `web/src/main.tsx` — Bootstrap with T-03 ordering + exports bootstrap() for tests
- `web/src/api.ts` — adoptSession() + openEventStream() helpers
- `web/src/store.ts` — useSyncExternalStore state machine
- `web/src/App.tsx` — Minimal stub (Plan 06 replaces main slot)
- `web/src/components/AppShell.tsx` — 3-slot h-screen layout
- `web/src/components/AppHeader.tsx` — 48px header with PR title, badge, pill
- `web/src/components/AppFooter.tsx` — 28px footer with token + click-to-copy URL
- `web/src/components/SessionStatusPill.tsx` — Active/Expired per UI-SPEC
- `web/src/__tests__/session-status-pill.test.tsx` — 10 tests
- `web/src/__tests__/app-footer.test.tsx` — 6 tests
- `web/src/__tests__/main-bootstrap.test.tsx` — 6 tests

## Decisions Made

1. **noncePlugin**: Vite 8 rewrites the `<script>` tag during `transformIndexHtml`, moving it to `<head>` and dropping the `nonce=` attribute since it doesn't recognize `__NONCE__` as its own nonce system. Added a `transformIndexHtml: { order: 'post' }` plugin that injects `nonce="__NONCE__"` onto the emitted `<script type="module" crossorigin>` tag. This preserves the placeholder for Hono's server-side substitution.

2. **Github icon fallback**: `lucide-react@1.8.0` does not export a `Github` icon. Used `GitBranch` for both GitHub and local source badges — the text label (`#123 on owner/repo` vs `main..feat/x (local)`) already distinguishes the sources visually.

3. **@types/react devDeps**: `web/package.json` from Plan 01 did not include `@types/react` or `@types/react-dom`. These are required by `tsc --noEmit`; Vite's bundler resolves them without types but tsc cannot. Added as devDeps.

4. **bootstrap() test isolation**: main.tsx exposes `export async function bootstrap()` and auto-runs only when `window.__TEST__` is falsy. Tests set `vi.stubGlobal('__TEST__', true)` in `beforeEach` and call `vi.resetModules()` in `afterEach` to get a fresh module import per test.

5. **Class-based EventSource mock**: `vi.fn().mockImplementation(...)` cannot serve as a `new`-able constructor in this context. Each test that intercepts `new EventSource(...)` defines a local `class MockES` and passes it to `vi.stubGlobal('EventSource', MockES)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vite 8 drops nonce= attribute from emitted script tag**
- **Found during:** Task 1 (first build verification)
- **Issue:** `pnpm --filter web build` produced `dist/index.html` with no `__NONCE__` placeholder — Vite 8 moved the `<script>` tag to `<head>` and rewrote the attributes, dropping `nonce="__NONCE__"`
- **Fix:** Added `noncePlugin()` to `vite.config.ts` using `transformIndexHtml: { order: 'post' }` to inject `nonce="__NONCE__"` onto the Vite-emitted `<script type="module" crossorigin>` element after Vite finishes processing
- **Files modified:** `web/vite.config.ts`
- **Verification:** `grep -c '__NONCE__' web/dist/index.html` returns 1
- **Committed in:** e719277 (Task 1 commit)

**2. [Rule 3 - Blocking] Missing @types/react and @types/react-dom**
- **Found during:** Task 2 (tsc --noEmit check)
- **Issue:** `pnpm --filter web exec tsc --noEmit` failed — "Could not find a declaration file for module 'react'" and similar for react-dom, react/jsx-runtime
- **Fix:** `pnpm --filter web add -D @types/react @types/react-dom`
- **Files modified:** `web/package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter web exec tsc --noEmit` exits 0
- **Committed in:** 616d0da (Task 2 GREEN commit)

**3. [Rule 1 - Bug] lucide-react@1.8.0 has no Github icon export**
- **Found during:** Task 2 (tsc --noEmit check)
- **Issue:** `src/components/AppHeader.tsx(2,10): error TS2305: Module '"lucide-react"' has no exported member 'Github'`
- **Fix:** Replaced `Github` import with `GitBranch` — used for both GitHub and local source badges. Text label (`#N on owner/repo` vs `base..head (local)`) provides visual context distinction.
- **Files modified:** `web/src/components/AppHeader.tsx`
- **Verification:** `tsc --noEmit` exits 0
- **Committed in:** 616d0da (Task 2 GREEN commit)

**4. [Rule 1 - Bug] Test isolation failures — stale DOM + spies across tests**
- **Found during:** Task 2 (test run — 15 failures)
- **Issue 1:** `@testing-library/react` renders accumulated across tests without cleanup; "Found multiple elements with role status" errors
- **Issue 2:** `Object.assign(navigator, { clipboard: ... })` fails in happy-dom — clipboard is getter-only
- **Issue 3:** `vi.fn().mockImplementation()` cannot be used as `new`-able EventSource constructor
- **Issue 4:** `vi.spyOn(history, 'replaceState')` spy leaked across tests without `vi.restoreAllMocks()` in afterEach
- **Fix:** Added `afterEach(cleanup)` to component tests; used `Object.defineProperty` for clipboard mock; replaced vi.fn() EventSource mock with `class MockES{}`; added `vi.restoreAllMocks()` to bootstrap test afterEach
- **Files modified:** all 3 test files
- **Verification:** 22/22 tests pass
- **Committed in:** 616d0da (Task 2 GREEN commit)

---

**Total deviations:** 4 auto-fixed (2 blocking, 1 bug, 1 bug-cluster)
**Impact on plan:** All fixes necessary for correctness and testability. No scope creep.

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| `Plan 06 mounts the diff canvas here.` | `web/src/App.tsx` | 17 | Intentional — Plan 06 replaces this with DiffCanvas + 4 UI states. The stub allows Plan 05's build and render to succeed without the diff components. |

## Hand-off Notes for Plan 06

- `useAppStore()` provides the 4-phase AppState machine (`loading`/`empty`/`error`/`diff`)
- `web/src/App.tsx` `<main>` slot is the mount point for `<DiffCanvas state={state} />`
- The `dist/index.html` `__NONCE__` placeholder is preserved — Plan 03's `render-index.ts` substitutes it per request
- No global keydown listeners anywhere in Phase 1 — Phase 3's shortcut layer starts clean

## Threat Flags

None — all network surfaces (fetch to /api/session/adopt, EventSource to /api/events) were planned in the threat model and properly handled.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| web/vite.config.ts exists | PASSED |
| web/index.html exists | PASSED |
| web/src/index.css exists with @theme block | PASSED |
| web/src/types.ts exists | PASSED |
| web/src/main.tsx exists with bootstrap() export | PASSED |
| web/src/api.ts exists with adoptSession + openEventStream | PASSED |
| web/src/store.ts exists with useAppStore + actions | PASSED |
| web/src/App.tsx exists (stub) | PASSED |
| web/src/components/AppShell.tsx exists | PASSED |
| web/src/components/AppHeader.tsx exists | PASSED |
| web/src/components/AppFooter.tsx exists | PASSED |
| web/src/components/SessionStatusPill.tsx exists | PASSED |
| pnpm --filter web build exits 0 | PASSED |
| web/dist/index.html contains __NONCE__ exactly once | PASSED |
| web/dist/index.html has exactly 1 script tag | PASSED |
| web/dist/assets/ has .js and .css files | PASSED |
| pnpm --filter web exec tsc --noEmit exits 0 | PASSED |
| 22 tests pass (3 test files) | PASSED |
| No global keydown listeners in web/src/ | PASSED |
| No document.addEventListener in web/src/ | PASSED |
| Commit e719277 (feat Task 1) | PASSED |
| Commit 41d7565 (test RED Task 2) | PASSED |
| Commit 616d0da (feat GREEN Task 2) | PASSED |
