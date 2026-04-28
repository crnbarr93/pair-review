# Requirements: Git Review Plugin

**Defined:** 2026-04-16
**Core Value:** A pair-review workflow that produces a posted GitHub review of real reviewer quality, faster and with better coverage than reviewing alone or chatting with an LLM in a generic UI.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Plugin (PLUG)

- [x] **PLUG-01**: User can launch a review via a single `/pair-review` slash command inside Claude Code — `/pair-review <github-url>` or `/pair-review <pr-number>` for GitHub, `/pair-review --local <base-ref> <head-ref>` for local branches
- [x] **PLUG-02**: Plugin auto-launches the user's default browser to the local review URL on start
- [x] **PLUG-03**: Plugin binds an ephemeral port and echoes the exact URL to the terminal as a fallback when the browser auto-launch fails
- [ ] **PLUG-04**: User can drive the review UI via keyboard shortcuts (`n`/`p` next/prev hunk, `c` comment, `r` mark hunk reviewed, `v` set verdict, `s` submit)

### Ingestion (INGEST)

- [x] **INGEST-01**: User can load a GitHub PR by URL or PR number; plugin fetches metadata via `gh pr view --json` and the diff via `gh pr diff`, inheriting the user's existing `gh` authentication
- [x] **INGEST-02**: User can review a local branch diff by supplying two refs; plugin runs `git diff <base>..<head>` and parses the unified-diff output with no host integration
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

- [x] **SESS-01**: User can close the browser or quit Claude Code mid-review and, on next `/pair-review` invocation for the same PR, resume with walkthrough cursor, drafted comments, summary, self-review findings, and checklist state intact
- [x] **SESS-02**: User is alerted and given a resolution choice (rebase drafts / discard / view-both) when resuming a PR whose head SHA has changed since last session
- [x] **SESS-03**: Plugin survives crashes, kills, and power loss without corrupting review state, using atomic write-and-rename and cross-process file locking
- [x] **SESS-04**: User can run multiple concurrent review sessions in separate browser tabs and switch between them via a session-switcher UI

### Security (SEC)

- [x] **SEC-01**: Local review server binds to `127.0.0.1` only — never `0.0.0.0` or `::`
- [x] **SEC-02**: Every state-changing request requires a per-session random token in a custom header, verified server-side; missing/invalid token returns 403
- [x] **SEC-03**: Server rejects requests whose `Host` header is not exactly `127.0.0.1:<port>` or `localhost:<port>` (closes the DNS-rebinding attack vector)
- [x] **SEC-04**: All HTML responses carry a strict Content-Security-Policy that forbids external scripts, inline scripts (except a nonce'd entry), and external connections

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
| PLUG-01 | Phase 1 | Complete |
| PLUG-02 | Phase 1 | Complete |
| PLUG-03 | Phase 1 | Complete |
| PLUG-04 | Phase 3 | Pending |
| INGEST-01 | Phase 1 | Complete |
| INGEST-02 | Phase 1 | Complete |
| INGEST-03 | Phase 3 | Pending |
| INGEST-04 | Phase 3 | Pending |
| DIFF-01 | Phase 3 | Pending |
| DIFF-02 | Phase 3 | Pending |
| DIFF-03 | Phase 3 | Pending |
| DIFF-04 | Phase 3 | Pending |
| LLM-01 | Phase 4 | Pending |
| LLM-02 | Phase 4 | Pending |
| LLM-03 | Phase 5 | Pending |
| LLM-04 | Phase 5 | Pending |
| LLM-05 | Phase 5 | Pending |
| CHECK-01 | Phase 4 | Pending |
| CHECK-02 | Phase 4 | Pending |
| SESS-01 | Phase 2 | Complete |
| SESS-02 | Phase 2 | Complete |
| SESS-03 | Phase 2 | Complete |
| SESS-04 | Phase 7 | Complete |
| SEC-01 | Phase 1 | Complete |
| SEC-02 | Phase 1 | Complete |
| SEC-03 | Phase 1 | Complete |
| SEC-04 | Phase 1 | Complete |
| SUB-01 | Phase 6 | Pending |
| SUB-02 | Phase 6 | Pending |
| SUB-03 | Phase 6 | Pending |
| SUB-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 31 total
- Mapped to phases: 31
- Unmapped: 0 ✓

**Phase distribution:**
- Phase 1 (Plugin Skeleton + Secure Vertical Slice): 9 requirements (PLUG-01, PLUG-02, PLUG-03, INGEST-01, INGEST-02, SEC-01, SEC-02, SEC-03, SEC-04)
- Phase 2 (Persistent Session Store + Resume): 3 requirements (SESS-01, SESS-02, SESS-03)
- Phase 3 (Diff UI + File Tree + Navigation): 7 requirements (PLUG-04, INGEST-03, INGEST-04, DIFF-01, DIFF-02, DIFF-03, DIFF-04)
- Phase 4 (LLM Summary + Checklist + Self-Review): 4 requirements (LLM-01, LLM-02, CHECK-01, CHECK-02)
- Phase 5 (Walkthrough + Inline Threaded Comments): 3 requirements (LLM-03, LLM-04, LLM-05)
- Phase 6 (Review Submission + Verdict UI): 4 requirements (SUB-01, SUB-02, SUB-03, SUB-04)
- Phase 7 (Polish + Concurrency): 1 requirement (SESS-04)

---
*Requirements defined: 2026-04-16*
*Last updated: 2026-04-16 after roadmap creation — traceability filled in with phase mappings*
