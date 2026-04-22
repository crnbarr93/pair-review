# Phase 6: Review Submission + Verdict UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 06-review-submission-verdict-ui
**Areas discussed:** Verdict + submit UX, GitHub submission mechanics, Local-branch export, MCP tool shape

---

## Verdict + submit UX

### Verdict picker style

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in TopBar | Replace stub button with dropdown/segmented control. Compact, always visible. | |
| Full-screen submit panel | Submit step opens a dedicated panel replacing the diff view. | |
| Modal dialog on submit | Verdict picker in TopBar, Submit opens confirmation modal with stats, comments, editable body. | ✓ |

**User's choice:** Modal dialog on submit
**Notes:** Lighter weight than a full panel but provides more review surface than inline-only.

### Signal-ratio warning

| Option | Description | Selected |
|--------|-------------|----------|
| Inline warning in modal | Stats always show; nit-heavy drafts get warning colors and "Submit anyway" button. | ✓ |
| Hard gate | Submit disabled until signal ratio improves. | |
| Stats only, no friction | Show counts but never block or add friction. | |

**User's choice:** Inline warning in modal
**Notes:** Visual friction without hard blocking. >3 nits or <40% signal ratio triggers warning.

### Early submit gate (incomplete walkthrough)

| Option | Description | Selected |
|--------|-------------|----------|
| Retype verdict | User must type the verdict word to confirm early submission. | ✓ |
| Checkbox confirmation | Check a box to acknowledge incomplete walkthrough. | |
| Warning only | Show warning but Submit stays enabled. | |

**User's choice:** Retype verdict
**Notes:** Per ROADMAP success criterion 5. High-friction confirmation for Pitfall 20 mitigation.

### Review summary body source

| Option | Description | Selected |
|--------|-------------|----------|
| LLM-drafted via MCP | submit_review tool accepts body field, LLM drafts, user edits in modal. | ✓ |
| User-written only | Empty textarea, user writes from scratch. | |
| Auto-generated from summary | Plugin auto-composes from PrSummary fields. | |

**User's choice:** LLM-drafted via MCP
**Notes:** Markdown supported. User sees and edits before submission.

---

## GitHub submission mechanics

### Submission API

| Option | Description | Selected |
|--------|-------------|----------|
| Octokit | Use octokit package for POST /pulls/{n}/reviews. Auth via gh auth token. | ✓ |
| gh api CLI | Shell out to gh api with JSON body. Zero new deps. | |
| GraphQL mutation | Use addPullRequestReview GraphQL mutation. More powerful, more complex. | |

**User's choice:** Octokit
**Notes:** Per CLAUDE.md stack decision. Single atomic createReview call.

### Pending-review handling

| Option | Description | Selected |
|--------|-------------|----------|
| Detect + adopt or clear | Query GitHub, offer Adopt/Clear/Cancel choice. | ✓ |
| Always clear | Silently delete pending review and start fresh. | |
| Detect + warn only | Show it exists but don't offer adopt. | |

**User's choice:** Detect + adopt or clear
**Notes:** Adopt imports pending comments into session threads. Clear DELETEs the review. Per SUB-03, Pitfall 10.

### Coordinate mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Single Anchor adapter | One Anchor type { path, line, side }, one adapter function, never position. | ✓ |
| You decide | Claude picks shape; Pitfall 1 constraint non-negotiable. | |

**User's choice:** Single Anchor adapter
**Notes:** Integration test posts comment and reads back to verify line correctness.

### Idempotency

| Option | Description | Selected |
|--------|-------------|----------|
| Session state gate | Track submissionState with submissionId nanoid embedded as HTML comment. | ✓ |
| Simple flag | Boolean submitted: true. Simpler but less robust. | |

**User's choice:** Session state gate
**Notes:** States: not_yet → submitting → submitted | failed. SubmissionId embedded in review body for dedup.

---

## Local-branch export

### Export format

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub-style review markdown | Structured markdown: verdict header, summary, inline comments with file:line headings. | ✓ |
| Minimal plain text | Simple text dump. | |
| You decide | Claude picks format. | |

**User's choice:** GitHub-style review markdown
**Notes:** Readable in any markdown viewer.

### Export path

| Option | Description | Selected |
|--------|-------------|----------|
| Repo root .reviews/ dir | Write to .reviews/<base>..<head>-review.md. Gitignored by convention. | |
| Plugin data dir | Write to ${CLAUDE_PLUGIN_DATA}/exports/. | |
| User-specified path | Prompt user for output path. | ✓ |

**User's choice:** User-specified path
**Notes:** Most flexible. LLM asks user or proposes a default via the exportPath tool field.

---

## MCP tool shape

### Tool count

| Option | Description | Selected |
|--------|-------------|----------|
| One tool, two paths | Single submit_review handles both GitHub and local export. Cumulative 10/10. | ✓ |
| Two separate tools | submit_github_review + export_review. Cumulative 11/10 — over budget. | |
| You decide | Claude picks based on schema needs. | |

**User's choice:** One tool, two paths
**Notes:** Server detects GitHub vs local from prKey prefix. Saves a tool-budget slot.

### Flow driver

| Option | Description | Selected |
|--------|-------------|----------|
| MCP tool drives it | LLM calls submit_review, server handles everything. | ✓ |
| Browser drives it | User clicks Submit, browser POSTs to /api/submit. | |
| Hybrid | Browser collects edits, server does Octokit call. No MCP tool. | |

**User's choice:** MCP tool drives it
**Notes:** Matches Phase 4/5 pattern where MCP tools are the mutation surface.

### Edit flow

| Option | Description | Selected |
|--------|-------------|----------|
| Browser edits, then LLM submits | Two-step: LLM proposes via submit_review, browser modal for user editing, user confirms via POST. | ✓ |
| LLM submits directly | No browser confirmation step. | |
| You decide | Claude picks exact confirmation flow. | |

**User's choice:** Browser edits, then LLM submits (two-step)
**Notes:** LLM proposes → pendingSubmission state → modal opens → user edits → Confirm POST → Octokit call.

---

## Claude's Discretion

- Submit modal component structure
- Verdict card styling details
- Stats strip layout
- "Draft with Claude" button behavior
- Adopted pending review comment mapping
- SubmissionId format
- `v`/`s` keyboard shortcut exact behavior
- Retype prompt wording
- Confirm-submit endpoint validation
- Whether threads-to-post list allows deselection

## Deferred Ideas

- Slack/team notifications from submit modal (v2)
- "Request re-review when addressed" workflow (v2)
- Tone/length controls on review body (v2)
- "Summarize threads" auto-generation (v2)
- "Include inline threads" toggle (v2)
- Thread deselection in submit modal (v2, unless trivial)
- GraphQL mutation path (v2, unless REST insufficient)
