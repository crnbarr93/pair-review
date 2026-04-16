# Architecture Research

**Domain:** Claude Code plugin + local web GUI + MCP-driven PR review
**Researched:** 2026-04-16
**Confidence:** HIGH for core topology (MCP lifecycle, process model); MEDIUM for UI-layer specifics (diff editor choice, state library)

---

## TL;DR

Run the MCP server and the web server as **a single Node process** spawned by Claude Code's plugin loader over stdio. All review state lives in that one process as a plain in-memory object, persisted to `.review/<pr-key>/state.json` on every mutation. The LLM mutates state via MCP tools; the browser observes state via an SSE stream and submits drafts via plain HTTP POST. GitHub ingestion uses `gh` CLI first, Octokit as fallback. The whole thing dies when Claude Code dies — no detached processes, no IPC, no ports to clean up manually.

**Smallest vertical slice (Phase 1 target):** `/review <pr>` spawns the plugin, fetches a PR via `gh`, parses hunks, opens a browser on a single-file diff view. One MCP tool — `show_hunk` — moves a cursor in shared state. The browser's SSE stream paints the highlight. No checklist, no comments, no GitHub submission. Proves the end-to-end control plane.

---

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                         Claude Code session                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  user types /review <pr-url>                                 │  │
│  │    ↓                                                         │  │
│  │  slash command prompt → LLM                                  │  │
│  │    ↓ (MCP tool calls over stdio: JSON-RPC)                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────┬───────────────────────┘
                                             │ stdio (stdin/stdout)
                                             │ spawned by Claude Code
                                             ▼
