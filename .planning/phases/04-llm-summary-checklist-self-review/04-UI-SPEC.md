---
phase: 4
slug: llm-summary-checklist-self-review
status: draft
shadcn_initialized: false
preset: none
created: 2026-04-20
extends: .planning/phases/03-diff-ui-file-tree-navigation/03-UI-SPEC.md
---

# Phase 4 — UI Design Contract

> Visual and interaction contract for the LLM Summary + Checklist + Self-Review surfaces.
> This document EXTENDS the Phase 3 UI-SPEC. Every token, spacing value, typography rule,
> and color decision in `03-UI-SPEC.md` is inherited without repetition. This spec adds ONLY
> what is new or overridden in Phase 4.
>
> Downstream executor must read both documents. In any conflict, Phase 4 takes precedence.

---

## Design System

Inherited from Phase 3, unchanged.

| Property | Value |
|----------|-------|
| Tool | none (hand-rolled CSS tokens at `:root` in `web/src/index.css`) |
| Preset | not applicable — shadcn deliberately not adopted |
| Component library | none — bespoke components in `web/src/components/` |
| Icon library | Inline SVG helpers `Ic.*` in `web/src/components/icons.tsx` (Lucide-derived) |
| Fonts | Sans: `Inter Tight` (→ `ui-sans-serif`). Mono: `JetBrains Mono` (→ `ui-monospace`). |
| CSS strategy | `:root` CSS variables are the source-of-truth token surface. |
| Theme | Light-mode only (paper-and-teal). Dark mode abandoned. |

**shadcn gate result:** shadcn not in use and not introduced in Phase 4. Registry safety gate: not applicable.

---

## Spacing Scale

Inherited from Phase 3. No new values introduced.

**Phase 4 additions to the spacing matrix:**

| Token | Value | Usage |
|-------|-------|-------|
| (inherited) xs | 6px | Gap between severity pill and finding text in FindingsSidebar rows |
| (inherited) sm | 8px | Padding inside category chip, inner vertical rhythm of finding rows |
| (inherited) md | 12px | FindingsSidebar section header padding, StageStepper band inner top/bottom |
| (inherited) base | 14px | FindingsSidebar category section collapsed-header clickable area padding |
| (inherited) lg | 16px | FindingsSidebar panel horizontal padding, summary-drawer horizontal padding |
| (inherited) 2xl | 24px | Top padding of summary-drawer open state (visual breathing room before keyChanges list) |

**Off-grid exceptions added in Phase 4:**

| Value | Where | Why |
|-------|-------|-----|
| 52px | `grid-template-rows: 44px 52px 1fr` — StageStepper row, added above main | Matches the prototype's reserved value for this row; consistent with Phase 3's comment "was: 44px 52px 1fr" |
| 5px | Coverage chip vertical padding | Chip height target: 24px at 13px body = 24 - 13×1.45 ÷ 2 ≈ 5px top/bottom |

---

## Typography

Inherited from Phase 3. No new sizes or weights introduced.

Phase 4 surfaces map to existing roles as follows:

| Phase 4 surface | Role from Phase 3 spec |
|-----------------|----------------------|
| Finding `.title` text | Body (13px / 400) |
| Finding `.rationale` text | Body (13px / 400) |
| Severity pill label | Caption (11px / 500) |
| Category chip label in StageStepper | Caption (11px / 500) |
| Summary `.paraphrase` body | Body (13px / 400 / 1.45 line-height) |
| Summary `.intent` chip label | Caption (11px / 500) |
| Summary `keyChanges` list items | Body (13px / 400) |
| Summary `riskAreas` list items | Body (13px / 400) |
| FindingsSidebar section heading | Body strong (13px / 600, uppercase micro pattern) |
| `file:line` ref in finding rows | Code small (11px / 400 / mono) |
| "Author's description" section label | Micro (10.5px / 600, uppercase, `--ink-4`) |
| StageStepper step `.label` | Body strong (13px / 500, already in `.stage .label` CSS) |
| StageStepper step `.sub` | Caption (11px / 400, already in `.stage .sub` CSS) |

**No new weights, sizes, or letter-spacings.** Executor must not introduce additional type scales.

---

## Color

All tokens inherited from Phase 3 `web/src/index.css`. No new CSS variables are introduced in Phase 4. The existing semantic tokens are mapped to Phase 4 surfaces below.

