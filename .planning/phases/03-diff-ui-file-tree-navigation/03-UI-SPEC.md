---
phase: 3
slug: diff-ui-file-tree-navigation
status: draft
shadcn_initialized: false
preset: none
created: 2026-04-19
supersedes: .planning/phases/01-plugin-skeleton-secure-vertical-slice/01-UI-SPEC.md
authoritative_prototype_commit: c7fe93f
---

# Phase 3 — UI Design Contract

> Visual and interaction contract for the "feels like a real review tool" surface.
> This document is the authoritative design contract for Phase 3+; it formally
> supersedes `01-UI-SPEC.md` per CONTEXT decision D-01. Downstream planner and
> executor must treat every token, state, and copy string below as prescriptive,
> not exploratory.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (hand-rolled CSS tokens at `:root` in `web/src/index.css`) |
| Preset | not applicable — shadcn deliberately not adopted (D-04) |
| Component library | none — bespoke components in `web/src/components/` (D-01, D-05) |
| Icon library | Inline SVG helpers `Ic.*` in `web/src/components/icons.tsx` (Lucide-derived). **No new icons required in Phase 3.** |
| Fonts | Sans: `Inter Tight` (→ `ui-sans-serif, system-ui`). Mono: `JetBrains Mono` (→ `ui-monospace, SFMono-Regular, Menlo`). Both declared as CSS variables `--sans` / `--mono`. |
| CSS strategy | `:root` CSS variables are the source-of-truth token surface. Tailwind v4 remains imported (line 3 of `index.css`) and is used by `StaleDiffModal` and any future overlay utilities; the two coexist. The Phase-1 UI-SPEC `@theme` block is **not** used. |
| Theme | Light-mode only (paper-and-teal). Dark mode is formally abandoned (D-01). |

---

## Spacing Scale

The prototype uses a 4-point scale with a handful of deliberate off-grid micro-values for gutters and line-number columns. The 4-point scale below is the default contract; executor must not introduce new spacing values outside this table without a spec amendment.

| Token | Value | Usage |
|-------|-------|-------|
| 2xs | 4px | Intra-chip gaps, status-dot spacing, file-icon gaps |
| xs | 6px | Button icon-to-label gap, small pills, inline code padding |
| sm | 8px | Brand logo gap, toggle padding, chat avatar gap, thread-msg gap |
| md | 12px | Card inner padding, explorer header padding, thread-panel internal gap |
| base | 14px | TopBar inter-element gap, FileExplorer row indent step |
| lg | 16px | Default section/panel horizontal padding, TopBar horizontal padding |
| xl | 18px | Diff header horizontal padding |
| 2xl | 24px | Reserved for future per-file section separators in multi-file diff |
| 3xl | 32px | Reserved for large empty-state padding |

**Off-grid exceptions (preserved from prototype, not to be normalized):**

| Value | Where | Why |
|-------|-------|-----|
| 22px | `.stage .num` circle, `.msg .av` avatar | Matches mono-font baseline for centered single-glyph badges |
| 44px | `.app` `grid-template-rows` — TopBar height | Matches macOS title-bar rhythm |
| 52px | `.app` `grid-template-rows` — reserved row that previously held StageStepper. Phase 3 reduces `grid-template-rows: 44px 1fr` (StageStepper not mounted per D-02) |
| 64px | `.diff-table .gutter` width | Fits two 4-digit line numbers + marker slot |
| 280px | `.main` `grid-template-columns` — FileExplorer fixed width (kept from prototype; 2-column layout per D-02 becomes `grid-template-columns: 280px 1fr`) |

---

## Typography

The prototype typographic scale is intentionally tight (13px base) to pack review context into the viewport. The four roles below cover every text surface in Phase 3 scope. **Executor may not introduce additional sizes** without a spec amendment.

| Role | Size | Weight | Line Height | Font | Notes |
|------|------|--------|-------------|------|-------|
| Body | 13px | 400 | 1.45 | sans | Default UI text (buttons, labels, list rows) |
| Body strong | 13px | 500–600 | 1.45 | sans | Active nav/file row labels, brand wordmark |
| Caption | 11px | 400–500 | 1.3 | sans | TopBar branch pill, CI pill label, summary footer counts, exp-summary dot labels |
| Micro | 10–10.5px | 400–600 | 1.2 | sans/mono | Uppercase `.exp-title`, `.exp-group` labels, line-number gutter, tooltip text |
| Code | 12px | 400 | 1.55 | mono | Diff body content — canonical review reading surface |
| Code small | 11–11.5px | 400 | 1.5 | mono | PR number, branch label, thread-ref code blocks, inline `<code>` |

