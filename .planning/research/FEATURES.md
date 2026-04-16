# Feature Research

**Domain:** LLM-assisted GitHub PR review tool (Claude Code plugin + local web GUI, single-user)
**Researched:** 2026-04-16
**Confidence:** HIGH — feature landscape in this domain is extensively documented (CodeRabbit, Greptile, Graphite, GitHub Copilot Code Review, Claude Code Review, Cursor BugBot, Qodo, diffx, diffity all mapped); complexity estimates verified against available OSS libraries (diff2html, react-diff-view, Monaco, Octokit).

**Framing note:** This is a personal tool — single user, replacing the Claude desktop app for PR review. "Table stakes" here means *stakes for THIS user against their current baseline (GitHub.com + desktop Claude)*, not stakes for a shared-team SaaS. Many features that would be table stakes for a hosted product (team management, cross-host support, analytics) are correctly in scope-out. Several conventional "table stakes" (split-diff toggle, CODEOWNERS, multi-LLM switching) can be deferred without breaking the core walkthrough → comments → posted-review loop.

---

## Feature Landscape

### Table Stakes (Core workflow breaks without these)

Features the tool absolutely must have on day one. Omitting any of these means either the LLM can't do its job or the human can't steer the review.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Load PR by GitHub URL / number / `gh` default** | Entry point; without this the tool has no input. Matches `gh pr view` mental model. | LOW | `gh pr view --json` + `gh pr diff` does 90% of the work. Octokit only needed for review submission and richer metadata. |
| **Fetch PR metadata (title, description, author, base/head refs, existing comments)** | LLM cannot write a useful summary or avoid duplicating existing review comments without this context. | LOW | Single `gh api` call. Include existing review threads so the LLM doesn't re-raise known issues. |
| **Fetch unified diff with file list** | Foundation for every downstream feature (summary, walkthrough, comments). | LOW | `gh pr diff` returns unified diff; parse with `parse-diff` or `diff2html`'s parser. |
| **Render syntax-highlighted diff** | Reading a mono-color diff in the browser when GitHub.com is one click away would make the tool feel strictly worse than the status quo. | MEDIUM | `diff2html` + `highlight.js` or `react-diff-view` + `refractor`. Unified view sufficient for v1; split view deferrable. |
| **File-tree navigation** | PRs touch many files; scrolling one long list breaks for any PR >10 files. Also drives "reviewed vs not" state. | LOW-MEDIUM | Tree from diff file paths; highlight current file; click-to-scroll. Marking files "viewed" is a natural extension. |
| **Line-level comment anchoring (file + line → draft comment)** | The entire walkthrough output is inline comments. No anchoring = no product. Must handle both sides of the diff (LEFT for deletions, RIGHT for additions). | MEDIUM | GitHub uses `path` + `line` + `side` + optional `start_line` for multi-line. DOM-side: capture click on diff row, render thread UI, persist to state. |
| **LLM-generated PR summary** | Listed in Core Value. Distinguishes this tool from plain `gh pr diff`. | LOW | First MCP tool: `generate_summary(pr_context)` → markdown. Rendered as top-of-GUI panel. |
| **LLM self-review against criticality-ranked checklist** | Listed in Active requirements. Built-in default + repo override. Checklist items with severity are the reviewer's scaffolding. | MEDIUM | Default checklist as YAML/MD shipped in plugin; repo override via `.review/checklist.md`; each item links back to diff locations (file+line refs). |
| **LLM-curated walkthrough with "show all" escape** | Listed in Active. This is the differentiator against the desktop-app chat flow — LLM picks an order and narrates. | MEDIUM | MCP tool `plan_walkthrough` returns ordered hunk refs with narrative beats; `show_all` expands to raw hunk order. |
| **Inline conversational threads (user ↔ LLM per line)** | Listed in Active. Without threaded reply, the walkthrough becomes one-shot annotation — indistinguishable from batch mode. | MEDIUM-HIGH | Each draft comment is a thread root; replies stay local until review submission. MCP exposes `reply_in_thread(thread_id, message)`. Comment gets posted as a single GitHub review comment with the full thread flattened into the body. |
| **Draft comment state (pending, not posted)** | User must iterate before committing. Posting per-comment would spam the PR. Matches GitHub's own pending-review semantics. | LOW | Keep comments in local state with status `draft`; only flush on "Submit review". |
| **Submit full GitHub review (verdict + body + inline comments, single call)** | Listed in Active. Terminal step. Must be atomic — no partial posts on failure. | MEDIUM | `POST /repos/{o}/{r}/pulls/{n}/reviews` with `event: APPROVE\|REQUEST_CHANGES\|COMMENT` and `comments[]` array. Single API call. Handle comment-position translation (line → diff-hunk position) correctly. |
| **Verdict selection UI (Approve / Request changes / Comment)** | GitHub review API requires it; also forces reviewer to actually decide (per Key Decisions in PROJECT.md). | LOW | Radio/button on submit. Default to "Comment". No silent approvals. |
| **Per-PR resumable state on disk** | Listed in Active + Constraints. Reviewing in chunks across hours/days is the actual workflow; session-only state would be a hard product failure. | MEDIUM | Keyed by `{owner}/{repo}#{pr}`. Persist: walkthrough cursor, draft comments, checklist progress, LLM conversation log. JSON or SQLite under `~/.gsd-review/` or `.planning/reviews/`. |
| **Local branch diff mode (no GitHub)** | Listed in Active. Enables offline review of in-progress feature branches; needed to validate the UX independent of GitHub API. | LOW | `git diff base..head` produces the same unified diff; skip the `gh` path and the "submit review" path (reviews output locally). |
| **LLM drives UI via MCP tools** | Listed in Constraints. The plugin's raison d'être. | MEDIUM | MCP tools: `load_pr`, `get_diff`, `generate_summary`, `run_self_review`, `plan_walkthrough`, `focus_hunk`, `draft_comment`, `reply_in_thread`, `submit_review`. UI subscribes to a state bus (websocket) so MCP-driven changes render live. |
| **Handle large diffs without dying** | A 5k-line PR from an auto-refactor must not freeze the browser or the LLM context. | MEDIUM | Lazy-render hunks (virtualized file list); pass summarized diff to LLM by default and expand hunks on demand. Don't try to solve >3k-file monorepo PRs in v1 — just don't *crash* on them. |
| **Collapse generated / lockfile / vendored files** | Standard reviewer hygiene. Every PR touches `package-lock.json` or similar; showing it as a normal file ruins signal-to-noise. Also hides huge files from the LLM context. | LOW | Respect `.gitattributes` `linguist-generated`; fallback glob list (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `poetry.lock`, `*.min.js`, `dist/**`, `vendor/**`). Collapsed in UI and excluded from LLM summary/walkthrough by default. |