┌────────────────────────────────────────────────────────────────────┐
│     Plugin process  (single Node process — long-lived)              │
│  ┌─────────────────────┐      ┌──────────────────────────────┐     │
│  │  MCP server         │      │  HTTP + SSE web server       │     │
│  │  (stdio transport)  │      │  (Fastify on 127.0.0.1:rand) │     │
│  │                     │      │                              │     │
│  │  Tool surface:      │      │  Routes:                     │     │
│  │  - start_review     │      │  - GET  /                    │     │
│  │  - show_hunk        │      │  - GET  /assets/*            │     │
│  │  - set_summary      │      │  - GET  /api/state           │     │
│  │  - run_self_review  │      │  - GET  /api/events (SSE)    │     │
│  │  - draft_comment    │      │  - POST /api/comments        │     │
│  │  - update_comment   │      │  - POST /api/verdict         │     │
│  │  - resolve_thread   │      │  - POST /api/walkthrough     │     │
│  │  - set_verdict      │      │                              │     │
│  │  - submit_review    │      │                              │     │
│  └──────────┬──────────┘      └──────────────┬───────────────┘     │
│             │                                │                     │
│             └──────────┬─────────────────────┘                     │
│                        ▼                                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Review Session Manager  (in-memory)             │  │
│  │  Map<pr-key, ReviewSession>                                  │  │
│  │  - mutations go through a single reducer-style applyEvent()  │  │
│  │  - every mutation fires a local event bus emit('session:X')  │  │
│  │  - web server SSE subscribers re-fan to browser              │  │
│  └──────┬────────────────────────────┬──────────────────────┬───┘  │
│         │                            │                      │      │
│         ▼                            ▼                      ▼      │
│  ┌────────────────┐  ┌─────────────────────────┐  ┌──────────────┐ │
│  │ GitHub Adapter │  │ Diff Model (parsed      │  │ Persistence  │ │
│  │ - gh CLI       │  │ hunks; file+line ↔      │  │ .review/<k>/ │ │
│  │ - Octokit      │  │ diff-position mapping)  │  │   state.json │ │
│  │ - local-diff   │  │                         │  │   .lock      │ │
│  └────────────────┘  └─────────────────────────┘  └──────────────┘ │
└────────────────────────────────────────────────────────────────────┘
                        ▲
                        │ open http://127.0.0.1:<port>/?session=<pr-key>
                        │ (default-browser launch)
                        ▼
┌────────────────────────────────────────────────────────────────────┐
│                         Browser (SPA)                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  React app                                                   │  │
│  │  - state:        EventSource('/api/events') → store          │  │
│  │  - diff viewer:  Monaco diff editor (hunk-anchored)          │  │
│  │  - walkthrough:  narration pane + "next/prev" controls       │  │
│  │  - checklist:    criticality-ranked, links to hunks          │  │
│  │  - comments:     threaded, anchored to file+line             │  │
│  │  - submit panel: verdict + preview + "Post review"           │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Plugin entry** (`index.ts`) | Parse argv, start MCP + HTTP servers, wire event bus, install signal handlers, handle crash recovery | Node.js executable registered via `plugin.json` → `mcpServers` |
| **MCP Tool Surface** | The LLM-facing contract. Validates inputs, invokes session reducer, returns structured result. Must be idempotent where reasonable. | `@modelcontextprotocol/sdk` + `StdioServerTransport`; one `server.tool()` per verb |
| **Web Server** | The browser-facing contract. Serves static SPA, exposes read-only state + SSE, accepts user-originated mutations (POST) | Fastify + `@fastify/static` + `@fastify/sse-v2`; listens on `127.0.0.1:0` (OS-assigned port) |
| **Review Session Manager** | Owns the canonical per-PR state. All mutations go through `applyEvent(sessionId, event)`. Emits on in-process event bus after every mutation. | Plain TS class; `Map<string, ReviewSession>`; `EventEmitter` for subscribers |
| **GitHub Adapter** | Fetch PR metadata, diff, existing threads. Post final review. Abstracts `gh` CLI vs Octokit vs local-diff mode. | `execa` wrapping `gh api`; `@octokit/graphql` fallback; `simple-git` for local-diff |
| **Diff Model** | Canonical in-memory representation of a PR's files and hunks. Maintains both file+line and diff-position mappings (needed for GitHub API). | Parse unified diff (`parse-diff` or hand-rolled); keyed by `file:hunkIndex` |
| **Checklist Engine** | Load built-in checklist; look for `.review/checklist.md` in repo; merge/override; track per-item coverage by session | Static YAML/MD loader; merged in-memory; coverage stored on session |
| **Persistence Layer** | Serialize session to `.review/<pr-key>/state.json` after every mutation. Resume on start. File-locking to prevent concurrent plugin instances clobbering each other. | `proper-lockfile`; atomic write via `write-file-atomic`; JSON (not DB) |
| **Web UI** | React SPA. One store, one SSE subscription. Renders diff, walkthrough, checklist, comments, submit panel. Never mutates its own state — always POSTs and waits for SSE echo. | Vite + React + Zustand + Monaco diff editor |

---

## Process Topology — Decided

### Q: Does `/review <pr>` spawn the web server inline or detached?

**Inline (same process as MCP server).** Rationale:

1. Claude Code already owns the MCP server's lifecycle — it spawns it at plugin-load and terminates it on session exit ([Claude Code MCP Integration SKILL](https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/mcp-integration/SKILL.md)). Piggybacking the web server on that subprocess means cleanup is **free**.
2. Detached background processes are a nightmare on macOS: orphaned ports, stale PIDs, "is the server still running?" UX. Avoid.
3. The web server only needs to serve while Claude Code is running — if Claude Code exits, the LLM can't drive the review anyway.
4. Shared in-memory state means **zero IPC overhead** between MCP tool handlers and the web server's SSE broadcaster — they just share a `ReviewSessionManager` instance.

### Q: Is the MCP server the same process as the web server?

**Yes.** Single Node process. Two transports (stdio for MCP, HTTP for browser) bound to the same process, sharing the same in-memory `ReviewSessionManager`. This is the architecturally simplest choice and the one that composes best with Claude Code's plugin-lifecycle assumptions.

### Q: Which process owns Octokit / `gh` calls?

**The plugin process.** All GitHub I/O goes through a single `GitHubAdapter` module that's called from MCP tool handlers (never directly from the web server — the web server is read-only against state; user-POSTed comments become drafts in local state and are submitted only when the LLM calls `submit_review`).

### Q: How does the plugin clean up when the review session ends?

Three paths, in order of preference:

1. **Claude Code exits** → Claude Code sends SIGTERM to the stdio child per [Node.js child process docs](https://nodejs.org/api/child_process.html) → plugin process's SIGTERM handler: close HTTP server, flush session to disk, exit. No detached state because there was never any.
2. **LLM calls `end_review` tool** → persist final state, optionally print a summary line to stderr for Claude Code's log, but do NOT exit the process (Claude Code's MCP lifecycle owns exit).
3. **Crash / orphan recovery** → on startup, check `.review/*/.lock` files. If lock exists but `pid` isn't alive, clear it and resume. (Don't auto-kill — just recover.)

**Never** use `child.unref()` or `detached: true` to keep a side-car alive past Claude Code's exit. The user closing Claude Code should close the browser tab (or make it show "session ended").

---

## Recommended Project Structure

```
git-review-plugin/
├── plugin.json                    # Claude Code plugin manifest
├── .mcp.json                      # MCP server config (points at dist/mcp.js)
├── commands/
│   └── review.md                  # /review slash command definition
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                   # Process entry: starts MCP + HTTP, signal handlers
│   ├── mcp/
│   │   ├── server.ts              # McpServer instantiation + StdioServerTransport
│   │   └── tools/                 # One file per tool, default-exports a registration fn
│   │       ├── start-review.ts
│   │       ├── show-hunk.ts
│   │       ├── set-summary.ts
│   │       ├── run-self-review.ts
│   │       ├── draft-comment.ts
│   │       ├── update-comment.ts
│   │       ├── resolve-thread.ts
│   │       ├── set-verdict.ts
│   │       └── submit-review.ts
│   ├── web/
│   │   ├── server.ts              # Fastify setup, port 0 bind, static + SSE + API
│   │   ├── routes/
│   │   │   ├── state.ts           # GET /api/state
│   │   │   ├── events.ts          # GET /api/events (SSE)
│   │   │   ├── comments.ts        # POST /api/comments (user-drafted)
│   │   │   ├── verdict.ts         # POST /api/verdict (user override)
│   │   │   └── walkthrough.ts     # POST /api/walkthrough (user "next"/"show all")
│   │   └── static/                # Built SPA goes here at build time
│   ├── session/
│   │   ├── manager.ts             # ReviewSessionManager: Map<id, Session>
│   │   ├── reducer.ts             # applyEvent(session, event) → session
│   │   ├── events.ts              # Discriminated-union event types
│   │   └── types.ts               # ReviewSession, DiffModel, Thread, etc.
│   ├── git/
│   │   ├── github.ts              # gh CLI + Octokit wrappers; submitReview()
│   │   ├── local-diff.ts          # git diff base...head, no host
│   │   └── diff-parser.ts         # unified-diff → DiffModel
│   ├── checklist/
│   │   ├── builtin.ts             # Default criticality-ranked checklist (as data)
│   │   └── loader.ts              # Merge with .review/checklist.md if present
│   ├── persist/
│   │   ├── store.ts               # load/save JSON, atomic writes, file lock
│   │   └── paths.ts               # .review/<pr-key>/state.json helpers
│   └── bus.ts                     # Tiny EventEmitter re-export, typed
├── ui/                            # Browser SPA (separate tsconfig, Vite)
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── store.ts               # Zustand; subscribes to /api/events
│       ├── api.ts                 # POST helpers
│       ├── components/
│       │   ├── DiffView.tsx       # Monaco diff editor wrapper
│       │   ├── Walkthrough.tsx
│       │   ├── Checklist.tsx
│       │   ├── CommentThread.tsx
│       │   └── SubmitPanel.tsx
│       └── types.ts               # Shared with src/session/types.ts (via symlink or codegen)
├── checklists/
│   └── default.md                 # Shipped default checklist
└── .planning/                     # GSD artifacts
```

### Structure Rationale

- **`src/` and `ui/` are separate TS projects** — they compile independently (Node target vs browser target, different `tsconfig`s). A `shared/types.ts` barrel keeps `ReviewSession` shape in sync.
- **`src/mcp/tools/*` = one file per verb** — each tool is isolated, easy to add, easy to test in isolation (feed it a session, assert the event emitted).
- **`src/session/` is the gravity well** — the reducer is the single place mutations happen. Both MCP tools and HTTP POST handlers funnel through it. This is the testable core.
- **`src/web/routes/*` are thin** — they parse requests, call `sessionManager.applyEvent()`, return. No business logic.
- **`commands/review.md` is just a prompt** — it doesn't "call" anything; it tells the LLM what to do (e.g., "call `start_review` with the PR URL, then `show_hunk` on the first hunk, etc."). The MCP tools are what actually do work.

---

## Architectural Patterns

### Pattern 1: Event-Sourced Reducer for Session State

**What:** All mutations (from MCP tools AND from HTTP POSTs) pass through a single `applyEvent(session, event)` reducer. Events are a discriminated union. The reducer returns a new session; the manager stores it and broadcasts on the bus.

**When to use:** Any time state is mutated from multiple entry points (here: 9+ MCP tools and 3+ HTTP routes).

**Trade-offs:** + Single source of truth for state transitions. + Trivially serializable (can log the event stream for debugging). − Slightly more ceremony than direct mutation.

**Example:**

```typescript
// src/session/events.ts
export type SessionEvent =
  | { type: 'review.started'; pr: PRMetadata; diff: DiffModel }
  | { type: 'cursor.moved'; fileId: string; hunkId: string }
  | { type: 'summary.set'; text: string }
  | { type: 'comment.drafted'; threadId: string; fileId: string; line: number; body: string; author: 'llm' | 'user' }
  | { type: 'comment.updated'; threadId: string; commentId: string; body: string }
  | { type: 'checklist.item.marked'; itemId: string; status: 'pass' | 'fail' | 'na'; note?: string }
  | { type: 'verdict.set'; verdict: 'approve' | 'request_changes' | 'comment' }
  | { type: 'review.posted'; githubReviewId: string; postedAt: string };

// src/session/reducer.ts
export function applyEvent(s: ReviewSession, e: SessionEvent): ReviewSession {
  switch (e.type) {
    case 'cursor.moved': return { ...s, cursor: { fileId: e.fileId, hunkId: e.hunkId } };
    case 'comment.drafted': /* ... */;
    // ...
  }
}