### Phase 4 token assignments

**Severity pills (finding rows in FindingsSidebar):**

| Severity | Background | Foreground | Border |
|----------|-----------|-----------|--------|
| `blocker` | `--block-bg` (`#F3DFD8`) | `--block` (`#9B3B2E`) | `--line` |
| `major` | `--warn-bg` (`#F6EED9`) | `--warn` (`#B5791F`) | `--line` |
| `minor` | `--paper-2` | `--ink-2` | `--line` |
| `nit` | `--paper-2` | `--ink-4` | `--line` |

**Coverage chips (5-chip tag strip in StageStepper band):**

| Coverage state | Background | Foreground | Border |
|----------------|-----------|-----------|--------|
| `pass` | `--ok-bg` (`#DEEBE1`) | `--ok` (`#3A7A55`) | `--line` |
| `partial` | `--warn-bg` (`#F6EED9`) | `--warn` (`#B5791F`) | `--line` |
| `fail` | `--block-bg` (`#F3DFD8`) | `--block` (`#9B3B2E`) | `--line` |
| `not-run` (no selfReview yet) | `--paper-2` | `--ink-4` | `--line` |

**Intent chip (summary pane):**

| Intent | Background | Foreground |
|--------|-----------|-----------|
| `bug-fix` | `--block-bg` | `--block` |
| `feature` | `--claude-2` | `--claude` |
| `refactor` | `--warn-bg` | `--warn` |
| `chore` | `--paper-2` | `--ink-3` |
| `other` | `--paper-2` | `--ink-4` |

**FindingsSidebar panel and summary drawer:**

| Element | Color |
|---------|-------|
| Panel background | `--paper` |
| Panel border (left edge separator) | `--line` (1px) |
| Section header background | `--paper-2` |
| Section header text | `--ink-2` (uppercase micro weight) |
| Finding row background (default) | `--paper` |
| Finding row background (hover) | `--paper-2` |
| Finding row background (active / scrolled-to) | `--claude-2` |
| Finding row left rail (when active) | `--claude` (2px, matching FileExplorer active pattern) |
| `file:line` ref text | `--ink-4` (mono, de-emphasized) |
| `file:line` ref hover | `--claude` (underline, cursor pointer) |
| Rationale expand toggle | `--ink-4` |
| Collapse arrow icon | `--ink-3` |
| "Expand" affordance (collapsed rationale) | `--ink-4` |

**StageStepper stage states (already in CSS, confirmed for Phase 4):**

| Stage state | Number circle bg | Number fg | Label color | Bottom border |
|-------------|-----------------|-----------|-------------|---------------|
| `done` | `--claude` | `#fff` | `--ink-2` | transparent |
| `active` | `--ink` | `--paper` | `--ink` | `--ink` (2px) |
| `default` (pending) | `--paper` | `--ink-3` | `--ink-3` | transparent |
| `disabled` | `--paper` | `--ink-4`, opacity 0.5 | `--ink-4`, opacity 0.5 | transparent |

**Summary drawer background:** `#FFFDF7` (matching the `thread-panel` warm off-white from existing CSS — visually separates drawer from main `--paper` surface without introducing a new token).

