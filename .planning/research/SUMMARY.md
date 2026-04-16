# Project Research Summary

**Project:** Git Review Plugin
**Domain:** Claude Code plugin + local web GUI for LLM-assisted GitHub PR review, driven by MCP tools (single-user, macOS)
**Researched:** 2026-04-16
**Confidence:** HIGH overall — strongest on plugin/MCP topology and pitfalls; a handful of cross-research disagreements flagged below for resolution at Phase 1 planning.

## Executive Summary

This is a **personal pair-review tool**: a Claude Code plugin that spawns a local browser-based review workspace, lets the active Claude Code session drive it via MCP tools, and ends by posting a full GitHub review (verdict + body + inline comments) in a single API call. Experts in the adjacent space (CodeRabbit, Greptile, Claude Code Review, Copilot Code Review) ship hosted multi-tenant products; almost none of their architectural assumptions apply here. The closest reference architectures are single-user local dev tools (diffx, diffity) plus the Claude Code plugin examples. The right mental model is **one Node process with two transports** (stdio JSON-RPC to Claude Code, HTTP+push to the browser) sharing one in-memory session store — not two processes, not a detached server, not a hosted backend.

The recommended build path is a **thin vertical slice first**: plugin boots → MCP + HTTP server bind → `/review <pr>` → `gh pr diff` ingest → basic diff render in the browser → one `show_hunk` tool moves a cursor → SSE/WS pushes it to the UI. No comments, no checklist, no submission. This proves the end-to-end control plane with zero product risk and unblocks every other feature as additive. The core loop (walkthrough → threaded inline comments → posted review) then stacks cleanly on top. Three explicit research disagreements need to be resolved at Phase 1 planning (flagged below) before code is written for those subsystems.

The single biggest risk class is **LLM output landing badly on GitHub** — wrong-line anchors (Pitfall 1), hallucinated coordinates (Pitfall 2), sycophantic self-review (Pitfall 4), nitpick flood (Pitfall 3), duplicate submissions (Pitfall 10). These are mitigated at the MCP tool-schema layer by making line numbers server-resolved opaque IDs the LLM cannot hallucinate, standardizing on `line`+`side` (never `position`), capping nits and defaulting verdicts to "Request changes" to force the LLM to argue down, and persisting a client-side `submitted` flag. The second risk class is **security of the localhost server** (DNS rebinding, CSRF from other browser tabs) — mitigated by 127.0.0.1-only binding, per-session token, strict Host validation, CSP. Both risk classes must be addressed in the earliest relevant phase, not retrofitted.

## Key Findings

### Recommended Stack

The stack is highly constrained by the platform (Claude Code plugin spec, Node runtime, macOS target, inherited Claude Code session). What's flexible is the UI/transport/persistence layer — and that's exactly where the research disagrees with itself. See "Open Decisions" below.

**Core technologies (HIGH confidence):**
- **Claude Code plugin format** (`.claude-plugin/plugin.json` + `commands/` + `.mcp.json` at plugin root; `${CLAUDE_PLUGIN_DATA}` for persistent state) — the native distribution path; non-optional.
- **`@modelcontextprotocol/sdk` 1.29.0 + `StdioServerTransport`** — the plugin is a Claude-Code-spawned child; stdio is the only valid transport. Critical rule: never `console.log` in the MCP server (corrupts JSON-RPC); stderr only.
- **Node.js 22 LTS** — matches Claude Code's runtime floor, `better-sqlite3` support, MCP SDK requirements. Do not require Bun.
- **Vite + React 19 SPA** served by **Hono** (`@hono/node-server`) embedded in the MCP process — one process, two transports, shared in-memory state. Not Next.js, not Express.
- **`gh` CLI for ingestion + Octokit for submission** — inherit the user's existing auth via `gh auth token`; use Octokit's typed `pulls.createReview({ event, body, comments })` for the single atomic review POST. Fall back to `GITHUB_TOKEN` env var.
- **Shell out to `git diff` + `parse-diff`** for local-branch mode — same unified-diff pipeline as GitHub mode; one internal representation.
- **`execa`, `open`, `get-port`, `nanoid`, `zod`** as supporting utilities.

**Open Decisions (research-level disagreement — resolve at Phase 1 planning):**

