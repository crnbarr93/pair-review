# Phase 4: LLM Summary + Checklist + Self-Review — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 04-llm-summary-checklist-self-review
**Areas discussed:** Self-review tool + checklist shape; Summary content & regenerate UX; Summary + checklist + findings UI; MCP tool budget for Phase 4

---

## Self-review tool + checklist shape

### Q1: How should run_self_review be shaped on the MCP surface?

| Option | Description | Selected |
|--------|-------------|----------|
| One atomic call | run_self_review({findings[], coverage, verdict}) — LLM submits full review once; single reducer event; saves tool-budget slots | ✓ |
| Lifecycle (start → add_finding → finalize) | 3 tools for incremental UI rendering; transaction semantics | |
| Hybrid streaming | One call, server-side progressive emission | |

**User's choice:** One atomic call
**Notes:** Recommended pick; matches Phase-2 `applyEvent` replace-the-blob discipline.

### Q2: Where should the built-in checklist live, and how structured should items be?

| Option | Description | Selected |
|--------|-------------|----------|
| TS const, structured items | checklist.ts exports CHECKLIST; {id, category, criticality, text, evaluationHint?}; ~5 items × 5 categories | ✓ |
| JSON file bundled in plugin | Extra I/O + validation; no real gain for a single-user plugin | |
| Markdown with frontmatter | Prose-friendly but requires parser + validation; CHECK-V2-01 (repo-override) would own markdown | |

**User's choice:** TS const, structured items
**Notes:** Recommended pick; no I/O at server start; type-safe.

### Q3: How should the nit cap + severity tagging be enforced?

| Option | Description | Selected |
|--------|-------------|----------|
| Schema-enforced hard cap | Zod rejects payloads with >3 nits; severity is a strict enum | ✓ |
| Advisory in tool description only | Prompt-level; UI shows warning pill | |
| Schema cap + UI soft warning | Phase-4 schema cap + Phase-6 signal-ratio (duplicates SUB-02) | |

**User's choice:** Schema-enforced hard cap
**Notes:** Structural mitigation for Pitfall 3. Phase 6 owns the pre-submit signal-ratio separately.

### Q4: How should the LLM anchor each finding?

| Option | Description | Selected |
|--------|-------------|----------|
| lineId only, server resolves | {lineId: string}; server resolves to (path, line, side); unknown IDs rejected | ✓ |
| hunkId required + optional lineId | Allows hunk-level "whole-hunk" findings; slightly weaker anchoring | |
| Structured anchor union: line \| hunk \| file | Most expressive; more schema surface for the LLM to fumble | |

**User's choice:** lineId only, server resolves
**Notes:** BLOCKER Pitfall 2 mitigation paid for in Phase 4 so Phase 5's draft_comment inherits it.

---

## Summary content & regenerate UX

### Q1: What shape should the PR summary take in session state?

| Option | Description | Selected |
|--------|-------------|----------|
| Structured fields | {intent, intentConfidence, paraphrase, keyChanges[], riskAreas[], generatedAt} — intent gates review lens per Pitfall 11 | ✓ |
| Markdown blob with required sections | Regex-validated headings; easier to render but loses per-field styling | |
| Structured + free-form rationale | Structured plus rationale: string; marginal extra surface | |

**User's choice:** Structured fields
**Notes:** Recommended pick; intent classification hooks Pitfall 11 mitigation.

### Q2: How does the summary get generated?

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit set_pr_summary tool call | LLM decides when; UI shows empty-state "ask Claude to summarize" | ✓ |
| Auto-generate on first start_review | Requires server-side LLM orchestration the plugin explicitly avoids | |
| UI-triggered request, LLM fulfills | UI POSTs a request; LLM sees it via list_pending_requests | |

**User's choice:** Explicit set_pr_summary tool call
**Notes:** Recommended pick; honors "plugin makes no LLM calls" constraint.

### Q3: What happens on regenerate?

| Option | Description | Selected |
|--------|-------------|----------|
| Silent atomic replace | summary.set replaces whole blob; no history | ✓ |
| Versioned with history panel | v2 / v1 flip-back; adds state bloat | |
| Replace + staleness flag | Flag stale: true on diff adopt; adds Phase-2 coupling | |

**User's choice:** Silent atomic replace
**Notes:** Recommended pick; matches the rest of the reducer's replace-the-blob patterns.

### Q4: How strictly should paraphrase fidelity be enforced?

| Option | Description | Selected |
|--------|-------------|----------|
| Tool description + UI visibility | Social enforcement; collapsed "Author's description" pane adjacent to paraphrase | ✓ |
| Schema check: non-empty + len floor | paraphrase.length ≥ 20 chars; mechanical but weak | |
| Server compares tokens server-side | Jaccard overlap threshold; fragile against well-written paraphrases | |

**User's choice:** Tool description + UI visibility
**Notes:** Recommended pick; strong social enforcement without brittleness.

---

## Summary + checklist + findings UI

### Q1: Where should the summary pane + checklist coverage + findings list live?

| Option | Description | Selected |
|--------|-------------|----------|
| StageStepper top band + findings sidebar | Mounts prototype's unmounted StageStepper per Phase 3 D-02 | ✓ |
| Dedicated third column | Breaks Phase-3 2-col scaffolding | |
| Everything inline above DiffViewer | Simplest DOM; pushes diff down; no StageStepper mount | |

**User's choice:** StageStepper top band + findings sidebar
**Notes:** Recommended pick; honors Phase 3 D-02.

### Q2: How should per-category coverage be visualized?

