---
phase: 01-plugin-skeleton-secure-vertical-slice
plan: "07"
subsystem: plugin-manifest-and-e2e-seam
tags: [manifest, plugin, slash-command, paraphrase, end-to-end, mcp, zod]
dependency_graph:
  requires: [01-02, 01-03, 01-04, 01-06]
  provides:
    - .claude-plugin/plugin.json (plugin manifest)
    - .mcp.json at repo root (MCP server declaration)
    - commands/review.md (/review slash-command prompt)
    - paraphrase() in start-review.ts (D-20 / Pitfall 11 mitigation)
    - end-to-end test (boot → tools/call → security-probes → SIGTERM)
  affects: [Phase 2+]
tech_stack:
  added: []
  patterns:
    - "paraphrase(): split-then-strip paragraph approach — split on \\n\\n+ first, then strip markdown from each paragraph candidate to find first non-empty"
    - "node:child_process.spawn for long-lived subprocess in vitest — execa v9 streams don't emit data events in vitest worker thread context"
    - "z.union with inner z.union for github source variants — Zod v4 rejects duplicate discriminator values in discriminatedUnion"
key_files:
  created:
    - path: ".claude-plugin/plugin.json"
      role: "Claude Code plugin manifest — name, version, description, commands pointer, mcpServers pointer"
    - path: ".mcp.json"
      role: "MCP server declaration at repo root — node command with CLAUDE_PLUGIN_ROOT env var in args"
    - path: "commands/review.md"
      role: "/review slash-command prompt — instructs LLM to call start_review with discriminated source arg"
    - path: "server/src/mcp/tools/__tests__/start-review.test.ts"
      role: "19 unit tests for paraphrase() + renderSummary() + plugin manifest structure"
    - path: "server/src/__tests__/end-to-end.test.ts"
      role: "Phase 1 seam test: boot → MCP JSON-RPC → security-probes.sh → SIGTERM"
  modified:
    - path: "server/src/mcp/tools/start-review.ts"
      role: "Added paraphrase() (D-20 Pitfall-11 mitigation), renderSummaryForTest export, updated renderSummary to use paraphrase(); fixed Zod v4 duplicate discriminator bug"
decisions:
  - "paraphrase-split-first: Split description into paragraphs on \\n\\n+ BEFORE stripping markdown and collapsing whitespace. Collapsing first loses paragraph boundaries."
  - "spawn-not-execa-in-vitest: Use node:child_process.spawn for the long-lived server subprocess in the e2e test. Execa v9 subprocess streams don't emit 'data' events inside vitest worker threads."
  - "zod-v4-union-not-discriminated: Zod v4 rejects duplicate discriminator values in discriminatedUnion. Using z.union([z.union([github-url, github-number]), local]) preserves semantic structure."
metrics:
  duration: "~12 minutes"
  completed: "2026-04-16T17:02:39Z"
  tasks_completed: 1
  files_created: 5
---

# Phase 01 Plan 07: Plugin Manifest + End-to-End Seam Summary

**One-liner:** Plugin manifest (`.claude-plugin/plugin.json` + `.mcp.json`) at correct locations, `/review` slash-command prompt, `paraphrase()` function in `start_review` return (D-20 Pitfall-11), and the Phase-1 seam test that boots the compiled server via stdio, invokes `start_review`, passes `security-probes.sh`, and confirms SIGTERM shutdown.

## What Was Built

### Task 1: Plugin manifest + /review command + paraphrase in start_review summary (TDD)

**`.claude-plugin/plugin.json`** — Claude Code plugin manifest. Keys: `name`, `version`, `description`, `author`, `commands: "./commands/"`, `mcpServers: "./.mcp.json"`. Correct location: inside `.claude-plugin/` per the plugin spec.

**`.mcp.json`** (at repo root, NOT inside `.claude-plugin/`) — MCP server declaration:
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
Uses `${CLAUDE_PLUGIN_ROOT}` — no hardcoded path (portability).

**`commands/review.md`** (at repo root, NOT inside `.claude-plugin/`) — `/review` slash-command prompt. YAML frontmatter with `description:` and `argument-hint:`. Body instructs LLM to call `start_review` with the appropriate discriminated `source` variant, then return the result verbatim. References `$ARGUMENTS`.