1. **Diff rendering: `@git-diff-view/react` vs Monaco / CodeMirror 6.**
   STACK.md recommends **`@git-diff-view/react` 0.1.3** as the research-level winner — it consumes unified diff directly (matches both `gh pr diff` and `git diff`), renders GitHub-style split/unified, has web-worker rendering for big PRs, and exposes hunk-anchor hooks needed for inline-comment composers. ARCHITECTURE.md's worked examples use **Monaco diff editor** (batteries-included, VS Code-like) and mention **CodeMirror 6 merge view** as a lighter alternative. Why the other two got considered: Monaco has a built-in diff editor and virtualization out of the box, but its 5-10 MB bundle is overkill for a personal tool and its editor-oriented UX is awkward for inline-comment threads hung off diff lines; CodeMirror 6's merge view is much smaller but is a two-way *merge* editor, not a GitHub-style *review* UI (wrong shape). **Resolution:** prefer `@git-diff-view/react` per STACK.md; keep `react-diff-viewer-continued` as a defensible React-19 fallback if maturity bites. Confirm on a real fixture PR in the first UI-phase spike.

2. **Real-time transport: WebSocket (`ws`) vs SSE + HTTP POST.**
   STACK.md recommends **`ws` 8.20.0** (WebSocket) — argues the control plane is inherently bidirectional because an MCP tool handler like `show_hunk` needs to push to the browser AND await an ACK before resolving, and SSE models that awkwardly by layering a separate POST channel. ARCHITECTURE.md recommends **SSE via `@fastify/sse-v2` + plain HTTP POST** — argues the push traffic is strongly asymmetric (~95% server→browser LLM-driven state), `EventSource` reconnects for free, HTTP POST for user input is simpler to test (curl works), and the in-process EventEmitter handles the intra-process fan-out regardless of the wire format. Both arguments are plausible. The deciding question is whether the MCP tool contract actually requires synchronous ACK-from-browser — if tools can return "cursor updated" without the browser having rendered yet (the browser always converges via SSE echo anyway), SSE+POST wins on simplicity. **Resolution:** Phase 1 planning decision; the choice changes a handful of modules (`src/web/server.ts`, the browser store subscription, the MCP tool return contract) but not the overall topology. Suggested default: start with SSE+POST (smaller surface, easier to debug); upgrade to WebSocket only if a concrete tool actually needs synchronous browser ACK.

