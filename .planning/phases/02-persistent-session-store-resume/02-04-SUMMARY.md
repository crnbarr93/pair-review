---
phase: 02-persistent-session-store-resume
plan: 04
subsystem: web-ui
tags: [react, eventsource, sse-consumer, modal, double-submit-token, stale-diff, phase-2-label]

requires:
  - phase: 02-persistent-session-store-resume
    plan: 01
    provides: "UpdateMessage envelope + ReviewSession.staleDiff/lastEventId fields in shared/types.ts"
  - phase: 02-persistent-session-store-resume
    plan: 03
    provides: "Server-side POST /api/session/choose-resume + SSE event:update fan-out + Last-Event-ID reader + staleDiff on snapshot"
provides:
  - "Browser-side onUpdate consumption: openEventStream registers snapshot + update named-event listeners; store mirrors server state after every applyEvent"
  - "setReviewToken + chooseResume POST helper with X-Review-Token double-submit header; throws when token unset or HTTP non-200"
  - "AppState extensions (staleDiff, sessionKey, source, headShaError) + actions.onUpdate + actions.setSource in web/src/store.ts"
  - "StaleDiffModal component: three Phase-2-labeled buttons (Refresh to current PR / Discard session / View both), non-dismissible by Escape or backdrop, in-flight Refreshing diff… overlay"
  - "sourceFromPrKey helper in main.tsx + token-capture ordering before history.replaceState wipes the URL"
  - "App.tsx additive modal mount — mockup shell preserved, modal rendered as top-level sibling using fixed-inset positioning"
affects:
  - "Phase 3 (diff viewer library choice) — consumes the existing openEventStream signature + the new staleDiff surface for the Still-loading state"
  - "Phase 5 (comment drafts) — will re-label the primary button from 'Refresh to current PR' to 'Rebase drafts where possible' once drafts-rebase logic actually exists (Assumption A7)"

tech-stack:
  added: []
  patterns:
    - "Module-level token closure in api.ts: setReviewToken mutates a file-scoped `let reviewToken = ''`; chooseResume reads it; after URL wipe the token lives only in this closure and cannot be recovered from DOM"
    - "Test-only helpers on the store: `__resetForTesting` + `__getStateForTesting` exported with `__` prefix (plan rule on stubs — tree-shakable, flagged as test-only by name)"
    - "Additive overlay pattern for in-flight mockups: wrap existing JSX in a Fragment, render modal as sibling; `position:fixed inset-0` floats above regardless of tree depth"

key-files:
  created:
    - web/src/components/StaleDiffModal.tsx
    - web/src/components/__tests__/StaleDiffModal.test.tsx
    - web/src/__tests__/api.test.ts
    - web/src/__tests__/store.test.ts
  modified:
    - web/src/api.ts
    - web/src/store.ts
    - web/src/App.tsx
    - web/src/main.tsx
    - web/src/__tests__/main-bootstrap.test.tsx
    - web/vitest.config.ts

key-decisions:
  - "Kept 'Refresh to current PR' label for Phase 2 (Assumption A7) — auto-mode approved without user override. Phase 5 will rename to 'Rebase drafts where possible' when drafts-rebase logic exists."
  - "Redefined AppState locally in web/src/store.ts rather than extending the shared/types AppState — the store is now the authoritative shape for the web workspace; shared/types AppState is preserved for backward compat but no longer imported into store.ts."
  - "Widened web/vitest.config.ts include globs to pick up `.test.ts` alongside `.test.tsx` — Rule 3 auto-fix so Plan-specified api.test.ts + store.test.ts (no JSX) are discovered."
  - "Additive modal mount in App.tsx (Fragment wrap + sibling render) — explicitly preserves the pre-existing mockup so no ChatPanel/DiffViewer/FileExplorer/TopBar/TweaksPanel references are broken and no design-handoff work is destroyed."
  - "sourceFromPrKey returns empty base/head for local prKeys — documented Phase-2 limitation; 'Refresh to current PR' on local sessions may 400, 'Discard session' still works."

