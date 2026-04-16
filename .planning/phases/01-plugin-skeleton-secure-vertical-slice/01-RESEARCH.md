# Phase 1: Plugin Skeleton + Secure Vertical Slice — Research

**Researched:** 2026-04-16
**Domain:** Claude Code plugin (MCP stdio) + embedded Hono HTTP/SSE server + secure localhost surface + dual-mode git diff ingestion
**Confidence:** HIGH (stack and security model are locked by CONTEXT; upstream research artifacts already cover architecture/pitfalls deeply; this document adds verified library specifics, concrete code shapes, and validation architecture)

---

## Summary

Phase 1 is a thin vertical slice that proves the entire control plane and closes every BLOCKER-severity security pitfall on day one. One Node 22+ process runs an `McpServer` over `StdioServerTransport` **and** a Hono HTTP server (via `@hono/node-server`) on an OS-assigned port bound to `127.0.0.1`, sharing one in-memory `SessionManager`. The `/review` slash command expands a prompt that tells the LLM to call a single MCP tool (`start_review`); that tool ingests a PR via `gh pr view` + `gh pr diff` (or `git diff base...head` in local mode), parses the unified diff with `parse-diff`, shapes it into the canonical `DiffModel`, persists the initial snapshot to `${CLAUDE_PLUGIN_DATA}/reviews/<pr-key>/state.json` via `write-file-atomic` + `proper-lockfile`, launches the default browser with an auth'd URL, and returns a paraphrased summary to the LLM. The browser connects to a single SSE endpoint (`GET /api/events`), receives an `event: snapshot` with the parsed diff and Shiki-pre-highlighted tokens, and renders the approved UI-SPEC shell. Security is enforced by Hono's `secureHeaders` middleware (CSP + NONCE), custom Host-validation and token-validation middleware, and fail-closed defaults. All four UI-SPEC diff-canvas states (Loading / Empty / Error / DiffLoaded) ship in this phase.

Nearly every material decision is already locked in `01-CONTEXT.md` (D-01..D-24). This research document's job is to (a) verify the package versions and APIs for the locked stack, (b) surface concrete code shapes the planner can structure tasks against, (c) flag the runtime/integration traps that remain now that transport-is-SSE and persistence-is-atomic-JSON have displaced the stack defaults, and (d) produce a Validation Architecture that makes the three `curl` probes and the four diff-canvas states testable.

**Primary recommendation:** Scaffold the monorepo as two TypeScript projects (`server/` and `web/`) with a `shared/` types barrel. Build the server in strict layers: `index.ts` owns lifecycle (signal handlers, server close), `http/` holds Hono middleware + routes, `mcp/` holds the stdio server + tool registrations, `session/` owns the in-memory `SessionManager`, `ingest/` holds `gh`/`git` adapters and `parse-diff` wiring, `persist/` holds the atomic-rename + lock wrappers. Do the security middleware **before** anything else in Wave 1 — validation tasks can run against a server that does nothing but say 403 / 400 before `start_review` is even implemented.

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Real-time transport (Open Decision 2 resolved):**
- **D-01:** Server→browser uses **Server-Sent Events** (`GET /api/events?session=<pr-key>`). Browser→server uses **plain HTTP POST**. No WebSocket in v1.
- **D-02:** Phase 1 SSE stream sends one `event: snapshot` with the full session state immediately after connect, then stays open idle. Disconnect at any time → browser flips footer session-status pill to "Session expired". Phase 2+ introduces `event: update` on the same open stream without protocol change.
- **D-03:** EventSource reconnect with `Last-Event-ID` is the long-term recovery path (Phase 2+). In Phase 1 a disconnected stream is a terminal state — the user re-runs `/review`.

**Persistence format (Open Decision 3 resolved):**
- **D-04:** **Atomic JSON** via `write-file-atomic` (write-temp + rename) for durability; `proper-lockfile` for cross-process safety.
- **D-05:** State lives at `${CLAUDE_PLUGIN_DATA}/reviews/<pr-key>/state.json`. PR-key: `gh:<owner>/<repo>#<number>` for GitHub PRs, `local:<sha256(repoPath+baseRef+headRef)>` for local-branch diffs.
- **D-06:** Phase 1 wires the persistence interface but only writes once per `start_review` (initial session snapshot). Event-sourced reducer + per-mutation persistence is Phase 2.

**Security model (SEC-01..04):**
- **D-07:** HTTP server binds `127.0.0.1` only. Never `0.0.0.0`, never `::`. OS-assigned port (`listen(0)`). Selected port echoed to **stderr** (never stdout).
- **D-08:** Per-launch cryptographically random session token (≥128 bits, `crypto.randomBytes` base64url). Token travels to the browser as a query param on the initial launch URL.
- **D-09:** Entry-point JS reads token from `location.search`, POSTs to `/api/session/adopt`. Server sets `httpOnly; SameSite=Strict; Secure=false; Path=/` cookie. JS wipes query string via `history.replaceState`.
- **D-10:** Every state-changing POST carries `X-Review-Token` header (CSRF double-submit alongside cookie). `/api/session/adopt` is the lone exception (reads token from query param since no cookie yet). SSE authenticates on cookie alone (EventSource can't set custom headers, but SameSite=Strict + Host validation + CSP make cross-origin SSE subscription infeasible).
- **D-11:** `Host` header strictly validated: allowlist is exactly `127.0.0.1:<port>` and `localhost:<port>`. Anything else → **400** before any routing. Defeats DNS rebinding.
- **D-12:** All HTML responses carry CSP: `default-src 'self'; script-src 'self' 'nonce-{SESSION_NONCE}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'none'; object-src 'none'; frame-ancestors 'none'`. (`connect-src 'self'` — no `ws://` because no WebSocket.)
- **D-13:** Browser-launch fallback: always print the full auth'd URL to stderr before calling `open`, so PLUG-03 is automatic (macOS `open` doesn't surface launch failure reliably).

**Ingestion (INGEST-01, INGEST-02):**
- **D-14:** One slash command `/review` with smart argv dispatch in the MCP tool: `/review <url>`, `/review <N>`, `/review --local <base> <head>`.
- **D-15:** GitHub ingestion: `gh pr view <n> --json title,body,author,baseRefName,headRefName,baseRefOid,headRefOid,additions,deletions,changedFiles` + `gh pr diff <n>`. Octokit is NOT a Phase 1 dep.
- **D-16:** Local ingestion: `execa('git', ['diff', '<base>...<head>'])` from cwd.
- **D-17:** Both paths feed `parse-diff` → one `DiffModel` with pre-populated opaque Hunk.id = `${fileId}:h${index}` (no retrofit later).

**MCP tool surface:**
- **D-18:** One tool in Phase 1: `start_review`. Tool count cap ≤10 across all phases.
- **D-19:** `start_review` zod schema: discriminated union `{ source: {kind:'github',url:string} | {kind:'github',number:number} | {kind:'local',base:string,head:string} }`.
- **D-20:** `start_review` return: text content with PR title, author, base→head, stats, paraphrased PR body (Pitfall 11 mitigation), final line `"Review open at: http://127.0.0.1:<port>/?token=..."`. No diff/hunk content.
- **D-21:** Idempotent on PR-key within one process. Browser auto-open only on first call.

**UI (honors approved UI-SPEC):**
- **D-22:** Shiki server-side highlighting ships in Phase 1. Tokens cached per `(filePath, headSha)` in-memory. Travel in SSE `snapshot`. `@git-diff-view/react` consumes via token-renderer hook.
- **D-23:** Unified mode only. Split-mode is Phase 3.
- **D-24:** Four diff-canvas states per UI-SPEC: Loading, Empty, Error (two variants: server unreachable / diff fetch failed), DiffLoaded. All four must render.

### Claude's Discretion