3. **Persistence: `better-sqlite3` vs JSON files.**
   STACK.md recommends **`better-sqlite3` 12.9.0** with a single DB at `${CLAUDE_PLUGIN_DATA}/state.db` — argues you'll reinvent transactions the moment browser WS and MCP tools mutate state concurrently, and the relational shape (reviews, comments, hunks, checklist) fits SQL naturally. FEATURES.md's open questions (and ARCHITECTURE.md's patterns section) lean **JSON-first** — `.review/<pr-key>/state.json` with atomic write-temp-and-rename, `proper-lockfile` for cross-process locking, human-readable, grep-able, git-ignorable, "zero ops overhead" for a single-user tool. Both are defensible. SQLite's real advantage shows up only if multiple mutations race; with the event-sourced reducer pattern (all mutations funnel through `applyEvent` on a single process) that race largely can't happen. JSON's advantage shows up on first-phase debuggability. **Resolution:** Phase 1 planning decision. Pragmatic default: start with atomic JSON (single state.json per PR under `${CLAUDE_PLUGIN_DATA}/reviews/<pr-key>/`); migrate to SQLite only if state grows past a few MB or a genuine concurrency need appears. Whichever is chosen, the `PersistenceStore` interface is small (load / save / listSessions) and swappable.

### Expected Features

The feature landscape is well mapped (CodeRabbit, Greptile, Copilot Code Review, diffx, diffity all documented). Because this is a **personal tool**, many conventional "table stakes" for hosted products are correctly deferrable.

**Must have (table stakes — core loop breaks without these):**
- Load PR via `gh` (URL/number) and local-branch diff mode (parallel path)
- Unified diff rendering with syntax highlighting + file-tree navigation + collapse generated/lockfile files
- LLM PR summary, self-review against criticality-ranked checklist (built-in default + `.review/checklist.md` override), LLM-curated walkthrough with "show all" escape
- Line-level comment anchoring (single-line), threaded conversational comments user↔LLM, draft state (pending until submission)
- Per-PR persistent state + resume, "reviewed" hunk markers
- Verdict UI (Approve / Request changes / Comment) + single atomic `POST /reviews` submission
- Graceful handling of large PRs (don't crash), basic keyboard shortcuts
- MCP tool surface driving the UI (the entire raison d'être of the plugin)

**Should have (differentiators vs chat-in-desktop-app baseline):**
- LLM-planned walkthrough narrative (unique — nobody else does ordered narration)
- Threaded inline conversation while drafting (unique — chat UIs lack line anchors, review bots are fire-and-forget)
- Criticality-tagged findings with clickable `file:line` refs
- Repo-overridable checklist (predictable, not LLM-inferred-per-PR)

**Defer (v1.x / v2+):**
- Split-diff view toggle, CI status display, multi-line comment ranges, suggested-edit blocks, incremental review since last session, in-diff search, previous-review memory, tree-sitter/LSP context, CODEOWNERS.

**Anti-features (deliberately not building, per PROJECT.md):**
- Team features, hosted backend, GitLab/Bitbucket, IDE-embedded panels, auto-approval, comment-only review (verdict is mandatory), LLM-inferred checklists, multi-LLM switching, PR analytics, Check Suite integration.

### Architecture Approach

**One Node process, two transports, one reducer.** The MCP stdio server and the HTTP/push web server run in the same process spawned by Claude Code. All state mutations — whether from MCP tool handlers (LLM) or from HTTP POST handlers (user) — funnel through a single event-sourced reducer (`applyEvent(session, event) → session`). Every mutation emits on a typed in-process EventEmitter; the push transport subscribes and fans out to connected browsers. The browser is dumb: it never mutates its own state; it POSTs and waits for the pushed echo. When Claude Code exits, SIGTERM flushes state and the process dies — no detached side-cars, no orphan ports.

**Major components:**
1. **Plugin entry (`src/index.ts`)** — boots MCP + HTTP, installs signal handlers, launches default browser
2. **MCP tool surface** (`src/mcp/tools/*`, one file per verb) — thin validators that call `sessionManager.applyEvent()` and return structured results to the LLM; **opaque-ID based** (no freeform `line` strings from the LLM)
3. **Web server** (Hono or Fastify on 127.0.0.1:ephemeral) — serves static SPA, push stream, user-POST routes; **strict Host + per-session-token + CSP** for DNS-rebinding/CSRF defense
4. **Review Session Manager** — `Map<pr-key, ReviewSession>`; the gravity well; runs the reducer; emits on the bus; calls persistence
5. **Diff Model** — parsed unified diff with dual addressing (`{fileId, line, side}` for UI/MCP; `diffPosition` for legacy GitHub compat); one internal `Anchor` type, one adapter to Octokit
6. **GitHub Adapter** — `gh` CLI for ingestion, Octokit for submission, local-`git` path for branch diff; single `submitReview()` entry point
7. **Checklist Engine** — built-in YAML/MD + `.review/checklist.md` repo override
8. **Persistence Layer** — atomic writes, file-locking, crash recovery (JSON or SQLite per Open Decision 3)
9. **Web UI (SPA)** — React + store + diff viewer + walkthrough + checklist + comments + submit panel; subscribes to push, POSTs mutations

### Critical Pitfalls

(Top 5 by severity × likelihood; see PITFALLS.md for the full 24.)

1. **GitHub comment positioning — `position` vs `line`/`side` confusion** (BLOCKER). Standardize on `line` + `side` (+ `start_line`/`start_side` for ranges) everywhere. Single internal `Anchor` type. One adapter module. Integration test that reads back a posted comment and asserts the line number — before any "works on my PR" manual check.
2. **LLM hallucinated line numbers / file paths in comment drafts** (BLOCKER). Never let the LLM supply `(path, line)` as freeform strings. MCP tools expose opaque `hunk_id` / `line_id` values generated server-side; `post_comment` accepts only those IDs. The schema rejects unknown IDs. This single discipline kills an entire failure mode.
3. **Context window exhaustion on large PRs** (BLOCKER). MCP tools are hunk-paginated by design: `list_files()` → `get_hunk(id)` → `next_hunk()`, each response ≤ ~2k tokens. Never `get_full_diff()`. Full diff cached on disk; model sees summaries + IDs + on-demand fetches.
4. **DNS rebinding / CSRF on localhost server** (BLOCKER). Bind 127.0.0.1 only. Per-session random token in a custom header, required on every state-changing request. Strict Host-header validation. Strict CSP. SameSite=Strict on any cookie.
5. **Sycophantic self-review + nitpick flood** (SERIOUS). Default verdict is "Request changes" forcing the LLM to argue down. Hard nit cap (≤ 3). Severity tagging required in the comment schema. Adversarial-stance framing in the self-review prompt ("what could break this?" / "what did the author forget?"). Surface the signal ratio in the review summary before submit.

**Other high-risk items addressed in phase planning:**
- Browser refresh loses unposted comments (BLOCKER per PROJECT.md) → persistence from the first end-to-end slice, not retrofitted.
- Stale diff on resume after force-push (SERIOUS) → store head SHA; surface "PR updated" UI with rebase/discard/view-both.
- Duplicate review submission (SERIOUS) → client-side `submitted` flag + GitHub existing-review check on startup.
- MCP tool timeout at ~60s (SERIOUS) → pre-fetch on slash-command boot; no synchronous network on tool critical path.
- LLM ignoring PR description (SERIOUS) → metadata ingested into summary; intent classification passed as structured context.
- Over-engineering for teams when it's a solo tool (meta-SERIOUS) → every phase runs the "does this survive with one user forever?" check.

## Implications for Roadmap

Based on combined research, a suggested 7-phase structure. Each phase ends with a shippable, daily-usable increment that doesn't require the next phase to exist.

### Phase 1: Plugin Skeleton + Vertical Slice
**Rationale:** Proves the control plane end-to-end (plugin boots → MCP + HTTP in one process → slash command → MCP tool → push → browser renders) with zero product risk. Unblocks every other phase as additive. This is explicitly the smallest thing that exercises every architectural assumption.
**Delivers:** `/review <pr-url>` spawns the plugin, fetches the PR via `gh`, parses the diff, opens the browser on a basic diff view (no fancy renderer yet), one `show_hunk` MCP tool moves a cursor that the browser renders. Plugin cleanly exits on Claude Code shutdown.
**Addresses:** Plugin-packaging, MCP tool surface, GitHub ingestion (read path), local-branch-diff mode (parallel path), diff parsing, browser auto-launch.
**Avoids:** Port collisions (ephemeral port), `console.log` in MCP (stderr only), detached side-car processes (single process, stdio lifetime), DNS rebinding (127.0.0.1 + Host validation + session token from day one), stale browser cache (hashed asset names, `no-store` on index).
**Resolves Open Decisions:** 2 (transport choice) and 3 (persistence format) must be decided here because they shape every subsequent phase. Open Decision 1 (diff viewer) can defer to Phase 3.

### Phase 2: Persistent Session Store + Resume
**Rationale:** PROJECT.md names per-PR resumable state as a hard requirement; PITFALLS.md flags unposted-comment loss and stale-diff-on-resume as blockers. Building persistence early means every downstream feature plugs into it naturally rather than being retrofitted.
**Delivers:** Event-sourced reducer with atomic persistence (JSON or SQLite per Open Decision 3), session resume on repeat `/review` of same PR, head-SHA-gated stale-diff detection with explicit "PR updated" UI choices (rebase-drafts / discard / view-both), crash recovery (lock-file handling).
**Uses:** `applyEvent` reducer pattern, write-through persistence, `proper-lockfile` or SQLite transactions.
**Implements:** Review Session Manager + Persistence Layer + Diff Model (with dual addressing).
**Avoids:** Browser-refresh data loss (Pitfall 8), stale diff on force-push (Pitfall 9), per-tool ad-hoc state mutation (Anti-pattern 4).

### Phase 3: Diff UI + File Tree + Collapse Noise
**Rationale:** Readable diff is a prerequisite for every LLM-driven feature downstream. Per PITFALLS.md, the LLM cannot meaningfully review without the UI and LLM agreeing on what hunk is "current" — and the user cannot read along without syntax highlighting and file-tree navigation. This is the phase that makes the tool feel like a review tool rather than a JSON viewer.
**Delivers:** Proper diff renderer (Open Decision 1: `@git-diff-view/react` recommended; `react-diff-viewer-continued` / Monaco as fallbacks), Shiki or lowlight-bundled syntax highlighting (defer to spike), file tree, collapsed generated/lockfile files, keyboard shortcuts (`n`/`p`/`c`/`r`/`v`/`s`), "reviewed" hunk markers, large-PR graceful degradation via lazy hunk rendering.
**Resolves Open Decision:** 1 (diff viewer — spike on a real fixture PR).
**Avoids:** UI bikeshedding by leaning on an existing library (Pitfall 23), main-thread highlighting freezes (web-worker render), full-diff client-side parsing (Anti-pattern 6 — parse once on server).

### Phase 4: LLM Summary + Checklist + Self-Review
**Rationale:** First LLM-driven product surface. Summary is the lowest-risk LLM integration (no anchoring, no posting); checklist + self-review are the scaffolding for everything else. Getting prompting discipline right here pays forward to the walkthrough and comment phases.
**Delivers:** `set_summary` MCP tool + summary pane. Built-in criticality-ranked checklist shipped with the plugin. `.review/checklist.md` override loader. `run_self_review` tool that produces category-by-category findings with severity tags + code references. Checklist coverage tracking UI. Default verdict resolves from self-review (defaulting to "Request changes" on first pass).
**Avoids:** Sycophantic reviews (Pitfall 4 — adversarial prompt + verdict-inversion), LLM ignoring PR description (Pitfall 11 — metadata into summary + structured intent classification), nitpick flood (Pitfall 3 — hard nit cap in schema).
**Implements:** Checklist Engine.

### Phase 5: Inline Comments + Threaded Conversation + Walkthrough
**Rationale:** This is the heart of the Core Value. All prior phases exist to make this work. The walkthrough drives the narrative; inline threads are the authoring surface; both culminate in the review submission (Phase 6).
**Delivers:** `plan_walkthrough` MCP tool (LLM-ordered hunks with narrative beats), "show all" filter toggle (not state reset — one walkthrough tree with a curated flag), `draft_comment` / `reply_in_thread` / `resolve_thread` MCP tools, inline thread UI anchored to `{path, line, side}`, designated "post body" slot per thread (editable synthesis, not auto-concatenation of the whole conversation), comment-composer POST path from browser → reducer → push echo.
**Avoids:** Hallucinated coordinates (Pitfall 2 — opaque `hunk_id`/`line_id` schema, never freeform), pre-existing code mis-attribution (Pitfall 12 — `post_comment` rejects context-line anchors unless explicit flag), "show all" state reset (Pitfall 18 — filter toggle pattern), thread-posted-verbatim (Pitfall 19 — explicit post-body slot).

### Phase 6: Review Submission + Verdict UI
**Rationale:** Terminal step. All prior phases' output funnels here. Atomic single-call submission is the shipping requirement; idempotency is the hardening requirement that must ship with it, not after.
**Delivers:** Verdict UI (Approve / Request changes / Comment) gated on walkthrough completion or explicit confirmation. `submit_review` MCP tool → single `POST /repos/{o}/{r}/pulls/{n}/reviews` with `event`, `body`, `comments[]`. Pre-submit check for existing pending review (adopt or DELETE). Client-side `submitted` flag + persistence + GitHub read-back check on startup. Coordinate adapter: internal `Anchor` → Octokit `{path, line, side, start_line?, start_side?}`. Read-back integration test asserting posted comment lands on the expected line.
**Avoids:** `position` vs `line`/`side` confusion (Pitfall 1 — standardize on `line`+`side` everywhere), duplicate submissions (Pitfall 10 — idempotency guards), premature submission (Pitfall 20 — progress gating), pending-review interaction bugs (integration gotcha — check and clear/adopt at session start).

### Phase 7: Polish + Hardening
**Rationale:** v1 shake-out. Address feedback from daily use and close the "looks done but isn't" checklist from PITFALLS.md.
**Delivers:** Auth identity display in UI chrome (detect `gh auth token` vs `GITHUB_TOKEN` mismatch, show authenticated user), large-PR virtualization tightening (hunk-level), pagination for PRs with 100+ files, multi-line comment ranges if single-line proves limiting in practice, local-branch-diff review artifact export (markdown), session-switcher UI if concurrent reviews become common.
**Defers:** Everything in FEATURES.md v1.x and v2+ — split-diff toggle, CI status, incremental review, suggested-edit blocks, previous-review memory, tree-sitter/LSP, CODEOWNERS, Zed integration.

### Phase Ordering Rationale

- **Control plane before features.** Phase 1 exists because every architectural assumption (single process, stdio + HTTP coexistence, slash-command → MCP → push → browser chain) needs to work before any feature is worth building. A feature built on a broken control plane is wasted work.
- **Persistence before any UI-visible feature.** PROJECT.md names it as a hard requirement, PITFALLS names it as a blocker. Retrofitting persistence is a well-documented trap (Pitfall 8). Phase 2 pays the cost upfront so every downstream feature plugs in naturally.
- **Diff UI before LLM features.** LLM features are meaningless without a readable diff the user and LLM both reference. Phase 3 establishes the UI baseline so Phase 4+ have a surface to render into.
- **Summary → Checklist → Walkthrough → Comments → Submission as dependency chain.** Summary is standalone. Self-review uses summary + checklist. Walkthrough uses summary + self-review output. Comments anchor into walkthrough. Submission bundles everything. Violating this order means retrofitting.
- **Submission last, idempotency included.** Per PITFALLS, every review-submission pitfall is a visible public artifact. Shipping submission with idempotency + read-back test baked in is non-negotiable. Keep it as a dedicated phase so it gets the attention.

### Research Flags

Phases likely needing deeper `/gsd-research-phase` investigation during planning:
- **Phase 1:** MUST research — resolve Open Decisions 2 (transport) and 3 (persistence). Short Context7/doc check on `@hono/node-server` + `@hono/node-ws` vs `@fastify/sse-v2` + `@fastify/static`, and on `better-sqlite3` crash-safety vs `write-file-atomic` + `proper-lockfile` for JSON mode.
- **Phase 3:** MUST research — 30-minute spike on a real large PR comparing `@git-diff-view/react` against `react-diff-viewer-continued` (and a sanity check on Monaco to confirm the bundle/UX concerns). Resolve Open Decision 1. Syntax highlighter decision (Shiki server-side vs `lowlight` already bundled with `@git-diff-view/react`) is the sub-decision.
- **Phase 5:** MUST research — MCP tool schema shape for opaque IDs (Pitfall 2), "show all" as filter-not-reset (Pitfall 18), threaded-conversation-to-single-posted-body synthesis UX (Pitfall 19). These are the novel product-shape questions.
- **Phase 6:** MUST research — GitHub pending-review semantics (adopt vs delete vs new) and how Octokit's `pulls.createReview` interacts with a user's pre-existing pending review on the same PR. This is the single most error-prone API interaction.

Phases with standard patterns (likely skip research-phase):
- **Phase 2:** Event-sourced reducer + atomic JSON (or SQLite) persistence is a well-documented pattern. Phase 1 decision on persistence format determines the library choice; no further research needed.
- **Phase 4:** Prompting discipline for self-review is well-covered in PITFALLS.md (adversarial framing, verdict inversion, nit caps). Checklist loading is file parsing. Standard work.
- **Phase 7:** Polish work by definition — scope informed by daily-use feedback, not pre-research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH on plugin/MCP/Node/runtime/Octokit; MEDIUM on diff viewer, real-time transport, persistence format (the three Open Decisions) | Official Claude Code docs + MCP SDK + GitHub API docs are authoritative. The three open questions are genuine engineering tradeoffs with defensible answers both ways. |
| Features | HIGH | Feature landscape extensively documented across competitor tools. Table-stakes vs differentiator vs defer ranking is well-grounded in PROJECT.md's explicit scope. |
| Architecture | HIGH on process topology (single-process, stdio + HTTP, in-process bus); MEDIUM on transport choice and state-library specifics | Direct validation from Claude Code plugin docs + MCP SDK docs. Transport choice is a research disagreement with STACK.md; reducer pattern is well-established but has some upfront ceremony. |
| Pitfalls | HIGH | GitHub API coordinate system, MCP token/timeout limits, localhost-CSRF/DNS-rebinding, and LLM-review noise patterns are all authoritatively documented. Severity ratings grounded in PROJECT.md's single-user scope. |

**Overall confidence:** HIGH with three explicit open decisions to resolve at Phase 1 planning.

### Gaps to Address

1. **Open Decision 1 — Diff viewer:** `@git-diff-view/react` is the research-level winner (unified-diff-native, GitHub-style, hunk-anchor hooks); Monaco (too heavy, wrong UX shape) and CodeMirror 6 merge view (wrong product shape) were the ARCHITECTURE-surfaced alternatives and are downgraded to "considered but not recommended." `react-diff-viewer-continued` stays as a mature React-19 fallback. **Handle:** Phase 3 spike on a real fixture PR before committing.
2. **Open Decision 2 — Real-time transport:** WebSocket (STACK.md) vs SSE+POST (ARCHITECTURE.md). Both plausible; hinges on whether MCP tools actually need synchronous ACK from the browser or can return before the push has rendered. **Handle:** Phase 1 planning decision. Suggested default: SSE+POST for simpler debugging; upgrade to WebSocket only if a concrete tool demands synchronous browser confirmation.
3. **Open Decision 3 — Persistence format:** `better-sqlite3` (STACK.md — relational shape, real transactions) vs atomic JSON (FEATURES.md open questions / ARCHITECTURE.md patterns — human-readable, zero ops). Event-sourced reducer funnels mutations through one point, eliminating most concurrency concerns. **Handle:** Phase 1 planning decision. Suggested default: atomic JSON (`write-file-atomic` + `proper-lockfile`) via a small `PersistenceStore` interface; swap to SQLite only if state grows beyond a few MB or concurrency emerges.
4. **MCP tool naming / surface size:** Pitfall 15 flags the tool-schema bloat risk. Target ≤ 10 tools, consistent verb set (`list_*`, `get_*`, `draft_*`, `submit_*`, `cancel_*`), no synonyms. **Handle:** Phase 5 planning must include a tool-list review; re-check at each phase transition.
5. **Syntax highlighter final choice:** Shiki server-side (higher fidelity) vs `lowlight`/`highlight.js` (already transited through `@git-diff-view/react`, smaller). **Handle:** 30-minute spike during Phase 3.

## Sources

### Primary (HIGH confidence)
- Claude Code plugin docs (`code.claude.com/docs/en/plugins` + `/plugins-reference`) — manifest schema, MCP integration, `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}`, directory layout mistakes
- Claude Code MCP integration SKILL (github.com/anthropics/claude-code/…/mcp-integration/SKILL.md) — stdio lifecycle, client behavior
- `@modelcontextprotocol/typescript-sdk` (Context7) — 1.29.0 API, `StdioServerTransport`, `registerTool` + zod, `console.error` rule
- GitHub REST API docs — `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` shape (event, body, comments), `line`/`side`/`start_line`/`start_side` semantics, `position` deprecation
- `/mrwangjusttodo/git-diff-view` (Context7) — unified-diff input, web-worker rendering, token system
- npm registry metadata (2026-04-16) — all version numbers verified
- [MCP response size limits discussion #2211](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2211)
- [Rafter — DNS rebinding & localhost MCP](https://rafter.so/blog/mcp-dns-rebinding-localhost)
- [Oligo — 0.0.0.0 day](https://www.oligo.security/blog/0-0-0-0-day-exploiting-localhost-apis-from-the-browser)

### Secondary (MEDIUM confidence)
- `/aeolun/react-diff-viewer-continued` (Context7) — React-19 peer confirmation for fallback
- `/websites/hono_dev` (Context7) — Hono + Node adapter + WS helpers
- `/shikijs/shiki` (Context7) — server-side rendering guidance
- [Effloow 2026](https://effloow.com/articles/best-ai-code-review-tools-coderabbit-claude-qodo-2026), [Morph 2026](https://www.morphllm.com/github-ai-code-review), [CallSphere 2026](https://callsphere.tech/blog/ai-code-review-tools-comparison-coderabbit-graphite-claude-2026) — competitor landscape
- [Greptile benchmarks](https://www.greptile.com/benchmarks) — 82% catch rate
- [diffray — LLM hallucinations in code review](https://diffray.ai/blog/llm-hallucinations-code-review/) — line-number hallucination rates
- [Jet Xu — low-noise code review](https://jetxu-llm.github.io/posts/low-noise-code-review/) — 22k-comment signal-to-noise study
- [Codeant — AI review overload](https://www.codeant.ai/blogs/prevent-ai-code-review-overload) — 70-90% ignored-comment data
- [MCP tool token bloat — The New Stack](https://thenewstack.io/how-to-reduce-mcp-token-bloat/)
- [anthropics/claude-code#17662](https://github.com/anthropics/claude-code/issues/17662) — MCP tool timeout behavior
- [SSE vs WebSocket — dev.to/polliog](https://dev.to/polliog/server-sent-events-beat-websockets-for-95-of-real-time-apps-heres-why-a4l)
- [web.dev — off-main-thread](https://web.dev/articles/off-main-thread)

### Tertiary (LOW confidence)
- WebSearch 2026-04 re: `node:sqlite` still experimental in Node 22/24
- WebSearch 2026-04 re: diff-viewer comparisons

---
*Research completed: 2026-04-16*
*Ready for roadmap: yes (after Phase 1 planning resolves the three Open Decisions)*