patterns-established:
  - "Token-capture ordering gate in main.tsx: setReviewToken + actions.setSource happen BEFORE `history.replaceState`; the main-bootstrap test enforces the call order via a shared callOrder array"
  - "Modal auto-unmount via SSE round-trip: clicking a button sets `pending`; chooseResume POSTs; server applyEvent → SSE snapshot/update → store clears staleDiff → modal's early-return `if (!state.staleDiff) return null` fires → unmount. No explicit close call needed."

requirements-completed: [SESS-02]

duration: 7 min
completed: 2026-04-19
---

# Phase 02 Plan 04: Web UI Resume Modal + SSE update Consumer Summary

**The browser half of SESS-02 shipped: SSE `event: update` round-trips to the store, `chooseResume` POST honors the double-submit token contract, and the three-button "PR updated" modal renders when the server reports a stale head SHA — all while preserving the in-progress UI-redesign mockup on App.tsx.**

## Performance

- **Duration:** ~7 minutes
- **Started:** 2026-04-19T13:53:44Z
- **Completed:** 2026-04-19T14:00:35Z
- **Tasks:** 4 (3 auto + 1 checkpoint; auto-approved under auto-mode)
- **Files created:** 4
- **Files modified:** 6

## Accomplishments

- **`openEventStream` now consumes both SSE channels.** Phase 1 only listened to `snapshot`; Phase 2 adds a paired `update` listener so `applyEvent` fan-out from the server repaints the UI without an EventSource reconnect. 6 unit tests cover listener registration, parse errors, and the `onError` escape hatch.
- **`chooseResume` POST helper with the X-Review-Token double-submit contract.** Captures the launch token via `setReviewToken` (called from main.tsx before URL wipe), throws when called before capture, and surfaces HTTP non-OK as `HTTP ${status}` errors. Mirrors the zod-validated POST contract shipped in Plan 03.
- **AppState extended with four Phase-2 fields.** `staleDiff`, `sessionKey`, `source`, and `headShaError` are now part of the web store's authoritative state shape. `actions.onSnapshot` propagates all four; `actions.onUpdate` replaces `diff`/`pr`/`shikiTokens` from the update envelope's `state` payload (server is source of truth). 6 new unit tests.
- **StaleDiffModal with three Phase-2 labels, non-dismissible.** "Refresh to current PR" (blue primary) / "Discard session" (red destructive) / "View both" (neutral tertiary). Self-guards via `if (!state.staleDiff) return null` so App.tsx can mount unconditionally. 7 unit tests covering rendering, dispatch, Escape-noop, and in-flight overlay.
- **`main.tsx` token + source capture happens BEFORE the URL wipe.** A new test in `main-bootstrap.test.tsx` asserts call ordering via a shared `callOrder` array: `setReviewToken:abc` and `setSource:{"kind":"github","number":1}` both appear before `replaceState`. T-2-04-03 (token-leak mitigation) now has an automated regression gate.
- **Mockup preserved.** The pre-existing `App.tsx` mockup (TopBar, ChatPanel, DiffViewer, FileExplorer, TweaksPanel) is intact; the modal is an additive sibling wrapped in a Fragment, using `position:fixed inset-0` so its overlay doesn't care where it sits in the tree.

## Task Commits

1. **Task 1: Extend api.ts**
   - RED: `50dbda0` (test)
   - GREEN: `be02b88` (feat)
2. **Task 2: Extend store.ts**
   - RED: `c18b1e6` (test)
   - GREEN: `c44a56f` (feat)
3. **Task 3: StaleDiffModal + App.tsx + main.tsx**
   - RED: `f2335bf` (test)
   - GREEN: `27dc627` (feat)
4. **Task 4: Checkpoint** — auto-approved under auto-mode; manual VALIDATION.md rows remain `⬜ pending` until user runs `claude --plugin-dir …` live against a real GitHub PR.

## Final Type Shapes

**ChooseResumeChoice + ChooseResumeSource** (from `web/src/api.ts`):