**Accent usage additions in Phase 4 (appended to Phase 3's reserved list):**

- `--claude`: Active finding row left-edge rail (matches active-file rail in FileExplorer)
- `--claude-2`: Active finding row background
- `--claude-2` / `--claude`: `feature` intent chip background / foreground
- `--claude`: StageStepper `done` stage number circle (already in CSS, now formally used in Phase 4 flow)

**Accent is still NOT used for:** generic hover states, general interactive feedback, or the open/close toggle on FindingsSidebar (uses neutral `--ink-3`/`--paper-2`).

---

## Layout Contract

Phase 4 modifies the Phase 3 2-row, 2-column layout as follows:

### Row expansion: StageStepper

The `.app` grid adds the StageStepper row that Phase 3 deliberately deferred (per D-02):

```css
.app {
  grid-template-rows: 44px 52px 1fr;  /* TopBar | StageStepper | main */
}
```

The StageStepper occupies the 52px band between TopBar and the main 2-column area.

### Column expansion: FindingsSidebar

The `.main` grid expands to three columns on wide viewports when FindingsSidebar is open:

```css
/* Sidebar open (≥1280px viewport) */
.main {
  grid-template-columns: 280px 1fr 280px;  /* FileExplorer | DiffViewer | FindingsSidebar */
}

/* Sidebar closed OR viewport <1280px */
.main {
  grid-template-columns: 280px 1fr;  /* FileExplorer | DiffViewer */
}
```

**Narrow viewport behavior (<1280px, sidebar open):** FindingsSidebar renders as a right-edge overlay with `position: fixed; right: 0; top: 96px; bottom: 0; width: 280px; z-index: 30` — it does NOT push the DiffViewer column. This avoids a jarring layout shift on common laptop screens. The overlay has a 1px `--line` left border and `box-shadow: -4px 0 12px rgba(0,0,0,0.06)`.

**<768px viewport:** FindingsSidebar toggle is removed from TopBar; sidebar is inaccessible (not needed for this single-user local desktop tool at this viewport width).

### Updated layout diagram:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TopBar (44px)                                                                │
│ [Brand] [PR meta] [Branch pill] ......... [CI pill] [Findings ⊞] [Settings] │
├──────────────────────────────────────────────────────────────────────────────┤
│ StageStepper (52px)                                                          │
│ ①Summary  ②Self-review  ③Walkthrough(dim)  ④Submit(dim)  [coverage chips]   │
├──────────────────┬─────────────────────────────┬───────────────────────────┤
│                  │                             │                           │
│ FileExplorer     │  DiffViewer                 │  FindingsSidebar          │
│ (280px)          │  (1fr)                      │  (280px, toggleable)      │
│                  │                             │                           │
│                  │  ┌─ summary drawer ───────┐ │  [Correctness (2)]        │
│                  │  │ (anchored to step 1)   │ │  ▶ blocker: title…        │
│                  │  └────────────────────────┘ │  ▶ major: title…          │
│                  │                             │                           │
│                  │  <diff hunks>               │  [Security (1)]           │
│                  │                             │  ▶ major: title…          │
│                  │                             │                           │
└──────────────────┴─────────────────────────────┴───────────────────────────┘
```

---

## Component Contracts

### StageStepper band

Mounts the existing `.stages` / `.stage` CSS from `index.css` (already on disk per Phase 3 D-02). Phase 4 wires it to session state.

**Four steps, in order:**

| # | Label | Sub-label | State logic |
|---|-------|-----------|-------------|
| 1 | `Summary` | `{intent} · {confidence%}` when available; `"Not generated"` otherwise | `done` when `session.summary !== null`; `active` when no selfReview; `default` otherwise |
| 2 | `Self-review` | `{N} findings` when available; `"Not run"` otherwise | `done` when `session.selfReview !== null`; `active` when summary exists but no selfReview; `default` otherwise |
| 3 | `Walkthrough` | `"Phase 5"` | Always `disabled` in Phase 4 |
| 4 | `Submit` | `"Phase 6"` | Always `disabled` in Phase 4 |

**Disabled step visual:** opacity 0.5, cursor `not-allowed`. No click handler registered. Native `title` tooltip: `"Walkthrough available in Phase 5"` / `"Submit available in Phase 6"`.

**Step click behavior (active steps):**
- Click step 1 when `session.summary !== null` → opens summary drawer (toggles).
- Click step 2 when `session.selfReview !== null` → scrolls FindingsSidebar to top and ensures it is open.
- Click step 1 when `session.summary === null` → no action; cursor default.
- Click step 2 when `session.selfReview === null` → no action; cursor default.

**5-chip coverage tag strip:** Rendered as a `chip-row` (existing class) positioned right-of-center in the StageStepper band via `flex: 1` + `justify-content: flex-end` on the stage container. Appears only when `session.selfReview !== null`; hidden (zero height, no placeholder) otherwise.

One chip per category in CHECKLIST order: Correctness, Security, Tests, Performance, Style.

Chip anatomy: `{CategoryLabel} ({N})` where N is the count of findings in that category. Click scopes FindingsSidebar filter to that category (second click clears filter).

---

### Summary Drawer

An expandable panel anchored below the StageStepper band (not a modal, not a sidebar — an in-flow drawer that pushes down the DiffViewer's visible area).

**Trigger:** click the step-1 chip in StageStepper, OR expand an affordance rendered inside DiffViewer's top area when `session.summary !== null`.

**Drawer height:** 180px when open (compact summary); the DiffViewer scrollable area shrinks accordingly. No resize handle in Phase 4.

**Drawer anatomy (top to bottom):**

| Sub-element | Content | Style |
|-------------|---------|-------|
| Intent chip | `{intent}` label | Severity-style chip using intent color mapping (see Color section) |
| Intent confidence | `{Math.round(intentConfidence * 100)}% confidence` | Caption (11px), `--ink-4`, mono |
| Paraphrase paragraph | `session.summary.paraphrase` (full text, line-clamped at 3 lines with "Read more" if overflow) | Body (13px / 400 / 1.45) |
| "Author's description" section | Collapsible; initially collapsed. Shows the original PR description from the session. | Micro label (10.5px, uppercase, `--ink-4`); body text same as paraphrase style |
| Key Changes list | `session.summary.keyChanges` as a `<ul>` with `•` bullets | Body (13px / 400) |
| Risk Areas list | `session.summary.riskAreas` as a `<ul>` with `⚠` prefix | Caption (11px / 400), `--warn` for the glyph |
| Regenerate affordance | `Regenerate summary` button, right-aligned | `.btn-sm` class (existing), `--ink-2` text |
| Drawer close | `×` icon button, top-right corner | `--ink-4`, hover `--ink-2` |

**Drawer background:** `#FFFDF7` (warm off-white, matching `.thread-panel`). Bottom border: 1px `--line`.

**Empty state (summary null):** Drawer does not render. Instead, StageStepper step 1 sub-label reads `"Not generated"` and clicking it is a no-op. The user learns to invoke `set_pr_summary` from Claude Code.

---

### FindingsSidebar

A new right-edge panel component. File: `web/src/components/FindingsSidebar.tsx`.

**Toggle:** A `⊞ Findings` button in TopBar (right of CI pill, left of Settings). Uses `.topbtn` class. When sidebar is open, button has `background: var(--claude-2); color: var(--claude)` (active state, matches FileExplorer tab pattern). No icon beyond the label in Phase 4.

**Panel dimensions:** 280px wide (matching FileExplorer width for visual balance), full height of `.main` area.

**Panel structure:**

```
┌─ FindingsSidebar ──────────────────────┐
│ FINDINGS                    [×] [Filter▾] │
│ ─────────────────────────────────────── │
│ ▼ Correctness                 2 findings │
│   ● BLOCKER  auth/jwt.ts:42             │
│     Null deref in verifyToken  [...]    │
│   ● MAJOR    auth/jwt.ts:87             │
│     Missing expiry check       [...]    │
│ ─────────────────────────────────────── │
│ ▼ Security                    1 finding  │
│   ● MAJOR    server/api.ts:120          │
│     No rate limit on /token    [...]    │
│ ─────────────────────────────────────── │
│ ▶ Tests                       0 findings │
│ ▶ Performance                 1 finding  │
│ ▶ Style                       3 findings │
└────────────────────────────────────────┘
```

**Header:** `FINDINGS` label (10.5px / 600 / uppercase / `--ink-4`). Close `×` button (`.btn-sm` equivalent). Filter chip if a category is active.

**Category sections:**

- Collapsible via click on the section header. Sections with findings default to expanded; sections with 0 findings default to collapsed.
- Section header: `▼/▶` chevron (10px, `--ink-4`) + category name (13px / 500, `--ink-2`) + finding count (11px, `--ink-4`, mono, right-aligned).
- Section header background: `--paper-2`. Height: 32px.

**Finding rows:**

Each row contains:
1. Severity pill: `BLOCKER` / `MAJOR` / `MINOR` / `NIT` — pill uses color mapping from Color section (11px / 500, border-radius 3px, padding 1px 6px). Width: fixed at 54px to keep all pills aligned.
2. `file:line` ref: `{basename}:{line}` in mono 11px `--ink-4`. Full path in `title` attribute. Click → scroll DiffViewer to that lineId anchor (reusing Phase 3 `scrollIntoView` rail) + open FindingsSidebar if closed. The file:line text is a clickable link styled with cursor pointer and `--claude` on hover.
3. Finding title: 13px / 400 / `--ink-2`. Single line, ellipsis on overflow.
4. Expand affordance: `…` / `▾` toggle in `--ink-4`. Click reveals `.rationale` text in a collapsible block below the row.

**Rationale block (expanded):** `--paper-2` background, 1px `--line` border-left, `--ink-3` text, 12.5px / 400 / 1.5. Padding: 8px 12px. Below the title row, not a separate panel.

**Row height:** 36px collapsed (enough for severity pill + file:line + title). Grows to auto when rationale is expanded.

**Row hover:** `--paper-2` background.

**Row active (scrolled-to by click):** `--claude-2` background, 2px `--claude` left rail. Transient: fades to default after 1.5s (matching the focused-hunk animation pattern from Phase 3).

**Empty state (selfReview null — sidebar open):**

```
Heading (13px / 500): Self-review not run yet
Body (13px / 400 / --ink-3): Ask Claude to run_self_review to see findings here.
```

Centered vertically in the panel.

**Empty state (selfReview exists, filter active, 0 results):**

```
Heading (13px / 500): No findings in {CategoryName}
Body (13px / 400 / --ink-3): Clear filter to see all {N} finding{s}.
```

**Category filter (chip click from StageStepper):** When a coverage chip is clicked, FindingsSidebar scrolls to that category section and adds a filter badge in the sidebar header. Click the filter badge (or the same coverage chip again) to clear.

**Default open/closed on first selfReview completion:** Opens automatically when `session.selfReview` transitions from `null` to non-null (via SSE `selfReview.set` event). Subsequent open/close is user-controlled.

---

## Copywriting Contract

This section is additive to Phase 3. All Phase 3 copy strings remain in force.

### TopBar additions

| Element | Copy | Notes |
|---------|------|-------|
| FindingsSidebar toggle (closed) | `Findings` | `.topbtn` label — no icon in Phase 4 |
| FindingsSidebar toggle (open) | `Findings` | Same label; active state via `--claude-2` background |

### StageStepper

| Element | Copy | Notes |
|---------|------|-------|
| Step 1 label | `Summary` | Static |
| Step 1 sub (no summary) | `Not generated` | |
| Step 1 sub (summary present) | `{intent} · {N}% confident` | e.g. `"bug-fix · 92% confident"` |
| Step 2 label | `Self-review` | Static |
| Step 2 sub (no selfReview) | `Not run` | |
| Step 2 sub (selfReview present) | `{N} findings` | e.g. `"4 findings"`. Singular: `"1 finding"` |
| Step 3 label | `Walkthrough` | Static |
| Step 3 sub | `Phase 5` | |
| Step 4 label | `Submit` | Static |
| Step 4 sub | `Phase 6` | |
| Step 3 disabled tooltip | `Walkthrough available in Phase 5` | Native `title` attribute |
| Step 4 disabled tooltip | `Submit available in Phase 6` | Native `title` attribute |

### Summary Drawer

| Element | Copy | Notes |
|---------|------|-------|
| "Author's description" section label | `Author's description` | 10.5px uppercase, `--ink-4` |
| Key Changes section label | `Key changes` | 10.5px uppercase, `--ink-4` |
| Risk Areas section label | `Risk areas` | 10.5px uppercase, `--ink-4` |
| Regenerate button | `Regenerate summary` | `.btn-sm`, right-aligned in drawer footer |
| Paraphrase line-clamp "more" | `Read more` | inline link style, `--claude` |
| Paraphrase line-clamp "less" | `Collapse` | inline link style, `--ink-4` |

### FindingsSidebar

| Element | Copy | Notes |
|---------|------|-------|
| Panel header label | `FINDINGS` | 10.5px / 600 / uppercase |
| Close button | `×` | `--ink-4`, 16px × 16px target |
| Section header (collapsed) | `▶ {CategoryName}` + `{N} finding{s}` | Capitalize category name: `Correctness`, `Security`, `Tests`, `Performance`, `Style` |
| Section header (expanded) | `▼ {CategoryName}` + `{N} finding{s}` | Singular: `1 finding` |
| Rationale expand | `Show rationale` | 11px, `--ink-4`, only if rationale is non-empty |
| Rationale collapse | `Hide` | 11px, `--ink-4` |
| Empty state (no selfReview) heading | `Self-review not run yet` | 13px / 500 |
| Empty state (no selfReview) body | `Ask Claude to run self_review to see findings here.` | 13px / 400 / `--ink-3`. Note: `run_self_review` tool name uses mono inline code style. |
| Empty state (filter, 0 results) heading | `No findings in {CategoryName}` | 13px / 500 |
| Empty state (filter, 0 results) body | `Clear filter to see all {N} finding{s}.` | 13px / 400 / `--ink-3` |
| Active category filter badge | `{CategoryName} ×` | `.chip` class (existing), `--paper-2` bg, click clears filter |
| Finding hover title attribute | Full rationale text (truncated at 200 chars) | Native tooltip for keyboard users |

### Error states (Phase 4 additions)

| Trigger | Copy | Display |
|---------|------|---------|
| `run_self_review` zod rejection returned to Claude Code session — UI effect | None. The rejection is an MCP tool error the Claude Code session handles. The UI does not show a partial selfReview. | Server-side only |
| `selfReview.set` SSE event received with findings but empty coverage map | FindingsSidebar renders findings without the coverage chip strip. No error UI. | Silent degradation |
| Summary drawer — empty `keyChanges` array | `keyChanges` section is hidden entirely (no "no key changes" placeholder) | Silent |
| Summary drawer — empty `riskAreas` array | `riskAreas` section shows: `No specific risk areas flagged.` in `--ink-4` italic style | 13px / 400 italic / `--ink-4` |

### Destructive actions (Phase 4)

**None.** Phase 4 introduces no destructive actions. `run_self_review` and `set_pr_summary` are additive-replace operations (they replace the previous value silently, per D-01 and D-08). No confirmation dialog is required.

---

## Component State Matrix (Phase 4 additions)

### StageStepper step states

| Step | When | State |
|------|------|-------|
| Summary | `session.summary === null` AND no selfReview | `active` (user is expected to do this next) |
| Summary | `session.summary !== null` | `done` |
| Summary | `session.selfReview !== null` AND `session.summary === null` | `done` (treat as done even if regenerated later — planner's call on exact heuristic) |
| Self-review | `session.selfReview === null` AND `session.summary !== null` | `active` |
| Self-review | `session.selfReview !== null` | `done` |
| Self-review | `session.summary === null` | `default` (not yet reachable) |
| Walkthrough | Always | `disabled` |
| Submit | Always | `disabled` |

### FindingsSidebar panel states

| State | Trigger | Visual |
|-------|---------|--------|
| Closed | Initial load; user clicks toggle; user clicks `×` | Hidden, `.main` reverts to `280px 1fr` |
| Open (no selfReview) | User clicks toggle before selfReview runs | Empty state copy |
| Open (selfReview present) | Auto-opens on first `selfReview.set`; user toggles | Findings rendered |
| Open (filter active) | User clicks a coverage chip | Filtered view + active filter badge in header |
| Open (finding active) | User clicked a `file:line` ref or a coverage chip scrolled to this row | `--claude-2` bg, `--claude` left rail, fades after 1.5s |

### Coverage chip states

| State | When | Visual |
|-------|------|--------|
| Hidden | `session.selfReview === null` | Not rendered (not `display:none`, not mounted) |
| `not-run` | `selfReview.coverage[cat]` is absent | `--paper-2` bg, `--ink-4` fg |
| `pass` | `selfReview.coverage[cat] === 'pass'` | `--ok-bg` bg, `--ok` fg |
| `partial` | `selfReview.coverage[cat] === 'partial'` | `--warn-bg` bg, `--warn` fg |
| `fail` | `selfReview.coverage[cat] === 'fail'` | `--block-bg` bg, `--block` fg |
| `active` (filter on) | User clicked this chip | Add 2px solid border using the current fg color; slightly heavier label weight (500 → 600) |

---

## Keyboard / Interaction Contract (Phase 4 additions)

The Phase 3 keyboard contracts (`n`/`p`/`r`/`c`/`v`/`s`) are inherited. Phase 4 stub toasts for `c`, `v`, `s` remain in place.

**New interactions:**

| Interaction | Trigger | Behavior |
|-------------|---------|----------|
| Open/close FindingsSidebar | Click `Findings` button in TopBar | Toggle `.main` column count; sidebar slides in/out |
| Scope findings to category | Click coverage chip in StageStepper | Filter FindingsSidebar; chip enters active state |
| Clear category filter | Second click on same chip, OR click filter badge `×` | Clear filter |
| Scroll to finding in diff | Click `file:line` ref in FindingsSidebar | `scrollIntoView` using existing Phase 3 lineId anchor rail |
| Open summary drawer | Click `Summary` step chip in StageStepper | Drawer expands below StageStepper band |
| Close summary drawer | Click `×` in drawer OR click `Summary` step again | Drawer collapses |
| Expand finding rationale | Click `Show rationale` | Inline block expands below row |
| Collapse finding rationale | Click `Hide` | Block collapses |
| Toggle author's description | Click `Author's description` section header | Collapsible section expands/collapses |
| Expand clamped paraphrase | Click `Read more` | `line-clamp` removed, `Collapse` replaces the link |

**No new keyboard shortcuts** are introduced in Phase 4. All panel interactions are mouse-driven.

**Focus management:** When FindingsSidebar auto-opens (triggered by `selfReview.set`), focus stays on the DiffViewer (no forced focus shift). The sidebar is navigable via Tab after the user moves focus there manually.

---

## Token Additions Required for Phase 4

No new CSS variables. Phase 4 uses the existing `:root` token surface exclusively. The table below confirms the mapping.

| Phase 4 concept | Token used | Rationale |
|-----------------|-----------|-----------|
| Blocker finding pill bg | `--block-bg` | Direct semantic fit (existing) |
| Blocker finding pill fg | `--block` | Direct semantic fit (existing) |
| Major finding pill bg | `--warn-bg` | Severity progression: block > warn |
| Major finding pill fg | `--warn` | Severity progression |
| Minor / Nit pill bg | `--paper-2` | De-emphasized; no new semantic color needed |
| Minor / Nit pill fg | `--ink-2` / `--ink-4` | Existing ink scale |
| Pass coverage chip | `--ok-bg` / `--ok` | Direct semantic fit |
| Partial coverage chip | `--warn-bg` / `--warn` | "Needs attention" — semantic fit |
| Fail coverage chip | `--block-bg` / `--block` | Direct semantic fit |
| Not-run coverage chip | `--paper-2` / `--ink-4` | Same as minor pill — absent data |
| Feature intent chip | `--claude-2` / `--claude` | "Positive new capability" — teal is the right semantic |
| Bug-fix intent chip | `--block-bg` / `--block` | "Something was wrong" — semantically correct |
| Refactor intent chip | `--warn-bg` / `--warn` | "Change with behavioral risk" — caution tone |
| Chore / other intent chip | `--paper-2` / `--ink-3` | Neutral |
| Summary drawer background | `#FFFDF7` literal | Reuses existing `.thread-panel` value; no new token |
| FindingsSidebar active row bg | `--claude-2` | Matches FileExplorer active-file pattern |
| FindingsSidebar active row rail | `--claude` | Matches FileExplorer active-file 2px rail |

---

## Accessibility Contract (Phase 4 additions)

Inherited Phase 3 accessibility contract remains in force. Phase 4 additions:

| Concern | Requirement |
|---------|-------------|
| FindingsSidebar panel | `role="complementary"` with `aria-label="Code review findings"` |
| Severity pills | `aria-label="{severity} severity"` in addition to visible text |
| Coverage chips | `aria-label="{category}: {coverage state}"` e.g. `"Security: fail"` |
| StageStepper steps | `aria-current="step"` on the active step; `aria-disabled="true"` on disabled steps |
| Summary drawer | `role="region"` with `aria-label="PR summary"` |
| FindingsSidebar category sections | Collapsible heading pattern: `<button aria-expanded="{bool}">` |
| `file:line` refs | `aria-label="{fullPath} line {line}"` to surface full path to screen readers |
| Auto-open announcement | When FindingsSidebar auto-opens after `selfReview.set`, a `role="status"` `aria-live="polite"` element announces: `"Self-review complete. {N} finding{s} found."` |
| Reduced motion | FindingsSidebar slide animation MUST respect `prefers-reduced-motion: reduce` → instant show/hide |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable — shadcn not initialized |
| third-party | none | not applicable |

Phase 4 adds **no new UI dependencies** to `web/package.json`. All components are bespoke, using existing CSS classes and token surfaces.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending

---

## Appendix A — Claude's Discretion Resolutions

The following items from `04-CONTEXT.md §Claude's Discretion` are resolved in this spec:

| CONTEXT reference | Resolution |
|-------------------|-----------|
| Exact visual weight of category chips (fill vs outline vs dot+label) | Fill chips with border — consistent with Phase 3's CI pill pattern. Coverage chips use fill bg + fg text + `--line` border. Same anatomy as `.chip` class. |
| FindingsSidebar defaults to open or closed on first selfReview completion | Auto-opens on first `selfReview.set` SSE event. Subsequent open/close is user-controlled. |
| Sidebar breakpoint behavior (overlay vs push vs inline on narrow viewports) | ≥1280px → push (3-column grid). <1280px → overlay (`position: fixed`, right-edge, z-index 30). <768px → toggle hidden. |
| Whether `ResolvedFinding.title` + `.rationale` get zod `max` lengths | Yes: `title` max 120 chars, `rationale` max 400 chars. Zod-enforced at `run_self_review` handler. Finding rows truncate title at 1 line (ellipsis) and rationale via collapsible. |
| StageStepper exact step labels and ordering | `Summary` / `Self-review` / `Walkthrough` / `Submit` — 4 steps total. Later steps disabled. |
| Exact copy for "Summary not generated yet" empty state | Covered in Copywriting Contract: StageStepper step 1 sub = `"Not generated"`. No drawer renders; no banner. |

---

## Appendix B — What This Spec Does NOT Cover

Per `04-CONTEXT.md §Explicitly NOT in scope`:

- Walkthrough narrative, inline-thread composer, per-hunk LLM commentary — Phase 5 UI-SPEC
- Verdict UI, `pulls.createReview` submission, pre-submit signal-ratio check — Phase 6 UI-SPEC
- Diff gutter markers for findings (rejected in D-13) — not in Phase 4
- Streaming / progressive self-review rendering — rejected in deferred ideas
- Third-column layout for findings — rejected; StageStepper + sidebar is the approach
- Dark-mode palette — formally abandoned (Phase 3 D-01)
- Per-finding mark-as-resolved — Phase 7 or Phase 5 thread-resolution surface
- `Chat panel` visual contract — Phase 5 UI-SPEC

---

## Appendix C — Checker Exceptions Accepted

The `gsd-ui-checker` (2026-04-20) returned BLOCKED on two rule-based findings. Both stem from the Phase 3 prototype design system, which is authoritative per Phase 3 decisions D-01 ("committed prototype as authoritative") and D-05 ("prototype-first; no parallel Figma source"). The user (crnbarr@gmail.com) was surfaced the conflict between generic checker heuristics and locked prototype fidelity, and elected to force-approve with the exceptions recorded here.

| Dimension | Checker rule | Value in this spec | Accepted because |
|-----------|--------------|---------------------|------------------|
| 4 Typography | "≤ 2 font weights" | 3 weights: 400 (body), 500 (active labels), 600 (brand + `who` names + stepper `done` number, uppercase micro) | Inherited from `web/src/index.css` and the committed prototype. The three weights are visually load-bearing in Inter Tight and collapsing to two would flatten the brand wordmark or the active-label state. Locked by Phase 3 D-01/D-05. |
| 5 Spacing | "All spacing values multiples of 4; scale within {4, 8, 16, 24, 32, 48, 64}" | 6px, 14px, 18px, 22px inherited from Phase 3; 5px chip vertical padding added in Phase 4 | Inherited from the committed prototype HTML/CSS. Prototype is authoritative (D-01/D-05). Snapping to multiples of 4 would drift the FindingsSidebar, StageStepper, and diff header from the agreed visual. The 5px chip padding targets the 24–27px coverage-chip line-height the prototype established for CI pill alignment. |

**Non-blocking recommendation accepted for future revision:** `Hide` (single-word CTA in FindingsSidebar rationale toggle) may be reworded to `Hide rationale` during implementation for copy parity with its paired `Show rationale`. Not treated as a blocker; implementer's discretion.

**Guidance for Phase 5+ UI-SPECs:** The prototype-authoritative exception covers Phase 3-inherited tokens only. New off-grid additions require explicit user sign-off; do not treat this exception as a blanket license.

---

*Phase 4 UI contract drafted 2026-04-20. Extends `03-UI-SPEC.md` — both documents required for complete contract. Force-approved 2026-04-20 with Appendix C exceptions.*
