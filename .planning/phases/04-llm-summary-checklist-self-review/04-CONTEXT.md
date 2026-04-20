# Phase 4: LLM Summary + Checklist + Self-Review — Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

The first LLM-driven product surface. Phase 4 turns the Phase-3 "readable diff + navigation" shell into a review workspace the user's Claude Code session can *reason about* via MCP:

1. A structured PR **summary** (intent, key changes, risk areas, paraphrase) authored by the Claude Code session and rendered in a dedicated UI pane, silently replace-on-regenerate.
2. A built-in **criticality-ranked checklist** (correctness, security, tests, performance, style) shipped as a TS const inside the plugin — no repo override, no JSON, no markdown (v2 territory per `CHECK-V2-01`).
3. An atomic **`run_self_review`** tool that emits severity-tagged (`blocker`/`major`/`minor`/`nit`) findings grouped by checklist category with opaque `lineId` anchors the server resolves to clickable `file:line` refs on the diff.
4. **Diff-inspection tools** (`list_files`, `get_hunk`) the Claude Code session uses to actually read the code it reviews — hunk-paginated, generated-file-filtered by default, \~2k-token-capped.
5. UI mounting of the prototype's **`StageStepper`** (left unmounted on purpose by Phase 3 D-02) as a top band above the DiffViewer, a 5-chip per-category coverage tag strip, and a findings sidebar grouped by category.

**Explicitly in scope:**
- Four new MCP tools (`list_files`, `get_hunk`, `set_pr_summary`, `run_self_review`) — cumulative toolbelt 5/10 after Phase 4.
- New `ReviewSession` fields: `summary?: PrSummary | null`, `selfReview?: SelfReview | null`.
- New `SessionEvent` variants: `summary.set`, `selfReview.set` — threaded through the Phase-2 reducer + `applyEvent` pipeline unchanged.
- TS-const checklist authored under `server/src/checklist/` with a typed `ChecklistItem` schema.
- Mounting `StageStepper` (already on disk per Phase 3 D-02) as the top-band host for summary / checklist-coverage / self-review step indicators.
- A findings sidebar component (new) that renders alongside the DiffViewer column, grouped by category and severity-ordered.
- Tool-description-level adversarial prompt framing + default-verdict-inversion (`verdict: 'request_changes'` is the schema default the LLM must argue *down* from to `'comment'` or `'approve'`).

**Explicitly NOT in scope (per ROADMAP / REQUIREMENTS boundaries):**
- Walkthrough narrative, inline-thread composer, per-hunk LLM commentary (Phase 5).
- `draft_comment` / `reply_in_thread` / `resolve_thread` MCP tools (Phase 5).
- Verdict UI, `pulls.createReview` submission, pre-submit signal-ratio check (Phase 6).
- Pre-existing pending-review detection (Phase 6, Pitfall 10).
- Repo-level checklist override via `.review/checklist.md` (v2, `CHECK-V2-01`).
- Multi-session switcher, concurrency (Phase 7, SESS-04).
- Any Anthropic API call from the plugin process — the Claude Code session is the sole LLM driver.
- Versioned summary history / summary diffing (considered and rejected in discussion).
- Stale-summary flag tied to diff change (considered; deferred — silent atomic replace + user regenerates on demand).
- Any summary-content-fidelity schema check (tokenizer comparison rejected — fragile).
- Diff gutter markers for findings (findings live in the sidebar; click = scroll + focus ring only).

</domain>

<decisions>
## Implementation Decisions

### Self-review tool + checklist shape

- **D-01:** `run_self_review` is a **single atomic MCP tool call**. Payload shape: `{ findings: Finding[], coverage: Record<Category, 'pass'|'partial'|'fail'>, verdict: 'request_changes'|'comment'|'approve' }`. The reducer event `selfReview.set` replaces the whole blob atomically. No `start → add_finding → finalize` lifecycle — avoids transaction semantics and saves two tool-budget slots (Pitfall 15). No streaming variant — the tool returns when the LLM finishes composing the full review; UI reactivity comes from the existing SSE `UpdateMessage` fanout after `applyEvent`.
- **D-02:** The built-in checklist lives as a **TypeScript const** at `server/src/checklist/index.ts` exporting `CHECKLIST: readonly ChecklistItem[]`. `ChecklistItem = { id: string, category: 'correctness'|'security'|'tests'|'performance'|'style', criticality: 1|2|3, text: string, evaluationHint?: string }`. No JSON, no markdown, no I/O at server start. Target volume: \~5 items per category × 5 categories = \~25 items total (planner-tunable within a reasonable range). Each item's `evaluationHint` (when present) is a short phrase the `run_self_review` tool description can pull in to frame adversarial stance on that specific item.
- **D-03:** **Nit cap is schema-enforced, not advisory.** The `run_self_review` zod schema rejects payloads where `findings.filter(f => f.severity === 'nit').length > 3`. A rejection bubbles back to the Claude Code session as a tool error with a corrective message ("too many nits — promote the most important, drop the rest"). Severity is a strict enum: `'blocker' | 'major' | 'minor' | 'nit'`. This is a structural mitigation for Pitfall 3 (nit flood), not a prompt-level request. Phase 6 adds a separate pre-submit signal-ratio warning per SUB-02 — not duplicated in Phase 4.
- **D-04:** **Findings anchor via opaque `lineId` only** — never freeform `(path, line)` strings. The `Finding` schema requires `lineId: string` (format `${fileId}:h${hunkIdx}:l${lineIdx}` per Phase 1 D-17). The server resolves each `lineId` to `(path, line, side)` before the reducer broadcasts the `selfReview.set` update, storing the resolved triplet on each finding alongside the `lineId`. Unknown or malformed IDs are rejected at the schema boundary with a clear error. This is the BLOCKER-severity Pitfall 2 mitigation carried forward from Phase 1 / Phase 5's design constraint; Phase 4 pays for it early so Phase 5's `draft_comment` inherits it for free.
- **D-05:** **Default verdict is `'request_changes'`** (Pitfall 4 mitigation). The `run_self_review` zod schema marks `verdict` as optional with a `.default('request_changes')` — meaning a payload without an explicit verdict is accepted as "Request changes." The tool description explicitly states: "*Default verdict is 'Request changes'. You must argue the verdict down to 'comment' or 'approve' if you do, not up from approve.*" Making "Request changes" the structural default (rather than "Approve") forces the direction-of-drift the research recommends.