// src/session/manager.ts
async applyEvent(id: string, e: SessionEvent) {
  const next = applyEvent(this.sessions.get(id)!, e);
  this.sessions.set(id, next);
  await this.persist.save(id, next);      // flush to disk
  this.bus.emit('session:updated', { id, event: e, state: next });
}
```

### Pattern 2: SSE Push + HTTP POST for User Inputs

**What:** Server → browser uses Server-Sent Events (one-way, HTTP, reconnect-friendly). Browser → server uses plain HTTP POST. No WebSocket.

**When to use:** When the push pattern is "server broadcasts state, browser occasionally mutates," which exactly describes this app. User typing a comment is an occasional POST; server broadcasting LLM-driven state changes is a continuous stream.

**Trade-offs:** + No socket-library dependency. + Native EventSource reconnects for free. + Simpler to test (curl the SSE stream). − Strictly one-way on the push channel (fine for this use case). See the [SSE-vs-WebSocket breakdown](https://dev.to/polliog/server-sent-events-beat-websockets-for-95-of-real-time-apps-heres-why-a4l) — for a broadcast-heavy local tool, SSE wins on simplicity.

**Example:**

```typescript
// src/web/routes/events.ts (Fastify)
app.get('/api/events', async (req, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  const session = sessionManager.get(req.query.session);
  reply.raw.write(`event: snapshot\ndata: ${JSON.stringify(session)}\n\n`);
  const unsub = bus.on('session:updated', (u) => {
    if (u.id !== req.query.session) return;
    reply.raw.write(`event: update\ndata: ${JSON.stringify(u.event)}\n\n`);
  });
  req.raw.on('close', unsub);
});
```

### Pattern 3: Bidirectional Event Bus (In-Process)

**What:** A single typed `EventEmitter` shared by MCP-tool handlers and HTTP route handlers. MCP tool mutates state → emits. SSE route is subscribed → forwards to browser. Browser POSTs mutation → HTTP handler calls `applyEvent` → emits → SSE route forwards → ALL connected browsers (including the one that submitted) see the same update.

**When to use:** When you need the browser UI and the LLM's view of state to converge. Echo-via-SSE (don't update the SPA optimistically from its own POST response) guarantees consistency with no extra code.

**Trade-offs:** + Trivial convergence. + MCP-driven and browser-driven changes use the same pipeline. − Requires the SPA to be disciplined about not optimistically mutating — always wait for the echo.

### Pattern 4: Dual-Addressing for GitHub Positions

**What:** The DiffModel stores each line with both `(fileId, fileLine, side)` AND `diffPosition`. UI and MCP tools address comments by `fileId + line + side` (user-friendly, stable). At submit time, the GitHubAdapter converts to whichever format `addPullRequestReview`'s `comments` field needs.

**When to use:** Always for this app. Per [GitHub's review API notes](https://docs.github.com/en/graphql/reference/mutations), the legacy `position` field is deprecated in favor of `line`/`startLine`/`side`/`startSide`, but some edge cases still need diff-position lookups (e.g., commenting on context lines between hunks).

**Example:**

```typescript
interface DiffLine { kind: 'add' | 'del' | 'ctx'; side: 'LEFT' | 'RIGHT'; fileLine: number; diffPosition: number; text: string; }
interface Hunk { id: string; header: string; lines: DiffLine[]; }
interface FileDiff { id: string; path: string; status: 'added' | 'modified' | 'deleted' | 'renamed'; hunks: Hunk[]; }
```

### Pattern 5: Atomic JSON Persistence + Write-Through

**What:** After every mutation, `JSON.stringify` the session and write it atomically (write-temp + rename) to `.review/<pr-key>/state.json`. On startup, load it back.

**When to use:** Single-writer, resumable state. No DB.

**Trade-offs:** + Zero ops overhead. + Human-readable, grep-able, git-ignorable. + Crash-safe via atomic rename. − Not suitable for large state (> a few MB). For reviews, state is small (< 500 KB even for a massive PR).

---

## Data Flow — Two Canonical Scenarios

### Scenario A: LLM calls `show_hunk(fileId, hunkId)`

```
Claude Code LLM
   │
   │ (1) JSON-RPC: tools/call show_hunk { fileId, hunkId }
   ▼