**`server/src/mcp/tools/start-review.ts`** — Updated:
- Added `paraphrase(desc: string): string` — deterministic markdown strip + first-paragraph extraction + 280-char truncation. Exported for unit testing.
- Added `renderSummaryForTest` export (thin wrapper around private `renderSummary`).
- Updated `renderSummary` to call `paraphrase(pr.description)` instead of raw `pr.description || '(no description)'`.
- Fixed Zod v4 incompatibility: `discriminatedUnion` with duplicate `kind: 'github'` entries now replaced with `z.union([z.union([...github variants...]), local])`.

**`server/src/mcp/tools/__tests__/start-review.test.ts`** — 19 tests:
- `paraphrase()`: 10 tests covering truncation, header stripping, bullet stripping, inline code (backtick removal, content preserved), link text extraction, empty/whitespace placeholder, multi-paragraph extraction, HTML comment stripping.
- `renderSummary()`: 5 tests covering line-0 pattern, line-1 pattern, paraphrase paragraph present (not raw markdown), final-line URL pattern, empty-description placeholder.
- Plugin manifest structure: 4 tests asserting plugin.json keys, .mcp.json location + CLAUDE_PLUGIN_ROOT arg, commands/ placement correctness.

**`server/src/__tests__/end-to-end.test.ts`** — Phase 1 seam test (1 test, 30s timeout):
1. Creates a throwaway git repo in `os.tmpdir()` (same helper pattern as Plan 04 integration test)
2. Boots `server/dist/index.js` via `node:child_process.spawn` with `CLAUDE_PLUGIN_DATA` set
3. Waits for `http://127.0.0.1:<port>` in stderr (5s timeout)
4. Sends MCP `initialize` + `tools/call start_review` JSON-RPC over stdin
5. Collects stdout until response with `id: 2` arrives (15s timeout)
6. Asserts `Review open at: http://127.0.0.1:<port>/?token=` in response text
7. Asserts `curl GET /` returns HTTP 200
8. Asserts `bash scripts/security-probes.sh <port>` exits 0
9. Sends SIGTERM, asserts exit code 0

## Test Results

```
Test Files  20 passed (20)   ← server
     Tests  117 passed (117)

Test Files  5 passed (5)     ← web
     Tests  37 passed (37)

Total: 154 tests passing
```

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| `.claude-plugin/plugin.json` parses as JSON with required keys | PASS |
| `.mcp.json` at repo root (NOT inside `.claude-plugin/`) | PASS |
| `.mcp.json` `args[0]` contains `${CLAUDE_PLUGIN_ROOT}` | PASS |
| `commands/review.md` at repo root with `description:`, `argument-hint:`, `start_review`, `$ARGUMENTS` | PASS |
| `.claude-plugin/commands/` does NOT exist | PASS |
| `paraphrase(` function definition in `start-review.ts` | PASS |
| `renderSummary` final line format: `Review open at: ${url}` | PASS |
| End-to-end test passes (boot → tools/call → security-probes → SIGTERM exit 0) | PASS |
| `pnpm --filter server build` exits 0 | PASS |
| `pnpm --filter web build` exits 0 | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Paraphrase paragraph split order**
- **Found during:** Task 1 GREEN phase (test failure)
- **Issue:** The plan's `paraphrase()` example collapsed whitespace (`.replace(/\s+/g, ' ')`) before splitting on `\n\n+`. After collapsing, `\n\n` becomes a single space and the paragraph split finds nothing.
- **Fix:** Split into paragraphs on `/\n\n+/` first, then strip and collapse each paragraph candidate independently. Loop finds the first non-empty stripped paragraph.
- **Files modified:** `server/src/mcp/tools/start-review.ts`
- **Commit:** 5f12172

**2. [Rule 1 - Bug] Zod v4 rejects duplicate discriminator values**
- **Found during:** End-to-end test execution — server returned `"Duplicate discriminator value 'github'"` instead of a tool result
- **Issue:** The plan's `z.discriminatedUnion('kind', [...])` schema has two entries with `kind: z.literal('github')` (url variant + number variant). Zod v4 strictly rejects duplicate discriminator values; Zod v3 allowed it.
- **Fix:** Replaced `discriminatedUnion` with `z.union([z.union([github-url, github-number]), local])`. Semantics preserved; Zod v4 compatible.
- **Files modified:** `server/src/mcp/tools/start-review.ts`
- **Commit:** a62a4c1

