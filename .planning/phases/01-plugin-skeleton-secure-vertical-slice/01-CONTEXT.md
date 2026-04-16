# Phase 1: Plugin Skeleton + Secure Vertical Slice — Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

End-to-end control plane for the review workflow. One process (MCP stdio + HTTP server) boots on `/review`, fetches a PR via `gh` or a local branch diff, opens the default browser to a dark-mode diff view with Shiki-highlighted hunks, and every browser request is authenticated against a per-session token with strict Host validation and CSP — all from day one.

**Explicitly in scope:** MCP `start_review` tool, single-tool SSE + POST transport, atomic JSON persistence wiring (interface, not writes yet), security headers, dual-mode ingestion (GitHub + local), minimal diff-view shell per the approved UI-SPEC.

**Explicitly NOT in scope** (per ROADMAP): event-sourced reducer (Phase 2), file-tree sidebar (Phase 3), split/unified toggle (Phase 3), keyboard shortcuts (Phase 3), existing PR comments overlay (Phase 3), CI check status (Phase 3), PR summary (Phase 4), checklist (Phase 4), walkthrough (Phase 5), inline comments (Phase 5), verdict / submission (Phase 6), multi-session switcher (Phase 7).

</domain>

<decisions>
## Implementation Decisions

### Real-time transport (resolves Open Decision 2)

- **D-01:** Server→browser uses **Server-Sent Events** (`GET /api/events?session=<pr-key>`). Browser→server uses **plain HTTP POST**. No WebSocket in v1.
- **D-02:** Phase 1 SSE stream sends one `event: snapshot` with the full session state immediately after connect, then stays open idle. Disconnect at any time → browser flips footer session-status pill to "Session expired" (destructive). Phase 2+ introduces `event: update` on the same open stream without protocol change.
- **D-03:** EventSource reconnect with `Last-Event-ID` is the long-term recovery path (used from Phase 2 on). In Phase 1 a disconnected stream is a terminal state for that browser session — the user re-runs `/review`.
- **Rationale on file:** Push traffic is ≥95% server→browser; LLM tool returns already include the hunk content so LLM reasoning does not block on browser visual catch-up; `EventSource` is curl-debuggable and dependency-free; reducer-on-single-event-loop serializes MCP and POST mutations before they touch any I/O.

### Persistence format (resolves Open Decision 3)

