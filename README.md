# Git Review Plugin

A Claude Code plugin that pairs you with an LLM to review pull requests through a rich local web GUI. The plugin launches a browser-based review workspace where Claude generates a PR summary, runs a self-review against a criticality-ranked checklist, and walks you hunk-by-hunk through the core changes -- capturing conversational inline comments along the way and posting a full GitHub review at the end.

## Prerequisites

| Dependency | Version | Notes |
|------------|---------|-------|
| [Node.js](https://nodejs.org/) | >= 22 (LTS) | Runtime for the MCP server and build tooling |
| [pnpm](https://pnpm.io/) | >= 10.3 | Workspace-aware package manager (`corepack enable` then `corepack prepare pnpm@latest --activate`) |
| [GitHub CLI (`gh`)](https://cli.github.com/) | 2.x | Used for auth token extraction and PR metadata/diff fetching. Must be authenticated (`gh auth login`). |
| [Claude Code](https://claude.ai/download) | Latest | The plugin host -- this is a Claude Code plugin, not a standalone tool |

## Installation

Install the plugin into Claude Code by pointing it at your local checkout:

```sh
claude plugin add /path/to/git-review-plugin
```

Then build the project so the MCP server and web app are ready:

```sh
cd /path/to/git-review-plugin
pnpm install
pnpm build
```

After installation, the plugin registers three slash commands under the `/gr:` prefix and an MCP server automatically via `.claude-plugin/plugin.json`.

## Usage

### `/gr:pair-review` -- Start a review

The primary entry point. Accepts a GitHub PR URL, a PR number (inferred from the current repo), or local git refs:

```
# Full GitHub PR URL
/gr:pair-review https://github.com/owner/repo/pull/123

# PR number (owner/repo inferred from git remote)
/gr:pair-review 123

# Local branch diff
/gr:pair-review --local main feature/my-branch

# Dry run -- opens the workspace without auto-generating summary/walkthrough/self-review
/gr:pair-review 123 --dry
```

On launch, Claude will:

1. Start the local review server and open the browser UI
2. Generate a PR summary (intent, key changes, risk areas)
3. Build a step-by-step walkthrough of the core changes
4. Run a self-review against a ranked checklist and surface findings
5. Enter a listen loop, responding to chat messages and inline comments from the browser

The review session persists on disk. Closing the browser and re-running the same command resumes where you left off.

### `/gr:listen` -- Resume listening

If Claude stops responding to browser requests (e.g., after a context reset), use this to re-enter the listen loop for the active session without regenerating artifacts.

### `/gr:clear-cache` -- Reset state

Deletes all persisted review sessions and the syntax-highlight cache.

## Local Development

### Build everything

```sh
pnpm install
pnpm build        # builds server/ (tsc) and web/ (vite) in parallel
```

### Run in dev mode

For the web app with hot-reload:

```sh
cd web
pnpm dev          # Vite dev server with HMR
```

For the MCP server with file watching:

```sh
cd server
pnpm dev          # tsx watch src/index.ts
```

### Run tests

```sh
pnpm test         # runs vitest across all workspaces
```

Or per-workspace:

```sh
cd server && pnpm test
cd web && pnpm test
```

### Test the plugin live

Use Claude Code's local plugin mode to iterate without reinstalling:

```sh
claude --plugin-dir ./
```

After making changes, use `/reload-plugins` inside Claude Code to pick up edits.

## Project Structure

```
git-review-plugin/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest (name, version, MCP server declaration)
├── commands/
│   ├── pair-review.md       # /pair-review slash command definition
│   ├── listen.md            # /listen slash command definition
│   └── clear-cache.md       # /clear-cache slash command definition
├── server/                  # MCP server + HTTP/WebSocket backend (Node.js, Hono)
│   └── src/
│       ├── index.ts         # Entry point (MCP stdio transport + Hono HTTP server)
│       ├── mcp/             # MCP tool handlers (start_review, set_pr_summary, etc.)
│       ├── http/            # Hono routes and static file serving
│       ├── ingest/          # PR/diff ingestion (GitHub via gh CLI, local via git diff)
│       ├── session/         # Review session state management
│       ├── persist/         # On-disk persistence (JSON state files)
│       ├── submit/          # GitHub review submission (Octokit)
│       ├── highlight/       # Shiki syntax highlighting with caching
│       ├── checklist/       # Self-review checklist and scoring
│       └── browser-launch.ts
├── web/                     # Review UI (React SPA, Vite, Tailwind)
│   └── src/
│       ├── App.tsx          # Root component
│       ├── components/      # UI components (diff viewer, chat panel, walkthrough, etc.)
│       ├── store.ts         # Client-side state
│       └── api.ts           # WebSocket + HTTP client
├── shared/                  # Shared TypeScript types (workspace package @shared/types)
│   └── types.ts
├── scripts/                 # Dev utilities (fixture generation, security probes)
├── package.json             # Root workspace config (engines: node >=22)
├── pnpm-workspace.yaml      # Workspaces: server, web, shared
└── tsconfig.base.json       # Shared TypeScript config
```

### Key technologies

- **MCP server:** `@modelcontextprotocol/sdk` over stdio, with `zod` for tool input schemas
- **HTTP server:** Hono (serves the built SPA and API endpoints)
- **Real-time transport:** WebSocket via `ws` (bidirectional LLM-to-browser communication)
- **Diff parsing:** `parse-diff` (unified diff from both `gh pr diff` and `git diff`)
- **Syntax highlighting:** Shiki (server-side, cached per file/revision)
- **GitHub submission:** Octokit (`POST /pulls/{num}/reviews` with batched inline comments)
- **Frontend:** React 19, Tailwind CSS 4, Vite 8
- **State:** JSON files persisted under `${CLAUDE_PLUGIN_DATA}`
