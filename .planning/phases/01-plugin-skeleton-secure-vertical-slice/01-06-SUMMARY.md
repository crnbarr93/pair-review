---
phase: 01-plugin-skeleton-secure-vertical-slice
plan: "06"
subsystem: web-spa-diff-canvas
tags: [react, tailwind, diff-view, ui-components, state-routing, tdd]
dependency_graph:
  requires:
    - phase: 01-05
      provides: web/src/App.tsx (stub), web/src/store.ts (useAppStore), AppShell/Header/Footer components
    - phase: 01-04
      provides: DiffModel shape, ShikiFileTokens type from shared/types.ts
  provides:
    - web/src/App.tsx — 4-phase router (replaces Plan-05 stub) using useAppStore() + DiffCanvas
    - web/src/components/DiffCanvas.tsx — main content region, 4-state router
    - web/src/components/LoadingState.tsx — 80x4px skeleton bar, animate-pulse, no text
    - web/src/components/EmptyState.tsx — GitCompareArrows icon + verbatim UI-SPEC copy
    - web/src/components/ErrorState.tsx — AlertCircle icon, 2 copy variants, no retry button
    - web/src/components/DiffView.tsx — @git-diff-view/react wrapper, unified mode, data.hunks API
    - web/src/components/DiffView.spike.tsx — API probe for @git-diff-view/react@0.1.3
    - web/src/__tests__/states.test.tsx — 12 tests covering all 4 DiffCanvas states
    - web/src/__tests__/diff-view-spike.test.tsx — 3 tests probing @git-diff-view/react API
  affects: [01-07]
tech_stack:
  added:
    - "@git-diff-view/react@0.1.3 DiffView named export confirmed — data.hunks: string[] API"
    - "DiffModeEnum.Unified=4 confirmed from index.d.ts"
  patterns:
    - "vi.mock('../components/DiffView') + deferred await import() — required for mock to apply before module resolution"
    - "canvas.getContext mock in test setup — @git-diff-view/react uses TextMeasure which calls canvas.getContext('2d'); happy-dom returns null; mock provides { font, measureText } stub"
    - "DiffView isolation pattern (Pitfall-7): only DiffView.tsx imports @git-diff-view/react — swap to fallback library requires editing one file"
key_files:
  created:
    - path: "web/src/components/LoadingState.tsx"
      role: "80x4px skeleton bar, animate-pulse, data-testid=skeleton-bar, no text"
    - path: "web/src/components/EmptyState.tsx"
      role: "GitCompareArrows 24px + verbatim UI-SPEC copy (No changes + body)"
    - path: "web/src/components/ErrorState.tsx"
      role: "AlertCircle 24px, 2 variants (unreachable/fetch-failed), NO retry button"
    - path: "web/src/components/DiffCanvas.tsx"
      role: "4-state router: loading/empty/error/diff per AppState.phase"
    - path: "web/src/components/DiffView.tsx"
      role: "@git-diff-view/react DiffView named export, data.hunks: string[], DiffModeEnum.Unified"
    - path: "web/src/components/DiffView.spike.tsx"
      role: "API probe: confirms DiffView named export, data.hunks prop, renders without crash"
    - path: "web/src/__tests__/states.test.tsx"
      role: "12 tests: loading (2), empty (3), error-unreachable (3), error-fetch-failed (3), diff (1)"
    - path: "web/src/__tests__/diff-view-spike.test.tsx"
      role: "3 tests: import survives, named DiffView export exists, renders without crashing"
  modified:
    - path: "web/src/App.tsx"
      role: "Replaced Plan-05 stub with real 4-phase router (useAppStore + DiffCanvas)"
