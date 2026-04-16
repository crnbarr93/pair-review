# Git Review Plugin

## What This Is

A Claude Code plugin that pairs the user with an LLM to review pull requests through a rich local web GUI. The plugin launches a browser-based review workspace where Claude generates a PR summary, runs a self-review against a criticality-ranked checklist, and walks the user hunk-by-hunk through the core changes — capturing conversational inline comments along the way and posting a full GitHub review at the end. Built for a single developer (the author) who currently does LLM-assisted reviews via the Claude desktop app and finds that UX inadequate for real code review work.

## Core Value

**A pair-review workflow that produces a posted GitHub review of real reviewer quality, faster and with better coverage than reviewing alone or chatting with an LLM in a generic UI.** If everything else fails, the walkthrough → inline-comments → posted-review loop must feel like a competent co-reviewer sitting next to you.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Claude Code plugin launches a local web GUI for a given PR (GitHub URL or local branch diff)
- [ ] Plugin exposes MCP tools that let the LLM drive the web UI (navigate hunks, run self-review, post comments, submit review)
- [ ] Web UI renders a first-class PR diff view with syntax highlighting and hunk anchoring
- [ ] LLM generates a PR summary (intent, key changes, risk areas) visible in the GUI
- [ ] LLM self-review runs against a criticality-ranked checklist with code references linking back to diff locations
- [ ] Built-in default checklist ships with the plugin (correctness, security, tests, performance, style)
- [ ] Per-repo checklist override via a repo-committed file (e.g. `.review/checklist.md`) takes precedence over built-ins
- [ ] Step-by-step walkthrough orders changes as an LLM-chosen narrative over curated "core changes"
- [ ] "Show all" escape in the walkthrough expands beyond curated core to walk the remaining hunks
- [ ] Inline conversational comments anchored to file+line, supporting a GitHub-style threaded dialogue between user and LLM during the walkthrough
- [ ] Final "Post review" action submits a full GitHub review (verdict: Approve / Request changes / Comment) with summary body and all inline comments in a single API call
- [ ] GitHub PR ingestion (fetch diff, metadata, existing comments) via `gh` CLI and/or Octokit
- [ ] Local branch diff mode — diff between two refs with no host integration, review output stays local
- [ ] Per-PR review state persists on disk so closing the browser and reopening resumes the walkthrough, drafted comments, and checklist progress

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Zed extension — Zed's WASM extension API has no custom webview/panel surface, so a rich diff+comments UI is not feasible there. Revisit only via an MCP context server once the plugin is proven.
- VS Code / Cursor extensions — tool is personal; reach is not a goal for v1.
- GitLab and Bitbucket support — v1 targets GitHub plus local branches only; other hosts add API surface without personal value.
- Comments-only review mode — the walkthrough always culminates in a full GitHub review submission with verdict; comment-only posting is a deliberate non-goal.
- Hosted/shared backend — everything runs locally; no accounts, no server.
- Polished open-source release (docs site, install wizard, config UX, versioned releases) — this is a personal tool first; release polish is deferred until the workflow proves itself in daily use.
- LLM-inferred per-PR checklists — built-ins plus repo override cover the scope; dynamic inference adds variance without clear value for a personal tool.

## Context

- **User situation:** Author reviews pull requests frequently and already uses Claude (often the desktop app) as a review assistant. The desktop-app chat UX is the specific pain point being replaced.
- **Existing auth surface:** User is already running Claude Code, so the plugin inherits that session — no second API key, no separate auth flow. The LLM driving the review *is* the Claude Code session the user invokes the plugin from.
- **GitHub access assumption:** `gh` CLI is expected to be installed and authenticated (standard dev setup on macOS); plugin falls back to env-var token if needed.
- **Local-only scope:** Plugin spawns a local HTTP/websocket server, opens the user's default browser to it, and tears down when the review session ends. No data leaves the machine except the final review submission to GitHub.
- **Greenfield repo:** `/Users/connorbarr/dev/personal/git-review-plugin` is empty — no prior code to preserve, full stack choice is open.
- **Claude Code plugin surface assumed:** slash commands, MCP tools, hooks, and (optionally) subagents are all available to wire up the plugin flow.

## Constraints

- **Tech platform**: Must ship as a Claude Code plugin — slash command(s) as entry points, MCP server for LLM-driven UI control. — This is the platform decision; everything else follows.
- **UI surface**: Local web app (browser-based), not terminal UI. — Rich diff rendering + inline threaded comments require real DOM, not a TUI.
- **LLM driver**: The user's active Claude Code session drives the review via MCP tool calls; the plugin does not make its own LLM API calls. — Single auth surface; no duplicate keys; matches user's current workflow.
- **Git hosts (v1)**: GitHub + local branch diffs only. — Scope discipline; other hosts deferred to Out of Scope.
- **Persistence**: Per-PR review state on local disk, resumable across browser close. — Core UX requirement; chosen over session-only to match how real reviews happen in chunks.
- **Audience**: Single user (author). — Shapes polish level downward; allows hardcoded assumptions about the workflow.
- **OS**: macOS is the development and target environment. — Shell commands, `gh` CLI availability, default-browser launch all assume macOS conventions.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Claude Code plugin + local web UI (not Zed extension, not standalone app) | Zed's WASM extension API cannot render the needed diff+comments UI; Claude Code gives MCP + slash commands + existing auth for free. Zed integration possible later via shared MCP server. | — Pending |
| MCP tools as the LLM-to-UI control plane (not subagent+file-protocol) | MCP is the natural Claude Code pattern; gives responsive, typed tool calls that map cleanly to UI actions (show_hunk, post_comment, run_self_review, submit_review). Subagent+files would be clunkier. | — Pending |
| Built-in default checklist + optional per-repo override file | Works out of the box for any PR; teams/repos can drop a file to tune without forcing config up front. Avoids forcing schema design in v1 while leaving the door open. | — Pending |
| LLM-curated walkthrough with "show all" escape | Reviewer-style guidance beats "walk every hunk" for long PRs; escape hatch prevents missing something. | — Pending |
| Final action is a full GitHub review submission (verdict + body + inline comments) | Matches how real reviews ship; one API call keeps the GitHub UI clean; verdict discipline forces the user to actually decide. | — Pending |
| Resumable per-PR state on disk | Real reviews happen in chunks across hours/days; session-only state would be a non-starter. | — Pending |
| GitHub + local branches only in v1 (no GitLab/Bitbucket) | Personal tool; author works on GitHub. API surface for other hosts isn't free. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-16 after initialization*