### Differentiators (Why this beats Claude desktop app)

These are the features that make the product distinct from "paste the diff into a chat window". The Core Value of PROJECT.md lives here.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Criticality-ranked self-review with code references** | Each checklist item emits findings with severity (Critical / Major / Minor / Nit) and clickable `file:line` links. Severity ranking is how CodeRabbit and Greptile both present findings; without it, the review is a wall of equal-weight comments. | MEDIUM | Schema: `{ item, severity, finding, location: {file, line}, suggestion? }`. Clickable locations scroll the diff to the hunk. |
| **Repo-specific checklist override** | Listed in Active. Every codebase has its own review culture — Rust project cares about `unsafe`, TS project cares about `any`, Python project cares about type hints. Built-in default + repo file gets ~90% of value without LLM-inferred-checklist variance. | LOW | Parse `.review/checklist.md` if present; merge/replace semantics (replace by default — simpler). |
| **LLM-planned walkthrough narrative** | The "story" of the PR is what the reviewer actually needs. CodeRabbit produces a flat list; Greptile does multi-hop but not narrative. Walking through changes in author-intended-order *as the LLM understands them* is the specific thing chat UIs can't give you because they don't have the diff structured in front of them. | MEDIUM | LLM picks ordered hunk sequence and writes a one-paragraph narrative per hunk. User advances with keyboard (`n`/`p`). |
| **"Show all" escape from curated walkthrough** | Listed in Active. Protects against LLM missing something; turns the curated list into additive guidance rather than a filter you can't override. | LOW | Toggle that appends un-curated hunks to the end of the walkthrough queue. |
| **Conversational per-line threading with LLM** | "What did the author mean by X on line 47?" → "Let me check the surrounding code and their earlier commits…" → back-and-forth resolved to a single draft comment or dismissed. This is exactly the thing that chat UIs can't do because they can't anchor to a line. | MEDIUM-HIGH | Thread state: messages[] per anchor. On submit, either (a) flatten thread into the posted comment body with a "Conversation with reviewer:" section, or (b) post only the final resolved comment with the thread kept local for audit. Prefer (b) for signal-to-noise. |
| **Diff-aware context injection (surrounding code, call sites, related tests)** | When the LLM reviews a hunk, it should see the function it's in, callers from the same PR, and adjacent tests — not just the ±3 lines of diff context. This is what separates Greptile (82% catch rate) from CodeRabbit (44% catch rate). | HIGH | MCP tools for `get_file(path, range)`, `find_references(symbol)`, `find_tests_for(path)`. Can use `git grep` / `rg` / tree-sitter / LSP. Start with `rg` + file reads; defer tree-sitter/LSP to later. |
| **Checklist coverage tracking (pass/fail/skip per item)** | Forces the LLM (and user) to actually address each item rather than hand-waving. Produces a visible "Reviewed 12/15 checklist items" progress indicator. | LOW | State per checklist item: `not_run / passed / failed / skipped`. Rendered in sidebar. |
| **"Reviewed" markers per hunk/file** | Analogue to GitHub's "Viewed" toggle but hunk-granular. Drives resumability and shows what remains. | LOW | Boolean per hunk; auto-set as walkthrough advances; user can toggle. |
| **One-click "Post review" with full context** | Converts all draft comments + summary + verdict into a single review submission. Atomic. | MEDIUM | See Table Stakes entry — same work; listed here because the *polish* (diff-of-what-will-be-posted, verdict confirmation, "N comments, verdict=X, proceed?") is a differentiator over the API-minimum. |
| **Keyboard-driven navigation** | `n` / `p` through walkthrough, `c` to comment, `r` to reply, `v` for viewed, `s` to submit. A desktop-app chat can't do this. GitHub itself has weak keyboard shortcuts on the PR page. | LOW | Standard hotkey library (`mousetrap`, `react-hotkeys-hook`). Cheap to implement, high daily-use ROI. |