key_decisions:
  - "git-diff-view-named-export: @git-diff-view/react@0.1.3 exports DiffView as a named export (not default). Confirmed from index.d.ts. API: data: { oldFile?, newFile?, hunks: string[] } where hunks is an array of raw hunk strings (header + lines). DiffModeEnum.Unified = 4."
  - "canvas-mock-in-spike: @git-diff-view/react uses TextMeasure internally which calls canvas.getContext('2d') for text width measurement. happy-dom returns null for getContext, causing 'Cannot set properties of null (setting font)'. Fixed by mocking HTMLCanvasElement.prototype.getContext to return { font, measureText } in the spike test's beforeAll. The library works correctly in real browsers."
  - "diffview-tx-to-real-library: DiffView.tsx built using confirmed API shape from spike. Converts DiffModel.hunks (parsed objects) back to hunk strings for the library's data.hunks prop. Isolation maintained: only DiffView.tsx imports @git-diff-view/react (Pitfall-7 defense)."
  - "ErrorState-no-JSX-entity: fetch-failed body uses React JSX node with literal curly apostrophe (&apos;) for 'couldn't' to pass both tsc strict mode and the grep assertion for the raw character."
requirements_completed: [SEC-04]
duration: "~4min"
completed: "2026-04-16"
---

# Phase 01 Plan 06: Diff Canvas Summary

**4-state diff canvas with @git-diff-view/react@0.1.3 wiring verified by spike — LoadingState skeleton, EmptyState with UI-SPEC copy, ErrorState with 2 variants and no retry button, DiffView wrapping the confirmed named-export DiffView component; App.tsx replaced with real 4-phase router; 37 tests green, build exits 0**

## Performance

- **Duration:** ~4 minutes
- **Started:** 2026-04-16T16:48:00Z
- **Completed:** 2026-04-16T16:52:04Z
- **Tasks:** 2
- **Files modified:** 8 created + 1 modified

## @git-diff-view/react@0.1.3 Spike Result

**Spike PASSED — no fallback needed.**

| Probe | Result |
|-------|--------|
| Import without throwing | PASS |
| Named `DiffView` export exists | PASS (`export declare const DiffView: typeof ReactDiffView`) |
| `DiffModeEnum.Unified` value | `4` (confirmed from enum declaration) |
| `data.hunks` prop type | `string[]` — array of raw hunk strings |
| Renders without crashing | PASS (after canvas.getContext mock for happy-dom) |
| Fallback to react-diff-viewer-continued | NOT TRIGGERED |

**API shape confirmed:**
```tsx
<DiffView
  data={{
    oldFile: { fileName: 'a.ts' },
    newFile: { fileName: 'b.ts' },
    hunks: ['@@ -1,1 +1,1 @@\n-old line\n+new line'],
  }}
  diffViewMode={DiffModeEnum.Unified}
/>
```

## Build Output

```
dist/index.html                     0.48 kB │ gzip:   0.32 kB
dist/assets/index-CVjwt4eB.css      6.34 kB │ gzip:   2.24 kB
dist/assets/index-BAm-_yWI.js   1,246.12 kB │ gzip: 396.59 kB
```