MCP Server (stdio)
   │
   │ (2) Validate args via zod; resolve session from manager (current pr-key)
   │ (3) Check fileId + hunkId exist in DiffModel; else return tool error
   ▼
ReviewSessionManager.applyEvent(id, { type: 'cursor.moved', fileId, hunkId })
   │
   │ (4) reducer produces new session
   │ (5) persist.save(id, next)   ← atomic write
   │ (6) bus.emit('session:updated', { id, event, state })
   ▼
SSE subscribers (one per connected browser tab)
   │
   │ (7) SSE writes:  event: update\ndata: {"type":"cursor.moved",...}\n\n
   ▼
Browser EventSource
   │
   │ (8) store.applyEvent(evt) → Zustand state update
   │ (9) <DiffView> re-renders, scrolls Monaco to fileId:hunkId, highlights
   ▼
MCP Server returns tool result to LLM
   │ (10) { content: [{ type: 'text', text: 'Showing hunk 3 of src/foo.ts. Diff snippet: ...' }] }
   ▼
LLM sees the hunk content in its own context (so the UI AND the LLM are both looking at the same hunk)
```

Notes:
- Steps 4-9 happen regardless of whether the LLM sees the result — the SSE fan-out is decoupled.
- The tool's return value **echoes the hunk text** so the LLM can reason about it. This is critical: the browser shows it to the human, the return value shows it to the LLM.
- If no browser is connected, the state still updates and persists; a browser joining later gets the latest state via the `snapshot` event.

### Scenario B: User types an inline comment in the browser

```
User types into <CommentComposer> at src/foo.ts:42 (RIGHT side)
   │
   │ (1) POST /api/comments
   │     { session, fileId, line: 42, side: 'RIGHT', body, replyTo?: threadId }
   ▼
Fastify route handler
   │
   │ (2) Validate; resolve session
   ▼
ReviewSessionManager.applyEvent(id, { type: 'comment.drafted', threadId, fileId, line, body, author: 'user' })
   │
   │ (3) reducer: creates or appends to thread; status='draft'
   │ (4) persist.save; bus.emit('session:updated', ...)
   ▼
SSE fan-out to all connected browsers (echo includes the submitter)
   │
   │ (5) browser store updates; thread UI re-renders with user's comment
   ▼
ROUTE handler returns 200 { ok: true, threadId, commentId }
   │
   │ (6) browser confirms send (removes pending indicator)

-- Separately, the LLM's awareness --

LLM (between tool calls) has no automatic signal.  Two options:

Option 1 (polling): next time LLM calls ANY tool, the tool result includes a
"recent user comments since last call" section appended to the tool's text response.
Tools like `show_hunk` and a dedicated `get_pending_user_comments` surface this.

Option 2 (MCP notification): use MCP server-initiated notifications to push
new comments as log messages; Claude Code surfaces these in the transcript.

Recommended: Option 1 — simpler, and guarantees LLM sees comments on its next
turn without relying on Claude Code's notification handling.

-- At submit time --

LLM calls submit_review tool
   │
   │ (7) GitHubAdapter.submitReview(session):
   │     - gather all threads with status='draft'
   │     - convert each to { path, line, side, body } (GraphQL addPullRequestReview input)
   │     - single addPullRequestReview mutation with event=APPROVE/REQUEST_CHANGES/COMMENT
   │ (8) On success, applyEvent({ type: 'review.posted', githubReviewId, postedAt })
   │ (9) Mark all threads as 'posted'
   ▼
SSE fan-out → browser shows "Review posted" state
```

---

## State Shape

```typescript
// src/session/types.ts

type PRSource =
  | { kind: 'github'; owner: string; repo: string; number: number; url: string }
  | { kind: 'local';  repoPath: string; baseRef: string; headRef: string };

interface PRMetadata {
  source: PRSource;
  title: string;
  description: string;      // PR body (markdown)
  author: string;
  baseSha: string;
  headSha: string;
  baseBranch: string;
  headBranch: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  existingThreads: ExistingThread[];   // from GitHub, read-only
}