**Letter-spacing:**
- Body: `-0.005em` (set on `body`)
- Brand / headings: `-0.01em`
- Uppercase micro labels (`.exp-title`, `.exp-group`, `.tweaks-head`): `+0.06em` to `+0.08em`

**Weights used:** 400 (regular), 500 (medium for active labels), 600 (semibold for brand + `who` names). No other weights. Inter Tight 700+ not used.

---

## Color

The palette is a 60/30/10 split over warm paper neutrals with a single reserved accent (Claude teal) and two semantic status colors. Token values come verbatim from `web/src/index.css` (D-04).

### Neutral surfaces (warm paper — the dominant 60%)

| Token | Hex | Usage |
|-------|-----|-------|
| `--paper` | `#FBFAF7` | Primary background (app shell, TopBar, diff body, chat body) |
| `--paper-2` | `#F5F3ED` | Secondary surface — hunk headers, hover rows, input backgrounds, toggle tracks |
| `--paper-3` | `#ECEAE2` | Tertiary surface — gutter hover, file-icon fallback, progress track |
| `--line` | `#E3E0D6` | Default 1px border color (between panels, hunks, rows) |
| `--line-2` | `#D3CFC2` | Emphasis border (focus rings, input borders) |

### Ink (text, the 30% darker secondary)

| Token | Hex | Usage |
|-------|-----|-------|
| `--ink` | `#1B1A17` | Primary body text, active file labels, brand |
| `--ink-2` | `#3A3832` | Default UI labels, inactive-row text, chat message body |
| `--ink-3` | `#6B6759` | Muted label / placeholder / PR meta labels |
| `--ink-4` | `#9A9585` | De-emphasized labels, line numbers, timestamps, disabled state |

### Accent (the reserved 10%)

| Token | Hex | Usage — RESERVED LIST |
|-------|-----|-----------------------|
| `--claude` | `#2F6F66` | Active-file left-edge rail, new-file status dot, Phase-5 thread-marker default, progress-ring fill, code-suggest pill text, `done`-stage-pill text, `chip.claude` border, submit/send button (deferred from Phase 3 via `c`/`v`/`s` stub toasts). |
| `--claude-2` | `#E6EFEC` | Active-file row background, code-suggest pill background, chip.claude background |
| `--claude-3` | `#CFDFD9` | Chip.claude border, done-stage-pill border |

**Accent is NOT used for:**
- Hover states on generic buttons (use `--paper-2`)
- Focus rings (use `--line-2` or `--ink-3`)
- Generic interactive feedback

### Semantic status (Phase 3 uses the `ok` / `warn` / `block` / `add` / `rem` families verbatim)

| Token | Hex | Usage |
|-------|-----|-------|
| `--ok` / `--ok-bg` | `#3A7A55` / `#DEEBE1` | File-status `reviewed` dot; CI aggregate pill "pass" state; resolved thread markers |
| `--warn` / `--warn-bg` | `#B5791F` / `#F6EED9` | File-status `in-progress` (via open-threads later); CI aggregate "pending" state |
| `--block` / `--block-bg` | `#9B3B2E` / `#F3DFD8` | CI aggregate "fail" state; blocker thread marker; destructive confirmation text |
| `--add-bg` / `--add-gutter` / `--add-ink` | `#EAF3EA` / `#CFE3CF` / `#2D5F31` | Diff add-line row background, gutter hover, `+` sigil, add count |
| `--rem-bg` / `--rem-gutter` / `--rem-ink` | `#F7EAE8` / `#ECCDC8` / `#7A3A34` | Diff remove-line row background, gutter hover, `−` sigil, remove count |

### 60/30/10 summary