- **D-04:** **Atomic JSON** via `write-file-atomic` (write-temp + rename) for durability; `proper-lockfile` for cross-process safety (prevents a second plugin instance clobbering state on the same PR).
- **D-05:** State lives at `${CLAUDE_PLUGIN_DATA}/reviews/<pr-key>/state.json`. PR-key shape: `gh:<owner>/<repo>#<number>` for GitHub PRs, `local:<sha256(repoPath+baseRef+headRef)>` for local-branch diffs. State survives plugin updates (that's the contract of `${CLAUDE_PLUGIN_DATA}`) and doesn't pollute the reviewed repos.
- **D-06:** Phase 1 wires the persistence interface but only writes once per `start_review` (the initial session snapshot). Richer event-sourced reducer + per-mutation persistence is Phase 2 scope.
- **Rationale on file:** The reducer funnels MCP and HTTP mutations through one synchronous call on one Node event loop — the transactional argument for SQLite doesn't hold because the reducer IS the transaction boundary. Pure-JS atomic-rename is crash-safe, tiny, grep-able, and avoids a native C addon.

### Security model (SEC-01..04)

- **D-07:** HTTP server binds `127.0.0.1` only. Never `0.0.0.0`, never `::`. Port assigned by OS (`listen(0)`). Selected port is echoed to **stderr** (never stdout — that's the MCP JSON-RPC channel per anti-pattern AP2).
- **D-08:** Per-launch cryptographically random session token (≥128 bits, `crypto.randomBytes` base64url). Token travels to the browser as **a query param on the initial launch URL** (`http://127.0.0.1:PORT/?token=...`).
- **D-09:** Entry-point JS reads the token from `location.search` on page load and POSTs it to `/api/session/adopt`. The server sets an `httpOnly; SameSite=Strict; Secure=false; Path=/` cookie. JS then wipes the query string via `history.replaceState` so the token doesn't persist in browser history or referer.
- **D-10:** Every state-changing request (POST) carries a custom `X-Review-Token` header as CSRF double-submit alongside the cookie. The `/api/session/adopt` endpoint is the lone exception — it reads the token from the query param since no cookie exists yet. SSE (`GET /api/events`) authenticates on the cookie alone (EventSource can't set custom headers, but SameSite=Strict + Host validation + CSP make cross-origin SSE subscription infeasible).
- **D-11:** `Host` header strictly validated: allowlist is exactly `127.0.0.1:<port>` and `localhost:<port>`. Anything else → 400 before any routing. Defeats DNS rebinding (PITFALL 6, BLOCKER).
- **D-12:** All HTML responses carry CSP from the UI-SPEC block: `default-src 'self'; script-src 'self' 'nonce-{SESSION_NONCE}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'none'; object-src 'none'; frame-ancestors 'none'`. (`connect-src 'self'` — no `ws://` entries since we're not using WebSocket.)
- **D-13:** Browser-launch fallback: plugin **always** prints the full auth'd URL to stderr before calling `open`, so PLUG-03's fallback is automatic — no need to detect `open` failure (macOS `open` doesn't surface it reliably anyway).

### Ingestion (INGEST-01, INGEST-02)

- **D-14:** **One slash command** — `/review` — with smart argv dispatch handled by the MCP tool itself. Patterns:
  - `/review https://github.com/owner/repo/pull/N` → GitHub by URL
  - `/review N` → GitHub by PR-number in the current `gh` CLI context (repo inferred from `gh repo view --json name,owner`)
  - `/review --local <base> <head>` → local-branch diff (no GitHub calls)
- **D-15:** GitHub ingestion uses `gh` CLI (via `execa`): `gh pr view <n> --json title,body,author,baseRefName,headRefName,baseRefOid,headRefOid,additions,deletions,changedFiles` for metadata; `gh pr diff <n>` for the raw unified diff. Octokit is NOT a Phase 1 dependency — deferred to Phase 6 (submit path).
- **D-16:** Local ingestion uses `execa('git', ['diff', '<base>...<head>'])` from the current working directory. Same unified-diff output shape.
- **D-17:** Both paths feed **one parser** (`parse-diff`) that produces the same `DiffModel` shape: `FileDiff[]` with `Hunk[]`, each hunk carrying `DiffLine[]` with `{ kind, side, fileLine, diffPosition, text }`. Phase 5's opaque-ID schema (Hunk.id = `${fileId}:h${index}`, etc.) is pre-populated even though Phase 1 doesn't expose hunk IDs to the LLM — no retrofit later.

### MCP tool surface (PITFALL 15 prevention)

- **D-18:** **One tool in Phase 1: `start_review`**. No `get_state`, no `end_review`, no `ping`. Tool count cap to be re-reviewed at every phase transition (target ≤10 across all phases).
- **D-19:** `start_review` input zod schema: `{ source: { kind: 'github', url: string } | { kind: 'github', number: number } | { kind: 'local', base: string, head: string } }`. Mutually exclusive discriminated union. Invalid input → tool error with actionable message.
- **D-20:** `start_review` return: `content: [{ type: 'text', text: <summary> }]` where summary includes PR title, author, base→head, stats (+N/-M lines, K files), a **paraphrased one-paragraph rephrasing of the PR description** (mitigates PITFALL 11 — LLM ignores PR intent), and the final line `"Review open at: http://127.0.0.1:<port>/?token=..."`. No hunk content, no diff content — that's Phase 3+/Phase 5's job.
- **D-21:** `start_review` is idempotent on PR-key: calling it twice for the same PR-key within one plugin process reuses the same session (the user has already been told to "reload the tab" by the first call). Browser auto-open is only triggered on the first call.

### UI implementation (honors approved UI-SPEC)

- **D-22:** **Shiki server-side highlighting ships in Phase 1** (resolves the ROADMAP-vs-UI-SPEC tension). Shiki renders per-hunk tokens on load, cached per `(filePath, headSha)` in-memory. Tokens travel in the SSE `snapshot` payload. `@git-diff-view/react` consumes them via its token-renderer hook. The ROADMAP's Phase 3 "syntax highlighting" bullet should be read as "plus split mode and file tree" — Shiki is not introduced then, only extended if large-PR perf tuning surfaces.
- **D-23:** Unified mode only in Phase 1. Split-mode toggle is Phase 3.
- **D-24:** Four diff-canvas states per UI-SPEC: Loading (skeleton), Empty (no changed files), Error (server unreachable OR diff fetch failed — two distinct copy variants), DiffLoaded. All four must render correctly in Phase 1.

### Claude's Discretion

The following were left to Claude / the planner to choose without user input:
- Exact wording of log messages and error copy beyond what UI-SPEC locks (UI-SPEC's copy table is authoritative for user-facing text).
- File structure under `src/` — ARCHITECTURE.md proposes a layout, planner may refine.
- Test framework specifics (vitest is in the stack; use of supertest vs raw fetch is planner's call).
- Deployment/install story — deferred entirely (personal tool, `claude --plugin-dir ./` workflow).
- Whether to use `nanoid` or plain `crypto.randomBytes().toString('base64url')` for IDs — whichever the planner prefers.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase-1 approved artifacts
- `.planning/phases/01-plugin-skeleton-secure-vertical-slice/01-UI-SPEC.md` — The visual/interaction contract. Authoritative on layout, tokens, copy, CSP directive, diff-canvas states, and what NOT to implement.

### Project context
- `.planning/PROJECT.md` §Constraints, §Key Decisions — Platform (Claude Code plugin), LLM driver model, persistence-is-required stance, single-user macOS scope.
- `.planning/REQUIREMENTS.md` §v1 Requirements — PLUG-01, PLUG-02, PLUG-03, INGEST-01, INGEST-02, SEC-01, SEC-02, SEC-03, SEC-04 are the Phase 1 bar.
- `.planning/ROADMAP.md` §"Phase 1: Plugin Skeleton + Secure Vertical Slice" — Four success criteria. Criterion #4 is now satisfied by this document's D-01..D-06 (to be mirrored into PROJECT.md Key Decisions at commit time).

### Architecture research (HIGH confidence topology)
- `.planning/research/ARCHITECTURE.md` §"TL;DR", §"Process Topology — Decided", §"State Shape", §"Pattern 1 Event-Sourced Reducer", §"Pattern 5 Atomic JSON Persistence", §"Anti-Pattern 1 Detached Daemon", §"Anti-Pattern 2 console.log in MCP server", §"Data Flow — Scenario A show_hunk" — The dominant reference for Phase 1 structure.
- `.planning/research/SUMMARY.md` — Synthesis of the four research streams; use for cross-stream conflicts.
- `.planning/research/STACK.md` — Authoritative dependency list. NOTE: Stack doc's WebSocket + better-sqlite3 recommendations are **overridden** by D-01 and D-04 in this CONTEXT; use the rest verbatim.
- `.planning/research/FEATURES.md` — User-visible feature breakdown; cross-check phase scope here before implementing.

### Pitfalls research (BLOCKERS and SERIOUS relevant to Phase 1)
- `.planning/research/PITFALLS.md` §"Pitfall 6 — DNS rebinding / CSRF" (BLOCKER, ships in Phase 1) — verify via curl probes per ROADMAP success criterion #3.
- `.planning/research/PITFALLS.md` §"Pitfall 16 — Port collisions on startup" (MODERATE) — the `listen(0)` pattern in D-07 closes this.
- `.planning/research/PITFALLS.md` §"Pitfall 13 — Over-engineering for teams" — re-read at every planning trade-off in Phase 1.
- `.planning/research/PITFALLS.md` §"Pitfall 2 — Hallucinated coords" — not a Phase 1 bug (no coord-sensitive tools yet) BUT D-17's `DiffModel` shape pre-populates opaque IDs so Phase 5 can enforce them without retrofit.
- `.planning/research/PITFALLS.md` §"Pitfall 11 — LLM ignores PR description" — D-20's `start_review` return paraphrases the PR body.
- `.planning/research/PITFALLS.md` §"Looks Done But Isn't" checklist — items relevant to Phase 1: local server security, port in use, auth identity (partial — full identity display deferred to Phase 7).

### External specs (read at planning time when a decision touches the external contract)
- [Claude Code Plugins reference](https://code.claude.com/docs/en/plugins-reference/index) — plugin manifest, `.mcp.json`, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`, directory-placement rules.
- [MCP TypeScript SDK quickstart](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server-quickstart.md) — `McpServer` + `StdioServerTransport` pattern; stdout-corruption rule (only `console.error`).
- [GitHub CLI `gh pr view --json`](https://cli.github.com/manual/gh_pr_view) and `gh pr diff` — Phase 1's ingestion entry points; confirm field names before wiring.

</canonical_refs>

<code_context>
## Existing Code Insights

Greenfield repo confirmed by scout_codebase (no `src/`, no `ui/`, no `package.json` yet). No existing patterns to conform to; Phase 1 sets them.

### Reusable Assets
- None yet. The approved `01-UI-SPEC.md` design tokens (`--color-*`, `--spacing-*`, font stacks) are the authoritative visual contract for this and every downstream phase.

### Established Patterns
- Design system tokens (UI-SPEC §"Tailwind 4 Token Declarations") — the `@theme {}` block. Downstream phases must not introduce new tokens; all extension happens within this set.
- Plugin layout per Claude Code contract (`.claude-plugin/plugin.json`, `commands/`, `.mcp.json` at plugin root). Planner must honor the "DO NOT place `commands/` inside `.claude-plugin/`" rule from STACK.md §"What NOT to Use".
- Stderr-only logging discipline in the MCP server process (AP2).

### Integration Points
- **Claude Code slash command** → `commands/review.md` (the prompt Claude Code expands when the user types `/review`).
- **Claude Code MCP spawn** → `.mcp.json` at plugin root declaring the MCP server command (points at the compiled entry, e.g. `dist/index.js`).
- **macOS default browser** → `execa('open', [url])` after server boots.
- **`gh` CLI** → `execa('gh', ['pr', 'view', ..., '--json', ...])` and `gh pr diff`. User's existing `gh` auth inherited.
- **`git` CLI** → `execa('git', ['diff', '<base>...<head>'])` for local-branch mode.

</code_context>

<specifics>
## Specific Ideas

- **Stack doc vs architecture doc conflict resolution:** Where the stack doc (CLAUDE.md) and `ARCHITECTURE.md` disagree, this CONTEXT explicitly chooses the architecture doc's position for transport (D-01) and persistence (D-04). Everything else in the stack doc stands.
- **UI-SPEC is law for Phase 1 visuals.** Shiki ships in Phase 1 (D-22) because the approved UI-SPEC was approved with Shiki in scope — revisiting that choice would amount to re-opening an approved artifact. The ROADMAP Phase 3 mention of "syntax highlighting" is interpreted as "plus split mode + file tree + larger-PR perf" rather than "introduces highlighting".
- **PR description paraphrase is Phase 1 scope, not Phase 4.** LLM-01 (dedicated summary pane) is Phase 4 and is about a *generated* summary surface. The `start_review` return in Phase 1 includes a paraphrase so the LLM enters its next turn with the PR intent already in working memory — this is Pitfall 11 prevention, not Phase 4 feature-creep.
- **Fail-closed defaults everywhere security-related:** missing token → 403 not 401; wrong Host → 400 not 404; bad CSP nonce → no content execution (browser enforces). Every auth/validation failure path is a single short early-return, not a permissive middleware with a late guard.

</specifics>

<deferred>
## Deferred Ideas

None surfaced during discussion. Discussion stayed within Phase 1 scope.

**Carried forward as Phase 1 boundary reminders** (not new ideas — restating so the planner sees them):
- Event-sourced reducer (Phase 2). Phase 1 writes state directly via the session manager, no event types yet.
- Octokit dependency (Phase 6). Phase 1 uses `gh` CLI exclusively.
- CI check status display, existing-PR-comments overlay (Phase 3).
- Keyboard shortcut capture (Phase 3). Phase 1 app shell must NOT install global keydown listeners.
- Multi-session switcher / session-start scan of `${CLAUDE_PLUGIN_DATA}/reviews/*` (Phase 7). Phase 1 handles one PR at a time.

</deferred>

---

*Phase: 01-plugin-skeleton-secure-vertical-slice*
*Context gathered: 2026-04-16*