### Deferrable (Would be table stakes for shared tool; fine for v1 personal use)

Features users would expect from a hosted/shared review tool that this user, as the sole developer reviewing their own PRs, can live without until the core workflow is validated.

| Feature | Why Deferrable | Complexity When Added | Notes |
|---------|----------------|----------------------|-------|
| **Split-diff view (side-by-side)** | Unified view covers the walkthrough case (LLM is narrating; user is reading, not mentally diffing). Power-users prefer split for complex refactors; can add later without architectural change. | LOW | `react-diff-view` and `diff2html` both support both modes via a single prop. |
| **CODEOWNERS display** | Single-user tool; user owns everything. Irrelevant for self-review. Relevant only when reviewing others' PRs from repos with codeowners — a v2 scenario. | LOW | Parse `CODEOWNERS` and match globs to file paths. |
| **CI status / check status display** | User can see this on GitHub.com; review is orthogonal to CI state. Nice-to-have; not blocking the review loop. | LOW | `gh pr checks --json`; render as a status pill. |
| **"Mark file viewed" (GitHub-compatible)** | Per-hunk "reviewed" markers (Differentiator) cover this need internally. GitHub's own "Viewed" state is only useful if the user is bouncing back to github.com — not this tool's workflow. | LOW | Write-back to GitHub via `PUT /repos/{o}/{r}/pulls/{n}/files/{path}/reviewed-by`. |
| **Previous-review memory (repeat-flag detection)** | Genuine value ("I always flag this pattern") but requires persistent cross-PR memory and is only useful after 5-10 reviews. Defer until the single-PR loop is proven. | MEDIUM | Embed findings to vector store or simple pattern log; match against new findings. |
| **Diff search / grep within PR** | Useful for large PRs; covered partially by file-tree navigation in v1. | LOW | Client-side filter over rendered diff. |
| **Incremental review (only new commits since last review)** | The diff-since-last-review UX is strong for iterative PRs, but as a solo reviewer pushing their own code, the author is rarely re-reviewing after another push. Add when it bites. | MEDIUM | Track last-reviewed SHA in per-PR state; compare-to-HEAD diff and feed that to the walkthrough. |
| **Suggested edits (GitHub "suggestion" blocks in comments)** | GitHub's ` ```suggestion ` block lets the author one-click apply a change. High value for the PR author, lower value for this reviewer-tool if most of the author's edits happen via Claude Code anyway. | LOW | Wrap suggested replacements in triple-backtick-suggestion in comment body. Cheap to add when wanted. |
| **Comment export / local review artifact** | For local-branch-diff mode, emitting the review as a markdown file makes sense. In GitHub mode, the posted review *is* the artifact. | LOW | Serialize pending review to markdown on demand. |
| **CLI/headless mode** | The web UI is the product. A headless "just print the summary" mode would duplicate `gh pr view` + Claude without the differentiator. Skip. | — | Non-goal. |

### Anti-Features (Deliberately NOT building, with rationale)

