# Requirements: Git Review Plugin

**Defined:** 2026-04-16
**Core Value:** A pair-review workflow that produces a posted GitHub review of real reviewer quality, faster and with better coverage than reviewing alone or chatting with an LLM in a generic UI.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Plugin (PLUG)

- [ ] **PLUG-01**: User can launch a review via a single `/review` slash command inside Claude Code — `/review <github-url>` or `/review <pr-number>` for GitHub, `/review --local <base-ref> <head-ref>` for local branches
- [ ] **PLUG-02**: Plugin auto-launches the user's default browser to the local review URL on start
- [ ] **PLUG-03**: Plugin binds an ephemeral port and echoes the exact URL to the terminal as a fallback when the browser auto-launch fails
- [ ] **PLUG-04**: User can drive the review UI via keyboard shortcuts (`n`/`p` next/prev hunk, `c` comment, `r` mark hunk reviewed, `v` set verdict, `s` submit)

### Ingestion (INGEST)

- [ ] **INGEST-01**: User can load a GitHub PR by URL or PR number; plugin fetches metadata via `gh pr view --json` and the diff via `gh pr diff`, inheriting the user's existing `gh` authentication
- [ ] **INGEST-02**: User can review a local branch diff by supplying two refs; plugin runs `git diff <base>..<head>` and parses the unified-diff output with no host integration
- [ ] **INGEST-03**: User can see existing PR review comments (inline and top-level) alongside the diff as read-only context during the review
- [ ] **INGEST-04**: User can see CI / check-run status (name + conclusion) on the PR header when reviewing a GitHub PR

### Diff UI (DIFF)

- [ ] **DIFF-01**: User can read changes in a GitHub-style unified diff view with syntax highlighting and hunk anchoring as the default rendering mode
- [ ] **DIFF-02**: User can toggle between unified and split (side-by-side) diff views
- [ ] **DIFF-03**: User can navigate changed files via a file-tree sidebar that shows per-file review status (reviewed / in-progress / untouched)
- [ ] **DIFF-04**: User can see generated/lockfile/vendored paths auto-collapsed in the UI and excluded from the LLM's diff context (lockfiles, `dist/`, `node_modules/`, `.min.*`, etc.)

### LLM Surfaces (LLM)

- [ ] **LLM-01**: User can see an LLM-generated PR summary covering intent, key changes, and risk areas in a dedicated summary pane
- [ ] **LLM-02**: User can see an LLM self-review output — findings grouped by checklist category, severity-tagged, ordered by criticality, each with clickable `file:line` references back to the diff
- [ ] **LLM-03**: User can walk through the PR following an LLM-curated narrative that picks hunk order and provides per-step commentary explaining intent and flagging potential issues
- [ ] **LLM-04**: User can toggle a "show all" mode during the walkthrough to walk the remaining non-curated hunks without losing progress in the curated set
- [ ] **LLM-05**: User can carry on a conversational thread with the LLM on any diff line — anchored to `{path, line, side}` — that flattens to a single posted comment on review submission

### Checklist (CHECK)

- [ ] **CHECK-01**: Plugin ships with a criticality-ranked built-in default checklist covering correctness, security, tests, performance, and style that the LLM self-review is evaluated against
- [ ] **CHECK-02**: User can see per-category checklist coverage in the review UI (pass / partial / fail states derived from the self-review findings)

### Session (SESS)

- [ ] **SESS-01**: User can close the browser or quit Claude Code mid-review and, on next `/review` invocation for the same PR, resume with walkthrough cursor, drafted comments, summary, self-review findings, and checklist state intact
- [ ] **SESS-02**: User is alerted and given a resolution choice (rebase drafts / discard / view-both) when resuming a PR whose head SHA has changed since last session
- [ ] **SESS-03**: Plugin survives crashes, kills, and power loss without corrupting review state, using atomic write-and-rename and cross-process file locking
- [ ] **SESS-04**: User can run multiple concurrent review sessions in separate browser tabs and switch between them via a session-switcher UI

### Security (SEC)