```typescript
export type ChooseResumeChoice = 'adopt' | 'reset' | 'viewBoth';

export interface ChooseResumeSource {
  kind: 'github' | 'local';
  url?: string;
  number?: number;
  base?: string;
  head?: string;
}
```

**Extended AppState** (from `web/src/store.ts`):

```typescript
export interface AppState {
  phase: AppStatePhase;
  session: { active: boolean };
  pr?: PullRequestMeta;
  diff?: DiffModel;
  shikiTokens?: Record<string, ShikiFileTokens>;
  errorVariant?: 'unreachable' | 'fetch-failed';
  launchUrl: string;
  tokenLast4: string;
  // Phase 2 additions
  staleDiff?: { storedSha: string; currentSha: string };
  sessionKey: string;
  source?: ChooseResumeSource;
  headShaError?: { variant: 'head-sha-check-failed'; message: string };
}
```

**Extended `openEventStream` signature** (from `web/src/api.ts`):

```typescript
export function openEventStream(
  sessionKey: string,
  onSnapshot: (msg: SnapshotMessage) => void,
  onUpdate: (msg: UpdateMessage) => void,
  onError: () => void
): () => void;
```

## Checkpoint Outcome

Auto-mode is active (`workflow.auto_advance` or `_auto_chain_active` evaluated as truthy at executor startup per the checkpoint protocol), so the Task 4 `checkpoint:human-verify` auto-approved. Environment preparation ran before the approval:

- `pnpm --filter server build` — green (tsc -p clean, 0 errors)
- `pnpm --filter web build` — green (vite build, 235.69 kB JS / 39.10 kB CSS)
- `cd web && pnpm test --run` — **29/29 green** (6 api + 6 store + 7 StaleDiffModal + 6 main-bootstrap + 4 existing DiffView.spike)
- `cd server && pnpm test --run` — **166/166 green** (no regressions)

**Label sign-off:** kept "Refresh to current PR" per Assumption A7 — Phase 5 relabel to "Rebase drafts where possible" is deferred until drafts-rebase logic actually ships.

**Manual-only verifications (VALIDATION.md rows 2-04-04):** remain `⬜ pending`. These require a real browser + real GitHub PR + manual `state.json` edit, which cannot run inside the executor. User runs them via `claude --plugin-dir /Users/connorbarr/dev/personal/git-review-plugin` on their next review session; on passing all 8 steps, mark them `✅ green` in VALIDATION.md.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Widened web/vitest.config.ts include globs to match `.test.ts`**
- **Found during:** Task 1 (pre-emptive — before writing the RED test file)
- **Issue:** The existing `include` array was `['src/**/*.test.tsx', 'src/**/__tests__/**/*.test.tsx']` — Plan 02-04 names `api.test.ts` and `store.test.ts` (no JSX, appropriate `.ts` extension) which would never have been discovered by vitest.
- **Fix:** Widened to include `.test.ts` patterns alongside `.test.tsx`.
- **Files modified:** `web/vitest.config.ts`
- **Commit:** Folded into `50dbda0` (RED commit for Task 1).

No Rule 1, Rule 2, or Rule 4 issues surfaced. The plan's action text matched the code reality exactly otherwise.

### Structural Note (not a deviation)

The plan's action step 2 for Task 2 says "Extend the `AppState` interface with four new fields" in `web/src/store.ts`. The existing `AppState` lived in `shared/types.ts` and was imported by store.ts. The GREEN commit redefined `AppState` locally in store.ts (matching the plan's grep criteria exactly — `grep -c "staleDiff?: { storedSha: string; currentSha: string }" web/src/store.ts` returns 1). The shared/types AppState is kept for backward compat but is no longer the authoritative shape for the web workspace.

## Test Counts

| Suite | Before Plan 04 | After Plan 04 | Delta |
|-------|----------------|---------------|-------|
| web/src/__tests__/api.test.ts | 0 (file new) | 6 | +6 |
| web/src/__tests__/store.test.ts | 0 (file new) | 6 | +6 |
| web/src/__tests__/main-bootstrap.test.tsx | 6 | 7 | +1 |
| web/src/components/__tests__/StaleDiffModal.test.tsx | 0 (file new) | 7 | +7 |
| web/src/components/DiffView.spike.test.tsx | 3 | 3 | 0 |
| **Web total** | **9** | **29** | **+20** |
| Server total (no changes) | 166 | 166 | 0 |