Features with surface appeal that conflict with PROJECT.md's Out of Scope list or would undermine the core workflow.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Team features (assignees, reviewer rotation, approval gates)** | Standard in hosted review tools. | Out of Scope per PROJECT.md — single-user tool. Adds persistence, identity, auth surfaces that have no value to a solo reviewer. | GitHub handles this natively; use GitHub for it. |
| **Hosted / multi-user backend** | "What if I want to share?" | Out of Scope per PROJECT.md. Introduces accounts, secrets management, hosting cost, and a wholly different product. | Local-only with resumable state. Share via GitHub's review if needed. |
| **GitLab / Bitbucket / Azure DevOps support** | Reach. | Out of Scope per PROJECT.md. Each host needs a separate diff/comment/review API adapter. No personal value — author works on GitHub. | GitHub + local-branch-diff covers author's real use. |
| **IDE-embedded experience (VS Code/Cursor/Zed panels)** | Keeping the reviewer in-editor. | Out of Scope per PROJECT.md (Zed WASM can't do it; VS Code/Cursor out of scope). The rich UI *is* the product — a panel would degrade it. | Browser opens side-by-side with editor. |
| **Automated approval / "auto-merge on LLM approval"** | Speed. | Eliminates the human-in-the-loop that the Core Value (`real reviewer quality`) depends on. Posting an auto-approval with no human read is worse than the status quo. | Verdict always chosen by the human. LLM can *suggest* approve, never *execute* it. |
| **Comment-only review submission** | Lower-friction for "not-sure-yet" reviews. | Out of Scope per PROJECT.md — a deliberate non-goal. Eliminating this enforces verdict discipline, which is a stated value. | User picks `COMMENT` verdict explicitly if they don't want to approve/request-changes. The distinction is "did I decide the verdict" not "is there a verdict field". |
| **LLM-inferred per-PR checklist** | Adaptive review criteria per PR. | Out of Scope per PROJECT.md. Adds variance without clear value; the built-in-plus-override checklist model is simpler and more predictable. | Built-in default + repo `.review/checklist.md`. |
| **Multi-LLM / model-switching UI** | "What if Claude is down?" or "compare GPT vs Claude". | The plugin *is* a Claude Code plugin — it inherits the Claude Code session. Adding model switching would require separate auth, separate API layers, and a UX that contradicts the "single auth surface" constraint. | Use Claude Code. If the user needs another model, they use a different tool. |
| **PR-level analytics / history dashboards** | "How many PRs have I reviewed?" | This is a usage-metrics product, not a review product. The persistent state exists for resumability, not measurement. | None. If the user wants analytics, dump the state directory to a script. |
| **Polished install / config wizard / docs site** | "Ship it properly." | Out of Scope per PROJECT.md for v1. Sole user is the author; README + manual install is fine. | Defer until workflow proves itself in daily use. |
| **Real-time collaborative review (two reviewers on same PR live)** | Multi-reviewer ergonomics. | Single-user tool. Would require CRDT, presence, conflict resolution — all wasted for v1. | GitHub's own PR page is the collaboration surface if two people are reviewing. |

### Features That Sound Good But Hide Complexity (flagged honestly)

Per the question — features worth calling out specifically because they *look* like natural additions but carry disproportionate complexity for a personal v1.

| Feature | Surface Appeal | Hidden Complexity | Recommendation |
|---------|----------------|-------------------|----------------|
| **GitHub Check Suite integration (post review as a Check)** | "Show the LLM review as a CI check on the PR." | Requires a GitHub App (not just user PAT), App installation flow, webhook receiver, separate Checks API auth scope, and a hosted endpoint for the Check — fundamentally incompatible with local-only architecture. | Anti-feature in v1. Reviews go through the normal review API. |
| **Embed comments back into the editor (VS Code/Zed/Cursor)** | "One workflow from review to fix." | Requires an extension per editor, cross-process comment sync, and bidirectional state — three to five additional product surfaces. Zed also ruled out by PROJECT.md (WASM limitation). | Defer. User copy-pastes file:line into their editor; this is acceptable friction. |
| **Multi-LLM / model-switching UI** | "Cheap OpenAI summary, expensive Claude walkthrough." | Auth per provider, pricing/rate-limit handling, tool-calling dialect differences, UX for "which model is talking now." Violates the inherited-Claude-Code-session constraint. | Anti-feature. See above. |
| **PR-level analytics / history** | "Track my review velocity." | Requires schema, aggregation queries, a visualization layer — a whole second product. | Anti-feature in v1. Files on disk are introspectable if needed. |
| **Tree-sitter / LSP-powered context injection** | "LLM understands that `foo()` on line 47 is defined in `src/utils.ts:12`." | Pulls in language servers per language, process management, and query wrappers. Value is real (Greptile's edge) but `rg` + file reads get ~60% of the value for ~10% of the effort. | Start with `rg`/grep for v1; defer tree-sitter/LSP to v2 if context quality is the complaint. |
| **Repository-wide semantic indexing** | "Greptile-style multi-hop investigation across the whole repo." | Embedding pipeline, vector store, incremental reindex on git state changes, staleness handling. Justifiable for a product catching bugs across millions of repos; overkill for one dev's own PRs where they wrote most of the code. | Anti-feature in v1. Revisit only if local-context injection proves insufficient in practice. |
| **Streaming LLM responses to the GUI in real time** | "Chat feels alive." | Needs a streaming channel (SSE/websocket) all the way through MCP → plugin → UI, token-level rendering, cancellation handling. MCP itself is request/response. | Defer. Progress indicators + completed-message delivery is adequate v1 UX. |
| **Multi-line comment ranges with precise start-line handling** | "Comment on lines 40-47 as a block." | GitHub API supports it (`start_line` + `line`) but line-to-diff-position translation is the most error-prone part of the review API; easy to get "position" wrong and have comments land on wrong lines. | Support single-line in v1; add multi-line once single-line is rock-solid. |

---

## Feature Dependencies

```
[MCP tool surface] ─── foundational ───────────────────────────────┐
      │                                                             │
      ├──> [Load PR / fetch metadata] ─────┐                         │
      │                                    │                         │
      ├──> [Render diff w/ syntax highlight]─┐                       │
      │               │                      │                      │
      │               └──> [File tree] ──────┤                      │
      │                                      │                      │
      │                                      v                      │
      │                   [Line-level comment anchoring]             │
      │                              │                               │
      │                              ├──> [Draft comment state]      │
      │                              │        │                      │
      │                              │        └─> [Conversational   │
      │                              │              inline threads] │
      │                              │                               │
      ├──> [LLM summary] ────────────┤                               │
      │                              │                               │
      ├──> [LLM self-review] ────────┤                               │
      │        │                     │                               │
      │        └─> [Checklist engine]│                               │
      │              │               │                               │
      │              ├─> [Built-in default]                          │
      │              ├─> [Repo override]                             │
      │              └─> [Criticality ranking + code refs]           │
      │                              │                               │
      ├──> [Walkthrough planner] ────┤                               │
      │        │                     │                               │
      │        ├─> ["Show all" escape]                               │
      │        └─> [Per-hunk "reviewed" markers]                     │
      │                              │                               │
      │                              v                               │
      │                    [Submit review API call] <────── [Verdict UI]
      │                              ^
      │                              │
      └──> [Per-PR persisted state] ─┘
                  │
                  └─> [Resume across sessions]


[Diff-aware context injection] ──enhances──> [LLM self-review]
[Diff-aware context injection] ──enhances──> [Walkthrough planner]
[Collapse generated files]     ──enhances──> [Diff rendering] + [LLM context budget]
[Keyboard navigation]          ──enhances──> [Walkthrough] + [File tree]

[Local branch diff mode] ──parallel path──> [Load PR] (same diff rendering; skips GitHub submission)

[Comment-only review mode] ──CONFLICTS with──> [Verdict discipline / Core Value]
[Auto-approval]            ──CONFLICTS with──> [Human-in-the-loop Core Value]
[Hosted backend]           ──CONFLICTS with──> [Local-only constraint]
```

### Dependency Notes

- **Line-level comment anchoring requires diff rendering with stable hunk-to-position mapping.** GitHub's review API takes `position` (offset into diff hunk) *or* `line` (file line). The UI must maintain both and pick correctly at submission time. This is the single most error-prone piece of the whole product and should be nailed down in the first phase.
- **Conversational threads require draft comment state.** Threads are multi-message; each needs to survive refresh; only flushed at review submission.
- **Walkthrough requires both the summary pass and the self-review pass as inputs.** The narrative the LLM chooses depends on what it discovered during self-review. Ordering in the roadmap: summary → self-review → walkthrough plan.
- **Persistent state wraps almost everything.** Adding it late means retrofitting state hooks everywhere. Pay the cost upfront with a state store that draft comments, walkthrough cursor, and checklist progress all target.
- **Local-branch-diff mode is a parallel path, not a subset.** It shares the diff rendering pipeline and LLM tooling but skips the GitHub metadata fetch and the `submit_review` API call (emits a local markdown artifact instead). Build both paths behind a common `ReviewSession` abstraction or GitHub bleeds into everything.
- **Comment-only review mode, auto-approval, and hosted backend each conflict with stated Core Value or Out of Scope.** These aren't "not yet" — they're "not ever".
- **Diff-aware context injection is a later-phase enhancement of self-review, not a prerequisite.** The v1 loop works with diff ±10 lines of context. Context injection becomes worth building once self-review quality plateaus.

---

## MVP Definition

### Launch With (v1) — the walkthrough-to-posted-review loop

Minimum set to validate the Core Value: *"a posted GitHub review of real reviewer quality, faster and with better coverage than reviewing alone or chatting with an LLM."*

- [ ] **MCP tool surface for LLM-driven UI control** — foundational; every other feature plugs into this
- [ ] **Load PR via `gh` (GitHub URL / number)** — entry point
- [ ] **Local-branch-diff mode** — review without GitHub; validates UI independent of host integration
- [ ] **Unified diff rendering with syntax highlighting** — readable diff
- [ ] **File-tree navigation** — usable on real PRs (>10 files)
- [ ] **Collapse generated / lockfile files** — sanity preservation
- [ ] **LLM PR summary** — first LLM output, lowest-risk integration test
- [ ] **Built-in default checklist + repo `.review/checklist.md` override** — checklist engine
- [ ] **LLM self-review with criticality + code refs** — first differentiator
- [ ] **LLM walkthrough planner with narrative + "show all"** — core workflow
- [ ] **Line-level comment anchoring (single-line)** — core workflow
- [ ] **Conversational threads on inline comments (user ↔ LLM)** — core workflow
- [ ] **Draft comment state (pending until submission)** — safety net
- [ ] **Per-PR persistent state + resume** — real-world workflow requirement
- [ ] **"Reviewed" markers per hunk (drives resume UX and progress visibility)** — progress tracking
- [ ] **Verdict UI (Approve / Request changes / Comment)** — required by GitHub API
- [ ] **Submit full review in single API call** — terminal step
- [ ] **Basic keyboard shortcuts (next/prev hunk, comment, submit)** — daily-use ergonomics
- [ ] **Graceful degradation on large PRs (don't crash)** — robustness floor

### Add After Validation (v1.x) — polish and power-user

Trigger: "the v1 loop works, but X keeps costing me time."

- [ ] **Split-diff view toggle** — when reviewing complex refactors
- [ ] **Diff-aware context injection (surrounding code via `rg`/grep, then file reads)** — when self-review misses cross-file issues
- [ ] **CI status display** — when repeatedly bouncing to GitHub for check results
- [ ] **Multi-line comment ranges** — when single-line is consistently limiting
- [ ] **GitHub "Viewed" file marker write-back** — when continuing review on github.com afterwards
- [ ] **Incremental review (only new commits since last session)** — when iterative PRs become common
- [ ] **Suggested-edit blocks in comments** — when handing off fixes to the author
- [ ] **Review export as markdown (for local-branch-diff mode)** — when sharing review results outside GitHub
- [ ] **In-diff search / filter** — when PRs touch >30 files

### Future Consideration (v2+) — only if the workflow proves itself

Trigger: v1 is in daily use, core value is validated, friction points are well understood.

- [ ] **Previous-review memory (pattern detection across past reviews)** — requires enough review history to matter
- [ ] **Tree-sitter / LSP-based context injection** — only if `rg` context proves insufficient
- [ ] **CODEOWNERS display** — only if reviewing others' PRs in codeowner-using repos
- [ ] **Zed integration via shared MCP context server** — only after plugin workflow is proven (per PROJECT.md)
- [ ] **Multi-reviewer collaborative session** — only if workflow somehow becomes team-shared (contradicts current scope)

---

## Feature Prioritization Matrix

Priority-labeled for roadmap phase ordering.

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| MCP tool surface | HIGH | MEDIUM | P1 |
| Load PR via `gh` | HIGH | LOW | P1 |
| Local branch diff mode | HIGH | LOW | P1 |
| Unified diff rendering + syntax highlight | HIGH | MEDIUM | P1 |
| File-tree navigation | HIGH | LOW | P1 |
| Collapse generated files | MEDIUM | LOW | P1 |
| LLM PR summary | HIGH | LOW | P1 |
| Checklist engine (built-in + repo override) | HIGH | MEDIUM | P1 |
| LLM self-review with criticality + code refs | HIGH | MEDIUM | P1 |
| Walkthrough planner + "show all" | HIGH | MEDIUM | P1 |
| Line-level comment anchoring | HIGH | MEDIUM | P1 |
| Conversational inline threads | HIGH | MEDIUM-HIGH | P1 |
| Draft comment state | HIGH | LOW | P1 |
| Per-PR persistent state / resume | HIGH | MEDIUM | P1 |
| Verdict UI + submit full review | HIGH | MEDIUM | P1 |
| "Reviewed" hunk markers | MEDIUM | LOW | P1 |
| Basic keyboard shortcuts | MEDIUM | LOW | P1 |
| Graceful large-PR handling | MEDIUM | MEDIUM | P1 |
| Diff-aware context injection | HIGH | HIGH | P2 |
| Split-diff view | MEDIUM | LOW | P2 |
| CI status display | LOW | LOW | P2 |
| Multi-line comment ranges | MEDIUM | MEDIUM | P2 |
| Incremental review since last session | MEDIUM | MEDIUM | P2 |
| Suggested-edit blocks | MEDIUM | LOW | P2 |
| Previous-review memory | MEDIUM | MEDIUM-HIGH | P3 |
| Tree-sitter / LSP context | MEDIUM | HIGH | P3 |
| CODEOWNERS | LOW | LOW | P3 |
| Team features, hosted backend, multi-host, auto-approve, multi-LLM, analytics, Check Suite integration, editor-embed | — | — | Anti-feature |

**Priority key:**
- **P1:** Required for v1 launch — the walkthrough → comments → posted-review loop cannot be validated without it
- **P2:** Add post-validation when friction is observed
- **P3:** Future — only if v1 + v1.x proves out the workflow

---

## Competitor Feature Analysis

| Feature | CodeRabbit | Greptile | Claude Code Review (Anthropic) | GitHub Copilot Code Review | Our Approach |
|---------|------------|----------|--------------------------------|----------------------------|--------------|
| PR summary | Auto on every PR | Auto on every PR | Multi-agent summary | Auto on every PR | LLM-generated, triggered on load; user can regenerate |
| Line-level inline comments | Yes, severity-ranked with one-click fixes | Yes, confidence-scored | Yes, via multi-agent dispatch | Yes, agentic | Yes, but conversation-threaded during authoring (unique) |
| Walkthrough narrative | No — flat list | Multi-hop investigation (not narrative) | Agent dispatches parallel review tasks | Agentic exploration of files | LLM-planned ordered walkthrough w/ per-hunk narrative (unique) |
| Checklist | Automation "recipes" | Repo-conventions inferred from history | No explicit checklist | No explicit checklist | Built-in + repo override, criticality-ranked (unique stable schema) |
| Codebase context | Diff + nearby files | Full-repo indexed graph | File reading + search | CodeQL + ESLint + file reading | `rg`/grep for v1, deferred tree-sitter/LSP |
| Submit as full GitHub review | Yes | Yes | Yes | Yes | Yes — single atomic call with verdict |
| Conversational per-line chat with LLM | No | No (comment-only) | Limited | No | Yes — threaded dialogue per anchor (unique differentiator) |
| Human-in-the-loop verdict | Optional | Optional | Yes | Optional | Mandatory (per PROJECT.md) |
| Platform | Hosted SaaS (GH, GL, BB, Azure) | Hosted SaaS | Anthropic-hosted agent | GitHub-hosted | Local-only, GitHub + local-branch-diff |
| Auth surface | GitHub App install + account | GitHub App install + account | Anthropic account | GitHub native | Inherits Claude Code session (no extra auth) |
| Multi-LLM | Yes (OpenAI/Anthropic/Gemini) | N/A | Claude only | OpenAI-backed | Claude only (by design — inherits Claude Code) |
| Previous-review memory | Limited | Learns conventions | Session-bound | No | Deferred to v2 |
| Review artifact | Posted GitHub review | Posted GitHub review | Posted GitHub review | Posted review | Posted GitHub review OR local markdown (local-branch-diff mode) |

**Where we compete:**
- **Walkthrough narrative ordering** — nobody else does LLM-planned order with per-hunk narrative.
- **Conversational inline threads during authoring** — the precise thing a chat UI can't do (no line anchors) and a review bot doesn't do (fire-and-forget).
- **Zero extra auth / local-only** — inherits Claude Code session, no GitHub App install, no accounts.
- **Repo-overridable stable checklist** — predictable criteria, not LLM-inferred-per-PR variance.

**Where we don't compete (and shouldn't):**
- Multi-platform support. Scale. Multi-LLM. Analytics. Team workflows. Hosted convenience.

---

## Explicit Deferral Analysis (per the question)

The question asks: *"given this is a personal tool for a single developer, which 'table stakes' can actually be deferred to v2 without breaking the core workflow?"*

Answer — the following conventional "table stakes" items are **safely deferrable for a single-user personal tool**:

1. **Split-diff view** — unified view + LLM narration is sufficient for walkthrough-style review. Split diff becomes desirable for complex refactors but isn't a daily-use blocker. **Defer.**
2. **CODEOWNERS display** — single-user means user owns everything. **Defer.**
3. **CI / check status display** — orthogonal to the review decision itself; GitHub.com is one click away for a check. **Defer.**
4. **GitHub "Viewed" file sync** — replaced by local "reviewed" markers for this tool's workflow. **Defer or skip entirely.**
5. **Multi-line comment ranges** — single-line handles 90%+ of comment cases; multi-line is higher-risk to implement correctly (position math). **Defer.**
6. **Suggested-edit blocks** — handy but not blocking; the author (same person) can apply suggestions via their own editor. **Defer.**
7. **Incremental-since-last-push review** — iterative review is less common for a solo reviewer; the tool can always be re-invoked against the latest diff. **Defer.**
8. **In-diff search** — file-tree navigation covers the locality need in v1. **Defer.**

The following **cannot** be deferred — deferring them breaks the core loop:

- PR load + metadata + existing comments (no input → no tool)
- Syntax-highlighted diff rendering + file-tree (unreadable → worse than status quo)
- Line anchoring + draft comments + threaded conversation (these ARE the workflow)
- LLM summary + checklist self-review + walkthrough (the Core Value)
- Persistent state + resume (real reviews happen in chunks)
- Verdict + single-call review submission (terminal step)
- Collapse of generated/lockfile noise (without this, both UI and LLM context are poisoned)
- Graceful large-PR handling (don't-crash floor)
- Local-branch-diff mode (needed to validate UI independent of GitHub, and to review pre-PR branches)

---

## Sources

- [Best AI Code Review Tools 2026 — CodeRabbit vs Claude Code vs Qodo vs GitHub Copilot (Effloow, Apr 2026)](https://effloow.com/articles/best-ai-code-review-tools-coderabbit-claude-qodo-2026)
- [GitHub AI Code Review: 6 Tools Tested (Morph, 2026)](https://www.morphllm.com/github-ai-code-review)
- [State of AI Code Review in 2026 (dev.to, 2026)](https://dev.to/rahulxsingh/the-state-of-ai-code-review-in-2026-trends-tools-and-whats-next-2gfh)
- [State of AI Code Review Tools in 2025 (devtoolsacademy.com)](https://www.devtoolsacademy.com/blog/state-of-ai-code-review-tools-2025/)
- [Greptile vs CodeRabbit comparison (Greptile, 2025)](https://www.greptile.com/greptile-vs-coderabbit)
- [Greptile benchmarks (82% catch rate)](https://www.greptile.com/benchmarks)
- [CodeRabbit Documentation](https://docs.coderabbit.ai)
- [AI Code Review Tools Compared: CodeRabbit, Graphite, Claude Code (CallSphere, 2026)](https://callsphere.tech/blog/ai-code-review-tools-comparison-coderabbit-graphite-claude-2026)
- [diffx — local code review tool for coding agents](https://github.com/wong2/diffx)
- [diffity — GitHub-style diff viewer for AI tools](https://github.com/kamranahmedse/diffity)
- [GitHub REST API — Pull Request Reviews](https://docs.github.com/en/rest/pulls/reviews)
- [GitHub REST API — Pull Request Review Comments](https://docs.github.com/en/rest/pulls/comments)
- [GitHub Community — PENDING comments must be submitted](https://github.com/orgs/community/discussions/10369)
- [GitHub Engineering — Diff lines performance on large PRs](https://github.blog/engineering/architecture-optimization/the-uphill-climb-of-making-diff-lines-performant/)
- [GitHub Community — PRs with thousands of files](https://github.com/orgs/community/discussions/138160)
- [Thoughtbot — Automatically collapse generated files in GitHub diffs](https://thoughtbot.com/blog/github-diff-supression)
- [GitHub Feature Request — Dedicated code review UI with inline comments (issue #44787)](https://github.com/anthropics/claude-code/issues/44787)
- [The Impact of LLMs on Code Review Process (arXiv:2508.11034)](https://arxiv.org/html/2508.11034v1)
- [Rethinking Code Review Workflows with LLM Assistance (arXiv:2505.16339)](https://arxiv.org/html/2505.16339v1)
- [react-diff-view (npm)](https://www.npmjs.com/package/react-diff-viewer)
- [diff2html](https://diff2html.xyz/)

---
*Feature research for: LLM-assisted PR review plugin (single-user, Claude Code plugin + local web UI)*
*Researched: 2026-04-16*