- [ ] **SEC-01**: Local review server binds to `127.0.0.1` only — never `0.0.0.0` or `::`
- [ ] **SEC-02**: Every state-changing request requires a per-session random token in a custom header, verified server-side; missing/invalid token returns 403
- [ ] **SEC-03**: Server rejects requests whose `Host` header is not exactly `127.0.0.1:<port>` or `localhost:<port>` (closes the DNS-rebinding attack vector)
- [ ] **SEC-04**: All HTML responses carry a strict Content-Security-Policy that forbids external scripts, inline scripts (except a nonce'd entry), and external connections

### Review Submission (SUB)

- [ ] **SUB-01**: User can submit a full GitHub review (verdict: Approve / Request changes / Comment; summary body; all inline comments) in a single atomic `pulls.createReview` call
- [ ] **SUB-02**: Before submission, user sees a signal-ratio check listing counts of major / minor / nit findings to discourage nit floods
- [ ] **SUB-03**: Plugin detects an existing pending review on the PR at session start and offers to adopt or clear it (prevents duplicate reviews on resume)
- [ ] **SUB-04**: In local-branch mode (no GitHub PR), `Submit` exports the review to a markdown file on disk with verdict, body, and inline comments anchored to diff locations

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Checklist

- **CHECK-V2-01**: Per-repo checklist override via a repo-committed `.review/checklist.md` file that overrides the built-in default when present

### Diff UI

- **DIFF-V2-01**: Multi-line comment ranges (currently single-line only)
- **DIFF-V2-02**: In-diff search / filter
- **DIFF-V2-03**: Suggested-edit code blocks (GitHub `suggestion` blocks in comments)
- **DIFF-V2-04**: Incremental review mode — only show changes since last session

### Context

- **CTX-V2-01**: Tree-sitter / LSP-backed context injection (call-sites, related tests, symbol defs) for LLM tools
- **CTX-V2-02**: Previous-review memory — the LLM knows things this reviewer has flagged before on similar code
- **CTX-V2-03**: CODEOWNERS-aware display of file ownership

### Integration

- **INT-V2-01**: GitHub "Viewed" checkbox sync (mark-as-viewed state mirrored between plugin and GitHub)
- **INT-V2-02**: Zed integration via the same MCP server as a context server / slash command

### Plugin UX

- **PLUG-V2-01**: Authenticated-user display in the UI chrome (detect `gh auth token` vs `GITHUB_TOKEN` mismatch and surface it)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Zed extension as v1 target | Zed's WASM extension API cannot render the needed diff+threaded-comment UI; deferred to v2 as a shared-MCP-server integration (see INT-V2-02) |
| VS Code / Cursor extensions | Personal tool — reach is not a v1 goal |
| GitLab / Bitbucket / Azure DevOps support | v1 targets GitHub plus local branches only; other hosts add API surface without personal value |
| Comments-only review (no verdict) | Per PROJECT.md Core Value — the walkthrough must culminate in a full review with verdict; comment-only mode would dilute the core loop |
| Hosted / multi-tenant backend | Tool is local and single-user by design; accounts and cloud storage are anti-goals |
| LLM-authored per-PR checklist | Built-ins cover the scope reliably; dynamic per-PR inference adds variance without predictable value for a personal tool (per PROJECT.md anti-feature list) |
| Automated approval without human-in-the-loop | Core value requires a human in the final verdict seat |
| Polished open-source release (install wizard, docs site, configurability UX, versioned publishing) | Personal tool first — release polish deferred until the workflow proves itself in daily use |
| Team features (assignees, reviewer rotation, approval workflows beyond GitHub's own) | Personal-scope tool |
| Multi-LLM / model-switching UI | LLM driver is the user's active Claude Code session — by design, not configurable in-UI |
| PR-level analytics / review history dashboards | Out of scope for a personal review-authoring tool |
| GitHub Check Suite integration | Requires GitHub App + hosted endpoint, contradicts local-only constraint |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLUG-01 | — | Pending |
| PLUG-02 | — | Pending |
| PLUG-03 | — | Pending |
| PLUG-04 | — | Pending |
| INGEST-01 | — | Pending |
| INGEST-02 | — | Pending |
| INGEST-03 | — | Pending |
| INGEST-04 | — | Pending |
| DIFF-01 | — | Pending |
| DIFF-02 | — | Pending |
| DIFF-03 | — | Pending |
| DIFF-04 | — | Pending |
| LLM-01 | — | Pending |
| LLM-02 | — | Pending |
| LLM-03 | — | Pending |
| LLM-04 | — | Pending |
| LLM-05 | — | Pending |
| CHECK-01 | — | Pending |
| CHECK-02 | — | Pending |
| SESS-01 | — | Pending |
| SESS-02 | — | Pending |
| SESS-03 | — | Pending |
| SESS-04 | — | Pending |
| SEC-01 | — | Pending |
| SEC-02 | — | Pending |
| SEC-03 | — | Pending |
| SEC-04 | — | Pending |
| SUB-01 | — | Pending |
| SUB-02 | — | Pending |
| SUB-03 | — | Pending |
| SUB-04 | — | Pending |

**Coverage:**
- v1 requirements: 31 total
- Mapped to phases: 0
- Unmapped: 31 ⚠️ (to be mapped by roadmapper)

---
*Requirements defined: 2026-04-16*
*Last updated: 2026-04-16 after initial definition*