interface DiffLine {
  kind: 'add' | 'del' | 'ctx';
  side: 'LEFT' | 'RIGHT' | 'BOTH';
  fileLine: number;        // line number in file on `side`
  diffPosition: number;    // position in unified diff (legacy GitHub field)
  text: string;
}

interface Hunk {
  id: string;              // stable: `${fileId}:h${index}`
  header: string;          // "@@ -a,b +c,d @@ context"
  startOld: number; lengthOld: number;
  startNew: number; lengthNew: number;
  lines: DiffLine[];
  coreChange: boolean;     // LLM-curated: is this a "core" hunk for the walkthrough?
  walkthroughOrder: number | null;  // null = not in narrative
}

interface FileDiff {
  id: string;              // stable: hash of path
  path: string;
  oldPath?: string;        // for renames
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  language: string;        // for Monaco syntax highlighting
  hunks: Hunk[];
  binary: boolean;
}

interface DiffModel {
  files: FileDiff[];
  totalHunks: number;
}

type Criticality = 'blocker' | 'major' | 'minor' | 'nit';

interface ChecklistItem {
  id: string;
  category: string;        // correctness, security, tests, performance, style, custom
  criticality: Criticality;
  prompt: string;          // "Have all new public APIs been tested?"
  source: 'builtin' | 'repo';
}

interface ChecklistCoverage {
  itemId: string;
  status: 'pending' | 'pass' | 'fail' | 'na';
  note?: string;           // LLM's justification
  linkedHunks: string[];   // hunk IDs that informed the verdict
  updatedAt: string;
}

type CommentStatus = 'draft' | 'posted';
type CommentAuthor = 'llm' | 'user';

interface Comment {
  id: string;
  threadId: string;
  author: CommentAuthor;
  body: string;            // markdown
  createdAt: string;
  updatedAt: string;
}

interface CommentThread {
  id: string;
  fileId: string;
  path: string;
  line: number;            // line in HEAD file
  startLine?: number;      // multi-line
  side: 'LEFT' | 'RIGHT';
  status: CommentStatus;
  resolved: boolean;
  comments: Comment[];
  githubThreadId?: string; // populated after post
}

interface WalkthroughState {
  mode: 'core' | 'show-all';
  cursor: { fileId: string; hunkId: string } | null;
  visited: string[];       // hunk IDs in order visited
  completed: boolean;
}

interface NarrationEntry {
  at: string;              // ISO timestamp
  kind: 'llm-tool-call' | 'llm-text' | 'user-action';
  summary: string;         // one-liner for the transcript pane
  ref?: { hunkId?: string; threadId?: string; checklistId?: string };
}

type Verdict = 'approve' | 'request_changes' | 'comment' | null;

interface ReviewSession {
  id: string;              // pr-key: `gh:owner/repo#n` or `local:<hash>`
  createdAt: string;
  updatedAt: string;
  pr: PRMetadata;
  diff: DiffModel;
  summary: {
    intent: string;
    keyChanges: string[];
    riskAreas: string[];
  } | null;
  walkthrough: WalkthroughState;
  checklist: {
    items: ChecklistItem[];    // merged builtin + repo
    coverage: Record<string, ChecklistCoverage>;
  };
  threads: Record<string, CommentThread>;
  verdict: Verdict;
  posted: { githubReviewId: string; postedAt: string } | null;
  narration: NarrationEntry[];  // LLM activity log for the transcript pane
}
```

**Why this shape:**
- `walkthrough.cursor` is authoritative for "where is the review right now" — drives both UI focus and tool-call defaults.
- `threads` keyed by ID (not array) for O(1) updates.
- `narration` is separate from events — it's a user-visible summary log, not a replay log. The event log is implicit in the sequence of `applyEvent` calls (we don't need to store it persistently; if we wanted to, we'd append to a separate file).
- `pr.existingThreads` is read-only input from GitHub; `threads` is this-session's drafts. We never try to modify existing threads' server-side state in v1.

---

## Build-Order Implications

Dependencies between components (→ means "required by"):

```
diff-parser ──────────────────────→ DiffModel
DiffModel ────────────────────────→ Session (state), Web UI (render)
Session reducer ──────────────────→ MCP tools, HTTP routes
Event bus ────────────────────────→ SSE route, MCP tool side-effects
Persistence ──────────────────────→ Session startup/shutdown
GitHub adapter (read) ────────────→ start_review tool
GitHub adapter (submit) ──────────→ submit_review tool  (can defer)
Checklist engine ─────────────────→ run_self_review tool  (can defer)
Monaco diff view ─────────────────→ Useful UI  (can defer: show raw diff first)
```

### Vertical Slice — Phase 1 End-to-End Loop

The minimum that proves the architecture works:

1. **Plugin process boots.** `src/index.ts` starts MCP server + Fastify on `127.0.0.1:0`, prints port to stderr.
2. **`/review <pr-url>` slash command.** Prompt tells the LLM to call `start_review` with the URL.
3. **`start_review` tool.** Fetch PR via `gh pr diff <n> --json` and `gh pr view <n> --json`. Parse diff → DiffModel. Create session. Persist. Return summary. Emit `review.started`.
4. **Auto-open browser.** On first session, `open http://127.0.0.1:<port>/?session=<id>` (macOS `open` command).
5. **Browser connects to SSE.** Gets `snapshot` event. Renders a plain side-by-side diff (can be basic — Monaco later).
6. **`show_hunk` tool.** LLM calls `show_hunk(fileId, hunkId)`. Cursor updates. SSE fan-out. Browser scrolls/highlights.
7. **Signal handler.** Plugin process catches SIGTERM, flushes state, exits.

**That's it for the vertical slice.** No checklist, no comments, no GitHub submission. But it exercises:
- Plugin manifest & MCP registration
- Stdio transport + Fastify in one process
- Slash command → tool call → state mutation → SSE → browser render
- `gh` CLI ingestion
- Diff parsing
- Persistence + resume
- Cleanup on Claude Code exit

