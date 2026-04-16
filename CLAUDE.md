<!-- GSD:project-start source:PROJECT.md -->
## Project

**Git Review Plugin**

A Claude Code plugin that pairs the user with an LLM to review pull requests through a rich local web GUI. The plugin launches a browser-based review workspace where Claude generates a PR summary, runs a self-review against a criticality-ranked checklist, and walks the user hunk-by-hunk through the core changes — capturing conversational inline comments along the way and posting a full GitHub review at the end. Built for a single developer (the author) who currently does LLM-assisted reviews via the Claude desktop app and finds that UX inadequate for real code review work.

**Core Value:** **A pair-review workflow that produces a posted GitHub review of real reviewer quality, faster and with better coverage than reviewing alone or chatting with an LLM in a generic UI.** If everything else fails, the walkthrough → inline-comments → posted-review loop must feel like a competent co-reviewer sitting next to you.

### Constraints

- **Tech platform**: Must ship as a Claude Code plugin — slash command(s) as entry points, MCP server for LLM-driven UI control. — This is the platform decision; everything else follows.
- **UI surface**: Local web app (browser-based), not terminal UI. — Rich diff rendering + inline threaded comments require real DOM, not a TUI.
- **LLM driver**: The user's active Claude Code session drives the review via MCP tool calls; the plugin does not make its own LLM API calls. — Single auth surface; no duplicate keys; matches user's current workflow.
- **Git hosts (v1)**: GitHub + local branch diffs only. — Scope discipline; other hosts deferred to Out of Scope.
- **Persistence**: Per-PR review state on local disk, resumable across browser close. — Core UX requirement; chosen over session-only to match how real reviews happen in chunks.
- **Audience**: Single user (author). — Shapes polish level downward; allows hardcoded assumptions about the workflow.
- **OS**: macOS is the development and target environment. — Shell commands, `gh` CLI availability, default-browser launch all assume macOS conventions.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Executive Recommendation (one-liner per dimension)
| # | Dimension | Recommendation | Version |
|---|-----------|----------------|---------|
| 1 | Plugin packaging | Claude Code plugin with `.claude-plugin/plugin.json` + `commands/` + `.mcp.json` | Spec current as of 2026-04 |
| 2 | MCP SDK | `@modelcontextprotocol/sdk` over **stdio** transport | `1.29.0` |
| 3 | Local web app | Vite + React SPA, served by a Hono HTTP server embedded in the MCP process | Vite `8.0.8`, React `19.2.5`, Hono `4.12.14` |
| 4 | Diff rendering | `@git-diff-view/react` | `0.1.3` |
| 5 | GitHub integration | `gh` CLI for auth/metadata/diff fetch + `octokit` for the single `POST /pulls/{num}/reviews` submission | `gh` 2.x, `octokit` `5.0.5` |
| 6 | Local git diff | Shell out to `git diff` + parse with `parse-diff` (unified diff pipeline shared with GitHub mode) | `parse-diff` `0.11.1` |
| 7 | Real-time UI transport | WebSocket via `ws` | `ws` `8.20.0` |
| 8 | State persistence | `better-sqlite3` with a single file at `${CLAUDE_PLUGIN_DATA}/state.db` | `12.9.0` |
| 9 | Runtime | Node.js 22 LTS (whatever Claude Code the user runs; don't require Bun) | Node `>=22` |
| 10 | Syntax highlighting | `shiki` (pre-rendered server-side for each hunk, cached) | `4.0.2` |
## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Claude Code plugin system | current (2026-04) | Distribution + entry points | Native platform for the tool. Spec is stable and public: `.claude-plugin/plugin.json` manifest, `commands/*.md` for slash commands, `.mcp.json` at plugin root declares the bundled MCP server, `${CLAUDE_PLUGIN_ROOT}` resolves the install dir, `${CLAUDE_PLUGIN_DATA}` gives persistent state across updates. |
| `@modelcontextprotocol/sdk` | `1.29.0` | MCP server implementation (LLM → UI control plane) | Official SDK. Use the `McpServer` + `StdioServerTransport` pattern from `@modelcontextprotocol/sdk/server/mcp.js` and `@modelcontextprotocol/sdk/server/stdio.js`. Works transparently with the plugin's `.mcp.json` command entry. |
| Node.js | 22 LTS (`>=22`) | Runtime for MCP server + embedded HTTP/WS server | MCP SDK requires `>=18`, `better-sqlite3` requires `>=20`. Node 22 LTS hits both, is the ecosystem floor in 2026, and matches what Claude Code itself ships on. `node:sqlite` is still experimental in 22/24 — stick with `better-sqlite3`. |
| Vite | `8.0.8` | Local web app bundler + dev server | Zero-config React SPA, instant HMR, tiny prod bundle you ship inside the plugin. No SSR concerns (local tool, no SEO). Build output is a static `dist/` folder served by Hono. |
| React | `19.2.5` | UI framework | SPA model fits a desktop-style review workspace. React 19 is the current major; all recommended UI libs below declare `^19` as a peer. |
| Hono | `4.12.14` | Embedded HTTP + static file server inside the plugin | Tiny (~14kB), Web-Standards-based, trivially runs on Node (via `@hono/node-server`) or Bun. Exposes `GET /` (static SPA), `GET /api/state`, and the WebSocket upgrade endpoint. Chosen over Express for size and over Next.js/Remix for ship-simplicity (no framework, no build conventions leaking into the plugin). |
| `@git-diff-view/react` | `0.1.3` (package) / `git-diff-view` `v0.x` | GitHub-style split/unified diff rendering | **Purpose-built to consume git unified diff output** — exactly what `gh pr diff` / GitHub's `.diff` endpoint / `git diff` all emit. GitHub-style UI, split + unified modes, token system for inline word-level diff highlighting, web-worker rendering for large PRs, first-class hunk-anchor hooks (needed for the `show_hunk`/inline-comment MCP tools). React 18/19 peer. Under active development (latest release 2026-03-19). |
| `better-sqlite3` | `12.9.0` | Per-PR review state persistence on disk | Fastest Node SQLite driver, synchronous API (simpler than async for a single-user local tool), battle-tested. Supports Node 20/22/23/24/25. Used via a single DB file at `${CLAUDE_PLUGIN_DATA}/state.db` so state survives plugin updates. |
| `octokit` | `5.0.5` | GitHub REST submission (posting the final review) | The "batteries-included" SDK — includes REST, GraphQL, auth plugins in one import. Needed to submit the review via `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` with the `event` verdict, `body`, and batched `comments[]` in a single round-trip. Don't take on `@octokit/rest` separately — `octokit` already bundles it. |
| `ws` | `8.20.0` | WebSocket server for LLM-driven UI updates | Minimal, fast, no extra transport fallbacks or broadcasting ceremony. The LLM-driven control plane is inherently stateful and bidirectional (browser ACKs a `show_hunk` so the next MCP tool call can proceed), which SSE models awkwardly. |
| Shiki | `4.0.2` | Syntax highlighting inside diff lines | TextMate-grammar-based, visually identical to VS Code. Renders to HTML strings server-side on hunk load and caches per (file, revision) — avoids every browser paint re-running a highlighter on a 2000-line PR. `@git-diff-view/react`'s token API accepts pre-highlighted HTML via its `renderContent`/token hooks. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | `4.3.6` | MCP tool input schemas | Required by the `McpServer.registerTool` pattern shown in the official MCP SDK docs. |
| `@hono/node-server` | latest | Adapter to run Hono on Node | Needed because Hono is runtime-agnostic; Node adapter is the thin glue. |
| `parse-diff` | `0.11.1` | Parse unified diff output into file/hunk/line objects | Works on output from both `gh pr diff` and `git diff`. Single internal representation fed to `@git-diff-view/react` regardless of source mode. |
| `execa` | latest 8.x | Shell out to `gh` and `git` CLIs | Safer, better-typed, promise-based child_process wrapper. |
| `@octokit/graphql` | `9.0.3` | Optional: GraphQL mutation path | Only if you need GraphQL's `addPullRequestReview`; the REST `/reviews` endpoint is sufficient for v1 and simpler. |
| `open` | latest 10.x | Launch user's default browser at the local URL | Standard macOS-friendly way to auto-open the review UI. |
| `get-port` | latest 7.x | Pick a free port for the local server | Avoids collisions when multiple review sessions run. |
| `nanoid` | latest 5.x | Stable IDs for comments, hunks, walkthrough steps | Tiny, fast, URL-safe. |
| TailwindCSS | latest 4.x | Styling the review UI | Standard React-SPA styling choice; Vite plugin is official. Not load-bearing — pick any CSS strategy you prefer. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| TypeScript `6.0.2` | Type checking both the MCP server and the web app | Use a monorepo-lite layout: `server/` (MCP + Hono) and `web/` (Vite). Share types in `shared/` and import both sides from there so MCP tool payloads and WebSocket messages stay aligned. |
| `tsx` | Run TypeScript entry points during dev | Faster than `ts-node`, no build step for local iteration inside Claude Code. |
| `vitest` | Unit tests (diff parsing, state machine, MCP tool handlers) | Same engine as Vite; zero config. |
| `claude --plugin-dir ./` | Live-test the plugin against a local checkout | Preferred over publishing-to-reinstall cycle; pair with `/reload-plugins` to pick up edits. |
| `pnpm` | Package manager (optional but recommended) | Workspace support for `server/` + `web/`; much smaller `node_modules` which matters when it ships with the plugin. |
## Installation
# MCP server side
# Web app side (separate workspace)
## Plugin Layout (concrete file structure)
# Review
## Rationale for Each Dimension
### 1. Plugin packaging — HIGH confidence
### 2. MCP server implementation — HIGH confidence
### 3. Local web app — HIGH confidence
### 4. Diff rendering — MEDIUM-HIGH confidence (`@git-diff-view/react` recommended; `react-diff-viewer-continued` is the defensible fallback)
- `react-diff-viewer-continued` — works and is React-19 compatible, but takes two strings (`oldValue`/`newValue`) rather than a unified diff. You'd have to reconstruct old/new from the patch, which loses the hunk headers you need for GitHub-style anchoring and is awkward for rename/copy detection. Fine fallback if `@git-diff-view/react` proves too young.
- `diff2html` — not a React component; produces HTML strings. Fine for read-only views, poor fit for inline-comment composers that need mounted React subtrees on each hunk.
- Monaco diff editor — huge (~5MB), editor-oriented, overkill, awkward to anchor inline-comment UI to.
- CodeMirror 6 merge view — a two-way merge editor, not a GitHub-style review UI. Wrong shape.
### 5. GitHub integration — HIGH confidence (hybrid: `gh` for ingest, Octokit for submit)
### 6. Local-branch diff mode — HIGH confidence (shell out + `parse-diff`)
- `isomorphic-git` — browser-friendly pure JS git. Unnecessary (we have Node and `git` on the PATH on macOS) and much slower on large repos.
- `simple-git` — a `git` wrapper with its own method API. Thin value over `execa('git', ['diff', ...])` and adds a dependency; you only need one command.
### 7. Real-time UI transport — HIGH confidence (WebSocket via `ws`)
### 8. State persistence — HIGH confidence (`better-sqlite3`)
- JSON files per PR — works, but you'll reinvent transactions the moment two MCP tools mutate state concurrently (which they will, since the browser WS and the LLM MCP call share state).
- `lowdb` / `keyv` — fine for toys; awkward for the relational shape of comments/hunks/checklist.
- `libsql` — lovely remote-capable SQLite, but you don't need remote; adds a dep.
### 9. Runtime — HIGH confidence (Node.js 22 LTS)
### 10. Syntax highlighting — MEDIUM confidence (Shiki, with a real tradeoff)
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Vite + React SPA | Next.js App Router | If you later want a hosted review service with SEO'd landing pages — not this tool. |
| Hono | Express | If you need a specific Express middleware that has no Hono equivalent — unlikely. |
| `@git-diff-view/react` | `react-diff-viewer-continued` | If `@git-diff-view/react` proves insufficiently mature for a specific rendering case; compatible React-19 fallback. |
| Octokit for submit | `gh api` shell calls | If you want zero extra deps and are okay hand-crafting the JSON body for reviews. Fine but uglier. |
| `better-sqlite3` | `node:sqlite` built-in | Once it exits experimental (possibly Node 26+). Revisit then to drop the native dep. |
| `ws` WebSocket | Server-Sent Events | If you redesign so the LLM never needs an ACK from the browser — e.g., fire-and-forget UI pushes only. Not the current model. |
| Shiki (server-side) | `highlight.js` via `lowlight` | If you prioritize bundle size and are okay with lower highlighting fidelity. |
| `gh` CLI for ingest | Octokit for ingest | If you want zero external CLI dependency — but PROJECT.md says `gh` is an assumed part of the dev setup, so this constraint is resolved. |
| Shell out to `git diff` | `isomorphic-git` | Only if you later run the plugin in a browser-only environment (you won't). |
| Node 22 | Bun | If you control the runtime (you don't — Claude Code's Node spawns your process). |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Next.js / Remix for the web UI | SSR, file-based routing, and framework conventions add complexity for zero value on a local no-SEO tool. Makes "bundle a SPA inside a plugin and serve from Hono" harder, not easier. | Vite + React SPA |
| Express | Larger, older, no first-class WebSocket upgrade, worse TypeScript story than Hono in 2026. | Hono |
| Socket.IO | Client library is ~100kB+, protocol is non-standard, fallback machinery (long-polling etc.) is pure waste for a local `ws://127.0.0.1` connection. | `ws` |
| Server-Sent Events only | One-way; you'll need a parallel POST channel for browser-acknowledged MCP tools like `show_hunk` waiting for the user to scroll. | WebSocket |
| Monaco diff editor | ~5MB, editor-shaped (not review-shaped), awkward to hang inline comment threads off diff lines. | `@git-diff-view/react` |
| CodeMirror 6 merge view | Two-way merge editor, wrong UX shape for a one-way code review. | `@git-diff-view/react` |
| `diff2html` | Returns HTML strings, not React components — you can't mount inline-comment threads inside hunks cleanly. | `@git-diff-view/react` |
| `simple-git` | Doesn't earn its dependency over `execa('git', [...])` for the narrow use of `git diff`. | Shell out via `execa` |
| `isomorphic-git` | Pure-JS git is slow on real repos; you already have `git` on macOS. | Shell out via `execa` |
| `lowdb` / JSON files for state | No transactions, poor story for concurrent mutations from MCP tools and the browser WS. | `better-sqlite3` |
| `node:sqlite` (built-in) | Still experimental in Node 22/24 (requires `--experimental-sqlite`); API is thinner than better-sqlite3. | `better-sqlite3` |
| `prismjs` | Highlighting quality visibly lags Shiki and even highlight.js in 2026; slower to gain language support. | Shiki (server-side) or highlight.js |
| `@octokit/rest` standalone | Subset of what `octokit` meta-package bundles; pulling both creates drift. | `octokit` |
| Streamable HTTP MCP transport | Required only for cross-host / multi-client scenarios; a Claude-Code-spawned local plugin uses stdio. | `StdioServerTransport` |
| Putting `commands/` inside `.claude-plugin/` | Documented common mistake — plugin won't load. | Keep `commands/`, `agents/`, `hooks/`, `.mcp.json` at the plugin root. |
| `console.log` in the MCP server | Corrupts the JSON-RPC stdio channel; server will break mysteriously. | `console.error` (stderr) or a file logger. |
## Stack Patterns by Variant
- Add a `marketplace.json` and distribute through a plugin marketplace (or the official Anthropic marketplace).
- Promote SQLite storage location to `${CLAUDE_PLUGIN_DATA}` (already recommended) so updates don't wipe review state.
- Keep all runtime choices identical — the stack scales down to personal and up to team without changes.
- Lean harder on `@git-diff-view/react`'s web-worker rendering mode.
- Pre-compute Shiki highlights server-side per hunk and push only the highlighted hunk the user is currently viewing.
- Add hunk pagination to the walkthrough state so the browser never holds the entire parsed diff in memory at once.
- Add an `OCTOKIT_TOKEN` env var fallback before the `gh auth token` probe; the rest of the stack is unchanged because Octokit already handles REST and GraphQL.
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@modelcontextprotocol/sdk@1.29.0` | Node `>=18`; TypeScript `5+` | Uses `.js` ESM import specifiers in the subpath exports (`/server/mcp.js`, `/server/stdio.js`). Needs `"type": "module"` in the MCP server's `package.json` and `"module": "Node16"` in tsconfig. |
| `better-sqlite3@12.9.0` | Node `20.x \|\| 22.x \|\| 23.x \|\| 24.x \|\| 25.x` | Native addon — users need a working C toolchain on first install, or prebuilt binaries (the package ships prebuilts for mainstream platforms including macOS arm64). |
| `react@19.2.5` | Works with `@git-diff-view/react@0.1.3` (peer `^16.8 \|\| ^17 \|\| ^18 \|\| ^19`) and `react-diff-viewer-continued@4.25.9` (peer `^15.3 \|\| ^16 \|\| ^17 \|\| ^18 \|\| ^19`) | Both diff libs accept React 19. |
| `octokit@5.0.5` | Node `>=20` (per `@octokit/rest` engines) | Matches the Node 22 target. |
| `vite@8.0.8` | Node `>=22` recommended in 2026 | Use the React plugin; no tailwind-specific conflict. |
| `hono@4.12.14` + `@hono/node-server` | Node `>=18` | `ws` layering: use `@hono/node-ws` (or wire `ws` directly to the underlying Node HTTP server exposed by `@hono/node-server`). |
## Open Questions Flagged for the Roadmap
## Sources
- `/modelcontextprotocol/typescript-sdk` (Context7) — `1.29.0` API (McpServer, StdioServerTransport, registerTool). HIGH.
- https://code.claude.com/docs/en/plugins — canonical plugin layout, `.claude-plugin/plugin.json`, `commands/`, `.mcp.json`, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`, directory-placement common mistakes. HIGH.
- https://code.claude.com/docs/en/plugins-reference — full plugin manifest schema, MCP server declaration format, hook event list, CLI commands. HIGH.
- https://modelcontextprotocol.io/docs/develop/build-server — TypeScript server quickstart (stdio logging rule, `registerTool` + zod pattern). HIGH.
- https://docs.github.com/en/rest/pulls/reviews — `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` parameters (event verdict, body, inline `comments[]`). HIGH.
- `/aeolun/react-diff-viewer-continued` (Context7) — component API, React 19 peer, Prism integration pattern. HIGH.
- `/mrwangjusttodo/git-diff-view` (Context7) — unified-diff input, split/unified, GitHub-style UI, web-worker rendering, token system. HIGH.
- `/shikijs/shiki`, `/websites/shiki_style` (Context7) — current version, server-side rendering guidance. HIGH.
- `/websites/hono_dev` (Context7) — Web-Standards framework, Node adapter, WebSocket helpers. HIGH.
- npm registry metadata (queried 2026-04-16): `@modelcontextprotocol/sdk@1.29.0` (2026-03-30), `shiki@4.0.2`, `vite@8.0.8`, `hono@4.12.14`, `react@19.2.5`, `react-diff-viewer-continued@4.25.9`, `@git-diff-view/react@0.1.3` (2026-03-19), `better-sqlite3@12.9.0`, `octokit@5.0.5`, `isomorphic-git@2.0.0` (not chosen), `simple-git@3.36.0` (not chosen), `parse-diff@0.11.1`, `ws@8.20.0`, `zod@4.3.6`, `typescript@6.0.2`. HIGH.
- WebSearch 2026-04 — `node:sqlite` still experimental in Node 22/24. MEDIUM.
- WebSearch 2026-04 — `react-diff-viewer-continued` vs `@git-diff-view/react` comparison; confirms git-diff-view is the GitHub-style, unified-diff-native choice. MEDIUM.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