| Option | Description | Selected |
|--------|-------------|----------|
| Tag strip: 5 colored chips | One chip per category with --ok/--warn/--block fills; clickable for category filter | ✓ |
| Radial/pie per category | Data-denser; visually heavier | |
| Progress bar per category | More detail; longer vertically | |

**User's choice:** Tag strip: 5 colored chips
**Notes:** Recommended pick; fits StageStepper band; uses existing palette.

### Q3: How should the findings list be presented?

| Option | Description | Selected |
|--------|-------------|----------|
| Grouped by category, severity-ordered within group | Matches ROADMAP success criterion 3 literally | ✓ |
| Flat list, severity-ordered, category badge | Loses per-category structural reinforcement | |
| Grouped by severity, category badge | Prioritizes action over checklist mapping | |

**User's choice:** Grouped by category, severity-ordered within group
**Notes:** Recommended pick.

### Q4: What happens when the user clicks a finding's file:line reference?

| Option | Description | Selected |
|--------|-------------|----------|
| Scroll + focus ring, no diff marker | Reuses Phase-3 scroll rail; no gutter competition with Phase 3/5 markers | ✓ |
| Scroll + gutter marker on the diff line | In-context; risks gutter clutter | |
| Scroll + inline pop-in card at the line | Echoes GitHub inline threads; conflicts with Phase 5 | |

**User's choice:** Scroll + focus ring, no diff marker
**Notes:** Recommended pick; sidebar is the single home for findings.

---

## MCP tool budget for Phase 4

### Q1: Where should diff-inspection tools land — Phase 4 or Phase 5?

Initial question was ambiguous about what "the LLM" meant; user asked "Are we calling the API or the local agent?" Clarified and re-asked.

| Option | Description | Selected |
|--------|-------------|----------|
| Ship list_files + get_hunk in Phase 4 | 2 new tools; generated-file-filtered by default; Pitfall 5 compliant | ✓ |
| Extend start_review's return with manifest + inline hunks | No new tools; gambles on ~2k-token ceiling | |
| Defer list_files + get_hunk to Phase 5 | Self-review quality collapses without code access | |

**User's choice (after re-framing):** list_files + get_hunk in Phase 4
**Notes:** Re-framed to make clear the LLM = user's Claude Code session consuming MCP tools. Recommended pick unblocks self-review and is reused by Phase 5's walkthrough.

### Q2: Tool budget accounting (cumulative 5/10 after Phase 4)

| Option | Description | Selected |
|--------|-------------|----------|
| Accept 5 after Phase 4 | P1: 1 / P4: 5 / P5: 8 / P6: 9; leaves 1-slot buffer | ✓ |
| Merge list_files into start_review's return | Saves 1 slot; loses fresh-list ergonomic | |
| Merge set_pr_summary into run_self_review | Saves 1 slot; couples summary to self-review refresh cadence | |

**User's choice:** Accept 5 after Phase 4
**Notes:** Recommended pick; verb palette list_/get_/set_/run_ stays clean per Pitfall 15.

### Q3: How should list_files paginate?

| Option | Description | Selected |
|--------|-------------|----------|
| Cursor-paginated, 30 files/page default | {cursor?, limit?, includeExcluded?} → {files[], nextCursor, totalFiles, excludedCount} | ✓ |
| Single response, cap at N files, warn if exceeded | No cursor; LLM blind past the cap | |
| Return just file IDs + metadata, no diff stats | Saves tokens; less useful for Phase-5 walkthrough ranking | |

**User's choice:** Cursor-paginated, 30 files/page default
**Notes:** Recommended pick; Pitfall 5 compliant; echoes Pitfall 22 pagination discipline.

### Q4: How should get_hunk handle oversized hunks?

| Option | Description | Selected |
|--------|-------------|----------|
| Slice + nextCursor within hunk | One tool, two paths (normal / big-hunk page-through) | ✓ |
| Truncate with a 'truncated' marker | Simple; LLM can't read the rest | |
| Refuse oversized hunks, require get_hunk_range | Adds a second tool surface | |

**User's choice:** Slice + nextCursor within hunk
**Notes:** Recommended pick; keeps tool count at 4 new for Phase 4.

---

## Claude's Discretion

The following were left to the planner to resolve without further user input (see CONTEXT.md §"Claude's Discretion" for the full list):
- Exact checklist item count per category (~5; range 3-7)
- Exact tool-description wording (adversarial framing + paraphrase discipline)
- Exact list_files default limit (target 30)
- Exact cursor encoding format
- Exact within-hunk slice size for get_hunk
- StageStepper step labels and ordering
- Findings-sidebar breakpoint behavior
- Visual weight of category chips
- Empty-state copy for "Summary not generated yet"
- Sidebar default open/closed on first self-review completion
- Zod max lengths for ResolvedFinding.title / .rationale

## Deferred Ideas

Captured in CONTEXT.md §Deferred Ideas. Highlights:
- Summary versioning / history / flip-back — rejected
- Stale-summary flag tied to diff adopt — deferred to v1.x if daily use demands
- Schema-level paraphrase content check (Jaccard) — rejected as fragile
- Lifecycle self-review tool — rejected for tool-budget cost
- Diff gutter markers for findings — deferred (sidebar-only in Phase 4)
- Third column in layout — rejected; honors Phase 3 D-02
- pre_existing: true gate on findings — that gate belongs on Phase-5 draft_comment
- Markdown / JSON checklist formats — v2 owns; Phase 4 uses TS const
- Pre-submit signal-ratio warning — Phase 6 owns (SUB-02)
- Adversarial-framing prompt as a separate file — rejected; lives in tool descriptions (D-20)