- **60% dominant:** `--paper` + `--paper-2` fill backgrounds of TopBar, explorer, diff body, diff head, chat (deferred).
- **30% secondary:** `--ink` / `--ink-2` for text content; `--paper-3` and `--line` for separators and tertiary surfaces.
- **10% accent (`--claude` family):** reserved for the specific list above — primarily the active-file indicator, the Phase-5-ready thread marker, and the future CTA surface. Phase 3 does **not** widen accent usage; per D-18 the `c`/`v`/`s` shortcut toasts use `--ink`/`--paper-2` neutral styling, not accent.

### CI pill color decisions (D-25)

| Aggregate | Background | Foreground | Border |
|-----------|-----------|-----------|--------|
| `pass` | `--ok-bg` | `--ok` | `--ok-bg` darkened 8% (fallback: `--line`) |
| `fail` | `--block-bg` | `--block` | `--line` |
| `pending` | `--warn-bg` | `--warn` | `--line` |
| `none` | `--paper-2` | `--ink-4` | `--line` |

**Local-branch mode (Claude's Discretion resolved):** CI pill **hides entirely** when there is no GitHub source. Rationale: a greyed "none" pill adds visual noise without affording any action, and local-branch flows are the minority use-case — hiding communicates "this doesn't apply" more truthfully than "this failed to find anything".

### Read-only existing-comment marker vs. Phase-5 active thread marker (D-21 — Claude's Discretion resolved)

| Variant | Background | Foreground | Border | When |
|---------|-----------|-----------|--------|------|
| Existing comment (Phase 3, read-only) | `--paper-3` | `--ink-3` | `1.5px` `--paper` (separator only) | INGEST-03 comments fetched at session start |
| Active thread (Phase 5, interactive) | `--claude` | `#fff` | `1.5px` `--paper` | Reserved for Phase 5 |
| Resolved thread (Phase 5) | `--ok` | `#fff` | `1.5px` `--paper` | Reserved for Phase 5 |
| Blocker thread (Phase 5) | `--block` | `#fff` | `1.5px` `--paper` | Reserved for Phase 5 |
| Warn thread (Phase 5) | `--warn` | `#fff` | `1.5px` `--paper` | Reserved for Phase 5 |

Read-only markers use a **muted grey fill** so they read as "context, not a conversation." Hover reveals a tooltip `"View existing comment"`; click opens a popover. The visual hierarchy — muted-grey is clearly sub-dominant to the teal/warn/block colored markers — communicates read-only status without a separate icon.

---

## Copywriting Contract

### TopBar

| Element | Copy | Notes |
|---------|------|-------|
| Brand wordmark | `PairReview` | Unchanged from prototype |
| PR meta | `{owner}/{repo} #{number}` then `{PR title}` | From `PullRequestMeta` |
| Branch pill | `{headBranch} → {baseBranch}` | Mono font, already in prototype |
| Primary CTA (Phase 3 stub) | `Approve & merge` | Remains visible from prototype for continuity, but wired only to the `s`-shortcut stub toast `"Submit available in Phase 6"` — button does **not** submit in Phase 3. |
| Secondary CTA (Phase 3 stub) | `Request changes` | Same behavior — toasts `"Verdict UI available in Phase 6"`. |
| Settings button | `Settings` | Kept visible; click = no-op (or toast `"Settings coming in Phase 7"`) — planner's choice. |
| CI pill aggregate labels | `All checks passed` / `{N} check{s?} failing` / `{N} check{s?} pending` / `No checks` | Singular/plural honored. Shown on hover/click expansion only — the pill itself shows a compact icon + count. |
| CI dropdown row | `{checkName} · {conclusion}` followed by `↗` (external-link glyph) | Click opens `detailsUrl` in new tab. |

### FileExplorer

| Element | Copy | Notes |
|---------|------|-------|
| Section title | `Files` (uppercase micro) | Unchanged |
| Tab — enabled | `Changed` | Default tab |
| Tab — disabled (D-10) | `Repo` | Rendered disabled. `title` (native tooltip) copy: `"Full repo tree available in Phase 7"`. Cursor: `not-allowed`. Opacity: `0.5`. |
| Search placeholder | `Filter changed files…` | Unchanged |
| Summary chips | `{n} reviewed` · `{n} in-progress` · `{n} untouched` | Phase 3 re-wires FILE_STATE to the D-11 tri-state machine. `threads` chip from the prototype is removed in Phase 3 (re-appears in Phase 5). |
| Group header | `Changed · {n}` | Unchanged |
| Generated-file row label suffix | `Excluded` (micro caption, `--ink-4`) | Appears right-aligned in the row before the stats chip. |
| Generated-file expanded affordance | `Expand generated file` (button) / `Collapse generated file` | Triggers the `file.generatedExpandToggled` SessionEvent. |
| Per-file "Mark reviewed" (in diff-head) | `Mark reviewed` (button) when status != `reviewed`; `Reviewed ✓` (disabled-looking but re-clickable) when status = `reviewed`. | Click fires `file.reviewStatusSet` with the toggled value. |

### DiffViewer

| Element | Copy | Notes |
|---------|------|-------|
| Per-file section header path | `{dirname}/` then `{basename}` (basename darker) | Extends existing `diff-head .path` pattern across all files in multi-file scroll (D-07) |
| Per-file stats | `+{adds}` `−{dels}` | Mono, red/green ink |
| View toggle | `Unified` / `Split` | Unchanged |
| Existing-comment popover heading | `{author} · {relativeTime}` | e.g. `"alice · 3 days ago"` — no reply affordance (D-21 read-only). |
| Existing-comment popover footer | `View on GitHub ↗` | Opens `html_url` in a new tab. |
| Collapsed generated-file section body | `This file is auto-collapsed as generated/lockfile content. It is excluded from Claude's context.` + `Expand` button | The second sentence makes DIFF-04's "excluded from LLM context" observable at Phase 3 time. |

### Keyboard shortcut toasts (D-18 — Claude's Discretion resolved)

Toast variant for stub shortcuts is a bottom-center pill that auto-dismisses after 2.5s.

| Key | Toast copy |
|-----|------------|
| `c` | `Comments available in Phase 5` |
| `v` | `Verdict picker available in Phase 6` |
| `s` | `Submit available in Phase 6` |

Working shortcuts (`n` / `p` / `r`) emit **no toast** — they act silently.

### Keyboard hint visibility (D-19 — Claude's Discretion resolved)

A minimal **footer hint** renders in the bottom-right corner of the diff viewport, muted, mono font, 10.5px. Copy:

```
n / p · r · c v s
```

`n / p · r` rendered in `--ink-3` (live shortcuts), `c v s` rendered in `--ink-4` (stubbed — communicates presence + status via the muted color alone). Hint is fixed position, non-interactive, `z-index: 10`. Removed entirely when viewport width < 768px.

**Rationale for including the hint:** the user must discover `r` somehow — CONTEXT D-18 specifies no `?` help overlay, so the lowest-friction path is a persistent micro-hint. A full help overlay is deferred to Phase 7 per D-19.

### Wrap-around behavior for `n`/`p` at list boundaries (D-18 — Claude's Discretion resolved)

**Wrap at boundaries** with a brief visual pulse on the target hunk + a transient footer message.

- `n` at the last hunk of the last file → jumps to the first hunk of the first file; the diff body briefly scrolls to the top; a toast: `Wrapped to first hunk`.
- `p` at the first hunk of the first file → jumps to the last hunk of the last file; toast: `Wrapped to last hunk`.

**Rationale:** No-op on wrap leaves the user wondering if the key is registered; wrap + toast acknowledges the action and teaches the behavior without introducing modality.

### Empty states

| Surface | When | Copy |
|---------|------|------|
| FileExplorer — no changed files | `DiffModel.files.length === 0` | Heading: `No files changed`. Body: `This PR reports 0 files in its diff. Try re-running /pair-review, or verify the base and head refs.` |
| FileExplorer — search filter returns nothing | User types a filter that matches zero files | Heading: `No matches`. Body: `No changed files match "{query}". Clear the filter to see all {n} changed file{s?}.` |
| DiffViewer — no fixtures loaded | `state.phase === 'empty'` (Phase-1 state carried forward) | Heading: `No review in progress`. Body: `Re-run /pair-review <pr-number> in Claude Code to start a review.` |
| CI dropdown — local-branch | N/A — CI pill hides entirely (D-26 resolution above) | — |
| Existing comments — none in PR | `existingComments.length === 0` after `gh api` completes | Silent — no UI surface. Absence of markers IS the empty state. No "no comments" banner. |

### Error states

| Surface | Trigger | Copy |
|---------|---------|------|
| Session — fetch-failed (Phase 1 carryover) | `state.errorVariant === 'fetch-failed'` | Heading: `Could not fetch PR`. Body: `Check gh auth status and try /pair-review again. Details in terminal.` |
| Existing-comments fetch failure (D-20) | `gh api` exits non-zero in `startReview` | Silent in UI. Server logs to stderr: `"Failed to load existing comments: {error}"`. No markers render. Planner decides whether a soft footer toast is added; default: silent, consistent with CI-checks failure behavior (logged to stderr only). |
| CI-checks fetch failure (D-24) | `gh pr checks` exits non-zero | CI pill renders `none` variant. Server logs to stderr: `"Failed to load CI checks: {error}"`. |
| Generated-file expand toggle POST fails | Client POST fails after click | Row stays collapsed; toast: `Could not update file state. Retrying on reload.` Transient, not blocking. |
| File-review-status POST fails | Client POST fails after `r`-key or button | Status visually reverts after 300ms; toast: `Could not mark reviewed. Retry.` |

### Destructive actions (Phase 3)

**None.** Phase 3 introduces no destructive actions. The StaleDiffModal (Phase 2 carryover) remains the only confirmation surface in this phase, and its copy is locked as-is (`"PR updated"`, `"Refresh to current PR"` / `"Discard session"` / `"View both"`). Phase 3 must not modify that modal beyond palette-harmonization tweaks.

---

## Component State Matrix

### FileExplorer row states

| State | Visual | Trigger |
|-------|--------|---------|
| `untouched` | Default row, dim grey dot, no left rail | Initial state; no viewport entry yet |
| `in-progress` | Default row, warn dot (`--warn`), no left rail | File section ≥50% visible for ≥500ms (D-11) |
| `reviewed` | Default row, ok dot (`--ok`), no left rail | Explicit via `r`-key or "Mark reviewed" button |
| `active` (focus) | `--claude-2` background, `--claude` 2px left rail | File contains currently-focused hunk (via `n`/`p`) OR user-clicked |
| `generated` (excluded) | Row dimmed (`--ink-4`), `Excluded` label suffix | `DiffFile.generated === true` |
| `hover` | `--paper-2` background | Pointer over row |
| `disabled` (Repo tab) | Tab opacity 0.5, cursor `not-allowed`, title tooltip | `filter === 'all'` mode (D-10) |

### DiffViewer per-file section states

| State | Visual | Trigger |
|-------|--------|---------|
| Default (non-generated) | Full hunks visible | `DiffFile.generated === false` |
| Collapsed generated (default) | Single stub row with message + "Expand" button | `DiffFile.generated === true` AND user has not expanded |
| Expanded generated | Full hunks visible, subtle top banner "Generated file — expanded" | User clicked Expand; SessionEvent `file.generatedExpandToggled` persisted |
| Focused hunk | Transient 2px `--claude` left border on the focused hunk; 400ms pulse animation | User pressed `n` or `p` |
| Line hover | Gutter background shifts to `--paper-3` (add→`--add-gutter`, rem→`--rem-gutter`) | Pointer over row (already in prototype CSS) |

### Keyboard shortcut behavior

| Key | Action | Preconditions | Visual feedback |
|-----|--------|---------------|-----------------|
| `n` | Advance to next hunk in cross-file virtual order (D-18) | `document.activeElement` is NOT input/textarea/contenteditable (D-17) | Scroll target hunk into view; 400ms teal left-border pulse; file containing target becomes `active` in explorer |
| `p` | Advance to previous hunk (same rules) | Same | Same |
| `r` | Toggle review status of current focused file (`untouched`/`in-progress` → `reviewed`; `reviewed` → `in-progress`) (D-11) | Same | Explorer dot color updates; no toast on success |
| `c` | Stub toast | Same | Toast: `Comments available in Phase 5` |
| `v` | Stub toast | Same | Toast: `Verdict picker available in Phase 6` |
| `s` | Stub toast | Same | Toast: `Submit available in Phase 6` |

### Focus rings / keyboard accessibility

All interactive elements receive a 2px focus outline offset 1px when focused via keyboard. Outline color: `--ink-3`. Focus rings are not suppressed on `:focus` — only on `:focus:not(:focus-visible)` — preserving keyboard-navigation visibility while avoiding click-focus noise.

Buttons inside the TopBar, FileExplorer toggle, View toggle, and diff `iconbtn` all honor this. The `StaleDiffModal`'s buttons inherit Tailwind's default focus-visible behavior.

---

## Layout Contract (D-02 — formally supersedes Phase-1 UI-SPEC's 3-column)

```
┌──────────────────────────────────────────────────────────────────────┐
│ TopBar (44px)                                                        │
│ [Brand] [PR meta] [Branch pill] ......... [CI pill] [Settings] [CTA] │
├───────────────┬──────────────────────────────────────────────────────┤
│               │                                                      │
│ FileExplorer  │  DiffViewer (multi-file, single vertical scroll)     │
│ (280px)       │                                                      │
│               │  ┌─ per-file section header ──────────────────────┐  │
│ - Files [Ch.] │  │ path/to/file.ts  +42 −18  [Unified|Split]      │  │
│ - Search      │  │                         [Mark reviewed]        │  │
│ - Summary     │  └────────────────────────────────────────────────┘  │
│ - File list   │                                                      │
│               │  <hunks>                                             │
│               │                                                      │
│               │  ┌─ next file section ────────────────────────────┐  │
│               │  ...                                               │  │
│               │                                                      │
│               │                                  [n / p · r · c v s]│
└───────────────┴──────────────────────────────────────────────────────┘
```

**CSS grid:**
```css
.app {
  grid-template-rows: 44px 1fr;  /* was: 44px 52px 1fr — StageStepper row removed (D-02) */
}
.main {
  grid-template-columns: 280px 1fr;  /* was: 280px 1fr 380px — ChatPanel column removed (D-02) */
}
```

**Narrow viewport behavior (DIFF-02 polish — "Specific Ideas" open question resolved):**
- Below 1024px viewport width, the **split-view toggle is disabled** with a tooltip `"Split view requires ≥1024px"`. Unified view is forced. This avoids both horizontal-scroll nightmare and implicit auto-collapse (which loses the user's preference).
- Below 768px viewport width, the whole experience remains functional but the FileExplorer collapses to an overlay drawer toggled by a hamburger glyph on the TopBar left. **Out of Phase 3 scope** — planner may defer this to Phase 7; the desktop target of a local plugin makes narrow viewports an edge case.

---

## Accessibility Contract

| Concern | Requirement |
|---------|-------------|
| Color contrast | All `--ink` on `--paper` combinations exceed WCAG AA (4.5:1). `--ink-4` on `--paper` is 3.2:1 and is used only for decorative/supplementary text (line numbers, timestamps) — never for load-bearing content. |
| Focus visibility | Every interactive element MUST have a visible `:focus-visible` state per the focus-rings rule above. |
| Keyboard reachability | FileExplorer rows must be reachable via Tab; arrow keys MAY be a Phase-7 enhancement. Phase 3 accepts Tab-only. |
| Screen-reader labels | CI pill: `aria-label="CI checks: {aggregate} — {count} checks"`. Existing-comment marker: `aria-label="Existing comment from {author}, {relativeTime}"`. Stub toasts announced via `role="status"`. |
| Reduced motion | The 400ms teal pulse on hunk focus MUST respect `prefers-reduced-motion: reduce` → fall back to instant border appearance with no animation. |
| `dangerouslySetInnerHTML` | Per CONTEXT `code_context`: ONLY server-produced Shiki tokens flow into innerHTML. Executor must NOT pipe user-entered text or GitHub comment bodies through innerHTML — comment popovers render bodies via React text nodes. |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable — shadcn not initialized per D-04 |
| third-party | none | not applicable |

Phase 3 adds **no new UI dependencies**. Net delta for `web/package.json`:
- Remove: `@git-diff-view/react` (D-05)
- Add: none

Font dependencies (Inter Tight, JetBrains Mono) are assumed loaded via the existing prototype pipeline. If the planner discovers the fonts are not actually loaded (e.g., relying solely on the system stack), that's a planner-level tech-debt remediation — not a spec change.

---

## Fixture Requirements (D-09)

The Phase-3 fixture PR that validates Open Decision 1 must be committed to `web/src/__tests__/fixtures/` and conform to the `DiffModel` shape in `shared/types.ts`. Visual acceptance criteria for the fixture:

- **Files:** 5–10 files, mixed languages (TypeScript, JavaScript, JSON, Markdown minimum)
- **Hunks:** 30–50 total
- **Must include:** at least one `package-lock.json`-equivalent (to exercise `generated: true` rendering), at least one renamed file, at least one file with ≥5 hunks (to exercise `n`/`p` within-file navigation)
- **Render-budget target (D-09):** first paint ≤500ms on a 50-hunk PR, measured via vitest benchmark in a typical CI environment (Node 22, no GPU acceleration). Budget is advisory — exceeding it by ≤20% is not a blocker; exceeding by >20% triggers planner-level review of the render path.

**Auto-in-progress viewport threshold (D-11 — Claude's Discretion resolved):** 50% visibility for 500ms. IntersectionObserver options: `threshold: 0.5`, debounced to 500ms via a per-file timer that resets on scroll-out-of-view.

---

## Token Additions Required for Phase 3

No new CSS tokens. Phase 3 uses existing `:root` variables only. Two **conceptual** additions surfaced below are satisfied by existing tokens:

| Concept | Token used |
|---------|-----------|
| File-status "in-progress" dot | `--warn` (re-use from existing "threads" color — semantic fit: "file needs attention but is not done yet") |
| File-status "untouched" dot | `--ink-4` at `0.4` opacity (already in prototype as `.status.pending`) |
| Existing-comment marker background | `--paper-3` (re-use from gutter-hover, tertiary surface) |
| CI "none" pill text | `--ink-4` (existing de-emphasized token) |

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

## Appendix A — Claude's Discretion Items: Resolutions

The following items CONTEXT.md marked as "Claude's Discretion" are resolved in this spec:

| CONTEXT reference | Resolution in this spec |
|-------------------|-------------------------|
| Auto-in-progress viewport threshold (D-11) | 50% visibility, 500ms debounce — "Fixture Requirements" section |
| Render-budget threshold (D-09) | 500ms first paint, 50-hunk PR; ±20% advisory tolerance |
| Wrap-around for `n`/`p` at boundaries (D-18) | Wrap + toast — "Keyboard shortcuts" section |
| Keyboard hint visibility (D-19) | Footer hint `n / p · r · c v s`, muted — "Copywriting Contract" |
| Read-only comment marker visual distinction (D-21) | Muted grey fill (`--paper-3` bg, `--ink-3` fg) — "Color" section |
| CI pill in local-branch mode (D-26) | Hide entirely — "Color" → CI pill color decisions |
| Repo-tab disabled styling (D-10) | Opacity 0.5, `not-allowed` cursor, tooltip `"Full repo tree available in Phase 7"` — "Copywriting Contract" |
| Narrow-viewport split-mode behavior (Specific Ideas item) | Disable split toggle <1024px, force unified — "Layout Contract" |
| Resolved-thread variant for existing comments (Specific Ideas item) | Render identically to unresolved; resolution state surfaced only in popover body copy (planner may refine) |

Items explicitly left to the planner (not resolved here):
- Exact fixture PR contents (5–10 files, 30–50 hunks is the envelope)
- Whether to harmonize `StaleDiffModal` styling beyond palette — planner discretion, "no functional change" per CONTEXT canonical_refs

---

## Appendix B — What This Spec Does NOT Cover

Per CONTEXT "Explicitly NOT in scope":

- `ChatPanel` / `InlineThread` / `StageStepper` visual contracts — these components stay on disk but are not mounted in Phase 3. Their Phase-4/Phase-5 UI-SPECs will re-derive any needed contract.
- Verdict UI / submission UI — Phase 6
- Multi-session switcher UI — Phase 7
- Dark-mode palette — formally abandoned (D-01)
- `TweaksPanel` — deleted (D-03)
- Word-level intra-line diff highlighting — Phase 7 / v1.x (D-08)
- Full repo tree in FileExplorer — Phase 7 (D-10)
- Orphan-comment sidebar — Phase 7 (D-22)
- CI polling / real-time refresh — Phase 7 (D-26)
- Keyboard help overlay (`?`) — Phase 7 (D-19)

---

*Phase 3 UI contract drafted 2026-04-19. Supersedes `01-UI-SPEC.md` per CONTEXT D-01. Source of truth for visuals until Phase 4 UI-SPEC extends the contract for LLM surfaces.*