The following were left to Claude / the planner without user input:
- Exact wording of log messages beyond what UI-SPEC locks.
- File structure under `src/` — planner may refine ARCHITECTURE.md's proposal.
- Test framework specifics (vitest is in the stack; supertest vs raw fetch is planner's call).
- Deployment/install story (deferred; personal tool, `claude --plugin-dir ./` workflow).
- `nanoid` vs plain `crypto.randomBytes().toString('base64url')` for IDs.

### Deferred Ideas (OUT OF SCOPE)

None surfaced. Boundary reminders restated:
- Event-sourced reducer → Phase 2 (Phase 1 writes state directly via session manager, no event types yet).
- Octokit → Phase 6 (Phase 1 uses `gh` CLI exclusively).
- CI check status, existing PR comments overlay → Phase 3.
- Keyboard shortcuts → Phase 3 (Phase 1 app shell MUST NOT install global keydown listeners).
- Multi-session switcher → Phase 7 (Phase 1 handles one PR at a time).

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLUG-01 | `/review` slash command with GitHub URL, PR number, or `--local <base> <head>` argv | Plugin manifest + `commands/review.md` prompt pattern (§Claude Code Plugin Packaging); MCP tool discriminated-union schema (§MCP Tool Surface) |
| PLUG-02 | Plugin auto-launches default browser to local review URL on start | `open` npm package 11.x shelling out to macOS `open` (§Browser Launch); called after HTTP server `listen` resolves |
| PLUG-03 | Plugin echoes exact URL to terminal as fallback when browser auto-launch fails | Always print to **stderr** (never stdout — that's the JSON-RPC channel, AP2); D-13 says always-print, don't detect failure |
| INGEST-01 | Load GitHub PR by URL or number via `gh pr view --json` + `gh pr diff` | `gh` CLI ingestion pattern (§GitHub Ingestion); `execa` shell-out; repo-inference from cwd via `gh repo view --json name,owner` |
| INGEST-02 | Local branch diff by base and head refs; no host integration | `git diff <base>...<head>` three-dot merge-base semantics (§Local-Branch Ingestion); same `parse-diff` pipeline |
| SEC-01 | Local server binds `127.0.0.1` only — never `0.0.0.0` or `::` | `serve({ hostname: '127.0.0.1', port: 0 }, info => ...)` from `@hono/node-server` (§Security Hardening) |
| SEC-02 | Every state-changing request requires per-session random token; missing/invalid → 403 | Per-launch `crypto.randomBytes(32).toString('base64url')`; token-in-URL + adopt-endpoint + cookie + `X-Review-Token` header double-submit (§Security Hardening) |
| SEC-03 | Server rejects non-`127.0.0.1:<port>` / `localhost:<port>` Host headers — closes DNS rebinding | Custom Hono middleware that runs before `secureHeaders`, short-circuits with `c.text('Bad host', 400)` (§Security Hardening) |
| SEC-04 | All HTML responses carry strict CSP — no external/inline scripts except nonce'd entry | `hono/secure-headers` with `contentSecurityPolicy` + `NONCE` (§Security Hardening); entry script nonce threaded to HTML via `c.get('secureHeadersNonce')` |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

These directives carry the same authority as locked decisions:

- **Tech platform:** Claude Code plugin. Slash commands as entry, MCP server for LLM-driven control. **Non-negotiable.**
- **UI surface:** Local web app, not terminal. Rich DOM required for diff + inline threads.
- **LLM driver:** User's Claude Code session drives review via MCP calls. Plugin does NOT make its own LLM API calls. Single auth surface, no duplicate keys.
- **v1 git hosts:** GitHub + local branch diffs only. No GitLab, Bitbucket, Azure DevOps.
- **Persistence:** Per-PR review state on local disk, resumable across browser close.
- **Audience:** Single user (author). No team features.
- **OS:** macOS. Shell commands, `gh` CLI availability, default-browser launch all assume macOS.
- **Do NOT use:** Next.js/Remix (SSR not needed), Express (use Hono), Socket.IO, SSE-only-one-way (contradicted by D-01 which says SSE+POST — so this constraint is updated by CONTEXT), Monaco diff editor, CodeMirror merge view, `diff2html`, `simple-git`, `isomorphic-git`, `lowdb`, `node:sqlite`, `prismjs`, `@octokit/rest` standalone, Streamable HTTP MCP transport, `commands/` inside `.claude-plugin/`, `console.log` in MCP server (stderr only).
- **Do:** TypeScript 6 with `"module": "Node16"` for the `.js` ESM import specifiers in the MCP SDK exports; `"type": "module"` in `package.json`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| MCP tool contract (`start_review`) | MCP server (stdio) | — | Phase 1's LLM-facing contract; must run over the stdio transport that Claude Code spawns |
| Slash command expansion | Claude Code client | Plugin manifest | `commands/review.md` is a prompt Claude Code expands — not code; it only instructs the LLM to call `start_review` |
| HTTP routing + static SPA | Hono server (in plugin process) | `@hono/node-server` | Local HTTP is the only browser-facing surface; co-located with MCP to share in-memory `SessionManager` |
| SSE push channel | Hono `streamSSE` | — | Server→browser state; Hono's first-class streaming helper (no external dep) |
| Session token adoption | Hono POST `/api/session/adopt` | Browser entry JS | Query param → cookie handoff; runs once per page load |
| Host / token / CSP validation | Hono middleware (`secureHeaders` + custom) | — | Must fire before routing; `secureHeaders` handles CSP+NONCE; custom middleware enforces Host allowlist and `X-Review-Token` check |
| PR ingestion (GitHub) | `execa` → `gh` CLI | — | Inherits user's `gh` auth; no Octokit dep in Phase 1 |
| PR ingestion (local) | `execa` → `git diff` | — | No network; same unified-diff output feeds `parse-diff` |
| Diff parsing | `parse-diff` | Custom `DiffModel` shaper | One parse, one model; consumed by both SSE snapshot payload and future opaque-ID MCP tools |
| Syntax highlighting | Shiki (server-side) | In-memory LRU cache keyed by `(path, headSha)` | Pre-render per hunk to keep browser paint cheap; tokens travel in SSE `snapshot` |
| State persistence | `write-file-atomic` + `proper-lockfile` | File at `${CLAUDE_PLUGIN_DATA}/reviews/<pr-key>/state.json` | D-04; crash-safe, grep-able, no native addon |
| Browser SPA render | Vite + React 19 + `@git-diff-view/react` | Tailwind 4 tokens per UI-SPEC | Static bundle served by Hono `serveStatic`; UI-SPEC is the visual contract |
| Default-browser launch | `open` npm package (macOS) | Stderr URL fallback | D-13: always print URL to stderr first, then call `open` |
| Lifecycle / shutdown | `process.on('SIGTERM'/'SIGINT')` → `server.close()` → `process.exit(0)` | Node `http.Server` returned by Hono's `serve()` | Parent Claude Code owns the process's lifetime; clean shutdown is mandatory |

## Standard Stack

### Core (server — Node 22+)

| Library | Version | Purpose | Why Standard | Source |
|---------|---------|---------|--------------|--------|
| `@modelcontextprotocol/sdk` | `1.29.0` | MCP server over stdio | Official SDK; `McpServer` + `StdioServerTransport` + `registerTool` + zod schema is the canonical pattern | [VERIFIED: npm view, 2026-03-30]; [CITED: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server-quickstart.md] |
| `hono` | `4.12.14` | HTTP server + middleware + SSE + static files | Tiny (~14kB), Web-Standards-based, first-class CSP+NONCE via `secureHeaders`, first-class SSE via `streamSSE` | [VERIFIED: npm view]; [CITED: https://hono.dev/docs/middleware/builtin/secure-headers, https://hono.dev/docs/helpers/streaming] |
| `@hono/node-server` | `1.19.14` | Node adapter; exposes the underlying Node `http.Server` for `.close()` and ephemeral-port discovery | `serve({fetch, port:0, hostname:'127.0.0.1'}, info => ...)` returns a Node server with `.close()`; `info.port` gives the OS-assigned port | [VERIFIED: npm view]; [CITED: https://hono.dev/docs/getting-started/nodejs] |
| `zod` | `4.3.6` | MCP tool input schemas | Required by `registerTool` pattern; discriminated unions for the `start_review` source argument | [VERIFIED: npm view]; [CITED: Context7 `/modelcontextprotocol/typescript-sdk`] |
| `execa` | `9.6.1` | Shell out to `gh` and `git` | Safer, better-typed than child_process; clean stdout/stderr separation | [VERIFIED: npm view] |
| `parse-diff` | `0.11.1` | Unified-diff → file/hunk/line objects | Works on `gh pr diff` and `git diff` output; one internal representation | [VERIFIED: npm view] |
| `shiki` | `4.0.2` | Server-side syntax highlighting | VS Code-quality tokens pre-rendered once per hunk; consumed by `@git-diff-view/react` token hook | [VERIFIED: npm view]; [CITED: Context7 `/shikijs/shiki`] |
| `write-file-atomic` | `7.0.1` | Atomic write-temp + rename | Crash-safe JSON persistence per D-04; pure JS, no native addon | [VERIFIED: npm view] |
| `proper-lockfile` | `4.1.2` | Cross-process file locking | Prevents a second plugin instance from clobbering state on the same PR | [VERIFIED: npm view] |
| `open` | `11.0.0` | Launch default browser (macOS) | Standard npm package; wraps macOS `open` | [VERIFIED: npm view] |
| `nanoid` | `5.1.9` | Stable IDs | Tiny, URL-safe, fast; use for fileId generation from path hashing (optional — plain `crypto` works too per Claude's Discretion) | [VERIFIED: npm view] |

### Core (web — browser, Vite-bundled)

| Library | Version | Purpose | Why Standard | Source |
|---------|---------|---------|--------------|--------|
| `vite` | `8.0.8` | SPA bundler + dev server | Zero-config React, HMR, produces a static `dist/` served by Hono | [VERIFIED: npm view] |
| `react` | `19.2.5` | UI framework | SPA model; all Phase-1 UI libs peer on ^19 | [VERIFIED: npm view] |
| `@git-diff-view/react` | `0.1.3` | GitHub-style unified-diff React component | Unified-diff native, token hook for Shiki tokens, hunk-anchor props for future inline-comment mount points | [VERIFIED: npm view (latest 2026-03-19)] |
| `tailwindcss` | `4.2.2` | Styling + UI-SPEC `@theme` tokens | Per UI-SPEC's `@theme` block — the design system is authoritative; Tailwind 4 reads CSS custom props natively | [VERIFIED: npm view] |
| `lucide-react` | `1.8.0` | Icon set (ShieldCheck, ShieldX, GitCompareArrows, AlertCircle, Github, GitBranch) | Per UI-SPEC; tree-shakeable, no external fetches (all SVG inline) | [VERIFIED: npm view] |

### Development

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| `typescript` | `6.0.2` | Type checking (server + web) | Use `"module": "Node16"` in server tsconfig for MCP SDK `.js` ESM subpath imports | [VERIFIED: npm view] |
| `tsx` | latest | Run TS entry points during dev | Faster than `ts-node`, no build step for local iteration inside Claude Code |
| `vitest` | latest | Unit + integration tests | Same engine as Vite; Vite's `vitest` is the standard with zero config |
| `pnpm` | 10.3.0 (installed) | Package manager w/ workspaces | Smaller `node_modules`, ships with plugin; project already uses it implicitly (verified installed) |
| `@types/node` | latest | Node type defs | Needed for `crypto`, `node:http`, signals |

### Alternatives Considered

| Instead of | Could Use | Why Not Chosen |
|------------|-----------|----------------|
| Hono `secureHeaders` CSP | Hand-rolled CSP header via `c.header()` | Re-invents nonce threading; `secureHeaders` integrates `c.get('secureHeadersNonce')` and is a single audit surface |
| Hono `streamSSE` | Raw `reply.raw.writeHead` + manual SSE formatting | `streamSSE` handles chunking, backpressure, abort propagation; much less code |
| `@hono/node-ws` | `ws` direct | Not applicable — WebSocket was overridden by D-01 |
| Shiki runtime bundle | Pre-rendering to HTML on server | We DO pre-render (D-22). `@git-diff-view/react`'s token hook accepts pre-highlighted tokens — server-side only |
| `better-sqlite3` | `write-file-atomic` + `proper-lockfile` | Overridden by D-04 (stack default replaced; reducer-on-single-event-loop makes the transactional argument for SQLite moot) |
| WebSocket (`ws`) | SSE + POST | Overridden by D-01 |
| Octokit | `gh` CLI | Deferred to Phase 6 per D-15; one fewer dep in Phase 1 |

### Installation

```bash
# From plugin root (monorepo-lite)
pnpm init
pnpm add -D typescript@6 tsx vitest @types/node

# Workspace: server/
pnpm --filter server add @modelcontextprotocol/sdk@1.29.0 hono@4.12.14 @hono/node-server@1.19.14 \
  zod@4.3.6 execa@9 parse-diff@0.11.1 shiki@4 \
  write-file-atomic@7 proper-lockfile@4 open@11 nanoid@5

# Workspace: web/
pnpm --filter web add react@19 react-dom@19 @git-diff-view/react@0.1.3 lucide-react@1
pnpm --filter web add -D vite@8 @vitejs/plugin-react tailwindcss@4 @tailwindcss/vite
```

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Claude Code Session (parent)                         │
│                                                                              │
│   User types: /review https://github.com/owner/repo/pull/N                   │
│                 │                                                            │
│                 ▼ (slash command expands commands/review.md prompt)          │
│   LLM sees: "Call start_review with source={kind:'github',url:'...'}"        │
│                 │                                                            │
│                 ▼  JSON-RPC over stdin/stdout (MCP)                          │
└─────────────────┼────────────────────────────────────────────────────────────┘
                  │
                  │ spawned at Claude Code session start per .mcp.json
                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│         PLUGIN PROCESS  (single Node 22+, lifetime = Claude Code session)     │
│                                                                              │
│  ┌───────────────────────┐              ┌─────────────────────────────────┐  │
│  │  MCP Server (stdio)   │              │  Hono HTTP Server               │  │
│  │  @mcp/sdk             │              │  bound 127.0.0.1:<OS-port>      │  │
│  │                       │              │  (OS-assigned via port:0)       │  │
│  │  registerTool(        │              │                                 │  │
│  │    'start_review',    │              │  Middleware chain (order!):     │  │
│  │    { inputSchema }    │              │   1. Host-validate (400 bad)    │  │
│  │    handler            │              │   2. secureHeaders (CSP+NONCE)  │  │
│  │  )                    │              │   3. Token-validate (403 none)  │  │
│  │         │             │              │        *except /api/session/    │  │
│  │         │             │              │         adopt & GET /           │  │
│  │         │             │              │                                 │  │
│  └─────────┼─────────────┘              │  Routes:                        │  │
│            │                            │   GET  /                        │  │
│            │                            │   GET  /assets/*                │  │
│            │                            │   POST /api/session/adopt       │  │
│            │                            │   GET  /api/events  (SSE)       │  │
│            │                            └────────────┬────────────────────┘  │
│            │                                         │                       │
│            └────────────────┬────────────────────────┘                       │
│                             ▼                                                │
│           ┌──────────────────────────────────────────────┐                   │
│           │  SessionManager (in-memory singleton)        │                   │
│           │   Map<pr-key, ReviewSession>                 │                   │
│           │   - get(key), create(key, session)           │                   │
│           │   - sessionToken (per-launch, one token      │                   │
│           │     shared across sessions in this process)  │                   │
│           │   - emit('session:snapshot') on create       │                   │
│           └────────┬──────────────────┬───────────────┬──┘                   │
│                    │                  │               │                      │
│                    ▼                  ▼               ▼                      │
│     ┌──────────────────┐  ┌────────────────────┐  ┌───────────────────┐      │
│     │  Ingest Adapter  │  │  Shiki Highlighter │  │  Persistence      │      │
│     │  gh:  execa('gh')│  │  (LRU cache by     │  │  write-file-      │      │
│     │  local: execa(   │  │   path+headSha)    │  │  atomic + lock    │      │
│     │    'git diff')   │  │                    │  │  → $CLAUDE_PLUGIN_│      │
│     │  ↓               │  │                    │  │    DATA/reviews/  │      │
│     │  parse-diff      │  │                    │  │    <pr-key>/      │      │
│     │  → DiffModel     │  │                    │  │    state.json     │      │
│     └──────────────────┘  └────────────────────┘  └───────────────────┘      │
│                                                                              │
│  Lifecycle:                                                                  │
│   - SIGINT/SIGTERM → server.close() → process.exit(0)                        │
│   - All logs to stderr (console.error) — stdout is JSON-RPC                  │
└──────────────────────────────────────────────────────────────────────────────┘
                  ▲
                  │ open http://127.0.0.1:<port>/?token=<base64url>
                  │ (macOS `open` via open@11; URL also printed to stderr)
                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                            Default Browser                                    │
│                                                                              │
│  (1) GET / → Hono serves index.html with CSP + nonce'd <script>              │
│  (2) main.js reads token from location.search                                │
│  (3) POST /api/session/adopt { token }  (header: X-Review-Token on future)   │
│      → server verifies token, sets httpOnly cookie                           │
│  (4) JS wipes query via history.replaceState('/', '')                        │
│  (5) EventSource('/api/events?session=<pr-key>')                             │
│      → receives event:snapshot { diffModel, shikiTokens, prMetadata }        │
│  (6) React renders AppShell → DiffCanvas → DiffView                          │
│      (or LoadingState / EmptyState / ErrorState per UI-SPEC)                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
git-review-plugin/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest (name, version, commands, mcpServers)
├── .mcp.json                    # MCP server config at plugin root (NOT inside .claude-plugin/)
├── commands/
│   └── review.md                # /review prompt: instructs LLM to call start_review
├── package.json                 # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── server/
│   ├── package.json             # "type": "module", entry = dist/index.js
│   ├── tsconfig.json            # module: Node16, target: ES2022
│   ├── vitest.config.ts
│   └── src/
│       ├── index.ts             # Entry: start MCP + HTTP, signal handlers, launch browser
│       ├── logger.ts            # Stderr-only logger; any console.log here is a bug
│       ├── mcp/
│       │   ├── server.ts        # McpServer + StdioServerTransport wiring
│       │   └── tools/
│       │       └── start-review.ts   # The single Phase-1 tool
│       ├── http/
│       │   ├── server.ts        # Hono app; middleware chain; route mounting
│       │   ├── middleware/
│       │   │   ├── host-validate.ts     # Reject non-localhost Host → 400
│       │   │   ├── token-validate.ts    # X-Review-Token || cookie → 403 on miss
│       │   │   └── secure-headers.ts    # Wraps hono/secure-headers with our CSP
│       │   └── routes/
│       │       ├── session-adopt.ts     # POST /api/session/adopt
│       │       ├── events.ts            # GET /api/events (SSE)
│       │       └── static.ts            # serveStatic for /assets/* + GET / → index.html
│       ├── session/
│       │   ├── manager.ts       # SessionManager: Map<pr-key, Session>, token, bus
│       │   ├── types.ts         # ReviewSession, DiffModel, etc. (mirrored in shared/)
│       │   └── key.ts           # pr-key derivation per D-05
│       ├── ingest/
│       │   ├── github.ts        # gh pr view + gh pr diff via execa
│       │   ├── local.ts         # git diff base...head via execa
│       │   ├── parse.ts         # parse-diff → DiffModel shaper with opaque IDs per D-17
│       │   └── repo-infer.ts    # gh repo view --json name,owner from cwd
│       ├── highlight/
│       │   └── shiki.ts         # Shiki singleton + LRU cache (path+headSha → tokens)
│       ├── persist/
│       │   ├── paths.ts         # ${CLAUDE_PLUGIN_DATA}/reviews/<pr-key>/state.json
│       │   └── store.ts         # write-file-atomic + proper-lockfile wrapper
│       └── browser-launch.ts    # open@11 with stderr URL echo first
├── web/
│   ├── package.json
│   ├── tsconfig.json            # target: ES2022, module: ESNext, jsx: react-jsx
│   ├── vite.config.ts
│   ├── index.html               # Single nonce'd <script type="module" src="/src/main.tsx">
│   │                            # (nonce placeholder replaced by Hono at serve time)
│   ├── tailwind.config.ts       # @theme tokens per UI-SPEC
│   └── src/
│       ├── main.tsx             # Bootstraps: adopt token, open EventSource, mount <App>
│       ├── index.css            # @theme {} block per UI-SPEC §"Tailwind 4 Token Declarations"
│       ├── api.ts               # adoptSession(token), openEventStream()
│       ├── store.ts             # Session state (useReducer or Zustand — planner's call)
│       ├── App.tsx              # Routes loading/empty/error/diff states
│       ├── components/
│       │   ├── AppShell.tsx
│       │   ├── AppHeader.tsx
│       │   ├── AppFooter.tsx
│       │   ├── SessionStatusPill.tsx
│       │   ├── DiffCanvas.tsx
│       │   ├── DiffView.tsx          # Wraps @git-diff-view/react
│       │   ├── LoadingState.tsx
│       │   ├── EmptyState.tsx
│       │   └── ErrorState.tsx
│       └── types.ts             # Re-export from shared/
└── shared/
    └── types.ts                 # DiffModel, ReviewSession, SSE message shapes
```

**Why this layout:**
- `server/` and `web/` are independent TS projects with independent tsconfigs (Node target vs browser target); `shared/types.ts` is imported by both via a tsconfig path alias.
- `server/src/http/middleware/*` one-file-per-concern: host, token, secureHeaders. Each exports a `Hono` middleware function. The ordering (host → secureHeaders → token, with adopt-route bypass) is the load-bearing security boundary and must be unit-testable in isolation.
- `server/src/ingest/parse.ts` is the one place `parse-diff`'s output becomes `DiffModel`. All opaque-ID generation per D-17 lives here.
- `server/src/index.ts` owns lifecycle; everything else is constructed inside it and torn down through it.
- No `commands/*.md` inside `.claude-plugin/` — this is [CITED: https://code.claude.com/docs/en/plugins-reference/] as a documented common mistake.

### Pattern 1: MCP Server + HTTP Server in One Node Process

**What:** Start `StdioServerTransport` and `@hono/node-server`'s `serve()` in the same entry file. Share one `SessionManager` instance by construction-injection.

**When to use:** Always for this app. The in-memory `SessionManager` is the whole architectural reason for co-location.

**Example:**

```typescript
// server/src/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serve } from '@hono/node-server';
import crypto from 'node:crypto';
import { buildHttpApp } from './http/server.js';
import { registerStartReview } from './mcp/tools/start-review.js';
import { SessionManager } from './session/manager.js';
import { logger } from './logger.js';

async function main() {
  // 1. One token per plugin process launch; shared across sessions (single-user, D-08 says "per-launch")
  const sessionToken = crypto.randomBytes(32).toString('base64url');
  const manager = new SessionManager({ sessionToken });

  // 2. Build Hono app and launch on 127.0.0.1:0 — OS picks port
  const app = buildHttpApp({ manager });
  const httpServer = serve(
    { fetch: app.fetch, port: 0, hostname: '127.0.0.1' },
    (info) => {
      const url = `http://127.0.0.1:${info.port}/?token=${sessionToken}`;
      // ALWAYS print URL to stderr BEFORE browser launch (D-13, PLUG-03)
      logger.info(`Review server listening at ${url}`);
      manager.setLaunchUrl(url);
    }
  );

  // 3. Build MCP server and register start_review
  const mcp = new McpServer(
    { name: 'git-review-plugin', version: '0.1.0' },
    { capabilities: { logging: {} } }
  );
  registerStartReview(mcp, manager);
  await mcp.connect(new StdioServerTransport());
  logger.info('MCP server ready on stdio');

  // 4. Signal handlers — Claude Code owns our lifetime
  const shutdown = (signal: string) => {
    logger.info(`${signal} received; shutting down.`);
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  // stderr only
  console.error('Fatal:', err);
  process.exit(1);
});
```

Source pattern: [CITED: https://hono.dev/docs/getting-started/nodejs] (graceful shutdown), [CITED: Context7 `/modelcontextprotocol/typescript-sdk`] (McpServer + StdioServerTransport).

### Pattern 2: Fail-Closed Hono Middleware Chain

**What:** Order-sensitive middleware. Every security check short-circuits before routing.

**When to use:** Always, as the first thing registered on the Hono app.

**Example:**

```typescript
// server/src/http/server.ts
import { Hono } from 'hono';
import { secureHeaders, NONCE } from 'hono/secure-headers';
import { serveStatic } from '@hono/node-server/serve-static';
import { hostValidate } from './middleware/host-validate.js';
import { tokenValidate } from './middleware/token-validate.js';
import { mountSessionAdopt } from './routes/session-adopt.js';
import { mountEvents } from './routes/events.js';

export function buildHttpApp({ manager }: { manager: SessionManager }) {
  const app = new Hono();

  // 1. Host allowlist FIRST — defeats DNS rebinding before any routing
  app.use('*', hostValidate(manager));   // → 400 on bad Host

  // 2. secureHeaders: CSP with NONCE, plus defaults (X-Frame-Options etc.)
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", NONCE],
        styleSrc: ["'self'", "'unsafe-inline'"],  // Tailwind 4 needs this; UI-SPEC-locked
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],                    // No ws:// — D-01 killed WebSocket
        fontSrc: ["'none'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    })
  );

  // 3. Token-validate runs everywhere EXCEPT /api/session/adopt (bootstrapping) and GET / (bootstrap HTML)
  app.use('/api/*', tokenValidate(manager));   // 403 on miss/invalid

  // 4. Routes (order doesn't matter here)
  mountSessionAdopt(app, manager);   // POST /api/session/adopt — reads token from query param
  mountEvents(app, manager);         // GET /api/events — SSE snapshot

  // 5. Static SPA last — catch-all
  app.use('/assets/*', serveStatic({ root: './web/dist' }));
  app.get('/', (c) => {
    const nonce = c.get('secureHeadersNonce');
    // Read index.html template, replace __NONCE__ placeholder
    const html = renderIndex(nonce);
    return c.html(html);
  });

  return app;
}
```

Notes on middleware order:
- **host-validate MUST be first** — it runs on EVERY request, including `GET /`. A malicious page attempting DNS rebinding must not even see `secureHeaders` add CSP; it gets a bare 400.
- **secureHeaders MUST run before the HTML route** — `c.get('secureHeadersNonce')` is only populated after the middleware runs.
- **tokenValidate is scoped to `/api/*`** — `GET /` must work without a token (that's the bootstrap page); `/api/session/adopt` is mounted under `/api/*` but bypasses token-validate internally by reading from the query param instead of header+cookie. The planner should decide whether to scope `tokenValidate` to `/api/*` minus `/api/session/adopt` (cleaner) or to put the bypass inside the handler (less clean but simpler middleware chain).

Source: [CITED: https://hono.dev/docs/middleware/builtin/secure-headers]

### Pattern 3: Host Header Allowlist Middleware

**What:** Strict allowlist of `127.0.0.1:<port>` and `localhost:<port>`. Anything else → 400.

**When to use:** Always, before any routing. Defeats DNS rebinding (Pitfall 6, BLOCKER).

**Example:**

```typescript
// server/src/http/middleware/host-validate.ts
import type { MiddlewareHandler } from 'hono';
import type { SessionManager } from '../../session/manager.js';

export function hostValidate(manager: SessionManager): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header('host') ?? '';
    const port = manager.getHttpPort();  // set by index.ts after serve() resolves
    if (port == null) return c.text('Server not ready', 503);
    const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!allowed.has(host)) {
      return c.text('Bad host', 400);
    }
    return next();
  };
}
```

Note: Host header comparison is case-insensitive in HTTP but Node normalizes to lowercase; still, defensive `.toLowerCase()` is cheap. Never parse `host` with a regex — use exact-string equality.

### Pattern 4: Token Validation (Header + Cookie Double-Submit)

**What:** POST routes require BOTH the `X-Review-Token` header AND the session cookie; they must match AND equal the process-launch token.

**Example:**

```typescript
// server/src/http/middleware/token-validate.ts
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';

export function tokenValidate(manager: SessionManager): MiddlewareHandler {
  return async (c, next) => {
    // Bypass: /api/session/adopt reads its own token from body
    if (c.req.path === '/api/session/adopt') return next();

    const cookie = getCookie(c, 'review_session');
    const launchToken = manager.getSessionToken();

    // SSE special-case: EventSource can't set X-Review-Token header
    // SameSite=Strict + Host validation makes cross-origin infeasible, so cookie-only is safe
    if (c.req.method === 'GET' && c.req.path === '/api/events') {
      if (cookie !== launchToken) return c.text('Forbidden', 403);
      return next();
    }

    const header = c.req.header('x-review-token');
    if (!header || !cookie || header !== cookie || header !== launchToken) {
      return c.text('Forbidden', 403);
    }
    return next();
  };
}
```

**Warning:** Token comparison should use `crypto.timingSafeEqual` on buffers to resist timing attacks. Since this is a local-only tool with a 256-bit token that's already high-entropy, plain `===` is acceptable for Phase 1 but flagged.

### Pattern 5: Session Adopt + SSE Snapshot

**What:** Browser posts token (from URL) to `/api/session/adopt`; server sets `httpOnly; SameSite=Strict` cookie. Browser opens EventSource to `/api/events?session=<pr-key>`; server writes one `event: snapshot` with the full `ReviewSession` JSON.

**Example (server):**

```typescript
// server/src/http/routes/session-adopt.ts
import { setCookie } from 'hono/cookie';
import { z } from 'zod';
const AdoptInput = z.object({ token: z.string().min(1) });

export function mountSessionAdopt(app: Hono, manager: SessionManager) {
  app.post('/api/session/adopt', async (c) => {
    const body = AdoptInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.text('Bad request', 400);
    if (body.data.token !== manager.getSessionToken()) {
      return c.text('Forbidden', 403);
    }
    setCookie(c, 'review_session', manager.getSessionToken(), {
      httpOnly: true,
      sameSite: 'Strict',
      secure: false,         // 127.0.0.1 has no TLS; secure=true would break
      path: '/',
    });
    return c.json({ ok: true });
  });
}
```

```typescript
// server/src/http/routes/events.ts
import { streamSSE } from 'hono/streaming';

export function mountEvents(app: Hono, manager: SessionManager) {
  app.get('/api/events', (c) => {
    const prKey = c.req.query('session');
    if (!prKey) return c.text('Missing session', 400);
    const session = manager.get(prKey);
    if (!session) return c.text('Unknown session', 404);

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'snapshot',
        data: JSON.stringify(session),
        id: '0',
      });
      // Phase 1: stay open but idle. Phase 2 will attach to the bus and emit 'update' events.
      // Browser disconnect (tab close, refresh) flows through stream.onAbort:
      stream.onAbort(() => {
        // no-op in Phase 1
      });
      // Keep-alive ping every 15s to prevent proxies from closing (local, not strictly needed)
      while (true) {
        await stream.sleep(15_000);
        await stream.writeSSE({ event: 'ping', data: '' });
      }
    });
  });
}
```

Source: [CITED: https://hono.dev/docs/helpers/streaming]

### Pattern 6: Dual-Mode Ingestion → `parse-diff` → `DiffModel`

**What:** GitHub and local paths both emit unified-diff text. One parser, one shape.

**Example (GitHub path):**

```typescript
// server/src/ingest/github.ts
import { execa } from 'execa';

export async function ingestGithub(numberOrUrl: string) {
  // gh auto-detects number vs URL; still normalize number→string for the CLI
  const [metaRaw, diffRaw] = await Promise.all([
    execa('gh', ['pr', 'view', String(numberOrUrl),
      '--json', 'title,body,author,baseRefName,headRefName,baseRefOid,headRefOid,additions,deletions,changedFiles'
    ]),
    execa('gh', ['pr', 'diff', String(numberOrUrl)]),
  ]);
  const meta = JSON.parse(metaRaw.stdout);
  return { meta, diffText: diffRaw.stdout };
}
```

**Example (local path):**

```typescript
// server/src/ingest/local.ts
import { execa } from 'execa';

export async function ingestLocal(base: string, head: string, cwd: string) {
  // Validate refs exist first — `git rev-parse` fails fast
  await Promise.all([
    execa('git', ['rev-parse', '--verify', base], { cwd }),
    execa('git', ['rev-parse', '--verify', head], { cwd }),
  ]);
  // Three-dot = diff from merge-base (what GitHub PRs show). Two-dot = literal diff.
  // Use three-dot for parity with gh pr diff.
  const { stdout } = await execa('git', ['diff', `${base}...${head}`], { cwd });
  return { diffText: stdout };
}
```

**Example (parse shape per D-17):**

```typescript
// server/src/ingest/parse.ts
import parseDiff from 'parse-diff';
import { createHash } from 'node:crypto';

export function toDiffModel(diffText: string): DiffModel {
  const files = parseDiff(diffText);
  return {
    files: files.map((f, fi) => {
      const path = f.to ?? f.from ?? 'unknown';
      const fileId = createHash('sha1').update(path).digest('hex').slice(0, 12);
      return {
        id: fileId,
        path,
        oldPath: f.from !== f.to ? f.from : undefined,
        status: f.deleted ? 'deleted' : f.new ? 'added' : f.renamed ? 'renamed' : 'modified',
        binary: false,   // parse-diff marks binary via `chunks.length === 0`; refine here
        hunks: f.chunks.map((c, hi) => ({
          id: `${fileId}:h${hi}`,    // Opaque Hunk.id per D-17 — downstream tools depend on this
          header: c.content,
          lines: c.changes.map((ch, li) => lineFromChange(ch, `${fileId}:h${hi}:l${li}`)),
        })),
      };
    }),
    totalHunks: files.reduce((sum, f) => sum + f.chunks.length, 0),
  };
}
```

**Handling rename/delete/binary hunks:**
- `parse-diff` reports `from` and `to`; rename = `from !== to && !deleted && !new`.
- Binary files appear with `chunks.length === 0`. The UI-SPEC doesn't spec a binary state in Phase 1; the `DiffView` wrapper should skip binary files with a small placeholder row (or filter them out). Planner decision — either flag them in `status: 'binary'` or fold into `status: 'modified'` with `binary: true`.
- Delete diffs have all `-` lines, `side: 'LEFT'` only; `@git-diff-view/react` handles this natively.

### Pattern 7: Shiki Server-Side Highlighting with LRU Cache

**What:** On `start_review`, for each file in the diff, highlight each hunk's added/context lines once and stash tokens in an LRU keyed by `(path, headSha)`. Push tokens in the SSE `snapshot` payload.

**Why:** The browser never runs a highlighter — zero CPU on the paint path. Cache key `(path, headSha)` means a repeat `/review` on the same PR reuses tokens.

**Example:**

```typescript
// server/src/highlight/shiki.ts
import { createHighlighter } from 'shiki';
import { LRUCache } from 'lru-cache';   // optional; Map works for Phase 1's single-PR scope

let hl: Awaited<ReturnType<typeof createHighlighter>> | null = null;
const cache = new Map<string, HunkTokens[]>();

async function getHighlighter() {
  if (!hl) {
    hl = await createHighlighter({
      themes: ['github-dark'],
      langs: ['typescript', 'javascript', 'tsx', 'jsx', 'json', 'md', 'css', 'html', 'bash', 'python', 'go', 'rust'],
    });
  }
  return hl;
}

export async function highlightHunks(filePath: string, headSha: string, hunks: Hunk[]): Promise<HunkTokens[]> {
  const key = `${filePath}@${headSha}`;
  if (cache.has(key)) return cache.get(key)!;
  const h = await getHighlighter();
  const lang = detectLang(filePath);   // fallback 'plaintext'
  const tokens = hunks.map((hunk) =>
    hunk.lines.map((line) => h.codeToTokensBase(line.text, { lang, theme: 'github-dark' }))
  );
  cache.set(key, tokens);
  return tokens;
}
```

Consumer: `@git-diff-view/react` accepts pre-computed tokens via its `renderContent` / extendData hooks. (Exact API to be verified at implementation time against `@git-diff-view/react@0.1.3`'s README, since the component library is young.)

### Anti-Patterns to Avoid

- **`console.log` anywhere in server code:** corrupts the MCP JSON-RPC channel on stdout. Enforce via an ESLint rule: `no-console: ["error", { allow: ["error", "warn"] }]`. `console.error` writes to stderr and is safe. [CITED: ARCHITECTURE.md AP2]
- **`commands/` inside `.claude-plugin/`:** documented common mistake; plugin won't load. [CITED: https://code.claude.com/docs/en/plugins-reference/]
- **Binding `0.0.0.0` or `::`:** defeats SEC-01 entirely. Only `127.0.0.1`. [CITED: PITFALLS.md Pitfall 6]
- **Serving without Host-header validation:** DNS rebinding completely bypasses origin checks. [CITED: PITFALLS.md Pitfall 6]
- **Inline scripts in index.html:** breaks CSP. The one script tag is `<script type="module" src="/assets/main-[hash].js" nonce="__NONCE__">` with the nonce substituted at serve time.
- **`Secure: true` on the session cookie:** 127.0.0.1 has no TLS; `Secure: true` makes the cookie never sent. Use `Secure: false` with `SameSite: Strict` + `httpOnly`.
- **Detached background processes:** Never `spawn(..., {detached: true, stdio: 'ignore'})`. The plugin lifetime = Claude Code lifetime. [CITED: ARCHITECTURE.md Anti-Pattern 1]
- **Optimistic UI:** Browser POSTs → wait for SSE echo. No local state mutation ahead of server confirmation. [CITED: ARCHITECTURE.md Anti-Pattern 3] (Phase 1 has no POSTs that mutate state beyond adopt; relevant for Phase 2+.)
- **Global keydown listeners in Phase 1:** Per UI-SPEC §"Interaction Contract": the app shell must not capture global key events in Phase 1 — Phase 3's keyboard-shortcut layer depends on a clean slate.
- **Hand-rolling the CSP header via `c.header('Content-Security-Policy', ...)`:** You'll forget to thread the nonce. Use `hono/secure-headers` + `NONCE` and `c.get('secureHeadersNonce')`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parsing unified diff | Line-by-line splitter | `parse-diff` | Rename/copy detection, binary markers, `\ No newline at end of file`, whitespace-only hunks are all edge cases you'll get wrong |
| CSP header assembly with nonce | Manual header string | `hono/secure-headers` + `NONCE` | Threading the same nonce through the header AND the script tag at request scope is exactly what `secureHeaders` does; you'll drift without it |
| SSE framing | Raw `reply.raw.write(\`event: ...\ndata: ...\n\n\`)` | `streamSSE()` + `writeSSE()` | Handles chunking, heartbeats, abort propagation, backpressure |
| Atomic file writes | `fs.writeFile` (silently partial on crash) | `write-file-atomic` | Writes to temp + rename atomically; crash-safe per D-04 |
| Cross-process file locks | `fs.open(..., 'wx')` hacks | `proper-lockfile` | Handles stale lock cleanup, mtime refresh, retries |
| Port selection | Hardcoded + try/catch fallback | `port: 0` + read from `serve()` info callback | OS does this for free; no retry loop; no race |
| Syntax highlighting | Regex-based tokenizer | Shiki | VS Code-grade TextMate grammars; offline; zero runtime eval |
| MCP tool validation | Manual typeof checks | zod + `registerTool` | SDK validates inputs against the schema before your handler runs; schema doubles as LLM-visible docs |
| Launching default browser | `execa('open', [url])` | `open` npm package | Handles macOS vs other platforms; already the recommended wrapper; if we ever want xdg-open/start fallbacks |
| PR number-vs-URL detection | Regex on the input | Pass through to `gh` — it auto-detects | `gh pr view <NUMBER_OR_URL>` handles both. Only validate shape when `--local` is NOT specified |
| Git ref validation | "Just try `git diff` and catch error" | `git rev-parse --verify <ref>` first | Fail-fast with a clean error; the diff command's error message is noisy |

**Key insight:** Every "small utility" you'd reach for in Phase 1 has a mature library that handles edge cases you don't want to discover in production. The only substantial hand-rolled pieces are: (a) the ingestion adapter's argv dispatch (because it's application-specific), (b) the `DiffModel` shaper (because the schema is ours), and (c) the Hono middleware chain (because the order and failure modes are ours).

## Runtime State Inventory

This is a greenfield phase — no existing runtime state to migrate. But this section documents what Phase 1 **creates** so future phases know what they inherit.

| Category | Items Created | Action Required |
|----------|---------------|------------------|
| Stored data | `${CLAUDE_PLUGIN_DATA}/reviews/<pr-key>/state.json` for each PR reviewed; lockfile sibling `state.json.lock` | Phase 2 extends with per-mutation writes; no migration yet |
| Live service config | None | — |
| OS-registered state | None (plugin lifetime = Claude Code lifetime) | — |
| Secrets/env vars | **Reads** `CLAUDE_PLUGIN_DATA` env var (set by Claude Code); no new secrets introduced | Document in README if deployed outside Claude Code |
| Build artifacts | `web/dist/` (Vite output) + `server/dist/` (tsc output) — both `.gitignore`d | `pnpm build` regenerates |

**Nothing found in category:** No migration needed for Phase 1; stated explicitly for the planner.

## Common Pitfalls

### Pitfall 1: stdout-corruption from non-logger code paths

**What goes wrong:** A `console.log` buried in a dependency (or a dev trying `console.log('debug')`) writes to stdout, corrupts the JSON-RPC channel, Claude Code sees "invalid JSON" and the MCP server "mysteriously breaks".

**Why it happens:** Stdout is the JSON-RPC transport. Anything writing to stdout corrupts the protocol.

**How to avoid:**
1. ESLint rule `no-console: ["error", { allow: ["error", "warn"] }]` on `server/`.
2. A tiny `logger.ts` that only writes to stderr via `process.stderr.write` — import it everywhere instead of console.
3. At process start, hijack stdout defensively: `process.stdout.write = new Proxy(...)` is overkill; a simpler guard is to trust the ESLint rule and add a one-line runtime check in dev.

**Warning signs:** Claude Code logs show "Invalid JSON-RPC message"; MCP tool calls start timing out; the plugin works in isolation but breaks under Claude Code.

**Phase-1 severity:** BLOCKER. If this hits, the plugin never actually works under Claude Code.

### Pitfall 2: Token in URL leaks to browser history / referer

**What goes wrong:** The launch URL `http://127.0.0.1:PORT/?token=abc` is stored in browser history. If the user ever navigates to an external link from the review page, the `Referer` header may leak `abc`.

**Why it happens:** Query strings persist in history; referer headers include them.

**How to avoid:** Per D-09, the entry JS wipes the query via `history.replaceState('', '', '/')` **before** any external resource could be fetched. Also: a strict CSP `connect-src 'self'` means the page can't fetch external resources; `frame-ancestors 'none'` + `object-src 'none'` close embed vectors. The token in history for a few milliseconds is an acceptable residual risk for a 256-bit token on localhost.

**Warning signs:** Token visible in browser history's URL list; token visible in Network tab's Referer header.

**Severity:** SERIOUS — mitigated to LOW by the `history.replaceState` + CSP combo.

### Pitfall 3: `@git-diff-view/react` is at version 0.1.3

**What goes wrong:** Pre-1.0 libraries can have breaking API changes between minor releases, insufficient documentation for edge cases (token hook, hunk anchor props), and quirks we discover during implementation.

**Why it happens:** [VERIFIED: npm view] shows `@git-diff-view/react@0.1.3` was published 2026-03-19; it's actively developed but young.

**How to avoid:**
- Pin the exact version (`0.1.3`, not `^0.1.3`). Upgrade is an explicit decision.
- Implement the simplest possible wrapper in Phase 1 (`<DiffView diff={diffModel} />`) and defer Shiki token integration behind a named prop. If the token hook API is unstable, Phase 1 can ship without syntax highlighting temporarily — except D-22 says it ships in Phase 1. So flag this as a risk.
- Have a rollback plan: `react-diff-viewer-continued@4.25.9` is the documented fallback (CLAUDE.md §4). It takes two strings, not a diff — would require reconstructing old/new from the patch, losing rename/copy info. Ugly but works.

**Warning signs:** API calls that don't match the README; unexpected prop types; missing exports; runtime errors about undefined methods.

**Severity:** MODERATE. Probability of needing fallback = low to moderate; impact = would cost 1-2 days to swap.

### Pitfall 4: `gh` CLI auth in unexpected environments

**What goes wrong:** User hasn't run `gh auth login`; or `gh auth token` returns empty; or `GH_TOKEN` env var shadows gh's store; or user is inside a `cwd` that isn't a git repo.

**Why it happens:** Phase 1 inherits user's gh auth per D-15 — but "inherits" has edge cases.

**How to avoid:**
- On `gh pr view` failure, parse stderr for recognizable patterns ("gh auth login", "no default repository", etc.) and return a friendly tool error: `"gh CLI is not authenticated. Run 'gh auth login' and try again."` rather than surfacing raw gh output.
- For `/review <number>` (without URL), the plugin must infer repo — `gh repo view --json name,owner` from the cwd. If that fails (not in a git repo, or no default repo set), return an actionable error: `"Couldn't infer repo from $(pwd). Pass the full PR URL instead."`

**Warning signs:** `start_review` returns raw "gh: command not found" or gh's opaque error messages; users confused about what to do next.

**Severity:** MODERATE. Non-blocking but hurts UX.

### Pitfall 5: `CLAUDE_PLUGIN_DATA` not set outside Claude Code

**What goes wrong:** In `claude --plugin-dir ./` dev workflow, `CLAUDE_PLUGIN_DATA` may or may not be populated; in tests, it definitely isn't.

**Why it happens:** The env var is provided by Claude Code at plugin spawn. Outside that context, it's `undefined`.

**How to avoid:** In `server/src/persist/paths.ts`, fall back to a local `.planning/.cache/reviews/` (inside the plugin repo, gitignored) when `CLAUDE_PLUGIN_DATA` is absent, and log to stderr that fallback is in use. In tests, use a `tmp` directory explicitly.

**Warning signs:** `ENOENT` errors at `fs.mkdir`; state written to `/reviews/...` (root) if `process.env.CLAUDE_PLUGIN_DATA` is `undefined` and you concatenate without a fallback.

**Severity:** MODERATE. Easy to fix; easy to miss in dev vs prod split.

### Pitfall 6: Hono middleware order silently wrong

**What goes wrong:** `tokenValidate` registered before `hostValidate`; an attacker's DNS-rebinding request with a forged Host hits token-validate first, which (correctly) fails on missing token — but the error response still includes CSP headers computed against the forged Host. Not a direct exploit; a defense-in-depth miss that will show up in audit.

**Why it happens:** Hono's `app.use('*', ...)` registers middleware in insertion order. Re-ordering is a one-character diff that's easy to misread.

**How to avoid:** Write an integration test that verifies a forged-Host request gets 400 (not 403). The distinction between 400 (Host) and 403 (Token) is the canary for correct ordering.

**Severity:** MODERATE. Surfaces in validation.

### Pitfall 7: Shiki bundle + `@git-diff-view/react` token hook API mismatch

**What goes wrong:** Shiki pre-computes tokens in one format; `@git-diff-view/react` expects another; the bridge code ends up hand-translating, which is brittle.

**How to avoid:** Before writing the Shiki integration, read `@git-diff-view/react@0.1.3`'s README and examples to confirm the token hook accepts raw strings + highlighter callback (preferred) or pre-computed token arrays. If the former, Shiki's `codeToHtml` output is directly usable. If the latter, a thin adapter is needed. The integration should be isolated to ONE file (`highlight/shiki.ts` on server + a small `components/DiffView.tsx` adapter) so swapping it is contained.

**Severity:** MODERATE → LOW once API is confirmed.

### Pitfall 8: SSE keep-alive vs client disconnect handling

**What goes wrong:** Client closes tab; server's `streamSSE` callback keeps writing to a dead connection; `write` eventually throws; no cleanup.

**How to avoid:** Use `stream.onAbort` (Hono's documented pattern) to stop write loops and release any held resources. For Phase 1 there are no held resources (no bus subscription yet), but this is the scaffold Phase 2 attaches to.

**Severity:** LOW in Phase 1 (no resources); SERIOUS in Phase 2.

### Pitfall 9: Vite `dev` vs `build` mismatch

**What goes wrong:** `vite dev` HMR works; `vite build` produces a `dist/` with hashed asset names; Hono's `serveStatic` serves the wrong path because `index.html` references `/assets/main-[hash].js` but the nonce-substitution code expects `/assets/main.js`.

**How to avoid:** Nonce substitution at serve time must read `index.html` from `dist/` at request time (or on boot into memory) and do a single string replace `__NONCE__` → `nonce-attribute`. Vite emits the correct hashed names; our server only has to inject the nonce into the `<script>` tag — we don't touch the `src` attribute.

Concretely: use an `index.html.tpl` with `__NONCE__` placeholder; Vite processes it; copy to `dist/`; Hono reads `dist/index.html`, substitutes, serves.

**Severity:** MODERATE. A 15-minute fix when it hits; harder to see in code review.

## Code Examples

### Example 1: `commands/review.md` (the slash-command prompt)

```markdown
---
description: Open a PR review workspace in the browser
argument-hint: <pr-url-or-number> | --local <base> <head>
---

The user wants to review a pull request. Call the `start_review` MCP tool now with one of:

- `{ source: { kind: "github", url: "https://..." } }` if the user provided a full GitHub PR URL.
- `{ source: { kind: "github", number: N } }` if the user provided only a number (the tool will infer owner/repo from the current working directory's git remote).
- `{ source: { kind: "local", base: "<ref>", head: "<ref>" } }` if the user passed `--local <base> <head>`.

After the tool returns, share the review summary it produces with the user verbatim. The browser will have opened automatically; the tool's return includes a fallback URL in case auto-launch failed.

User argument: $ARGUMENTS
```

Source pattern: [CITED: https://code.claude.com/docs/en/plugins-reference/] (commands/*.md frontmatter + `$ARGUMENTS` substitution).

### Example 2: `start_review` MCP tool

```typescript
// server/src/mcp/tools/start-review.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const Source = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('github'), url: z.string().url() }),
  z.object({ kind: z.literal('github'), number: z.number().int().positive() }),
  z.object({ kind: z.literal('local'), base: z.string().min(1), head: z.string().min(1) }),
]);
const Input = z.object({ source: Source });

export function registerStartReview(mcp: McpServer, manager: SessionManager) {
  mcp.registerTool(
    'start_review',
    {
      title: 'Start Review',
      description:
        'Open a local browser review workspace for a GitHub PR or a local-branch diff. Fetches the diff, parses hunks, persists state, and launches the default browser. Returns a paraphrased summary and the review URL.',
      inputSchema: Input,
    },
    async ({ source }) => {
      try {
        const session = await manager.startReview(source);
        const text = renderSummary(session, manager.getLaunchUrl());
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: renderFriendlyError(err) }],
          isError: true,
        };
      }
    }
  );
}

function renderSummary(s: ReviewSession, url: string): string {
  const { pr, diff } = s;
  return [
    `**${pr.title}** by @${pr.author}`,
    `${pr.baseBranch} → ${pr.headBranch}  (+${pr.additions}/-${pr.deletions}, ${pr.filesChanged} files)`,
    '',
    // Paraphrased PR body (Pitfall 11 mitigation, D-20).
    paraphrase(pr.description),
    '',
    `Review open at: ${url}`,
  ].join('\n');
}
```

### Example 3: Browser entry (token adopt + EventSource)

```typescript
// web/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

async function bootstrap() {
  // Extract token from URL query param
  const params = new URLSearchParams(location.search);
  const token = params.get('token');
  const sessionKey = params.get('session') ?? inferFromPath();

  if (!token) {
    return renderFatal('Missing session token. Re-run /review.');
  }

  // 1. Adopt token: server sets httpOnly cookie
  const adoptRes = await fetch('/api/session/adopt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    credentials: 'same-origin',
  });
  if (!adoptRes.ok) {
    return renderFatal('Session rejected. Re-run /review.');
  }

  // 2. Wipe token from URL
  history.replaceState('', '', '/');

  // 3. Open EventSource
  const es = new EventSource(`/api/events?session=${sessionKey}`, { withCredentials: true });
  es.addEventListener('snapshot', (ev) => {
    const session = JSON.parse((ev as MessageEvent).data);
    renderApp(session);
  });
  es.onerror = () => {
    // Phase 1: disconnect is terminal. Phase 2 will reconnect.
    markSessionExpired();
  };
}

function renderApp(session: ReviewSession) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App session={session} />
    </StrictMode>
  );
}

bootstrap().catch((e) => renderFatal(e.message));
```

### Example 4: Required `curl` probes (from ROADMAP success criterion #3)

```bash
# Probe 1: 127.0.0.1 bind only (not 0.0.0.0)
curl -v --max-time 2 http://0.0.0.0:$PORT/    # → should fail / timeout / refused
curl -v --max-time 2 http://127.0.0.1:$PORT/  # → 200 OK (with token+adopt flow)

# Probe 2: Missing token → 403
curl -v http://127.0.0.1:$PORT/api/events?session=test   # → 403 Forbidden

# Probe 3: Wrong Host header → 400 (DNS rebinding defense)
curl -v -H 'Host: evil.com' http://127.0.0.1:$PORT/  # → 400 Bad host

# Probe 4: CSP present on GET /
curl -sI http://127.0.0.1:$PORT/ | grep -i content-security-policy
# → Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-...'; ...
```

### Example 5: `.mcp.json` at plugin root

```json
{
  "mcpServers": {
    "git-review-plugin": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/server/dist/index.js"],
      "env": {}
    }
  }
}
```

Source: [CITED: https://code.claude.com/docs/en/plugins-reference/]

### Example 6: `.claude-plugin/plugin.json`

```json
{
  "name": "git-review-plugin",
  "version": "0.1.0",
  "description": "Pair-review workflow with LLM in a local browser GUI",
  "author": { "name": "Connor Barr" },
  "commands": "./commands/",
  "mcpServers": "./.mcp.json"
}
```

## State of the Art

| Old Approach | Current Approach (as locked by CONTEXT) | When Changed | Impact |
|--------------|------------------------------------------|--------------|--------|
| WebSocket via `ws` for full-duplex UI | SSE (`streamSSE`) + HTTP POST | Resolved in discussion 2026-04-16 → D-01 | Simpler transport; no WS dep; matches asymmetric broadcast pattern |
| `better-sqlite3` with `state.db` | Atomic JSON via `write-file-atomic` + `proper-lockfile` | Resolved in discussion 2026-04-16 → D-04 | No native addon; grep-able state; reducer-as-transaction model |
| Hand-rolled CSP header | `hono/secure-headers` with `NONCE` | This research document | One audit surface; automatic nonce threading |
| Hand-rolled SSE framing | `streamSSE` + `writeSSE` | This research document | Less code; built-in abort/heartbeat |
| GitHub `position` field for comments | `line` + `side` + `start_line` + `start_side` | Owned by Phase 6, but `DiffModel` must carry `diffPosition` AND `(fileLine, side)` from day 1 per D-17 | Phase 1 responsibility: don't lose `fileLine`+`side`; `parse-diff` gives both |
| Monaco diff editor | `@git-diff-view/react` | Locked in CLAUDE.md / STACK.md | Purpose-built for unified diffs, 100x smaller |

**Deprecated / intentionally avoided:**
- `ws` (WebSocket) — overridden by D-01.
- `better-sqlite3` — overridden by D-04.
- `node:sqlite` (Node built-in) — still experimental in Node 22-24, not considered.
- Octokit — deferred to Phase 6.
- `position` field in any GitHub API payload — Phase 1 doesn't submit comments but the schema discipline starts here.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@git-diff-view/react@0.1.3`'s token hook accepts Shiki `codeToTokensBase` output with minimal adaptation | Pattern 7 (Shiki) | May need to write an adapter layer; worst case defer Shiki to Phase 3 (violates D-22) |
| A2 | `secureHeaders({ contentSecurityPolicy: { ... } })` in hono/secure-headers sends exactly one `Content-Security-Policy` header per response | Pattern 2 | If middleware emits multiple headers or drops one, CSP is silently weakened |
| A3 | `@hono/node-server`'s `serve()` returns a Node `http.Server` with `.close(cb)` signature that behaves exactly like Node's built-in | Pattern 1 (lifecycle) | If `.close()` doesn't drain SSE connections, SIGTERM could hang. Mitigation: add a timeout on shutdown |
| A4 | macOS `open` command returns 0 regardless of actual browser launch (unreliable signal for PLUG-03) | D-13 | None — D-13 already says "always print URL first"; assumption is baked in |
| A5 | `CLAUDE_PLUGIN_DATA` is set when Claude Code spawns the MCP server via `.mcp.json` | Pitfall 5 | If not, path fallback to `.planning/.cache/reviews/` is the documented mitigation |
| A6 | `parse-diff@0.11.1` preserves original-position numbering needed for future `diffPosition` in GitHub API calls | Pattern 6 | If not, we compute it manually by counting hunk-header offsets; one-time fix |
| A7 | The single per-launch token is shared across all PR sessions within one plugin process lifetime (rather than per-session) | D-08 interpretation | CONTEXT is ambiguous; I'm reading "per-launch" as "per plugin process" per discussion. If "per session" was intended, token handling changes materially |
| A8 | `gh pr diff` emits a unified diff compatible with `parse-diff` out of the box (no pre-processing needed) | Pattern 6 | If `gh` output has GitHub-specific prefixes/suffixes, `parse-diff` will skip them or complain. Low risk — it's standard unified-diff format |
| A9 | Shiki's default `github-dark` theme's color tokens are close enough to UI-SPEC's `--color-diff-*` that we don't need theme overrides beyond per-token coloring | Pattern 7 | If colors clash, we build a custom minimal theme; 1-2 hour fix |
| A10 | Node 22 LTS is a safe minimum target even though user has Node 24 installed | Stack | If we need a 24-only feature, we bump the floor; currently nothing in stack requires >22 |

**User confirmation needed on:** A7 (token scope — per-launch vs per-session). The rest are low-risk and can be resolved during implementation.

## Open Questions

1. **Exact token-hook API of `@git-diff-view/react@0.1.3`**
   - What we know: The library advertises token system for inline word-level diff highlighting; v0.x so API may be fluid.
   - What's unclear: Does it accept Shiki's `ThemedToken[][]` shape, or only HTML strings, or a highlighter callback?
   - Recommendation: During Wave 1 scaffolding, write a 20-line spike (`web/src/components/DiffView.spike.tsx`) that imports the component and renders a 2-hunk fixture with and without tokens. Confirm the API shape before wiring Shiki. If the shape is incompatible, fall back to shipping Phase 1 without highlighting and add a Phase 1 addendum — but this violates D-22, so surface it to the user.

2. **Is per-session cookie path `/` safe or should it be `/api/`?**
   - What we know: The cookie only needs to be sent with `/api/*` requests (SSE, adopt, future POSTs); static assets `/assets/*` don't need it.
   - What's unclear: Narrower `Path=/api/` has no practical security benefit on `SameSite=Strict` + host-validated + single-user localhost.
   - Recommendation: `Path=/` for simplicity. Document the choice in the middleware comment.

3. **Should the nonce rotate per-request or per-session?**
   - What we know: `secureHeaders` with `NONCE` generates a fresh nonce per request; `c.get('secureHeadersNonce')` returns it; the HTML template pulls it in via placeholder substitution.
   - What's unclear: Nothing — per-request is correct CSP hygiene. But only the `GET /` response uses the nonce (the SPA's single entry script); subsequent `/api/*` responses don't include nonces because they're JSON, not HTML.
   - Recommendation: Use default per-request behavior.

4. **Tailwind 4 CSS custom props in CSP**
   - What we know: UI-SPEC's CSP says `style-src 'self' 'unsafe-inline'`. The UI-SPEC justification cites Tailwind 4 emitting inline custom property values at runtime.
   - What's unclear: Is `'unsafe-inline'` on style-src actually necessary, or does Tailwind 4 compile to static classes that only need `'self'`?
   - Recommendation: Honor UI-SPEC (which is the approved visual contract) and use `'unsafe-inline'`. Revisit in Phase 7 hardening if the actual build output proves it's unnecessary.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js >=22 | MCP SDK, stack | ✓ | 24.10.0 | — |
| `gh` CLI | INGEST-01 (GitHub mode) | ✓ | 2.60.1 | Tool reports friendly error on missing `gh`; local mode still works |
| `git` CLI | INGEST-02 (local mode) | ✓ | 2.50.1 | Required; no fallback |
| macOS `open` | PLUG-02 browser launch | ✓ | (system, `/usr/bin/open`) | D-13: print URL to stderr unconditionally |
| `pnpm` | Package manager | ✓ | 10.3.0 | `npm` works too (verified 11.6.1 installed) |
| `npm` | Fallback package manager | ✓ | 11.6.1 | — |
| `claude` CLI | Plugin dev loop (`claude --plugin-dir ./`) | ✓ | (installed at `~/.local/bin/claude`) | — |
| `CLAUDE_PLUGIN_DATA` env | Persistence path | Runtime-provided by Claude Code | — | Fallback to `.planning/.cache/reviews/` in dev (Pitfall 5) |
| Network to GitHub (via `gh`) | INGEST-01 | Assumed available at runtime | — | Local mode is the always-available path |

**Missing dependencies with no fallback:** None. Everything required is present or has a documented fallback.

**Missing dependencies with fallback:** None in this environment.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` 2.x (installs alongside Vite; no version pin in Phase 1) |
| Config file | `server/vitest.config.ts` and `web/vitest.config.ts` (none exist yet — Wave 0) |
| Quick run command (server) | `pnpm --filter server test -- --run --bail=1` (single pass, stop on first failure) |
| Quick run command (web) | `pnpm --filter web test -- --run --bail=1` |
| Full suite command | `pnpm -r test -- --run` (all workspaces) |
| Probe script | `scripts/security-probes.sh` (to be created — curl probes per Example 4) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| PLUG-01 (github url) | `/review <url>` triggers `start_review` with `{kind:'github',url}` | integration | `pnpm --filter server test -- mcp/start-review.test.ts -t "github url"` | ❌ Wave 0 |
| PLUG-01 (github number) | `/review N` infers repo via `gh repo view` and calls with `{kind:'github',number}` | integration | `... -t "github number with repo-infer"` | ❌ Wave 0 |
| PLUG-01 (local) | `/review --local <base> <head>` calls with `{kind:'local',base,head}` | integration | `... -t "local branch"` | ❌ Wave 0 |
| PLUG-02 | Browser auto-launch invoked after server listens | unit (with `open` stub) | `pnpm --filter server test -- browser-launch.test.ts` | ❌ Wave 0 |
| PLUG-03 | URL printed to stderr BEFORE `open` call | unit | `... -t "stderr URL echo before browser launch"` | ❌ Wave 0 |
| INGEST-01 | `gh pr view` + `gh pr diff` with correct args; parse → DiffModel | integration (execa stub) | `pnpm --filter server test -- ingest/github.test.ts` | ❌ Wave 0 |
| INGEST-02 | `git diff base...head` via execa; parse → DiffModel | integration (execa stub) | `pnpm --filter server test -- ingest/local.test.ts` | ❌ Wave 0 |
| SEC-01 | Hono `serve()` called with `hostname: '127.0.0.1'`, `port: 0` | unit (inspect options) | `pnpm --filter server test -- http/server.test.ts -t "binds 127.0.0.1 only"` | ❌ Wave 0 |
| SEC-01 (runtime) | `curl http://0.0.0.0:PORT/` fails; `curl http://127.0.0.1:PORT/` succeeds | manual-automated | `bash scripts/security-probes.sh` | ❌ Wave 0 |
| SEC-02 | Request without `X-Review-Token` → 403 | integration (supertest-style via fetch) | `pnpm --filter server test -- http/token-validate.test.ts` | ❌ Wave 0 |
| SEC-02 | Request with wrong token → 403 | integration | `... -t "wrong token rejected"` | ❌ Wave 0 |
| SEC-02 | Request with correct token+cookie → 200 | integration | `... -t "correct double-submit accepted"` | ❌ Wave 0 |
| SEC-03 | Request with `Host: evil.com` → 400 | integration | `pnpm --filter server test -- http/host-validate.test.ts` | ❌ Wave 0 |
| SEC-03 | Request with `Host: 127.0.0.1:<port>` → passes middleware | integration | `... -t "localhost host accepted"` | ❌ Wave 0 |
| SEC-04 | `GET /` response includes `Content-Security-Policy` header with expected directives | integration | `pnpm --filter server test -- http/secure-headers.test.ts` | ❌ Wave 0 |
| SEC-04 | `<script>` tag in served HTML carries `nonce=` attribute matching CSP | integration | `... -t "nonce in HTML matches CSP nonce"` | ❌ Wave 0 |
| D-17 (opaque IDs) | `parse-diff → DiffModel` produces `Hunk.id = ${fileId}:h${index}` | unit | `pnpm --filter server test -- ingest/parse.test.ts` | ❌ Wave 0 |
| D-20 (summary content) | `start_review` return includes title, author, stats, paraphrase, URL | integration | `... -t "start_review return shape"` | ❌ Wave 0 |
| D-22 (Shiki) | Snapshot payload includes `shikiTokens[fileId][hunkId]` | integration | `pnpm --filter server test -- highlight/shiki.test.ts` | ❌ Wave 0 |
| UI-SPEC state: Loading | Rendered when snapshot not yet received | component | `pnpm --filter web test -- LoadingState.test.tsx` | ❌ Wave 0 |
| UI-SPEC state: Empty | Rendered when `diff.files.length === 0` | component | `pnpm --filter web test -- EmptyState.test.tsx` | ❌ Wave 0 |
| UI-SPEC state: Error | Rendered on EventSource error or snapshot error | component | `pnpm --filter web test -- ErrorState.test.tsx` | ❌ Wave 0 |
| UI-SPEC state: DiffLoaded | Rendered when snapshot arrives with files | component | `pnpm --filter web test -- DiffView.test.tsx` | ❌ Wave 0 |
| Phase success criterion 4 | D-01 and D-04 documented in PROJECT.md Key Decisions | manual | grep PROJECT.md for D-01, D-04 | ❌ Wave 0 (planner may sequence this as a documentation task) |

### Sampling Rate

- **Per task commit:** `pnpm --filter <affected> test -- --run --bail=1` (only the workspace changed).
- **Per wave merge:** `pnpm -r test -- --run` (full suite, both workspaces).
- **Phase gate:** Full suite green + `bash scripts/security-probes.sh` passes + manual walkthrough of the 4 UI-SPEC states on a fixture PR (one GitHub, one local) before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `server/vitest.config.ts` — vitest base config for the server workspace
- [ ] `web/vitest.config.ts` — vitest base config for the web workspace (happy-dom or jsdom for component tests)
- [ ] `server/src/test/fixtures/` — canned diff text (one GitHub-style, one `git diff` output), canned `gh pr view --json` output
- [ ] `server/src/test/helpers/build-test-app.ts` — shared helper to build a Hono app with mock SessionManager for middleware tests
- [ ] `scripts/security-probes.sh` — the four curl probes (bind, token, host, CSP) returning non-zero on any failure
- [ ] `web/src/test/setup.ts` — happy-dom setup + mock EventSource
- [ ] Framework install (already in stack but not installed): `pnpm -w add -D vitest @vitest/ui happy-dom @vitejs/plugin-react`
- [ ] ESLint install + `no-console` rule: `pnpm -w add -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin` with rule `no-console: ["error", { allow: ["error", "warn"] }]` on `server/`

Critical: the security-probes script is the single verification surface for ROADMAP success criterion #3. It must be green before Phase 1 gates as done.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | Yes — local-only, per-launch token | Random 256-bit token; `crypto.randomBytes(32).toString('base64url')`; cookie + header double-submit |
| V3 Session Management | Yes | Token lives only in server process memory; cookie is `httpOnly; SameSite=Strict; Path=/`; session keyed by `pr-key` (not the token) |
| V4 Access Control | Yes (origin) | Host header allowlist; 127.0.0.1-only bind; CSP `connect-src 'self'` |
| V5 Input Validation | Yes | `zod` discriminated-union schemas on MCP tool input; `z.string().url()` on GitHub URL; `git rev-parse --verify` for local refs before use |
| V6 Cryptography | Yes (narrow) | Only `crypto.randomBytes` for token generation; no hand-rolled crypto; `timingSafeEqual` for token comparison (SHOULD, MAY defer to Phase 7 hardening) |
| V14 Configuration | Yes | CSP via `hono/secure-headers`; explicit directive list; `frame-ancestors 'none'`; `object-src 'none'` |

### Known Threat Patterns for localhost web servers

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| DNS rebinding (attacker webpage binds a hostname to 127.0.0.1) | Spoofing | Strict Host allowlist (`127.0.0.1:<port>`, `localhost:<port>`) — 400 everything else. `SEC-03`, D-11. |
| CSRF from a visited website to localhost endpoint | Tampering | Per-launch random token + cookie `SameSite=Strict` + `X-Review-Token` double-submit on POST. `SEC-02`, D-08..D-10. |
| LAN-side access when bound to 0.0.0.0 | Information disclosure / Elevation | Bind `127.0.0.1` only. `SEC-01`, D-07. |
| XSS via malicious PR content rendered in diff | Tampering | Strict CSP + React auto-escaping + diff text rendered as text (not HTML). `SEC-04`. |
| Token leak via browser history / referer | Information disclosure | `history.replaceState` immediately after adopt; CSP `connect-src 'self'` blocks external referers. D-09. |
| Clickjacking / iframe embedding | Spoofing | `frame-ancestors 'none'` in CSP. |
| stdout-contamination of MCP JSON-RPC by debug logs | Repudiation (protocol corruption) | ESLint `no-console` rule; dedicated stderr-only logger. (Anti-Pattern 2.) |

**Note on "single-user, personal tool" framing:** Even though the tool is personal, the browser is NOT a trusted context. The author's browser routinely visits untrusted sites; any of them can attempt requests at the known-local port. "Single-user" does not lower the security bar; every control in CONTEXT.md is load-bearing.

## Risk Register — BLOCKERS That Must Close in Phase 1

These are the pitfalls/risks that CANNOT be retrofitted later without rewriting the control plane. Every one of them has an SEC-0X requirement directly or indirectly.

| # | Risk | Requirement | Mitigation (ships in Phase 1) | Verification |
|---|------|-------------|-------------------------------|--------------|
| R1 | LAN-side access (bind 0.0.0.0 leaks the server to the network) | SEC-01 | `serve({ hostname: '127.0.0.1', port: 0 })` | curl probe 1 |
| R2 | DNS rebinding bypasses origin checks, allows arbitrary-site CSRF | SEC-03 | `hostValidate` middleware; strict allowlist | curl probe 3 |
| R3 | CSRF from any visited site → POSTs to plugin | SEC-02 | Per-launch token + cookie + header double-submit + `SameSite=Strict` | curl probe 2 + integration tests |
| R4 | XSS via PR-content injection in rendered diff | SEC-04 | CSP `default-src 'self'`, scripts nonce'd, React auto-escaping | curl probe 4 + component tests |
| R5 | stdout corruption kills MCP JSON-RPC silently | AP2 | stderr-only logger + ESLint `no-console` | unit test on logger; integration test that runs `start_review` and captures stdout for zero non-JSON lines |
| R6 | Port collision on startup causes undefined binding | Pitfall 16 | OS-assigned ephemeral port (`port: 0`) | starts-under-load test (stand up a dummy listener on the expected preferred port; Phase 1 uses 0 anyway so this is a belt-and-braces test) |
| R7 | Token leak via URL in history/referer | SEC-02 | `history.replaceState` in entry JS; CSP `connect-src 'self'` | manual browser check + component test |
| R8 | Opaque-ID schema not pre-populated → Phase 5 retrofit | PITFALLS.md #2 (BLOCKER for Phase 5; scaffolding due here per D-17) | `Hunk.id = ${fileId}:h${index}` from day one; `DiffLine` carries `fileLine`+`side`+`diffPosition` | unit test on parse shape |
| R9 | Browser launch fails silently | PLUG-03 | Always-print URL to stderr first, regardless of `open` outcome | unit test stubs `open` returning error; assert stderr contains URL |
| R10 | `CLAUDE_PLUGIN_DATA` undefined breaks persistence | Pitfall 5 (phase-1-specific) | Fallback to `.planning/.cache/reviews/` with logged warning | unit test on persist/paths |

All R1–R7 must be green via `scripts/security-probes.sh` + integration tests before the phase gates. R8–R10 are Phase-1-specific hygiene that prevents Phase 2+ retrofitting.

## Sources

### Primary (HIGH confidence)

- [Claude Code Plugins reference](https://code.claude.com/docs/en/plugins-reference/) — plugin manifest schema, `.mcp.json`, `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PLUGIN_DATA}`, directory placement rules (verified via Context7 `/websites/code_claude_en_plugins-reference`)
- [MCP TypeScript SDK docs](https://github.com/modelcontextprotocol/typescript-sdk) — `McpServer`, `StdioServerTransport`, `registerTool` with zod schema, stdout-corruption rule (verified via Context7 `/modelcontextprotocol/typescript-sdk`)
- [Hono docs](https://hono.dev/docs) — `secureHeaders` + CSP + `NONCE`, `streamSSE` + `writeSSE` + `onAbort`, `serve({fetch, port:0, hostname})` pattern, graceful shutdown with `server.close()`, `serveStatic` from `@hono/node-server/serve-static` (verified via Context7 `/websites/hono_dev`)
- npm registry (verified 2026-04-16): versions listed in Standard Stack table above

### Secondary (MEDIUM confidence)

- `.planning/research/ARCHITECTURE.md` — canonical for MCP + HTTP co-process topology, event-sourced reducer pattern, dual-addressing, anti-patterns 1–6 (internal document; stack recommendations superseded by CONTEXT D-01/D-04 but architectural guidance is authoritative)
- `.planning/research/PITFALLS.md` — canonical for Pitfalls 1–24; ratings used verbatim where Phase 1 is in scope

### Tertiary (application context; no direct verification needed)

- `01-UI-SPEC.md` — the approved visual/interaction contract; all Phase-1 UI decisions flow from here

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — all versions verified via `npm view`; CONTEXT locks every substantive choice
- Architecture: **HIGH** — ARCHITECTURE.md + CONTEXT fully specify the topology; Hono SSE + `secureHeaders` patterns verified via Context7
- Security middleware: **HIGH** — controls map 1:1 to SEC-01..04; Hono's `secureHeaders` is the industry-standard CSP middleware for the framework; host-validate and token-validate are small, self-contained, testable
- Ingestion: **HIGH** — `gh` CLI output format is well-known; `parse-diff` has been stable for years; `git diff base...head` semantics are canonical
- Shiki + `@git-diff-view/react` token integration: **MEDIUM** — `@git-diff-view/react@0.1.3` is pre-1.0; token hook API not yet verified in-repo. Flagged in Open Questions #1 and Pitfall #3
- Runtime state inventory: N/A (greenfield)
- Validation architecture: **HIGH** — curl probes map directly to SEC requirements; vitest + component tests are industry standard

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (30 days — stack is stable; revisit if `@git-diff-view/react` or `hono` major version changes during implementation)

---

*Research for: Phase 1 — Plugin Skeleton + Secure Vertical Slice*
*Researched: 2026-04-16*
