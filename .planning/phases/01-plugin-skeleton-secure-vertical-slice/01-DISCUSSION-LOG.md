# Phase 1: Plugin Skeleton + Secure Vertical Slice — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `01-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 01-plugin-skeleton-secure-vertical-slice
**Areas discussed:** Real-time transport, Persistence format, Session token delivery, MCP tool surface + ingestion shape, (bonus: Phase 1 vs Phase 3 syntax highlighting boundary)

---

## Real-time transport

### Q1: Which real-time transport for Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| SSE + HTTP POST | Server pushes over SSE; browser POSTs mutations. Matches asymmetric push pattern. `EventSource` reconnect free. No socket lib. Curl-debuggable. | ✓ |
| WebSocket via `ws` | Bidirectional socket. Natural IF MCP tools must wait for browser ACKs (e.g., `show_hunk` blocks on scroll confirm). | |
| Hybrid — SSE now, WS later if needed | Ship SSE in Phase 1; revisit at Phase 5 if walkthrough needs low-latency browser→server round-trips. | |

**User's choice:** SSE + HTTP POST
**Notes:** Stack doc (CLAUDE.md) and architecture research disagreed. User accepted architecture research's position — MCP tool returns already carry the hunk content, so LLM reasoning doesn't block on browser visual catch-up; WebSocket's full-duplex brings no value for this workload.

### Q2: What does the SSE stream carry in Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| `snapshot` only, stream stays open | Server sends full session state then holds connection idle. Disconnect → 'session expired' pill. Sets up Phase 2+ cleanly. | ✓ |
| `snapshot` then close | Snapshot delivered, connection closed. Simplest; small refactor in Phase 2 to reopen. | |
| No SSE at all in Phase 1; plain `GET /api/state` | Polling path. Simplest Phase 1 but hides the transport decision from real exercise. | |

**User's choice:** `snapshot` only, stream stays open
**Notes:** Keeps Phase 1 the smallest proof-of-transport that Phase 2 extends without protocol churn.

---

## Persistence format

### Q1: Which persistence format?

| Option | Description | Selected |
|--------|-------------|----------|
| Atomic JSON via `write-file-atomic` + `proper-lockfile` | Pure JS. Crash-safe via rename. Grep-able state file. Reducer-on-single-event-loop is the transaction boundary — no concurrency problem at the file layer. | ✓ |
| `better-sqlite3` at `.review/state.db` | Transactions, defensible for Phase 7 multi-session. Native C addon; synchronous API. Overkill given reducer already serializes mutations. | |
| Start JSON, migrate to SQLite if Phase 7 needs it | Simpler now, migration cost later if needed. | |

**User's choice:** Atomic JSON
**Notes:** The stack doc's argument for SQLite hinged on concurrent MCP + browser writes. In practice they share one Node event loop and pass through one synchronous reducer — the transaction concern evaporates.

### Q2: Where does review state live on disk?

| Option | Description | Selected |
|--------|-------------|----------|
| `${CLAUDE_PLUGIN_DATA}/reviews/<pr-key>/state.json` | Plugin-managed dir that survives updates. Doesn't pollute reviewed repos. | ✓ |
| `<repo-root>/.review/<pr-key>/state.json` | Matches ARCHITECTURE.md. Per-repo isolation natural; gitignore chore; doesn't survive plugin reinstall. | |
| `~/.git-review-plugin/<pr-key>/state.json` | Classic dotfile home. Not tied to plugin lifecycle. | |

**User's choice:** `${CLAUDE_PLUGIN_DATA}/reviews/<pr-key>/state.json`
**Notes:** PR-key shape: `gh:<owner>/<repo>#<number>` | `local:<sha256(repoPath+base+head)>`.

---

## Session token delivery

### Q1: How does the browser receive the per-session token?

| Option | Description | Selected |
|--------|-------------|----------|
| URL hash (`#token=...`), JS reads + clears, sets same-origin cookie | Fragment never sent to server or logs. JS adopts → cookie → wipes hash. Strongest leak profile. | |
| Query param (`?token=...`) | Simplest. Query lands in server logs, history, potentially referer. For single-user local tool these paths are controlled/suppressed. | ✓ |
| One-shot setup endpoint | Bootstrap code → redirect → cookie. More elegant but more moving parts. | |