### Summary content & regenerate UX

- **D-06:** **Summary is a structured-fields blob**, not a markdown blob and not a markdown-plus-freeform hybrid. Shape: `PrSummary = { intent: 'bug-fix'|'refactor'|'feature'|'chore'|'other', intentConfidence: number (0–1), paraphrase: string, keyChanges: string[], riskAreas: string[], generatedAt: string (ISO) }`. Intent classification is the structural hook Pitfall 11 mitigation rests on — downstream self-review prompt framing can key off `intent` to adopt the right review lens (`refactor → behavior-preservation`, `feature → correctness+tests`, etc.).
- **D-07:** **Summary is generated only via an explicit `set_pr_summary` MCP tool call** from the Claude Code session. The plugin process never orchestrates summary generation (no auto-summary hook, no UI-POST-triggers-tool-request pattern). On a fresh `ReviewSession`, `summary === null`; the UI renders a "Summary not generated yet — ask Claude to summarize this PR" empty state. The Claude Code session decides when to call `set_pr_summary`, and regeneration is another call with a new payload.
- **D-08:** **Silent atomic replace on regenerate.** `set_pr_summary` always replaces; the reducer event `summary.set` carries the new `PrSummary` blob. No history array, no version flip-back, no diff-of-regeneration pane, no `stale: true` flag tied to the Phase-2 stale-diff detection. If the diff changes via `session.adoptNewDiff`, the summary stays as-is and the user regenerates manually when they want to. Keeps the reducer surface minimal and matches how `selfReview.set` works (D-01).
- **D-09:** **Paraphrase fidelity is enforced socially, not mechanically.** The `set_pr_summary` tool description explicitly requires `paraphrase` to quote or restate the PR description. The UI renders `paraphrase` adjacent to a collapsed-by-default "Author's description" pane so mismatches are visible to the user at a glance — strong social enforcement. No Jaccard-overlap check, no length floor, no tokenized comparison; those are fragile against well-written summaries using different words, and `start_review` already deterministically paraphrases the PR body via `paraphrase()` in `server/src/mcp/tools/start-review.ts` as a belt-and-suspenders sanity surface.

### Summary + checklist + findings UI