**Phase 2 priorities (any order, mostly independent):**
- Monaco diff editor integration (replaces the basic renderer)
- Draft-comment flow (MCP tool + HTTP POST + thread rendering)
- Self-review / checklist engine
- Summary generation (set_summary tool + summary pane)

**Phase 3:**
- `submit_review` via `addPullRequestReview` GraphQL mutation (see the [GitHub GraphQL mutations reference](https://docs.github.com/en/graphql/reference/mutations))
- Verdict panel + preview
- Resume UX (pick up existing session on `/review` of same PR)

**Phase 4 (polish):**
- Walkthrough narrative ordering
- "Show all" escape
- Multi-line comments
- Local-branch diff mode

---

## Transport Choices

### MCP ↔ Plugin Process: **stdio** (mandatory)

Claude Code's plugin system spawns plugin MCP servers over stdio ([plugins reference](https://code.claude.com/docs/en/plugins-reference/index)); there is no other transport option for plugin-bundled MCP servers. The plugin's lifetime is bound to Claude Code's session. No choice to make here.

### Plugin Process ↔ Browser: **SSE for push, HTTP POST for pull-back**

**Chosen: SSE + POST, not WebSocket.**

Rationale:
- Push traffic is strongly asymmetric — 95%+ is LLM-driven state changes flowing server → browser. User POSTs are infrequent (typing a comment, clicking "next"). WebSocket's full-duplex is overkill.
- `EventSource` reconnects automatically with `Last-Event-ID`. Roll that + a per-session monotonically increasing seq → graceful browser-refresh recovery for free.
- No socket library means smaller deps (`@fastify/sse-v2` is tiny).
- Easier to debug: `curl -N http://localhost:PORT/api/events?session=X` just works.
- WebSocket offers nothing we need here.

**Caveat:** If future features demand low-latency browser → server (e.g., collaborative cursors), revisit. Not in v1 scope.

### MCP Tool ↔ Web UI (intra-process): **Typed in-process EventEmitter**

**Chosen: in-process EventEmitter (`src/bus.ts`).**

Not shared state + polling (adds latency and staleness), not WebSocket fan-out within the same process (pointless serialization). An `EventEmitter` is the standard Node pattern for single-process pub/sub, it's zero-latency, and it composes naturally with the SSE route's subscription model.

Shape:
```typescript
type BusEvents = {
  'session:updated': (u: { id: string; event: SessionEvent; state: ReviewSession }) => void;
  'session:removed': (id: string) => void;
};
```

---

## Configuration Surface

Three tiers, in order of precedence (most specific wins):

### Tier 1: Per-session (runtime)

Not a file. Arguments to `start_review`:
```typescript
{ source: { kind: 'github', owner, repo, number } | { kind: 'local', base, head } }
```

### Tier 2: Repo-level (`.review/checklist.md` in repo)

Committed to the repo being reviewed. Plugin reads from `git rev-parse --show-toplevel`.
Overrides/extends the built-in checklist. Markdown format with YAML frontmatter:

```markdown
---
extends: builtin       # or "replaces"
ignore_paths:
  - "dist/**"
  - "*.lock"
---

## correctness

- [blocker] Are all nil/null cases handled?
- [major] Is error handling consistent with existing patterns?

## security

- [blocker] Are new env vars documented?
```

### Tier 3: Plugin-level (`~/.claude/plugins/git-review-plugin/config.json`)

Per-user defaults. All optional:

```jsonc
{
  "defaultVerdictOnEmptyFindings": "approve",   // or "comment"
  "autoOpenBrowser": true,
  "browserCommand": "open",                      // for non-macOS users down the line
  "walkthroughMode": "core",                     // "core" | "show-all"
  "github": {
    "authMethod": "gh"                           // "gh" | "octokit-env"
  },
  "persistence": {
    "root": ".review"                            // relative to repo root
  }
}
```

### What explicitly does NOT live anywhere

- No model selection: the LLM is whatever Claude Code is currently running as.
- No API key: auth is inherited from the Claude Code session and from `gh` for GitHub.
- No port: always dynamically assigned (`127.0.0.1:0`).

---

## Testing Strategy — MCP Tools That Mutate UI State

The key insight: **the reducer is the testable core, and the MCP tool is a thin wrapper.** Don't try to test the whole stack end-to-end first; test the reducer with unit tests, then integration-test the MCP tools against an in-memory session, then smoke-test the SSE channel, then do a small number of full end-to-end tests.

### Layer 1: Reducer unit tests (fast, exhaustive)

```typescript
describe('applyEvent', () => {
  it('cursor.moved updates cursor and walkthrough.visited', () => {
    const s0 = makeSession({ cursor: null });
    const s1 = applyEvent(s0, { type: 'cursor.moved', fileId: 'f1', hunkId: 'h2' });
    expect(s1.walkthrough.cursor).toEqual({ fileId: 'f1', hunkId: 'h2' });
    expect(s1.walkthrough.visited).toContain('h2');
  });
});
```

All state transitions live here. This should be 80% of the test volume.

### Layer 2: MCP tool handler tests (in-process, stub SDK)

Instead of spawning a real MCP client, construct the tool handler function and call it directly with a fake `CallToolRequest`:

```typescript
describe('show_hunk tool', () => {
  it('rejects unknown hunk ID with a tool error', async () => {
    const mgr = new ReviewSessionManager(fakePersist, fakeBus);
    mgr.sessions.set('s1', makeSessionWithHunks(['h1', 'h2']));
    const handler = makeShowHunkHandler(mgr);
    const result = await handler({ params: { arguments: { fileId: 'f1', hunkId: 'h99' } } });
    expect(result.isError).toBe(true);
  });

  it('happy path emits session:updated and returns hunk text', async () => {
    const bus = new EventEmitter();
    const emitted: any[] = [];
    bus.on('session:updated', (u) => emitted.push(u));
    // ... run tool ... assert emitted.length === 1 and event type
  });
});
```

### Layer 3: HTTP + SSE integration tests

Spin up Fastify on an ephemeral port; use `eventsource` client to subscribe; assert that calling an MCP tool handler (layer 2) produces an SSE event on the stream:

```typescript
it('SSE forwards session:updated events to subscribers', async () => {
  const { port, sessionId } = await bootTestPlugin();
  const es = new EventSource(`http://127.0.0.1:${port}/api/events?session=${sessionId}`);
  const updates: any[] = [];
  es.addEventListener('update', (e) => updates.push(JSON.parse(e.data)));
  await callTool('show_hunk', { fileId: 'f1', hunkId: 'h1' });
  await waitFor(() => updates.length > 0);
  expect(updates[0].type).toBe('cursor.moved');
});
```

### Layer 4: E2E via a scripted LLM harness (few, slow, high value)

Use the [`@modelcontextprotocol/sdk` client transports](https://github.com/modelcontextprotocol/typescript-sdk) to spin up a real `StdioClientTransport` against the plugin binary; drive it via a test script that mimics the LLM's tool-calling. Validate final state rather than every intermediate step.

### Browser-side

Component tests (Vitest + Testing Library). Don't try to test the SSE pipeline end-to-end from the browser — unit-test the store's `applyEvent` reducer on the browser side too, and use Playwright sparingly (1-2 happy-path tests per milestone).

### Test seams

- Replace `GitHubAdapter` with `FakeGitHubAdapter` in all non-submit tests.
- Replace `PersistenceStore` with `InMemoryStore` for unit tests.
- The bus is a normal `EventEmitter` — no replacement needed, just subscribe in tests.

---

## Scaling Considerations

This is a **single-user, single-machine, single-PR-at-a-time** tool. "Scaling" means something different here than in a SaaS product:

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 PR at a time (v1 target) | Current design, no changes needed. |
| 2-3 PRs concurrently (same session) | `Map<id, ReviewSession>` already supports this; browser URL uses `?session=<id>` to pick one. UI needs a session switcher (defer). |
| Massive PRs (1000+ files, 10K+ hunks) | DiffModel is held in memory. At 10K hunks × ~100 lines × ~50 chars ≈ 50 MB — tight but manageable. Lazy-load file content only when visited. Monaco already virtualizes — [GitHub does this too](https://github.blog/engineering/architecture-optimization/the-uphill-climb-of-making-diff-lines-performant/) with TanStack Virtual. |
| Multiple reviewers collaborating | Out of scope. Would require a real backend. |

### What breaks first, at what scale

1. **Giant PRs exhaust memory** — mitigate with lazy hunk loading + Monaco virtualization.
2. **SSE stream gets noisy during rapid LLM tool calls** — batch consecutive `session:updated` events with a tiny debounce (e.g., coalesce within 16 ms) before SSE dispatch.
3. **JSON persistence write latency** (if every keystroke in a comment composer POSTs) — debounce user-draft writes in the browser (250 ms) before POSTing; MCP-driven writes are low-frequency and fine as-is.

None of these need addressing in v1.

---

## Anti-Patterns

### Anti-Pattern 1: Running the web server as a detached background daemon

**What people do:** Fork a separate `node web-server.js` process with `spawn(..., { detached: true }); child.unref()` so it survives Claude Code exit.

**Why it's wrong:**
- Orphaned processes on crash.
- "Is the server running?" UX surface; lock files; PID management; zombies.
- Second port to manage, second log stream, second IPC channel.
- Breaks Claude Code's assumption that the MCP server is the complete plugin surface.

**Do this instead:** Run the web server as an HTTP listener **inside the same Node process** that runs the MCP stdio server. Lifetime is bound to Claude Code's lifetime. [Node child process lifecycle docs](https://nodejs.org/api/child_process.html) confirm that non-detached children die with their parent cleanly on SIGTERM.

### Anti-Pattern 2: Using `console.log` in the MCP server

**What people do:** Print debug output to stdout from the MCP server code.

**Why it's wrong:** Stdout is the JSON-RPC channel ([TypeScript SDK quickstart](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server-quickstart.md) says explicitly: "use `console.error()` for logging to avoid corrupting the JSON-RPC communication channel"). `console.log` will corrupt protocol messages and cause mysterious "invalid JSON" client errors.

**Do this instead:** All logging goes to stderr via `console.error`, or to a log file. The web server's `reply.log` is fine (it writes to stderr by default in Fastify).

### Anti-Pattern 3: Optimistic UI updates without SSE echo

**What people do:** When the user POSTs a comment, the browser locally appends it to state immediately, then waits for server confirmation.

**Why it's wrong:** You now have two code paths for state (local mutation + server mutation) that can diverge. Worse: when the LLM comments on the same thread in the next tool call, your optimistic UI might race the LLM's update and show stale state.

**Do this instead:** Browser POSTs and waits for the SSE echo. Show a "sending…" indicator on the input (disable + spinner), clear it when the echo arrives. Latency is sub-millisecond on localhost — user will not notice.

### Anti-Pattern 4: Per-tool ad-hoc state mutation

**What people do:** Each MCP tool handler reaches into the session object and mutates fields directly.

**Why it's wrong:** Duplicated logic, inconsistent persistence, forgotten SSE emits, impossible to test exhaustively.

**Do this instead:** Every mutation goes through `sessionManager.applyEvent(id, event)`. Tools produce events; they don't mutate state. See [Pattern 1 above](#pattern-1-event-sourced-reducer-for-session-state).

### Anti-Pattern 5: Using GitHub's deprecated `position` field for new comments

**What people do:** Read GitHub docs' old examples, use the legacy `position` field (offset from `@@` header) in `addPullRequestReviewComment`.

**Why it's wrong:** Per the [GitHub GraphQL mutations reference](https://docs.github.com/en/graphql/reference/mutations), `position` is deprecated; `line` + `side` (and `startLine` + `startSide` for multi-line) are the correct inputs. And `addPullRequestReviewComment` itself is being deprecated in favor of `addPullRequestReviewThread` (for replying to existing threads) and `addPullRequestReview` (with `comments: [...]` for bulk submit).

**Do this instead:** At submit time, use the single-shot `addPullRequestReview` mutation with all draft comments as `comments: DraftPullRequestReviewComment[]`, each with `{ path, body, line, side, startLine?, startSide? }`. One API call, atomic, matches the app's "full review" submission semantics.

### Anti-Pattern 6: Parsing diffs line-by-line in the UI

**What people do:** Send the raw unified diff text to the browser and have it split/parse client-side.

**Why it's wrong:** Duplicate parsing logic (server needs it too for `diffPosition`/`fileLine` maps); UI is slower; tests are split across two runtimes.

**Do this instead:** Parse once on the server into the `DiffModel` shape. Send structured JSON to the UI. UI just renders.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| GitHub API | `gh` CLI via `execa` for reads (`gh api graphql -f query=...`); Octokit (`@octokit/graphql`) fallback if `gh` is missing or `GH_TOKEN` set | `gh` is the pragmatic choice — no auth configuration, same token the user already has. Fall back to env-var token for CI-like environments. |
| Local `git` | `execa('git', [...])` or `simple-git` for base/head diff generation in local-diff mode | No network. Same parser produces DiffModel. |
| Default browser (macOS) | `open http://...` via `execa` | Phase 1 only targets macOS. Add `xdg-open` / `start` fallbacks when scope expands. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| LLM ↔ Plugin | JSON-RPC over stdio (MCP) | Owned by Claude Code + `@modelcontextprotocol/sdk`. |
| Plugin process ↔ Browser | HTTP + SSE | Server → browser via SSE; browser → server via POST. |
| MCP tool handler ↔ session | Synchronous call to `sessionManager.applyEvent()` | No network, no serialization. |
| HTTP route handler ↔ session | Same as above. | Single reducer, two callers. |
| Session manager ↔ SSE route | Typed `EventEmitter` (in-process bus) | Decouples mutation from fan-out. |
| Session manager ↔ persistence | Async `save(id, state)` after every mutation | Atomic write, file lock. |
| Browser UI ↔ browser store | Zustand subscribe/dispatch | Store's reducer is a mirror of server's reducer, applied to SSE events. |