- Bundle size increased from 196kB to 1.24MB (Plan-05 → Plan-06) due to `@git-diff-view/react` inclusion
- `dist/index.html` contains `__NONCE__` exactly once: YES (Plan-05's noncePlugin preserved)
- `pnpm --filter web exec tsc --noEmit`: exits 0
- `pnpm --filter web build`: exits 0

## Task Commits

1. **Task 1 RED: failing tests** — `648169f` (test)
2. **Task 1 GREEN: state components + DiffCanvas + spike** — `2506ff7` (feat)
3. **Task 2 GREEN: real DiffView + App.tsx replacement** — `66d221b` (feat)

## Accomplishments

- All 4 UI-SPEC diff canvas states implemented per spec
- Verbatim copy verified: "No changes", "This diff has no changed files...", "Review unavailable", "Couldn't load diff" (with curly apostrophe)
- No retry button in ErrorState (grep confirms zero `<button>` elements)
- No `dangerouslySetInnerHTML` anywhere in web/src/ (T-01-04 defense)
- `@git-diff-view/react` isolated to DiffView.tsx only (Pitfall-7 isolation)
- App.tsx stub replaced — Plan-05's "Plan 06 mounts the diff canvas here." comment removed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Canvas Mock] @git-diff-view/react TextMeasure crashes in happy-dom**
- **Found during:** Task 1 spike test (diff-view-spike.test.tsx "renders without crashing")
- **Issue:** `@git-diff-view/react@0.1.3` uses `TextMeasure` internally which calls `canvas.getContext('2d').font = '...'`. In happy-dom, `canvas.getContext('2d')` returns null. This is a test environment limitation — the library works correctly in real browsers.
- **Fix:** Added `beforeAll` in `diff-view-spike.test.tsx` that mocks `HTMLCanvasElement.prototype.getContext` to return `{ font: '', measureText: () => ({ width: 0 }) }`. Used `(HTMLCanvasElement.prototype as any).getContext` to avoid TypeScript overload-resolution errors.
- **Files modified:** `web/src/__tests__/diff-view-spike.test.tsx`
- **Decision:** NOT a Pitfall-3 fallback trigger. The library API is confirmed and works. The crash is a headless DOM limitation. Fallback to `react-diff-viewer-continued` would have been unnecessary.

None of the other plan-defined deviations occurred. `react-diff-viewer-continued` fallback was NOT needed.

## Security Review (Threat Model T-01-04)

| Threat | Mitigation Applied | Status |
|--------|-------------------|--------|
| T-01-04: XSS via diff content | React auto-escapes all `{text}` interpolation in components | MITIGATED |
| T-01-04: dangerouslySetInnerHTML | `grep -rn "dangerouslySetInnerHTML" web/src/` returns zero matches | CONFIRMED |
| R-PITFALL-3: pre-1.0 library API instability | Spike test passed; API shape confirmed from index.d.ts | CLOSED |
| R-PITFALL-7: Shiki token shape mismatch | DiffView.tsx isolated to one file; token prop accepted but not wired to library's highlighter hook in Phase 1 (Phase 2+ concern) | DEFERRED |
| R-UI-SPEC-copy: wrong error copy | All copy verified by grep and test assertions | CLOSED |

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| `tokens` prop accepted but not wired to @git-diff-view/react highlighter hook | `web/src/components/DiffView.tsx` | 11 | Shiki token integration (D-22 + Pitfall-7) requires the `registerHighlighter` adapter; the library uses lowlight by default. Phase 2 wires Shiki tokens. The diff renders without syntax highlighting in Phase 1. |

## Threat Flags

None — all surfaces are within the planned threat model.

## Hand-off Notes for Plan 07

- `web/dist/` is fully built and ready for Plan 03's `render-index.ts` static serving
- `web/src/App.tsx` now uses real `<DiffCanvas state={state} />` — no stubs remain in the router
- Plan 07 wires the plugin manifest and runs the live end-to-end test; no web/ changes expected

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| web/src/components/LoadingState.tsx exists | PASSED |
| web/src/components/EmptyState.tsx exists | PASSED |
| web/src/components/ErrorState.tsx exists | PASSED |
| web/src/components/DiffCanvas.tsx exists | PASSED |
| web/src/components/DiffView.tsx exists | PASSED |
| web/src/components/DiffView.spike.tsx exists | PASSED |
| web/src/__tests__/states.test.tsx exists | PASSED |
| web/src/__tests__/diff-view-spike.test.tsx exists | PASSED |
| web/src/App.tsx has no "Plan 06 mounts" stub text | PASSED |
| web/src/App.tsx contains `<DiffCanvas` | PASSED |
| grep "No changes" EmptyState.tsx | PASSED |
| grep "This diff has no changed files" EmptyState.tsx | PASSED |
| grep "Review unavailable" ErrorState.tsx | PASSED |
| grep "Couldn't load diff" ErrorState.tsx | PASSED |
| grep -rn "<button" ErrorState.tsx returns 0 | PASSED |
| grep -rn "dangerouslySetInnerHTML" web/src/ returns 0 | PASSED |
| grep "@git-diff-view/react" DiffView.tsx returns match | PASSED |
| Only DiffView.tsx imports @git-diff-view/react | PASSED |
| pnpm --filter web exec vitest run exits 0 (37 tests) | PASSED |
| pnpm --filter web exec tsc --noEmit exits 0 | PASSED |
| pnpm --filter web build exits 0 | PASSED |
| Commit 648169f (test RED) | PASSED |
| Commit 2506ff7 (feat GREEN Task 1) | PASSED |
| Commit 66d221b (feat GREEN Task 2) | PASSED |