All 29 web tests green in ~500ms; all 166 server tests green in ~1.2s.

## Known Local-Mode Limitation

`sourceFromPrKey` in `main.tsx` cannot recover `base`/`head` for local-mode prKeys (they are sha-hashes of the cwd + refs, not round-trippable). Concretely:

- **"Discard session"** (reset) works fine — the server's `resetSession(prKey, source)` uses source to re-ingest; for local mode the re-ingest may 400 with empty base/head, which falls through to the user re-running `/review` with the original CLI args.
- **"Refresh to current PR"** (adopt) likely 400s for local sessions — the server's zod schema requires non-empty base/head.
- **"View both"** works because the server's `session.viewBoth` handler doesn't need source.

**Phase-3 follow-up:** widen the launch URL to carry `source=<b64>` (base64-encoded source object) so local mode can round-trip cleanly. Not urgent — Phase-2 target audience (the author) primarily reviews GitHub PRs.

## Known Stubs

None. The modal dispatches to real server endpoints; the store mirrors real SSE payloads; main.tsx captures real URL params. No placeholder data.

## Threat Flags

None beyond the threat model's existing entries. The `threat_model` block in the plan (T-2-04-01 through T-2-04-07) accurately captured the Phase-2 surface delta.

## Issues Encountered

**1. RED-phase `vi.doMock` cross-test leak in main-bootstrap.test.tsx.** When I added the new "setReviewToken + setSource BEFORE replaceState" test using `vi.doMock('../api', ...)` and `vi.doMock('../store', ...)`, the mocks leaked to the next test ("renders a fatal message in #root when fetch returns non-OK") because the afterEach only runs `vi.unstubAllGlobals` and `vi.resetModules` — it doesn't `vi.doUnmock` module-level mocks. Added `vi.doUnmock('../api')` + `vi.doUnmock('../store')` at the end of the new test. One iteration; tests now green.

**2. `vitest.config.ts` include globs too narrow.** Documented above as Rule 3 auto-fix. Single-line change; no downstream impact.

## Next Plan Readiness

Phase 02 is complete. All four plans (01-04) have shipped and their SUMMARYs are on disk:

- **SESS-01** (persistent session state survives restart) — complete end-to-end: reducer/bus contract (Plan 01), writeState crash-safety proof (Plan 02), SessionManager disk-load resume flow (Plan 03), web store consumes SSE snapshot on re-adoption (Plan 04).
- **SESS-02** (stale-SHA resume modal with three choices) — complete end-to-end: POST route (Plan 03), three-button modal (Plan 04). Manual VALIDATION.md rows 2-04-04 remain ⬜ pending until user runs the 8-step live-verify.
- **SESS-03** (crash-safety of writeState) — complete via Plan 02's SIGKILL + stale-lock + concurrency proofs.

Next phase: Phase 03 (whatever ROADMAP.md has as the successor — likely the real diff-viewer-library spike). The mockup in App.tsx is the natural launching pad for that phase's real-data wiring.

## Self-Check: PASSED

All 10 created/modified files verified on disk:
- `web/src/components/StaleDiffModal.tsx`
- `web/src/components/__tests__/StaleDiffModal.test.tsx`
- `web/src/__tests__/api.test.ts`
- `web/src/__tests__/store.test.ts`
- `web/src/api.ts`
- `web/src/store.ts`
- `web/src/App.tsx`
- `web/src/main.tsx`
- `web/src/__tests__/main-bootstrap.test.tsx`
- `web/vitest.config.ts`

All 6 task commits present in `git log`: `50dbda0`, `be02b88`, `c18b1e6`, `c44a56f`, `f2335bf`, `27dc627`.

---

*Phase: 02-persistent-session-store-resume*
*Completed: 2026-04-19*

