# Git Review Plugin

## What This Is

A Claude Code plugin that pairs the user with an LLM to review pull requests through a rich local web GUI. The plugin launches a browser-based review workspace where Claude generates a PR summary, runs a self-review against a criticality-ranked checklist, and walks the user hunk-by-hunk through the core changes — capturing conversational inline comments along the way and posting a full GitHub review at the end. Built for a single developer (the author) who currently does LLM-assisted reviews via the Claude desktop app and finds that UX inadequate for real code review work.

## Core Value

**A pair-review workflow that produces a posted GitHub review of real reviewer quality, faster and with better coverage than reviewing alone or chatting with an LLM in a generic UI.** If everything else fails, the walkthrough → inline-comments → posted-review loop must feel like a competent co-reviewer sitting next to you.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- [x] Web UI renders a first-class PR diff view with syntax highlighting and hunk anchoring (Phase 3: bespoke DiffViewer with github-light Shiki, unified/split toggle, scrollIntoView hunk anchoring, file-tree sidebar)
- [x] LLM generates a PR summary (intent, key changes, risk areas) visible in the GUI (Phase 4: set_pr_summary MCP tool + SummaryDrawer with intent chip, paraphrase, key changes)
- [x] LLM self-review runs against a criticality-ranked checklist with code references linking back to diff locations (Phase 4: run_self_review MCP tool + FindingsSidebar with click-to-scroll, lineId resolution to path/line/side)
- [x] Built-in default checklist ships with the plugin (correctness, security, tests, performance, style) (Phase 4: 24-item checklist across 5 categories, criticality-ranked 1-3)
- [x] Claude Code plugin launches a local web GUI for a given PR (Phase 1: /pair-review slash command, MCP+HTTP single-process, default browser auto-launch)
- [x] Plugin exposes MCP tools that let the LLM drive the web UI (Phases 4-6: 10 tools total — start_review, list_files, get_hunk, set_pr_summary, run_self_review, set_walkthrough, draft_comment, reply_in_thread, resolve_thread, submit_review)
- [x] Step-by-step walkthrough orders changes as an LLM-chosen narrative over curated "core changes" (Phase 5: set_walkthrough MCP tool + WalkthroughStepList with reorder affordance)
- [x] "Show all" escape in the walkthrough expands beyond curated core to walk the remaining hunks (Phase 5: Curated/All hunks toggle, filter-not-reset preserves progress)
- [x] Inline conversational comments anchored to file+line, supporting a GitHub-style threaded dialogue between user and LLM during the walkthrough (Phase 5: draft_comment + reply_in_thread + resolve_thread, opaque server-resolved IDs)
- [x] Final "Post review" action submits a full GitHub review (verdict + body + inline comments) in a single API call (Phase 6: submit_review MCP tool → confirm-submit HTTP endpoint → Octokit pulls.createReview)
- [x] GitHub PR ingestion (fetch diff, metadata, existing comments) via `gh` CLI and/or Octokit (Phase 1/3: gh pr diff + gh pr view + existing-comments fetch)
- [x] Local branch diff mode — diff between two refs with no host integration, review output stays local (Phase 1: git diff ingest; Phase 6: markdown export on submit)
- [x] Per-PR review state persists on disk so closing the browser and reopening resumes the walkthrough, drafted comments, and checklist progress (Phase 2: event-sourced reducer + atomic JSON persistence + stale-diff detection)

### Active

<!-- Current scope. Building toward these. -->