**User's choice:** Query param
**Notes:** Fallback URL (PLUG-03) already needs to be copy-pasteable, which the query-param approach supports naturally. Our own server controls its logs and can drop the token from log lines.

### Q2: How is the token actually verified on each request?

| Option | Description | Selected |
|--------|-------------|----------|
| Custom `X-Review-Token` header on every state-changing request | Token held in-memory, attached on every fetch. Custom-header-forces-CORS-preflight as the CSRF defense. | |
| Cookie set on first load | Query-param token → JS POSTs `/api/session/adopt` → httpOnly SameSite=Strict cookie → wipe query string. Subsequent requests auth via cookie. Survives browser refresh. | ✓ |
| Token stays in query param on every request | No header logic. More exposure surface. Loses the custom-header CSRF defense. | |

**User's choice:** Cookie set on first load (with `X-Review-Token` as CSRF double-submit per option description)
**Notes:** Cookie-based auth survives browser refresh (relevant for Phase 5 drafted-comment persistence at the browser layer). EventSource sends same-origin cookies by default so SSE auth comes free.

---

## MCP tool surface + ingestion shape

### Q1: What MCP tools ship in Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| `start_review` only | One tool, discriminated-union input. Minimum viable; no misuse surface. Matches PITFALL 15 prevention. | ✓ |
| `start_review` + `get_state` | Read-only debug tool. Not needed in Phase 1 — `start_review` return carries the metadata. | |
| `start_review` + `end_review` | Explicit session-end. Redundant when plugin lifecycle is bound to Claude Code exit. | |

**User's choice:** `start_review` only

### Q2: How does `/review` parse its slash-command args?

| Option | Description | Selected |
|--------|-------------|----------|
| Single `/review` with smart dispatch | `<url>` | `<number>` | `--local <base> <head>` handled by the same tool. | ✓ |
| Split `/review` and `/review-local` | Two commands. Clearer per-command docs. More for the user to remember. | |
| Single `/review` with no args — LLM prompts user | Guided flow. Friendlier but conversational ceremony for a one-liner. | |

**User's choice:** Single `/review` with smart dispatch

### Q3: What does `start_review` return to the LLM?

| Option | Description | Selected |
|--------|-------------|----------|
| PR metadata summary + browser URL | Title, author, stats, paraphrased PR description (Pitfall 11 defense), browser URL. No hunk content. | ✓ |
| Just confirmation + URL | Terse. LLM can't reason about the PR without more tool calls. | |
| Full initial snapshot including diff | Everything. Fails PITFALL 5 on large PRs. | |

**User's choice:** PR metadata summary + browser URL

---

## Bonus: Syntax highlighting — Phase 1 or Phase 3?

Surfaced during discussion because ROADMAP Phase 3 mentions "syntax highlighting" but the approved `01-UI-SPEC.md` has Shiki in Phase 1 scope.

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 1 — honor UI-SPEC | Shiki per-hunk server-side, tokens in snapshot payload. | ✓ |
| Phase 3 — strip Shiki from Phase 1 | Raw monochrome in Phase 1; UI-SPEC gets amended. | |
| Compromise — lazy-highlight visible hunks only | Common case in Phase 1; perf tuning defers to Phase 3/7. | |

**User's choice:** Phase 1 — honor UI-SPEC
**Notes:** ROADMAP's Phase 3 "syntax highlighting" bullet is to be read as "plus split mode + file tree" — Shiki is not introduced there. Approved UI-SPEC is the authoritative Phase-1 visual contract.

---

## Claude's Discretion

Left to the planner / executor to decide without explicit user input:
- Log message wording beyond UI-SPEC copy table (UI-SPEC is authoritative for user-facing text).
- `src/` layout specifics — ARCHITECTURE.md proposes a structure; planner may refine.
- Test framework specifics (vitest is in stack; planner chooses supertest vs raw fetch).
- ID generation library choice (`nanoid` vs `crypto.randomBytes`).
- Exact stderr log format for the server-boot banner.

## Deferred Ideas

None surfaced — discussion stayed within Phase 1 scope.