**3. [Rule 3 - Blocking issue] execa v9 streams don't emit data events in vitest worker threads**
- **Found during:** End-to-end test execution — the `child.stderr.on('data', ...)` listener never fired when using `execa()` for the server subprocess, even with explicit `stdin: 'pipe', stdout: 'pipe', stderr: 'pipe'` options. Works correctly in bare Node.js.
- **Fix:** Replaced `execa(...)` for the long-lived server subprocess with `node:child_process.spawn(..., { stdio: ['pipe', 'pipe', 'pipe'] })`. The `git` setup commands continue using `execa` (they complete synchronously and don't need stream listeners).
- **Files modified:** `server/src/__tests__/end-to-end.test.ts`
- **Commit:** a62a4c1

**4. [Rule 1 - Bug] REPO_ROOT path resolution in test: 4 levels vs 3 levels**
- **Found during:** End-to-end test execution — `Cannot find module '/Users/connorbarr/dev/personal/server/dist/index.js'`
- **Issue:** `path.resolve(__dirname, '../../../../')` from `server/src/__tests__/` goes 4 levels up → `personal/` not `git-review-plugin/`. Correct is 3 levels.
- **Fix:** Changed to `path.resolve(__dirname, '../../../')`.
- **Files modified:** `server/src/__tests__/end-to-end.test.ts`
- **Commit:** a62a4c1

## Task 2 (Checkpoint: awaiting human walkthrough)

Task 2 is a `type="checkpoint:human-verify"` gate. The executor has:
1. Confirmed both server and web builds pass (`pnpm --filter server build` + `pnpm --filter web build`)
2. Confirmed the automated e2e test passes

The human walkthrough is required to:
- Run `claude --plugin-dir /Users/connorbarr/dev/personal/git-review-plugin` in a real git repo
- Type `/review --local HEAD~1 HEAD` and verify the browser opens with the dark-mode UI
- Run `/review <github-pr-url>` and verify the paraphrased description appears in the chat
- Run `security-probes.sh <port>` manually and confirm exit 0
- Update `PROJECT.md` §Key Decisions with D-01 and D-04 rows (ROADMAP criterion #4 closure)
- Mark VALIDATION.md manual checks as PASS

## Phase-1 Gate Status

| ROADMAP Criterion | Status |
|-------------------|--------|
| 1. `/review` opens browser (GitHub URL or PR number) | Automated: PASS (e2e test confirms `Review open at:` URL in tool return + HTTP 200 on GET /); Human: PENDING (Task 2) |
| 2. `/review --local <base> <head>` renders diff without GitHub call | Automated: PASS (e2e test uses local source, no gh CLI called); Human: PENDING (Task 2) |
| 3. Security probes (bind/token/host/CSP) all pass | Automated: PASS (e2e test runs `security-probes.sh` and asserts exit 0); Human: PENDING (Task 2) |
| 4. D-01 and D-04 in PROJECT.md §Key Decisions | PENDING (Task 2 human step 10) |

## Phase-1 Requirement Closure

| Req | Closed By | Status |
|-----|-----------|--------|
| PLUG-01 | `commands/review.md` + zod discriminated union (Plan 02) | CLOSED |
| PLUG-02 | `browser-launch.ts` + `manager.startReview` wiring (Plan 04) | CLOSED |
| PLUG-03 | stderr URL echo + Plan 02 browser-launch.ts | CLOSED |
| INGEST-01 | `ingest/github.ts` (Plan 04) | CLOSED |
| INGEST-02 | `ingest/local.ts` (Plan 04) | CLOSED |
| SEC-01 | `hostname: '127.0.0.1'` (Plan 02) + e2e probe 1 | CLOSED |
| SEC-02 | tokenValidate + adopt endpoint (Plan 03) + e2e probe 2 | CLOSED |
| SEC-03 | hostValidate (Plan 03) + e2e probe 3 | CLOSED |
| SEC-04 | secureHeaders CSP (Plan 03) + e2e probe 4 | CLOSED |

## Handoff Note for Phase 2

Phase 2 (Persistent Session Store + Resume) builds on the reducer-on-single-event-loop pattern established here. The `SessionManager.startReview` call writes state once at the end (D-06). Phase 2 replaces that with per-event writes through an event-sourced reducer sharing the same `SessionManager` singleton. The `writeState` interface in `server/src/persist/store.ts` is the seam — Phase 2 changes the call site in `manager.ts`, not the storage primitives.

## Known Stubs

The `tokens` prop in `DiffView.tsx` is accepted but not wired to `@git-diff-view/react`'s highlighter hook (documented in Plan 06 SUMMARY). Shiki tokens are computed server-side and included in the session snapshot — Phase 2 wires the bridge.

## Threat Flags

None — all new surfaces (plugin manifest, slash-command prompt) are static configuration files with no runtime attack surface.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| .claude-plugin/plugin.json exists | FOUND |
| .mcp.json exists at repo root | FOUND |
| commands/review.md exists | FOUND |
| .claude-plugin/commands/ does NOT exist | CONFIRMED |
| server/src/mcp/tools/__tests__/start-review.test.ts exists | FOUND |
| server/src/__tests__/end-to-end.test.ts exists | FOUND |
| paraphrase( in start-review.ts | FOUND |
| CLAUDE_PLUGIN_ROOT in .mcp.json args | FOUND |
| Commit 6126841 (test RED) | FOUND |
| Commit 5f12172 (feat GREEN — manifests + paraphrase) | FOUND |
| Commit a62a4c1 (fix — e2e spawn + Zod v4 + path) | FOUND |
| 154 tests pass (117 server + 37 web) | CONFIRMED |

## Update (2026-04-18): Human-verify checkpoint APPROVED + shakedown fixes

Task 2's human walkthrough surfaced a cascade of integration bugs that the
automated vitest + Playwright stub coverage had missed. The fixes landed in
9 commits between the original checkpoint commit (`5fdea73`) and approval:

| Commit | Fix |
|--------|-----|
| `31b4c3f` | Inline `mcpServers` in plugin.json; delete root `.mcp.json`. The string-path form plus the auto-discovered file registered the same server twice; Claude Code's loader collapsed the duplicate and dropped the tool. |
| `d4320b4` | Rename `/review` → `/pair-review`. A bare `/review` collided with a globally-installed review skill; the collision ran that skill and Claude performed a freeform code review instead of calling our MCP tool. |
| `e7d6119` | Resolve `web/dist` via `CLAUDE_PLUGIN_ROOT`, not `process.cwd()`. The plugin is launched from the user's workspace, so the server was serving the SPA from `<user-repo>/web/dist` (not found → fallback HTML). |
| `1f8e962` | Include `session=<prKey>` in `launchBrowser` URL and SSE snapshot's `launchUrl`. The web bootstrap reads `?session=` to subscribe to `/api/events`; the missing param was silently sending `?session=` (empty → 400). |
| `e15e371` | Add `sessionLaunchUrl(prKey)` to test stubs so events-test expectations still hold after the manager-API change. |
| `1d2c7ca` | Include `&session=` in the URL Claude prints to chat (not just the auto-launched one). The chat-copyable URL used the bare `getLaunchUrl()`. |
| `7e84537` | Render diff hunks correctly: pass `l.text` verbatim (parse-diff already attaches the +/-/space prefix — we were double-prefixing into `++`/`--`) AND import `@git-diff-view/react/styles/diff-view-pure.css` so library classes style correctly. |
| `267ce82` | Wrap each file's hunks in a unified-diff envelope (`--- a/path` + `+++ b/path` above the `@@` hunks). The library's parser silently produces zero rows without the envelope; the Plan-06 spike only verified API exports, never actual rendering. |

### Final Self-Check (supersedes the initial pre-checkpoint table)

| Check | Result |
|-------|--------|
| .claude-plugin/plugin.json with INLINE mcpServers | CONFIRMED |
| No separate .mcp.json (merge-ambiguity defense) | CONFIRMED |
| commands/pair-review.md (renamed to avoid global skill collision) | CONFIRMED |
| `allowed-tools: mcp__git-review-plugin__start_review` frontmatter | CONFIRMED |
| `CLAUDE_PLUGIN_ROOT` used for web/dist path resolution | CONFIRMED |
| Browser auto-launch URL and chat-displayed URL both include `&session=<prKey>` | CONFIRMED |
| 117 server tests + 37 web tests still green | CONFIRMED |
| Human walkthrough: `/git-review-plugin:pair-review --local HEAD~1 HEAD` produces populated browser diff view with 14 files, Shiki highlighting, session-active header, footer URL | APPROVED |

### Handoff Note for Phase 2 (updated)

The Phase 2 entry-point expectations changed only cosmetically:

- Invoke via `/git-review-plugin:pair-review` (not `/pair-review`) — plugin commands are namespaced.
- `SessionManager.sessionLaunchUrl(prKey)` is now the canonical launch-URL builder; Phase 2's persistence layer should continue using it.
- The `@git-diff-view/react` integration now works end-to-end, but requires the unified-diff envelope. If Phase 3+ adds inline comments or widgets, build them against the library's per-line hooks — the render path is confirmed functional.