- **D-10:** **`StageStepper` becomes the top-band host above the DiffViewer column.** Phase 3 D-02 left `StageStepper` on disk but unmounted; Phase 4 mounts it at the top of the right-of-FileExplorer column as a persistent band showing: (1) current review stage — Summary | Self-review | (Walkthrough-disabled-Phase-5) | (Submit-disabled-Phase-6), (2) a 5-chip per-category coverage tag strip, (3) a compact summary card (intent chip + first \~80 chars of `paraphrase` + "Expand" affordance). Full summary (keyChanges / riskAreas / full paraphrase / author-description comparator) lives in an expandable drawer anchored to the StageStepper's current step. No new top-level column — the 2-column layout scaffolding from Phase 3 stays intact.
- **D-11:** **Per-category coverage renders as a 5-chip tag strip** on the StageStepper band. One chip per checklist category (Correctness, Security, Tests, Performance, Style); chip fill color = `--ok` (pass) / `--warn` (partial) / `--block` (fail) / muted (not-yet-run). Clicking a chip scopes the findings sidebar filter to that category. Coverage state comes from `selfReview.coverage` in session state — derived server-side from the `findings` array when `run_self_review` lands, not computed client-side. No pie charts, no progress bars; compact and scannable.
- **D-12:** **Findings sidebar is a new right-edge panel**, grouped by checklist category with collapsible sections, severity-ordered within each group (`blocker → major → minor → nit`). Matches ROADMAP success criterion 3 literally. Sidebar toggles open/closed via a TopBar affordance; on narrow viewports it overlays the FileExplorer sidebar (planner's call on exact breakpoint). Category chip click in the StageStepper tag strip filters this sidebar to that category. Each finding row: severity pill, `file:line` ref (server-resolved from `lineId`), finding title, rationale (collapsed behind an "expand" affordance if long). No finding ever renders a diff gutter marker in Phase 4 (D-13).
- **D-13:** **Click-on-finding behavior: scroll + transient focus ring only**, reusing the Phase-3 `scrollIntoView` + `lineId`-anchor rail from `DiffViewer`. No gutter marker is mounted on the diff for Phase-4 findings. Reason: Phase 3 already reserves the `thread-marker` slot for read-only existing-comment markers (Phase 3 D-21); Phase 5 reserves it again for active-thread markers. Stacking a third variant for findings would blow the gutter budget and visually clutter hunks with multiple near-line findings. The sidebar is the one place findings live.

### MCP tool budget for Phase 4

- **D-14:** **Phase 4 adds four MCP tools**: `list_files`, `get_hunk`, `set_pr_summary`, `run_self_review`. Cumulative toolbelt after Phase 4: **5/10** (Phase 1: `start_review`; Phase 4: these four). Projected totals: Phase 5 adds \~3 (`draft_comment`, `reply_in_thread`, `resolve_thread`) → 8/10; Phase 6 adds \~1 (`submit_review`) → 9/10; leaves 1-slot buffer for Phase 7 polish. Verb palette stays within `list_` / `get_` / `set_` / `run_` per Pitfall 15 guidance — no synonyms, no ambiguous overlaps.
- **D-15:** **`list_files` is cursor-paginated with a 30-file-per-page default** (tunable in planning; target keeps a typical response well under Pitfall 5's \~2k-token ceiling). Shape: `list_files({ cursor?: string, limit?: number, includeExcluded?: boolean }) → { files: FileSummary[], nextCursor: string | null, totalFiles: number, excludedCount: number }`. `FileSummary = { fileId, path, status, additions, deletions, hunkCount, generated }`. **`generated: true` files are excluded by default** (Phase 3 D-16) — `includeExcluded: true` opts in. Cursor is opaque (server-side encoded offset). Signals `totalFiles` + `excludedCount` so the Claude Code session knows when it's seen everything. One tool does the whole job — no `list_all_files`, no `list_files_including_excluded` alternates.
- **D-16:** **`get_hunk` supports within-hunk slicing via cursor** so oversized hunks (e.g., a 400-line snapshot-test diff) don't bust the \~2k-token ceiling. Shape: `get_hunk({ hunkId: string, cursor?: string }) → { hunkId, fileId, path, header: string, lines: DiffLine[], nextCursor: string | null, totalLines: number }`. Each line carries its opaque `lineId`. Normal hunks fit in one call (`nextCursor: null`); the rare big hunk pages through. Same tool, two paths — no `get_hunk_range` / `get_hunk_slice` split. Generated files are not automatically refused by `get_hunk` — a caller can always fetch one if they explicitly want it; the default-filter only applies at `list_files` enumeration time.

### Reducer extensions (Phase-2 event-sourcing pattern)

- **D-17:** New `SessionEvent` variants added to the `shared/types.ts` union:
  - `{ type: 'summary.set', summary: PrSummary }` — fires when `set_pr_summary` lands; reducer replaces `session.summary`.
  - `{ type: 'selfReview.set', selfReview: SelfReview }` — fires when `run_self_review` lands; reducer replaces `session.selfReview`. `SelfReview = { findings: ResolvedFinding[], coverage: CategoryCoverage, verdict: Verdict, generatedAt: string }`. `ResolvedFinding = { id, category, checklistItemId, severity, lineId, path, line, side, title, rationale }` — note: `path`/`line`/`side` are server-resolved from `lineId` at tool-call time, not supplied by the Claude Code session.
- **D-18:** `ReviewSession` gains two optional fields: `summary?: PrSummary | null` and `selfReview?: SelfReview | null`. Both default to `null` on new sessions and on `session.reset`. Pre-Phase-4 sessions on disk (no summary/selfReview fields) load fine because both fields are optional — zero migration work.
- **D-19:** Both new events extend the pure reducer (Phase 2 Plan 02-01 pattern). `applyEvent` retains sole ownership of `lastEventId` increment (Phase 2 Plan 02-03 grep-enforced invariant). Per-`prKey` Promise-chain queue (Phase 2) serializes these new mutations automatically. SSE `UpdateMessage` fanout (Phase 2) pushes the new state to the browser store on each event. No changes to reducer / manager / bus infrastructure beyond the new union branches and their case handlers.

### Prompting discipline & tool descriptions

- **D-20:** **Adversarial framing lives in tool descriptions** — not a separate prompt file, not a server-owned system prompt, not a client-side bundle. The `run_self_review` tool's `description` field spells out: (a) adversarial reviewer role ("your job is to find reasons to request changes, not approve"), (b) the criticality-ranked checklist categories pulled inline from `CHECKLIST` at server-startup time, (c) nit-cap discipline (max 3), (d) the devil's-advocate pass ("what could break? what did the author forget? what happens at null / empty / error / concurrent boundaries?"), (e) "default verdict is request_changes; you must argue it down." The `set_pr_summary` tool description spells out the paraphrase-the-PR-description discipline (Pitfall 11). No runtime prompt templating; the descriptions are static strings the Claude Code session's tool introspection surfaces directly.
- **D-21:** **Intent → review-lens coupling is prompt-level, not schema-level.** `run_self_review` does not take intent as an input parameter (the Claude Code session already has `session.summary.intent` available via its read of session state through... wait, it doesn't have direct state read access, but it has the summary it authored in its own context). The tool description instructs: "If you authored a summary via `set_pr_summary`, apply the intent-appropriate review lens (refactor → behavior preservation; feature → correctness + tests; bug-fix → regression check)." Soft coupling — deliberately avoids making `run_self_review` depend on `set_pr_summary` having been called first.

### Claude's Discretion

The planner resolves the following without further user input:
- Exact number of items per checklist category (target \~5; range 3–7).
- Exact wording of each checklist item's `text` and `evaluationHint`.
- Exact wording of the `run_self_review` and `set_pr_summary` tool descriptions (adversarial framing + paraphrase discipline).
- Exact `limit` default for `list_files` (target 30; pick anything between 20 and 50).
- Exact `cursor` encoding (base64 offset / opaque hex / similar).
- Exact within-hunk slice size for `get_hunk` pagination (pick something that keeps the average hunk in one response).
- StageStepper's exact step labels and ordering (Summary | Self-review | Walkthrough | Submit with later steps disabled is the obvious shape).
- Sidebar breakpoint behavior (overlay vs push vs inline on narrow viewports).
- Exact visual weight of the category chips (fill vs outline vs dot + label).
- Exact copy for the "Summary not generated yet" empty state.
- Whether the findings sidebar defaults to open or closed on first self-review completion.
- Whether `ResolvedFinding.title` + `.rationale` get zod `max` lengths (suggestion: yes, bounded).

### Folded Todos

None. No pending backlog todos matched Phase 4 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, UI-researcher, executor) MUST read these before planning or implementing.**

### Project-level governance
- `.planning/PROJECT.md` — Core Value; constraint "LLM driver is the user's active Claude Code session; plugin does not make its own LLM API calls"; Key Decisions (including Phase 1 D-01 SSE+POST, D-04 atomic JSON, and Phase 3 D-01/D-05 prototype-as-authoritative).
- `.planning/REQUIREMENTS.md` — Phase 4 requirements: **LLM-01** (summary pane), **LLM-02** (self-review findings with file:line refs), **CHECK-01** (built-in checklist), **CHECK-02** (per-category coverage). v2 deferrals: `CHECK-V2-01` (repo-override checklist — not in Phase 4).
- `.planning/ROADMAP.md` §"Phase 4: LLM Summary + Checklist + Self-Review" — five success criteria (criterion 5 is the Pitfall-4 adversarial-stance proof via fixture PR with a genuine bug).
- `.planning/STATE.md` — current progress; Phase 1/2/3 accumulated decisions.

### Phase 1 artifacts (load-bearing — Phase 4 builds on the control plane)
- `.planning/phases/01-plugin-skeleton-secure-vertical-slice/01-CONTEXT.md` — D-01 (SSE + HTTP POST transport), D-04 (atomic JSON persistence), D-07..D-13 (security — tokens + Host check + CSP still apply to POST `/api/session/events` for any Phase-4 client-POST wrappers), D-17 (opaque-ID rail for `DiffFile.id` / `Hunk.id` / `DiffLine.id` — Phase-4 findings inherit this), D-22 (Shiki tokens in the SSE snapshot — findings sidebar reads only `lineId` for scroll, not content).
- `server/src/mcp/tools/start-review.ts` — reference implementation of the `mcp.registerTool(name, { title, description, inputSchema }, handler)` pattern. Phase 4's four new tools follow the same shape. Note the `paraphrase()` helper — complementary to D-09's paraphrase-fidelity framing.
- `server/src/mcp/server.ts` — where `registerStartReview` is wired up; Phase 4 adds four sibling `register*` imports.

### Phase 2 artifacts (load-bearing — Phase 4 extends the reducer)
- `.planning/phases/02-persistent-session-store-resume/02-01-PLAN.md` — pure reducer pattern, `SessionEvent` union discipline. Each D-17 new event follows this.
- `.planning/phases/02-persistent-session-store-resume/02-03-PLAN.md` — `applyEvent` ownership of `lastEventId` (grep-enforced invariant); per-`prKey` Promise-chain queue for serializing mutations; SSE subscribe-before-snapshot + buffer-and-flush. Phase-4 events inherit these for free.
- `server/src/session/reducer.ts` — pure reducer; new `case 'summary.set':` and `case 'selfReview.set':` branches land here.
- `server/src/session/manager.ts` — `applyEvent`; no changes to the method itself, only the `SessionEvent` union it accepts.
- `server/src/session/bus.ts` — `SessionBus` with `WeakMap`-preserved off-semantics (Phase 2 pattern).
- `shared/types.ts` — `SessionEvent` union, `ReviewSession`, `SnapshotMessage`, `UpdateMessage`. Phase 4 extensions (D-17 new events, D-18 new fields, new `PrSummary` / `SelfReview` / `Finding` / `ResolvedFinding` / `CategoryCoverage` / `Verdict` types) go here.

### Phase 3 artifacts (load-bearing — Phase 4 consumes Phase-3 state surfaces)
- `.planning/phases/03-diff-ui-file-tree-navigation/03-CONTEXT.md` — D-02 (StageStepper left unmounted for Phase 4 to mount — Phase 4 D-10), D-14 (`DiffFile.generated: boolean` populated — Phase 4 D-15 filters on it), D-16 ("LLM exclusion is stateful only in Phase 3; Phase-4/5 tools filter on the flag by default" — this is Phase 4 honoring that promise via `list_files`'s default behavior), D-21 (read-only comment marker slot on `thread-marker` — Phase 4 does NOT compete for this slot per D-13), D-17/D-18 (keyboard shortcuts — `c`/`v`/`s` are toast stubs; no new shortcut in Phase 4).
- `.planning/phases/03-diff-ui-file-tree-navigation/03-UI-SPEC.md` — paper/teal palette; `:root` CSS vars authoritative; severity color semantics (`--ok`, `--warn`, `--block`, `--add`, `--rem`) that Phase 4's coverage chips + severity pills key off.
- `web/src/components/DiffViewer.tsx` — `scrollIntoView` + transient focus-ring rail; Phase 4 findings click-navigation reuses this (D-13).
- `web/src/components/TopBar.tsx` — sibling placement for the findings-sidebar toggle affordance (planner's call on exact layout).
- `web/src/index.css` — authoritative token set: `--paper`, `--claude`, `--ok`, `--warn`, `--block`, `--add`, `--rem`, `--mono`, etc.
- `web/src/components/StageStepper` (in `TopBar.tsx` or adjacent — confirm during planning) — the prototype component Phase 4 mounts.
- `web/src/store.ts`, `web/src/api.ts` — Phase-4 store actions for `summary.set` and `selfReview.set` updates; no new client POST wrappers are needed because Phase-4 mutations originate from the MCP tool surface, not from the browser.

### Pitfalls research (BLOCKERS + SERIOUS relevant to Phase 4)
- `.planning/research/PITFALLS.md` §"Pitfall 2 — LLM hallucinated line numbers" **(BLOCKER)** — structurally closed by D-04 (lineId-only anchoring) and D-15/D-16 (opaque IDs pervasive in the tool surface). Phase 4 pays the cost early so Phase 5's `draft_comment` inherits it.
- `.planning/research/PITFALLS.md` §"Pitfall 3 — Nitpick flood drowns critical findings" — closed by D-03 (schema-enforced nit cap). Phase 6 adds pre-submit signal-ratio (SUB-02) — not duplicated in Phase 4.
- `.planning/research/PITFALLS.md` §"Pitfall 4 — Self-review becomes blandly positive" — closed by D-05 (default verdict = request_changes) + D-20 (adversarial framing in tool description).
- `.planning/research/PITFALLS.md` §"Pitfall 5 — Context window exhaustion on large PRs" **(BLOCKER for any non-trivial PR)** — closed by D-15 (cursor-paginated `list_files`) + D-16 (within-hunk slicing on `get_hunk`). Per-tool response capped \~2k tokens.
- `.planning/research/PITFALLS.md` §"Pitfall 7 — MCP tool blocks past client timeout" — each Phase-4 tool is in-memory work (`list_files` reads session state; `get_hunk` reads session state; `set_pr_summary` / `run_self_review` are pure reducer mutations). No network round-trips on any Phase-4 tool path. P99 latency stays well below any timeout.
- `.planning/research/PITFALLS.md` §"Pitfall 11 — LLM ignores PR description" — closed by D-06 (intent+paraphrase structured fields) + D-09 (tool-description paraphrase discipline + UI visibility of the comparator).
- `.planning/research/PITFALLS.md` §"Pitfall 12 — Mis-attribution of pre-existing code" — Phase 4 findings can legitimately anchor on context lines (an LLM self-review comment saying "this pre-existing helper has no null check" is a valid flag); no `pre_existing: true` gate on `run_self_review` because that gate is for Phase-5 `draft_comment`, not for findings. Flag for planner review.
- `.planning/research/PITFALLS.md` §"Pitfall 13 — Over-engineering for teams" — D-02's built-in-only checklist, D-07's no-orchestration, D-08's no-history-no-versioning, D-20's static tool descriptions all honor this.
- `.planning/research/PITFALLS.md` §"Pitfall 15 — Tool schema surface too large" — directly addressed by D-14 (cumulative 5/10; verb palette `list_/get_/set_/run_`; no synonyms). Re-check this budget at every Phase transition per the pitfall's own guidance.

### External specs
- [MCP TypeScript SDK `registerTool` docs](https://modelcontextprotocol.io/docs/develop/build-server) — the `McpServer.registerTool(name, { title, description, inputSchema }, handler)` pattern Phase 4's four new tools follow; zod inputSchemas use `.shape` per the SDK convention. Context7 `/modelcontextprotocol/typescript-sdk` is the authoritative source if a version-specific question comes up during planning.
- [Zod v4 union / discriminatedUnion gotcha](https://zod.dev/) — Phase 1 D-notes flag that Zod v4 disallows duplicate discriminator values; Phase-4 finding schemas that union over severity/category don't hit that, but keep the note in mind if any tool schema uses discriminated unions.
- [IntersectionObserver API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API) — already in use in Phase 3 for the in-progress file transition; Phase 4 does not add a new IntersectionObserver usage, but may rely on the existing one to auto-scope the findings-sidebar filter to the visible file (planner's call).

### Committed prototype code (Phase 4 mounts + extends these)
- `web/src/components/TopBar.tsx` — Phase 4 mounts StageStepper (lives within/adjacent to TopBar in the committed prototype — confirm exact location during planning). Phase 4 adds the 5-chip category coverage strip and the summary intent chip.
- `web/src/components/DiffViewer.tsx` — no functional change for Phase 4; its `scrollIntoView`-by-`lineId` API is re-used for findings click-navigation (D-13).
- `web/src/components/FileExplorer.tsx` — no change in Phase 4.
- Phase 4 adds a new component under `web/src/components/` (likely `FindingsSidebar.tsx` + an expandable summary drawer) — planner names them.

</canonical_refs>

<code_context>
## Existing Code Insights

Phase 4 is substantially a *new-tool + new-state + new-UI-pane* exercise on top of Phase 3's stable scaffolding. No refactors to Phase-2/3 infrastructure — only additive.

### Reusable Assets
- **`mcp.registerTool(name, { title, description, inputSchema }, handler)` pattern** (`server/src/mcp/tools/start-review.ts`). Each new Phase-4 tool is a sibling `register*` module imported by `server/src/mcp/server.ts`. Input schemas are zod; outputs return `{ content: [{ type: 'text', text }] }` for now — structured output is via the `summary.set` / `selfReview.set` SessionEvents the tool handlers emit through `manager.applyEvent`, not via the tool return payload (except for diff-inspection tools whose *purpose* is to return data).
- **`paraphrase()` helper** in `start-review.ts` — complementary to D-09's paraphrase-fidelity framing. Phase 4 may want to expose it or a sibling as a utility the `set_pr_summary` server-side handler can optionally invoke to cross-check the LLM-supplied paraphrase against a deterministic baseline (planner's call; not required by D-09 which is social-enforcement).
- **Phase-2 reducer pattern** (`server/src/session/reducer.ts`): pure switch-on-`event.type`. Phase 4 adds `case 'summary.set': return { ...s, summary: e.summary }` and `case 'selfReview.set': return { ...s, selfReview: e.selfReview }` — nothing else.
- **Phase-2 `SessionManager.applyEvent`** + per-`prKey` Promise-chain queue + SSE fanout — Phase 4 mutations inherit all of this without code changes.
- **Phase-2 `SessionBus`** (`server/src/session/bus.ts`) — `WeakMap`-based listener wrapping preserves `off()` semantics; Phase 4 doesn't add new subscribers; existing SSE fanout suffices.
- **Phase-3 `DiffFile.generated: boolean` + Shiki tokens + opaque IDs** — already in the SSE snapshot. `list_files` and `get_hunk` read from the snapshot's `state.diff`; no new server-side ingest work.
- **Phase-3 `scrollIntoView` + focus-ring rail** on `DiffViewer` — click-on-finding reuses this (D-13).
- **Phase-3 prototype palette** — `--ok` / `--warn` / `--block` / `--add` / `--rem` / `--mono` etc. cover every color Phase 4 needs for severity pills, coverage chips, intent chip, empty states. No new tokens.
- **Phase-3 `StageStepper` component** (on disk, unmounted — confirm exact file path during planning) — Phase 4 mounts it and wires the three steps (summary / self-review / disabled-walkthrough / disabled-submit) to session state.

### Established Patterns
- **MCP tool outputs that mutate state go via `manager.applyEvent`**, not directly on the session object. `summary.set` and `selfReview.set` follow this.
- **MCP tool outputs that read state** (Phase 4: `list_files`, `get_hunk`) read from `manager.getSession(prKey)`'s snapshot. No extra persistence; no caching; the snapshot is the source of truth.
- **Per-tool response \~2k-token discipline** (Pitfall 5). `list_files` (30-file page) and `get_hunk` (within-hunk pagination) are the Phase-4 surfaces where this matters.
- **Stderr-only logging in the MCP process** (Phase 1 AP2) — Phase-4 handlers use `logger.error(...)` for anything diagnostic. No `console.log` anywhere in the MCP server path.
- **Zod-first tool input schemas** using `.shape` per MCP SDK convention (see `start-review.ts` — Zod v4's duplicate-discriminator gotcha noted in STATE.md).
- **Opaque IDs are the LLM-facing surface for every anchor.** Phase 4 tools accept `fileId` / `hunkId` / `lineId` only; never `path` + `line` freeform strings.
- **SessionEvent plain-JSON discipline** (shared/types.ts comment) — no Date, no functions, no class instances in events. Phase 4 events use ISO strings for timestamps.
- **Client actions and server events are named symmetrically** (Phase 2 pattern). `summary.set` server event → `onSummarySet` web store action; `selfReview.set` → `onSelfReviewSet`.

### Integration Points
- **`server/src/mcp/server.ts`**: add four `import`s and four `register*()` calls (one per new tool).
- **`server/src/mcp/tools/`**: four new sibling modules — `list-files.ts`, `get-hunk.ts`, `set-pr-summary.ts`, `run-self-review.ts`.
- **`server/src/checklist/index.ts`** (new): TS-const checklist + `ChecklistItem` type.
- **`server/src/session/reducer.ts`**: two new case branches.
- **`shared/types.ts`**: new `PrSummary`, `SelfReview`, `Finding`, `ResolvedFinding`, `CategoryCoverage`, `Verdict`, `ChecklistCategory` types; two new `SessionEvent` union branches; two new optional `ReviewSession` fields.
- **`web/src/store.ts`**: two new store actions (`onSummarySet`, `onSelfReviewSet`) that reflect the `summary.set` / `selfReview.set` update messages into `AppState`.
- **`web/src/components/`**: new `FindingsSidebar.tsx` + summary-expand drawer (planner names the exact component split); `StageStepper` mount wired in `App.tsx` or `TopBar.tsx` depending on the committed prototype's exact structure.
- **`web/src/App.tsx`**: mount `StageStepper` above the DiffViewer column; mount `FindingsSidebar` alongside (sibling to FileExplorer on wide viewports, overlay on narrow).
- **No new HTTP endpoints**: the Phase-2 POST-event endpoint accepts the new `SessionEvent` shapes automatically via the typed union. All Phase-4 mutations originate on the MCP surface.

</code_context>

<specifics>
## Specific Ideas

- **The Claude Code session is the LLM.** There is no other LLM in this system. Every "the LLM does X" in this document refers to the user's active Claude Code chat session reading the plugin's MCP tools. The plugin never calls the Anthropic API. This is load-bearing for Phase 4 because it means adversarial framing, paraphrase discipline, and default-verdict-inversion all have to live in places the Claude Code session actually sees — tool descriptions, inputSchema constraints, and UI affordances — not in server-side system prompts.
- **Ship opaque IDs early.** Pitfall 2 is the single most-referenced BLOCKER in the research, and Phase 5's `draft_comment` inherits the discipline Phase 4 establishes. Planner should make `lineId`-only resolution a first-class part of the `run_self_review` server-side handler — the `ResolvedFinding` that lands in session state carries both the `lineId` and the resolved `(path, line, side)` triplet, so the UI renders `file:line` without re-resolving.
- **Checklist items are data, not prompt strings.** The LLM sees the categories and the item `text`s via the `run_self_review` tool description (which pulls them in at server-start time). But the structured `ChecklistItem[]` is also exposed via session state (checklist items are part of the SSE snapshot — TBD during planning) so the UI can render them as a reference pane without duplicating the content. A future v2 repo-override (`CHECK-V2-01`) would swap `CHECKLIST` for a loaded-from-file source with the same shape.
- **StageStepper is the natural home for review-stage UI.** The prototype specifically put StageStepper into TopBar precisely for this kind of progress affordance. Phase 4 mounts it rather than designing a new pane from scratch — honors Phase 3 D-02 and keeps the UI from diverging from the committed prototype direction (Phase 3 D-01).
- **Findings-sidebar vs gutter markers is a deliberate choice.** The diff gutter already has the Phase-3 existing-comment marker slot and the Phase-5 active-thread marker slot claimed. Phase 4 findings explicitly do not compete for that slot (D-13) — if a future phase wants findings as gutter markers, it can add a fourth variant then; for Phase 4 the sidebar is enough.
- **Silent replace + user-initiated regenerate** is the regeneration discipline across both summary and self-review. No versioning, no staleness tags, no auto-invalidation. Matches how Phase 2's `session.adoptNewDiff` works for the diff itself — a user-triggered event replaces the state atomically. Keeps mental model simple.
- **Phase 4 fixture test mirrors the Phase-3 committed fixture approach.** ROADMAP success criterion 5 demands a fixture PR with a *genuine bug* where the first self-review does NOT default to Approve. Planner should commit a second fixture under `server/src/__tests__/fixtures/` (or similar) specifically engineered to have a plausibly-pass-looking bug (e.g., off-by-one, missing null check in a changed line) — then assert `run_self_review`'s schema accepts a request_changes payload and rejects an approve payload that didn't argue down from the default.
- **`list_files`'s `includeExcluded` flag is the only Phase-4 surface where Phase 3's `generated` flag is user-visible to the LLM.** All other tool paths (`get_hunk`, `set_pr_summary`, `run_self_review`) operate on whatever IDs the LLM passes in. If the LLM explicitly passes a `hunkId` belonging to a generated file, `get_hunk` serves it (no default filter on per-ID tools).
- **Adversarial tool description is long — and that's fine.** Pitfall 15's \~10-tool cap is about tool count, not tool description length. A 400-word `run_self_review` description spelling out the adversarial stance is well spent because it's the exact place the Claude Code session reads the framing.

</specifics>

<deferred>
## Deferred Ideas

Ideas surfaced during discussion that belong in other phases or versions:

- **Summary versioning / history / flip-back UX** — rejected in favor of silent atomic replace (D-08). If regeneration accuracy becomes a practical problem in daily use, revisit in Phase 7 or v1.x.
- **`stale: true` summary flag tied to Phase-2 `session.adoptNewDiff`** — considered (mirroring stale-diff handling), rejected for simplicity. User regenerates manually when they want. Revisit if daily use shows the lack of auto-invalidation bites.
- **Schema-level content fidelity check on `paraphrase`** (Jaccard overlap / token comparison) — rejected as fragile (D-09). Tool description + UI visibility is the enforcement path.
- **Lifecycle self-review tool (`start_self_review` + `add_finding` + `finalize_self_review`)** — rejected for tool-budget cost and transaction complexity (D-01). Atomic one-shot is the shape.
- **Streaming / incremental self-review rendering via server-side progressive event emission** — rejected; SSE-after-single-applyEvent is reactive enough for a single-user local UI.
- **Diff gutter markers for findings (severity-colored dots next to line numbers)** — rejected for Phase 4 (D-13). Phase 7 could add if daily use shows sidebar-only is insufficient.
- **Third column in the 2-col layout for findings** — rejected; Phase 3 D-02 set 2-col as authoritative and StageStepper-top-band + sidebar honors that (D-10).
- **Progress bar / pie chart variants for per-category coverage** — rejected in favor of 5-chip tag strip (D-11).
- **`CHECK-V2-01` repo-level `.review/checklist.md` override** — explicitly deferred to v2 per REQUIREMENTS.md.
- **Repo-level per-category item override / team-authored checklists** — never in scope (PITFALLS 13 solo-tool discipline).
- **Auto-summary-on-session-start orchestration** — rejected; plugin makes no LLM calls (D-07, PROJECT.md constraint).
- **UI-POST-triggers-tool-request pattern for summary generation** — rejected in favor of direct LLM-initiated `set_pr_summary` call (D-07). Simpler flow.
- **Intent as an input parameter on `run_self_review`** — rejected in favor of soft coupling via tool-description instruction (D-21). Avoids forcing a call order.
- **Markdown checklist authoring format** — rejected in favor of TS const (D-02). When `CHECK-V2-01` arrives, v2 owns the format decision.
- **JSON-file checklist authoring format** — same rejection as markdown (D-02).
- **Pre-submit signal-ratio warning in Phase 4** — deferred to Phase 6 per SUB-02. Schema nit cap covers the Phase-4 concern (D-03).
- **`pre_existing: true` gate on `run_self_review` findings** — that gate lives on Phase-5's `draft_comment` (Pitfall 12 mitigation). Findings can legitimately anchor on context lines.
- **Pending-review detection at session start (Pitfall 10 → Phase 6 SUB-03)** — outside Phase 4.
- **Adversarial-framing prompt file outside the tool-description** — rejected in favor of inline tool descriptions (D-20). Static text the Claude Code session reads directly.
- **Separate diff-inspection tool for generated files (`list_excluded_files`)** — rejected; `list_files({ includeExcluded: true })` is sufficient (D-15).
- **Per-hunk range-slicing tool (`get_hunk_range`)** — rejected; `get_hunk({ hunkId, cursor })` handles oversized hunks (D-16).
- **Findings sidebar as an overlay modal rather than an inline panel** — rejected; sidebar pattern is more consistent with FileExplorer.
- **Per-finding mark-as-resolved / hide affordance in the sidebar** — not in scope for Phase 4. If daily use demands it, add in Phase 7 or as part of Phase 5's thread-resolution surface.

### Reviewed Todos (not folded)

None — no pending todos matched Phase 4 scope.

</deferred>

---

*Phase: 04-llm-summary-checklist-self-review*
*Context gathered: 2026-04-20*
