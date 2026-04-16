---
phase: 01-plugin-skeleton-secure-vertical-slice
plan: 02
subsystem: server-lifecycle
tags: [lifecycle, session, persistence, mcp, security, logger]
dependency_graph:
  requires: [01-01]
  provides: [server-lifecycle-bedrock, session-manager, persistence-interface, mcp-scaffold]
  affects: [01-03, 01-04, 01-05]
tech_stack:
  added: []
  patterns:
    - stderr-only logging via process.stderr.write (never console.log)
    - atomic JSON persistence via write-file-atomic + proper-lockfile
    - pr-key sanitization via replace(/[/#:\\]/g, '_') before filesystem path construction
    - idempotent startReview via Map + Set for session and launch tracking
    - 127.0.0.1-only bind with OS-assigned port (port: 0)
    - discriminated union zod schema for MCP tool input
key_files:
  created:
    - server/src/logger.ts
    - server/src/session/key.ts
    - server/src/persist/paths.ts
    - server/src/persist/store.ts
    - server/src/browser-launch.ts
    - server/src/session/manager.ts
    - server/src/mcp/server.ts
    - server/src/mcp/tools/start-review.ts
    - server/src/index.ts
    - server/src/__tests__/logger.test.ts
    - server/src/session/__tests__/key.test.ts
    - server/src/persist/__tests__/paths.test.ts
    - server/src/persist/__tests__/store.test.ts
    - server/src/__tests__/browser-launch.test.ts
    - server/src/session/__tests__/manager.test.ts
    - server/src/__tests__/lifecycle.test.ts
  modified: []
decisions:
  - "Phase-1 stub body in SessionManager.startReview returns a minimal ReviewSession with empty DiffModel; Plan 04 replaces with real ingest/parse/highlight"
  - "Lifecycle test uses node --import tsx/esm as the TypeScript runner since tsx is the dev dependency specified in server/package.json"
  - "proper-lockfile requires the target file to exist before locking; added pre-lock touch (fs.writeFile with '{}') to avoid ENOENT on first write"
  - "paths.ts uses module-level warnedOnce flag to emit the CLAUDE_PLUGIN_DATA warning only once per process lifetime; test suite uses vi.resetModules() to isolate"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-16"
  tasks_completed: 2
  files_created: 16
---

# Phase 1 Plan 02: Server Lifecycle Bedrock Summary

**One-liner:** Stderr-only logger, idempotent SessionManager with per-launch token, atomic JSON persistence (write-file-atomic + proper-lockfile), 127.0.0.1:0 Hono server, SIGTERM/SIGINT shutdown, and zod-validated `start_review` MCP tool stub.

## What Was Built

This plan ships the server's lifecycle foundation. Every component that Plans 03, 04, and 05 depend on now exists:

### Task 1: Logger + pr-key + persistence interface

**`server/src/logger.ts`** — Stderr-only logger using `process.stderr.write` directly. Zero `console.log` calls. Three methods: `info`, `warn`, `error`. Error method formats stack traces. No external dependencies.

**`server/src/session/key.ts`** — Two pure functions:
- `githubKey(owner, repo, number)` → `gh:owner/repo#number`
- `localKey(repoPath, base, head)` → `local:<sha256-hex>` (64 hex chars)

**`server/src/persist/paths.ts`** — CLAUDE_PLUGIN_DATA-aware path resolver:
- When `CLAUDE_PLUGIN_DATA` is set: `${CLAUDE_PLUGIN_DATA}/reviews/<safe-key>/state.json`
- When unset: `.planning/.cache/reviews/<safe-key>/state.json` + one-time stderr warning
- Path traversal defense: `prKey.replace(/[/#:\\]/g, '_')` strips separators (T-07)

**`server/src/persist/store.ts`** — Atomic write wrapper:
- `writeState`: mkdir -p, touch file (proper-lockfile needs it), acquire lock, write-file-atomic, release lock
- `readState`: read + JSON.parse, returns null on ENOENT

### Task 2: SessionManager + browser-launch + MCP scaffold + lifecycle entry

**`server/src/browser-launch.ts`** — Stderr URL echo happens BEFORE `open(url)` call (D-13 mandate). `open()` failures are caught and logged as warn; the URL already printed to stderr is the fallback.

**`server/src/session/manager.ts`** — In-memory singleton session store:
- `Map<prKey, ReviewSession>` — session lookup
- `Set<prKey>` (launched) — tracks which prKeys already triggered browser launch (D-21 idempotency)
- `startReview(source)`: derives prKey, returns existing session if present (idempotency), else creates Phase-1 stub ReviewSession, calls `writeState` once (D-06), launches browser once
- Phase-1 stub: `DiffModel = { files: [], totalHunks: 0 }`. Plan 04 replaces the stub body with real ingestion.

**`server/src/mcp/tools/start-review.ts`** — Single registered MCP tool (D-18):
- Zod `discriminatedUnion` schema covering all three source variants (D-19)
- Returns formatted text: PR title, author, stats, description, review URL (D-20)
- Error path returns `isError: true` with friendly message

**`server/src/mcp/server.ts`** — `McpServer` + `StdioServerTransport` factory; calls `registerStartReview`.

**`server/src/index.ts`** — Process entry point:
- Generates `crypto.randomBytes(32).toString('base64url')` session token (D-08)
- Hono stub app (Plan 03 replaces with `buildHttpApp(manager)`)
- `serve({ fetch, port: 0, hostname: '127.0.0.1' })` — SEC-01 enforced
- URL echoed to stderr inside `serve()` callback (D-13)
- `startMcp(manager)` connects MCP over stdio
- SIGTERM/SIGINT handlers close HTTP server + 2-second hard-exit backstop

## SessionManager Public Surface

Plans 03, 04, 05 consume this interface:

```typescript
export class SessionManager {
  constructor(opts: { sessionToken: string });

  getSessionToken(): string;     // Full token for cookie comparison in Plan 03
  getHttpPort(): number | null;  // Used by Plan 03 host-validate middleware
  setHttpPort(port: number): void;
  setLaunchUrl(url: string): void;
  getLaunchUrl(): string;        // Included in start_review return text
  getTokenLast4(): string;       // Footer display per UI-SPEC (never the full token)

  get(prKey: string): ReviewSession | undefined;
  startReview(source: SourceArg): Promise<ReviewSession>;
}
```

## Boot-time Stderr Output

Running `tsx src/index.ts` with SIGINT after 1 second produces:

```
[2026-04-16T17:XX:XX.XXXZ] [warn] CLAUDE_PLUGIN_DATA unset; falling back to /path/to/repo/.planning/.cache
[2026-04-16T17:XX:XX.XXXZ] [info] Review server listening at http://127.0.0.1:PORT/?token=TOKEN
[2026-04-16T17:XX:XX.XXXZ] [info] MCP server ready on stdio
[2026-04-16T17:XX:XX.XXXZ] [info] SIGINT received; shutting down.
```

Stdout remains empty (no JSON-RPC frames are emitted without a connected MCP client).

## TypeScript Compilation

`tsc --noEmit` will pass after Plan 01-01 is merged (which provides `shared/types.ts`, `server/tsconfig.json`, and installed dependencies). This plan's files use `"module": "Node16"` import semantics with `.js` extensions on all local imports, matching the MCP SDK's ESM subpath export pattern.

## Security Controls Implemented

| Control | File | Mechanism |
|---------|------|-----------|
| T-01-06 log poisoning | `logger.ts` + all server files | `process.stderr.write` only; zero `console.log`; ESLint `no-console` from Plan 01 blocks future violations |
| T-01-07 path traversal | `persist/paths.ts` | `replace(/[/#:\\]/g, '_')` strips /, #, :, \\ before `path.join` |
| SEC-01 LAN-only bind | `index.ts` | `hostname: '127.0.0.1'` in `serve()` — not `0.0.0.0`, not `::` |
| PLUG-03 browser launch fallback | `browser-launch.ts` | URL logged to stderr before `open()` call; test asserts ordering |
| R-lifecycle shutdown hang | `index.ts` | 2-second `setTimeout(() => process.exit(0)).unref()` backstop |

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] proper-lockfile pre-touch**
- **Found during:** Task 1 implementation
- **Issue:** `proper-lockfile.lock(file)` throws ENOENT if the target file doesn't exist; the plan's pattern comment acknowledged this but the provided code snippet had `lockfile.lock` called immediately after mkdir
- **Fix:** Added `try { await fs.access(file) } catch { await fs.writeFile(file, '{}') }` before the lock acquire in `store.ts`
- **Files modified:** `server/src/persist/store.ts`
- **Commit:** ac00b15

**2. [Rule 3 - Blocking issue] lifecycle test stream collection**
- **Found during:** Task 2 — lifecycle.test.ts initial draft had a polling loop that broke before stream listeners were attached, creating a race condition where output chunks could be missed
- **Fix:** Moved `proc.stderr.on('data', ...)` and `proc.stdout.on('data', ...)` listeners to immediately after `execa()` spawn, before any polling
- **Files modified:** `server/src/__tests__/lifecycle.test.ts`
- **Commit:** 66c71be

## Known Stubs

The following are intentional Phase-1 stubs, documented here for the verifier:

| Stub | File | Line | Reason |
|------|------|------|--------|
| `diff: { files: [], totalHunks: 0 }` | `session/manager.ts` | ~50 | Plan 04 replaces with real parse-diff output |
| `pr.title = 'GitHub PR (Plan 04 replaces stub...)'` | `session/manager.ts` | ~80 | Plan 04 replaces with real `gh pr view` metadata |
| `app.get('/', c => c.text('Stub — Plan 03 mounts real routes'))` | `index.ts` | ~18 | Plan 03 replaces with `buildHttpApp(manager)` |

These stubs are intentional and documented in the plan (Phase-1 stub per D-06/D-18). They prevent nothing in Phase 1 since the UI layer and ingestion pipeline land in Plans 03–05.

## Self-Check: PASSED

All 16 created files verified present on disk. All 5 task commits verified in git history:

| File / Commit | Status |
|---------------|--------|
| server/src/logger.ts | FOUND |
| server/src/session/key.ts | FOUND |
| server/src/persist/paths.ts | FOUND |
| server/src/persist/store.ts | FOUND |
| server/src/browser-launch.ts | FOUND |
| server/src/session/manager.ts | FOUND |
| server/src/mcp/server.ts | FOUND |
| server/src/mcp/tools/start-review.ts | FOUND |
| server/src/index.ts | FOUND |
| server/src/__tests__/logger.test.ts | FOUND |
| server/src/session/__tests__/key.test.ts | FOUND |
| server/src/persist/__tests__/paths.test.ts | FOUND |
| server/src/persist/__tests__/store.test.ts | FOUND |
| server/src/__tests__/browser-launch.test.ts | FOUND |
| server/src/session/__tests__/manager.test.ts | FOUND |
| server/src/__tests__/lifecycle.test.ts | FOUND |
| b5224a7 (test RED Task 1) | FOUND |
| 25855e7 (feat GREEN Task 1) | FOUND |
| bc2f5e7 (test RED Task 2) | FOUND |
| ac00b15 (feat GREEN Task 2) | FOUND |
| 66c71be (test fix lifecycle) | FOUND |