(All v1 functional requirements validated. Phase 7 addresses polish and concurrency.)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Zed extension — Zed's WASM extension API has no custom webview/panel surface, so a rich diff+comments UI is not feasible there. Revisit only via an MCP context server once the plugin is proven.
- VS Code / Cursor extensions — tool is personal; reach is not a goal for v1.
- GitLab and Bitbucket support — v1 targets GitHub plus local branches only; other hosts add API surface without personal value.
- Comments-only review mode — the walkthrough always culminates in a full GitHub review submission with verdict; comment-only posting is a deliberate non-goal.
- Hosted/shared backend — everything runs locally; no accounts, no server.
- Polished open-source release (docs site, install wizard, config UX, versioned releases) — this is a personal tool first; release polish is deferred until the workflow proves itself in daily use.
- LLM-inferred per-PR checklists — built-in checklist covers the scope reliably; dynamic inference adds variance without predictable value for a personal tool.
- Per-repo checklist override file in v1 — deferred to v2 (see REQUIREMENTS.md `CHECK-V2-01`). Built-in checklist only in v1; if override value emerges in daily use, bring it forward.

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
| Built-in default checklist only in v1 (repo override deferred to v2) | Works out of the box; avoids forcing override-schema design in v1. Repo override (`.review/checklist.md`) tracked as `CHECK-V2-01` and will come forward if daily use surfaces a need. | — Pending |
| LLM-curated walkthrough with "show all" escape | Reviewer-style guidance beats "walk every hunk" for long PRs; escape hatch prevents missing something. | — Pending |
| Final action is a full GitHub review submission (verdict + body + inline comments) | Matches how real reviews ship; one API call keeps the GitHub UI clean; verdict discipline forces the user to actually decide. | — Pending |
| Resumable per-PR state on disk | Real reviews happen in chunks across hours/days; session-only state would be a non-starter. | — Pending |
| GitHub + local branches only in v1 (no GitLab/Bitbucket) | Personal tool; author works on GitHub. API surface for other hosts isn't free. | — Pending |
| **D-01 (Phase 1)** Real-time transport: SSE + HTTP POST (chosen over WebSocket) | Asymmetric broadcast shape (server pushes snapshots; client posts adopt/comment). EventSource is curl-debuggable and needs no extra dep; the LLM control channel is MCP-stdio so a bidirectional WS layer would have been redundant. | Resolved (Phase 1) |
| **D-04 (Phase 1)** Persistence format: atomic JSON via `write-file-atomic` + `proper-lockfile` (chosen over `better-sqlite3`) | Reducer-on-single-event-loop already serializes mutations; native addons add install friction in a plugin-distributed binary; grep-able JSON state is easier to debug for a single-user local tool. | Resolved (Phase 1) |
| **D-01 (Phase 3)** Phase-1 `01-UI-SPEC.md` formally superseded by the committed prototype at commit `c7fe93f` | Paper-and-teal light-mode design is the authoritative direction for Phase 3+; dark-mode palette + `@theme` block + `@git-diff-view/react` recommendation are abandoned in favor of bespoke components + `:root` CSS vars | Resolved (Phase 3 planning) — see `.planning/phases/03-diff-ui-file-tree-navigation/03-CONTEXT.md` D-01 and `03-UI-SPEC.md` |
| **D-05 (Phase 3)** Open Decision 1 (diff viewer library) resolves to the bespoke `DiffViewer.tsx` | `@git-diff-view/react` removed; bespoke renderer consumes server-side Shiki tokens and reuses the prototype's thread-marker gutter slot for read-only comment markers. Validated by the committed synthetic fixture render test at `web/src/__tests__/fixtures/` (≤500ms first paint on 50-hunk PR, ±20% advisory tolerance) | Resolved (Phase 3 planning) — see `.planning/phases/03-diff-ui-file-tree-navigation/03-CONTEXT.md` D-05, D-09 and `03-RESEARCH.md` Q1 |
| **D-24 correction (Phase 3)** `gh pr checks --json` field names are `bucket` and `link` — NOT `conclusion` and `detailsUrl` | CONTEXT D-24 originally specified `conclusion`/`detailsUrl`; verified against `gh pr checks --help` these fields do not exist. Correct fields are `name,state,bucket,link`. Also: exit code 8 = "checks pending" is not an error — stdout must be parsed anyway. `CheckRun` type in `shared/types.ts` uses `bucket` and `link` | Resolved (Phase 3 planning) — see `.planning/phases/03-diff-ui-file-tree-navigation/03-RESEARCH.md` Q6, Pitfall B, Pitfall F |
| **D-05 (Phase 4)** Default verdict: `request_changes` (adversarial framing) | Anchors the LLM toward finding real issues rather than rubber-stamping; user can always override to approve. | Resolved (Phase 4) |
| **D-09 (Phase 4)** Paraphrase-fidelity discipline carried via tool description only | Tool description is the sole prompt surface (D-20); no system prompt injection. Keeps prompt engineering visible and auditable in the tool registration code. | Resolved (Phase 4) |
| **D-12 (Phase 4)** FindingsSidebar auto-opens on first selfReview.set | Immediate visibility of findings without requiring user action; stays open on regenerate. | Resolved (Phase 4) |
| **D-16 (Phase 4)** Generated-file filtering at list_files level only | get_hunk does NOT filter generated files — LLM may still inspect them if it knows the fileId. Enumeration-level filter is sufficient to steer LLM attention. | Resolved (Phase 4) |
| **Nit cap (Phase 4)** Zod `.refine()` not propagated by MCP SDK — handler-side validation | MCP SDK constructs its own validator from `Input.shape` and drops `.refine()` refinements. Nit cap (≤3) enforced in handler with `isError: true` response. | Resolved (Phase 4) |
| **D-09 (Phase 6)** Anchor adapter: line+side only, never position | Octokit `position` field is deprecated and unreliable (Pitfall A/F). BOTH side maps to RIGHT (context lines anchor on post-image). | Resolved (Phase 6) |
| **D-05 (Phase 6)** Two-step submit: LLM proposes → user confirms in browser | submit_review MCP tool applies `submission.proposed`; actual Octokit call happens in `/api/confirm-submit` after user clicks. Prevents accidental submissions. | Resolved (Phase 6) |
| **D-10 (Phase 6)** submissionId embedded as HTML comment for idempotency | `<!-- submission_id: abc123 -->` in review body enables duplicate detection. Server returns 409 on re-submit. | Resolved (Phase 6) |
| **D-08 (Phase 6)** Pending-review detection at session start (fail-open) | Paginated listing filters by PENDING+authenticated login. Detection failure logs warn, never blocks session. | Resolved (Phase 6) |
| **D-03 (Phase 6)** Retype gate for incomplete-walkthrough submissions | When walkthrough is not 8/8, user must type exact verdict word to confirm early submission. Prevents accidental premature reviews. | Resolved (Phase 6) |

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
*Last updated: 2026-04-23 after Phase 6 completion (review submission + verdict UI shipped; all v1 functional requirements validated; Phase 7 is polish only)*