---

## Sources

- [Claude Code Plugins reference — plugin manifest & MCP server config](https://code.claude.com/docs/en/plugins-reference/index) — verified via Context7 `/websites/code_claude_en_plugins-reference`
- [Claude Code MCP Integration SKILL — stdio lifecycle: server terminated when Claude Code exits](https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/mcp-integration/SKILL.md) — verified via Context7 `/anthropics/claude-code`
- [Model Context Protocol TypeScript SDK — StdioServerTransport; "use `console.error()` for logging"](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server-quickstart.md) — verified via Context7 `/modelcontextprotocol/typescript-sdk`
- [GitHub GraphQL mutations reference — `addPullRequestReview` with `comments` array; `position` deprecated in favor of `line`+`side`](https://docs.github.com/en/graphql/reference/mutations)
- [GitHub Engineering — diff performance via TanStack Virtual (validates hunk virtualization approach)](https://github.blog/engineering/architecture-optimization/the-uphill-climb-of-making-diff-lines-performant/)
- [SSE vs WebSocket — SSE wins for broadcast-heavy, one-way push](https://dev.to/polliog/server-sent-events-beat-websockets-for-95-of-real-time-apps-heres-why-a4l)
- [Node.js child process docs — lifecycle, signal handling, detached caveat](https://nodejs.org/api/child_process.html)
- [Monaco vs CodeMirror 6 — Monaco ships a batteries-included diff editor](https://agenthicks.com/research/codemirror-vs-monaco-editor-comparison)

---

## Confidence Notes

- **HIGH** — Process topology (single Node process, stdio MCP + HTTP in same binary). Directly validated by Claude Code plugin docs and MCP SDK documentation.
- **HIGH** — Transport choice (SSE + POST). Matches the asymmetric push pattern; WebSocket adds no value here.
- **HIGH** — GitHub submission via single `addPullRequestReview` mutation. Validated by GitHub GraphQL docs; matches the app's "always submit a full review" semantic.
- **MEDIUM** — Event-sourced reducer pattern. Architecturally clean and well-tested elsewhere, but adds some upfront ceremony — alternative is direct mutation with a "notify bus" helper, which is fine if discipline holds.
- **MEDIUM** — Monaco over CodeMirror for the diff viewer. Monaco's built-in diff is attractive, but its 5-10 MB bundle and VS Code-flavored UX may be overkill for a personal tool. CodeMirror 6's merge view is a viable alternative with much smaller footprint — decide at UI-phase start based on how custom the rendering needs to be.
- **LOW** — Specific framework choice for the UI (React + Zustand assumed here). Defer to STACK.md research. Architecture works equivalently with Svelte/Solid/Vue — the server-side design is framework-agnostic.

---
*Architecture research for: Claude Code plugin — MCP-driven PR review with local web GUI*
*Researched: 2026-04-16*
