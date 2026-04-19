# Phase 3: Diff UI + File Tree + Navigation — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `03-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 03-diff-ui-file-tree-navigation
**Areas discussed:** Design baseline reconciliation · Diff renderer library (Open Decision 1) · File-tree + generated-file handling · Keyboard shortcuts + existing PR comments + CI check status

---

## Gray Area Selection

**Question:** Which Phase 3 gray areas should we discuss? (#1 is a prerequisite — every other area's framing depends on it. Select at least that one.)

| Option | Selected |
|--------|----------|
| 1. Design baseline reconciliation | ✓ |
| 2. Diff renderer library (Open Decision 1) | ✓ |
| 3. File-tree + generated-file handling | ✓ |
| 4. Keyboard shortcuts + existing comments + CI status | ✓ |

All four selected.

---

## Design Baseline Reconciliation

### Q1.1: Which baseline should Phase 3 build on?

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid — keep prototype visuals, swap bespoke DiffViewer for `@git-diff-view/react` | Treat prototype look as Phase-3+ direction but replace the fixture-driven DiffViewer with the approved library reading live DiffModel | |
| Keep prototype as-is, live-wire everything | Treat the committed prototype (incl. bespoke DiffViewer) as the Phase-3 target; rip fixtures, point at live store | ✓ |
| Revert to Phase 1 UI-SPEC, delete prototype | Treat commit c7fe93f as an out-of-process detour; delete prototype components, restore UI-SPEC tree | |
| Fresh redesign via `/gsd-ui-phase 3` | Commission a fresh 03-UI-SPEC to reconcile both inputs formally | |

**User's choice:** Keep prototype as-is, live-wire everything.
**Notes:** Open Decision 1 resolves toward the bespoke renderer as a consequence.

### Q1.2: What happens to `@git-diff-view/react`?

| Option | Description | Selected |
|--------|-------------|----------|
| Remove dependency + delete spike | Drop dep from `web/package.json`, delete spike + test, drop CSS import | ✓ |
| Keep as quarantined fallback | Leave dep in tree with a comment header marking it as emergency fallback | |
| Delete spike files but keep the dep installed | Middle ground | |

**User's choice:** Remove dependency + delete spike.

### Q1.3: Acceptance bar for Open Decision 1 resolution toward bespoke?

| Option | Description | Selected |
|--------|-------------|----------|
| Ship a live-fixture-PR validation test | Phase 3 ships a vitest test mounting DiffViewer with a captured DiffModel + ShikiFileTokens; asserts unified + split render, opaque-ID anchors, and a paint budget | ✓ |
| Document the choice in PROJECT.md only | Add a Key Decision row; no new fixture-PR test | |
| Spike against a real upstream PR interactively during planning | Manual visual verification; attach screenshot to PLAN | |

**User's choice:** Ship a live-fixture-PR validation test.

### Q1.4: Phase 4/5 component shells (StageStepper, ChatPanel, InlineThread) behavior in Phase 3?

| Option | Description | Selected |
|--------|-------------|----------|
| Hide entirely — render only DiffViewer + FileExplorer + TopBar (2-column layout) | Mount shells only when their data is real | ✓ |
| Ship shells with empty states | 3-column layout; non-functional chrome in Phase 3 | |
| Render behind feature flag in TweaksPanel | Dev toggle reveals the empty shells | |

**User's choice:** Hide entirely — 2-column layout in Phase 3.

### Q1.5: TweaksPanel — dev-only gated, ship as settings, or delete?

| Option | Description | Selected |
|--------|-------------|----------|
| Dev-only — gate behind `?tweaks=1` query param | Author-only toggle available when needed | |
| Ship as visible settings affordance | Single-user tool = author's prefs ARE the app's prefs | |
| Delete — committed defaults only | No tweaks surface at all | ✓ |

**User's choice:** Delete — no tweaks, committed defaults only.

---

## Diff Renderer Library (Open Decision 1)

### Q2.1: Shiki tokens (per D-22 Phase 1) vs client regex highlighter?

| Option | Description | Selected |
|--------|-------------|----------|
| Consume server Shiki tokens; delete regex highlighter | Honor D-22 as locked contract; delete `web/src/utils/highlight.ts` | ✓ |
| Hybrid — Shiki when server tokens exist, regex fallback for missing languages | Keep `highlight.ts` as fallback | |
| Keep client-side regex, drop Shiki server-side (undoes D-22) | Simpler server, lower fidelity | |

**User's choice:** Consume server Shiki tokens; delete regex highlighter.

### Q2.2: Multi-file scroll model

| Option | Description | Selected |
|--------|-------------|----------|
| All files in one long scroll, with per-file section headers | GitHub-PR-style stacked | ✓ |
| One file at a time — sidebar selection swaps content | Deliberate navigation; loses cross-file continuity | |
| Accordion — all files in one scroll, each collapsed by default | User expands what they want | |

**User's choice:** All files in one long scroll with per-file section headers.

### Q2.3: Word-level intra-line diff highlighting?

| Option | Description | Selected |
|--------|-------------|----------|
| Skip — line-level highlight is enough for v1 | Scope discipline; defer to Phase 7 | ✓ |
| Ship it — required for real review UX on rename/minor-edit hunks | Adds `jsdiff` or similar dep | |
| Stub the DOM structure now, ship computation in Phase 7 | Hedges against retrofit cost | |

**User's choice:** Skip — defer to Phase 7 polish or v1.x.

### Q2.4: Validation fixture shape

| Option | Description | Selected |
|--------|-------------|----------|
| Synthetic committed fixture — DiffModel + ShikiFileTokens JSON in `web/src/__tests__/fixtures/` | Reproducible, network-independent | ✓ |
| Live PR fetch in a dev-only spike script — no committed fixture | Manual verification; no CI regression floor | |
| One of YOUR real PRs from a personal repo — captured and committed | Most realistic; embeds your code in fixtures | |

**User's choice:** Synthetic committed fixture.

---

## File-Tree + Generated-File Handling

### Q3.1: Sidebar scope — Changed/Repo toggle — does Repo mode ship?

| Option | Description | Selected |
|--------|-------------|----------|
| Changed-only — drop the toggle entirely | DIFF-03 only needs changed files | |
| Keep toggle, implement Repo mode properly | Full repo-tree fetch + cache + collapse state | |
| Keep UI toggle but disable 'Repo' tab — mark as Phase 7 polish | Preserve the affordance; defer the work | ✓ |

**User's choice:** Keep UI toggle but disable Repo tab.
**Notes:** Deviates from recommendation in favor of preserving the design affordance.

### Q3.2: Review-status state machine

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-on-scroll `untouched → in-progress`; explicit `r`-key marks reviewed | Three-state with IntersectionObserver auto-promote | ✓ |
| Pure explicit — no auto transitions; `r`-key toggles untouched/reviewed | Simpler; drops in-progress signal | |
| Three-state with automatic transitions on ANY interaction (scroll + click + thread-open) | Richer signal; more event-log noise | |

**User's choice:** Auto-on-scroll + explicit `r`-key.

### Q3.3: Generated-file detection rules

| Option | Description | Selected |
|--------|-------------|----------|
| Pure path-pattern allowlist, committed in server code | Hardcoded list; predictable; covers 95% | ✓ |
| Path-pattern PLUS additions-heuristic | Catches unusually-pathed generated files; false-positive risk | |
| User override via `.pair-review.json` in the repo root | Adds config surface; v2 territory | |

**User's choice:** Pure path-pattern allowlist.

### Q3.4: LLM-side exclusion mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Add `generated: boolean` flag to `DiffFile`; no new Phase-3 MCP tools | State-level flag; Phase 4/5 tools filter | ✓ |
| Ship a `get_excluded_files` MCP tool in Phase 3 | Burns a tool-budget slot; no Phase-3 consumer | |
| Always exclude silently — no flag, files just don't appear | Forces divergent DiffModel shapes server-side | |

**User's choice:** Add `generated: boolean` flag; no new MCP tools.

---

## Keyboard Shortcuts + Existing Comments + CI Status

### Q4.1: Keyboard shortcuts scope in Phase 3

| Option | Description | Selected |
|--------|-------------|----------|
| Register all 6; `n`/`p`/`r` fully wired; `c`/`v`/`s` fire a toast | Single keydown listener owns all 6; reserves keys + teaches user | ✓ |
| Register only `n`/`p`/`r` in Phase 3; leave `c`/`v`/`s` unbound | Tighter scope; later-phase reshuffle risk | |
| Register all 6 now with no-op handlers — no user feedback | Minimal code, bad UX | |

**User's choice:** Register all 6; `c`/`v`/`s` toast to teach + reserve.

### Q4.2: `n`/`p` navigation scope (cross-file?)

| Option | Description | Selected |
|--------|-------------|----------|
| `n`/`p` navigate hunks across files seamlessly; auto-marks previous hunk visited | Linear reading; single virtual list | ✓ |
| `n`/`p` within file; `shift+n` / `shift+p` jumps to next/prev file's first hunk | Structured but adds mental overhead | |
| `n`/`p` is file-level; hunk-level is `j`/`k` (vim-style) | Adds unspec'd shortcuts | |

**User's choice:** Cross-file seamless.

### Q4.3: Existing PR comments — source + render

| Option | Description | Selected |
|--------|-------------|----------|
| `gh api` for fetch; read-only markers reuse the `thread-marker` DOM slot | Stays with Phase-1 gh paradigm; reuses prototype surface | ✓ |
| Pull Octokit forward from Phase 6 | Centralized GitHub client; adds dep now | |
| Side-panel-only rendering — no per-line markers | Cheaper but loses line locality | |

**User's choice:** `gh api` + read-only markers on diff lines.

### Q4.4: CI check-run status depth

| Option | Description | Selected |
|--------|-------------|----------|
| Aggregate pill on TopBar, click-to-expand list with name + conclusion | One-shot fetch at session start; no polling | ✓ |
| Compact pill only, no expandable details | Too terse | |
| Full checks panel with 30s refresh poll | Over-invested for Phase 3 | |

**User's choice:** Aggregate pill + expandable list; no polling.

---

## Final Edge Case + Readiness

### Q5.1: Orphan existing comments (anchors no longer in diff)?

| Option | Description | Selected |
|--------|-------------|----------|
| Hide in Phase 3; add a Phase 7 'Orphan comments' panel | Scope discipline; stderr logs skipped count | ✓ |
| Show as badges at the affected file's header | Inline collapsed list above the first hunk | |
| Show in an 'Orphan comments' side panel now, not Phase 7 | Pulls Phase 7 polish forward | |

**User's choice:** Hide in Phase 3; defer panel to Phase 7.

### Q5.2: Ready for context?

| Option | Selected |
|--------|----------|
| Ready for context — write CONTEXT.md | ✓ |
| Explore more gray areas | |

**User's choice:** Ready for context.

---

## Claude's Discretion

Items explicitly left to Claude / the planner (summary; see `03-CONTEXT.md` §Claude's Discretion for full list):
- Synthetic fixture PR size (5-10 files / 30-50 hunks suggested)
- IntersectionObserver threshold for auto-in-progress (50%/500ms suggested)
- Paint-budget target for validation test (500ms on 50-hunk PR suggested)
- `n`/`p` wrap-around behavior at list boundaries
- Keyboard help visibility (footer hint or skipped)
- Visual distinction between Phase-5 active threads and Phase-3 read-only markers
- CI pill behavior in local-branch mode (hide vs render 'none')
- Repo tab disabled-state styling + tooltip copy
- Whether to repurpose `data.ts` as fixture seed or capture fresh
- Exact `ReadOnlyComment` / `CIStatus` / `CheckRun` type shapes
- Split-mode viewport-width behavior (collapse vs horizontal scroll)
- Resolved-thread visual variant for read-only existing comments

## Deferred Ideas

- Orphan comments sidebar panel (Phase 7)
- Full Repo-mode file tree (Phase 7)
- Word-level intra-line diff (Phase 7 or v1.x)
- Polling CI refresh (Phase 7)
- Failed-check inline log drill-down (Phase 7)
- Keyboard help overlay (Phase 7)
- Octokit adoption (Phase 6)
- TweaksPanel (deleted — not carried forward)
- Per-repo `.pair-review.json` config (v2)
- Authenticated user identity display (`PLUG-V2-01`, Phase 7)
