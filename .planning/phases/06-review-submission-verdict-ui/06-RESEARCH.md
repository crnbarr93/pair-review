# Phase 6: Review Submission + Verdict UI — Research

**Researched:** 2026-04-22
**Domain:** GitHub PR review submission, Octokit REST API, two-step submit flow, pending-review detection, local markdown export
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Verdict + submit UX:**
- D-01: Submit flow uses a modal dialog. Verdict picker stays in TopBar. Clicking Submit opens a confirmation modal: verdict picker, editable review summary body, signal-ratio stats, all drafted inline comments.
- D-02: Signal-ratio warning is inline in the submit modal. Stats always display. Nit-heavy draft (>3 nits or signal ratio <40%) turns `--warn`-colored and changes button to "Submit anyway" — extra click required, no hard gate.
- D-03: Incomplete walkthrough requires verdict retype to submit early. Warning shown; user must type the verdict word to enable Submit.
- D-04: Review summary body is LLM-drafted via `submit_review` MCP tool, user-editable in modal. Markdown supported.
- D-05: Two-step submit flow: LLM calls `submit_review({verdict, body})` → `pending_confirmation` state → SSE opens modal → user confirms/edits → browser POSTs `/api/confirm-submit` → server calls Octokit.
- D-06: Design reference is `design.html` at project root — click "Submit review" for modal mockup.

**GitHub submission mechanics:**
- D-07: Octokit for `pulls.createReview`. Auth via `gh auth token`. `octokit` package added as server dependency.
- D-08: Pending-review detection at session start with adopt-or-clear choice. Query `GET /pulls/{n}/reviews` filtered by `state: PENDING` and authenticated user. Offer "Adopt", "Clear", or "Cancel". Never silently create a second pending review.
- D-09: Single `Anchor` adapter — `line` + `side` only, never `position`. Internal type `{path, line, side}` derived from `Thread.{path, line, side}`. Integration test required.
- D-10: Session state gate for idempotency. `submissionState` field: `not_yet → submitting → submitted | failed`. `submissionId` (nanoid) embedded in review body as HTML comment. Submit button refuses if state is `submitted`.

**Local-branch export:**
- D-11: GitHub-style structured markdown export. Format: verdict header, base→head refs, date, review summary body, inline comments as `### file:line (side)` sections.
- D-12: Export path is user-specified via `submit_review` `exportPath` field (required for local mode).

**MCP tool surface:**
- D-13: One tool: `submit_review`. Server detects GitHub vs local from `prKey` prefix. Cumulative toolbelt: 10/10.
- D-14: Input schema: `{ body: string, verdict: Verdict, exportPath?: string }`.
- D-15: Return: `{ content: [{ type: 'text', text: 'Review submitted: <url>' }] }` for GitHub; `'Review exported to <path>'` for local. Pending confirmation returns a wait message.

**Reducer extensions:**
- D-16: New `SessionEvent` variants: `submission.proposed`, `submission.confirmed`, `submission.completed`, `submission.failed`, `pendingReview.detected`, `pendingReview.resolved`.
- D-17: `ReviewSession` gains: `submissionState?`, `pendingSubmission?`, `pendingReview?`.

### Claude's Discretion

- Exact submit modal component structure (single vs decomposed).
- Exact styling of verdict cards (colors, selected states, badge positioning).
- Exact stats strip layout and which counts to show.
- Whether "Draft with Claude" button re-invokes MCP tool or is UI-only.
- How adopted pending review comments map into session threads (exact field mapping).
- Exact `submissionId` format (nanoid length, embedding pattern in review body).
- Whether `v` shortcut opens verdict picker dropdown or cycles through verdicts.
- Whether `s` shortcut opens submit modal directly.
- Exact wording of incomplete-walkthrough warning and retype prompt.
- How `/api/confirm-submit` validates user edits (body length limits, verdict validation).
- Whether threads-to-post list in modal is read-only or allows deselecting individual threads.

### Deferred Ideas (OUT OF SCOPE)

- Slack/team notifications from the submit modal.
- "Request re-review when addressed" checkbox.
- Tone/length controls ("Tone: constructive", "Shorten").
- "Summarize threads" auto-generation button.
- "Include inline threads" toggle (v1 posts all threads with `draftBody`).
- Thread deselection in submit modal (planner may include if trivial).
- `CHECK-V2-01` repo-level checklist override.
- Multi-line comment ranges (DIFF-V2-01).
- Suggested-edit code blocks (DIFF-V2-03).
- GraphQL `addPullRequestReview` mutation path.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUB-01 | User can submit a full GitHub review (verdict + summary body + all inline comments) in a single atomic `pulls.createReview` call | D-07 (Octokit), D-09 (Anchor adapter), Anchor Pattern section below |
| SUB-02 | Before submission, user sees a signal-ratio check listing counts of major / minor / nit findings | D-02 (signal-ratio warning), signal-ratio calculation from `selfReview.findings` |
| SUB-03 | Plugin detects existing pending review at session start and offers to adopt or clear | D-08 (pending-review detection), GitHub API filtering section below |
| SUB-04 | In local-branch mode, Submit exports to markdown file with verdict, body, and inline comments | D-11/D-12 (structured markdown export) |
</phase_requirements>

---

## Summary

Phase 6 is the terminal step of the review pipeline. It converts the walkthrough and threaded-comment scaffold built in Phase 5 into a posted GitHub review via a two-step human-in-the-loop flow: the LLM drafts via `submit_review`, the user confirms in a modal, and the server calls Octokit's `pulls.createReview`. The phase adds one MCP tool, two new session state surfaces (`submissionState`, `pendingReview`), six new `SessionEvent` variants, one new HTTP endpoint (`/api/confirm-submit`), and one new React component (`SubmitModal`).

The most error-prone API interaction in the entire product lives here: `pulls.createReview` has two coexisting coordinate systems (`position` vs `line`+`side`), and the `position` parameter is deprecated. The project has already decided to use `line`+`side` only (D-09); research confirms this is correct per the current GitHub docs and per the PITFALLS.md Blocker 1 analysis. The integration test is non-negotiable.

Pending-review detection is the second critical area. The GitHub REST API list-reviews endpoint returns all reviews for a PR including `PENDING` ones; filtering by `state: PENDING` must be done client-side because the endpoint does not accept a state filter. The authenticated-user identity comes from `gh auth token` (the same pattern used by existing ingest code).

**Primary recommendation:** Implement the Anchor adapter as a single pure function in `server/src/submit/anchor.ts` before wiring any Octokit call, and write the integration test fixture before touching the modal UI.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Octokit `pulls.createReview` call | API / Backend (MCP server) | — | Must not happen in browser; token lives server-side only |
| Pending-review detection | API / Backend (MCP server) | — | Requires GitHub API call at session start; server owns ingest |
| Submit modal UI | Browser / Client (React SPA) | — | Interactive form; user must be able to edit body and verdict |
| `/api/confirm-submit` endpoint | API / Backend (Hono) | — | State-changing POST; requires token middleware; server calls Octokit after |
| Signal-ratio calculation | API / Backend (server) | Browser (display) | Counts derived from `selfReview.findings` in session state; browser displays |
| Local markdown export | API / Backend (MCP server) | — | File I/O on server; browser only shows confirmation |
| `submissionState` persistence | API / Backend (SQLite session store) | — | Phase 2 reducer + applyEvent pipeline; browser reflects via SSE |
| Two-step confirm flow | Both | — | Server emits `submission.proposed` event; browser opens modal; browser POSTs confirm |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `octokit` | `5.0.5` | `pulls.createReview` REST call and `GET /pulls/{n}/reviews` | Per CLAUDE.md stack decision; bundles @octokit/rest; one import |
| `nanoid` | `5.1.9` | Generate `submissionId` and thread IDs | Already in server codebase |
| `zod` | `4.3.6` | Input schema for `submit_review` MCP tool and `/api/confirm-submit` body | Already used for all MCP tools |
| Node.js `node:fs/promises` | built-in | Write markdown export file | Already used for session persistence |

[VERIFIED: npm registry — `octokit@5.0.5` is the current version, confirmed via `npm view octokit version`]
[VERIFIED: server/package.json — `nanoid`, `zod` already present; `octokit` is NOT yet in server/package.json and must be added]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `execa` | `9.6.1` | Shell out to `gh auth token` for Octokit auth token | Already used in `server/src/ingest/github.ts` |

**Installation (server side only):**
```bash
cd server && pnpm add octokit@5.0.5
```

**Version verification:**
```
npm view octokit version  → 5.0.5  (verified 2026-04-22)
```

---

## Architecture Patterns

### System Architecture Diagram

```
LLM calls submit_review({verdict, body})
        │
        ▼
server/src/mcp/tools/submit-review.ts
  ├── validate: threads with draftBody exist?
  ├── validate: prKey prefix (gh: vs local:)
  ├── applyEvent('submission.proposed', {verdict, body})
  │     └── SSE broadcast → browser opens SubmitModal
  └── return: "Awaiting user confirmation"

Browser SubmitModal
  ├── shows: signal-ratio stats, verdict cards, editable body, threads list
  ├── incomplete walkthrough? → retype-verdict gate
  ├── user clicks Confirm
  └── POST /api/confirm-submit {prKey, verdict, body, exportPath?}

server/src/http/routes/confirm-submit.ts
  ├── tokenValidate middleware (Phase 1 — required)
  ├── validate body with zod
  ├── applyEvent('submission.confirmed')   → state = 'submitting'
  ├── detect mode from prKey prefix
  │
  ├── [GitHub mode]
  │     ├── build Anchor[] from session.threads (path, line, side)
  │     ├── call octokit.rest.pulls.createReview({event, body, comments})
  │     ├── applyEvent('submission.completed', {reviewId, url, submissionId})
  │     └── return {ok: true, url}
  │
  └── [Local mode]
        ├── build markdown export string
        ├── fs.writeFile(exportPath)
        ├── applyEvent('submission.completed', {path: exportPath, submissionId})
        └── return {ok: true, path}

Pending-review detection (session start / resume):
  start_review or resume
        │
        ▼
  [GitHub mode only]
  GET /repos/{o}/{r}/pulls/{n}/reviews (via octokit or gh CLI)
  filter: state === 'PENDING' && review.user.login === authenticatedLogin
        │
  ├── none found → continue
  └── found → applyEvent('pendingReview.detected', {reviewId, commentCount})
              SSE → browser shows PendingReviewModal (adopt / clear / cancel)
```

### Recommended Project Structure for New Files

```
server/src/
├── submit/
│   ├── anchor.ts          # Anchor adapter: Thread[] → Octokit comment[] (line+side only)
│   ├── octokit-submit.ts  # Octokit auth + pulls.createReview call
│   ├── markdown-export.ts # Local-branch markdown export writer
│   └── pending-review.ts  # GET /pulls/{n}/reviews + filter PENDING + adopt/clear logic
├── mcp/tools/
│   └── submit-review.ts   # new MCP tool (D-13)
└── http/routes/
    └── confirm-submit.ts  # POST /api/confirm-submit (D-05)

web/src/
└── components/
    └── SubmitModal.tsx     # new component (D-01, D-06)
```

### Pattern 1: Anchor Adapter (line + side — NEVER position)

**What:** A pure function that converts a `Thread` object (which carries `path`, `line`, `side` from Phase 5 resolution) into the Octokit comment payload shape.

**When to use:** Called in `confirm-submit.ts` immediately before the `octokit.rest.pulls.createReview` call. Every inline comment goes through this adapter and only this adapter — no inline mapping elsewhere.

[VERIFIED: docs.github.com — `position` is deprecated; `line` + `side` is the current approach. `side` accepts `LEFT` (deletions, shown red) or `RIGHT` (additions, shown green or context)]

```typescript
// Source: GitHub REST API docs (docs.github.com/en/rest/pulls/comments)
// Source: PITFALLS.md Pitfall 1 — Anchor adapter pattern

interface OctokitComment {
  path: string;
  body: string;
  line: number;
  side: 'LEFT' | 'RIGHT';
}

function threadToOctokitComment(thread: Thread): OctokitComment {
  // D-09: line + side ONLY. Never position. Single adapter, no inline mapping.
  return {
    path: thread.path,
    body: thread.draftBody ?? '',
    line: thread.line,
    side: thread.side === 'BOTH' ? 'RIGHT' : thread.side,  // BOTH maps to RIGHT (context lines)
  };
}
```

**CRITICAL NOTE:** The `octokit` TypeScript types (as of the checked version) may mark `position` as required in `PullsCreateReviewParamsComments`. This is a known type bug (octokit/plugin-rest-endpoint-methods.js#614). [VERIFIED: WebFetch — issue confirmed open, position is marked required in types but is optional in the GitHub API]. The fix is to use a type cast or supply `position: undefined` explicitly if the TypeScript compiler rejects the payload without it.

```typescript
// Workaround for Octokit type bug (issue #614):
const comment = {
  ...threadToOctokitComment(thread),
  position: undefined as unknown as number,  // required by TS types, optional in API
} satisfies Parameters<typeof octokit.rest.pulls.createReview>[0]['comments'][number];
```

### Pattern 2: Octokit Auth (gh auth token — existing pattern)

**What:** Shell out to `gh auth token` to get the user's current GitHub token, then instantiate Octokit with it. This is the same pattern used by `server/src/ingest/github.ts`.

```typescript
// Source: server/src/ingest/github.ts (existing pattern)
import { execa } from 'execa';
import { Octokit } from 'octokit';

async function getOctokit(): Promise<Octokit> {
  const { stdout } = await execa('gh', ['auth', 'token']);
  const token = stdout.trim();
  return new Octokit({ auth: token });
}
```

[VERIFIED: server/src/ingest/github.ts — `execa('gh', [...])` pattern already established]

### Pattern 3: Pending-Review Detection

**What:** On session start (GitHub mode only), list all reviews for the PR and filter for `state === 'PENDING'` and `user.login === authenticatedLogin`. The GitHub REST API `GET /repos/{o}/{r}/pulls/{n}/reviews` does NOT accept a state filter — filtering is client-side.

[VERIFIED: GitHub REST docs (docs.github.com/en/rest/pulls/reviews) — `listReviews` endpoint returns all reviews; no state query parameter exists. PENDING reviews are identified by absence of `submitted_at` and by `state: 'PENDING'` in the response body]

[VERIFIED: GitHub community discussions — no server-side filtering by state; client must iterate paginated results]

```typescript
// Source: GitHub REST API docs + octokit/rest.js
async function detectPendingReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  authenticatedLogin: string
): Promise<{ id: number; commentCount: number } | null> {
  const reviews = await octokit.paginate(
    octokit.rest.pulls.listReviews,
    { owner, repo, pull_number: pullNumber, per_page: 100 }
  );
  const pending = reviews.find(
    (r) => r.state === 'PENDING' && r.user?.login === authenticatedLogin
  );
  return pending
    ? { id: pending.id, commentCount: (pending as any).body?.length ?? 0 }
    : null;
}
```

### Pattern 4: Two-Step Confirm Flow (SSE + POST)

**What:** The `submit_review` MCP tool does NOT call Octokit directly. It applies `submission.proposed` event, which SSE-broadcasts to the browser, which opens the submit modal. The user edits/confirms and POSTs to `/api/confirm-submit`. The HTTP handler then calls Octokit.

**When to use:** Always for GitHub mode. Local mode follows the same two-step flow but the "confirm" action writes a file instead of calling Octokit.

**Analog in codebase:** Phase 2 stale-diff modal: server emits `staleDiff` via SSE → browser shows StaleDiffModal → user clicks "Adopt new diff" → browser POSTs `/api/session/resume` → server calls `applyEvent`.

[VERIFIED: server/src/http/routes/session-adopt.ts, session-resume.ts — two-step POST pattern already in place]

### Pattern 5: Signal-Ratio Calculation

**What:** Derive counts from `session.selfReview.findings` by severity, then compute signal ratio = (blocker + major) / total findings. Display in the submit modal stats strip.

```typescript
// Source: shared/types.ts — SelfReview.findings: ResolvedFinding[]
// Source: Phase 4 D-03 — severity enum: 'blocker' | 'major' | 'minor' | 'nit'

function computeSignalRatio(findings: ResolvedFinding[]): {
  blocker: number; major: number; minor: number; nit: number;
  signalRatio: number; isNitHeavy: boolean;
} {
  const counts = { blocker: 0, major: 0, minor: 0, nit: 0 };
  for (const f of findings) counts[f.severity]++;
  const total = findings.length;
  const signalRatio = total > 0 ? (counts.blocker + counts.major) / total : 1;
  const isNitHeavy = counts.nit > 3 || signalRatio < 0.4;
  return { ...counts, signalRatio, isNitHeavy };
}
```

[VERIFIED: shared/types.ts — `Severity` type and `ResolvedFinding.severity` field exist]

### Pattern 6: Reducer Extension (Phase 2 pure-function pattern)

**What:** Add new case branches to `server/src/session/reducer.ts` for the six new `SessionEvent` variants. The reducer is a pure function — no I/O, no async, no mutations. The `lastEventId` invariant is owned by `SessionManager.applyEvent`, NOT the reducer.

[VERIFIED: server/src/session/reducer.ts — pure function, all prior phases follow this pattern exactly]

New reducer cases:
```typescript
case 'submission.proposed':
  return { ...s, pendingSubmission: { verdict: e.verdict, body: e.body } };
case 'submission.confirmed':
  return { ...s, submissionState: { status: 'submitting', submissionId: e.submissionId } };
case 'submission.completed':
  return { ...s, submissionState: { status: 'submitted', ...e } };
case 'submission.failed':
  return { ...s, submissionState: { status: 'failed', error: e.error } };
case 'pendingReview.detected':
  return { ...s, pendingReview: { reviewId: e.reviewId, createdAt: e.createdAt, commentCount: e.commentCount } };
case 'pendingReview.resolved':
  return { ...s, pendingReview: undefined };
```

### Pattern 7: `/api/confirm-submit` Endpoint (Phase 1 security pattern)

**What:** POST endpoint that requires the same `token-validate` middleware as all other `/api/*` routes. Body is zod-validated. After validation, the handler calls the Octokit submit path or file-write path.

[VERIFIED: server/src/http/server.ts — `app.use('/api/*', tokenValidate(manager))` applies to all /api/* routes automatically]

```typescript
// Source: server/src/http/routes/session-events.ts — existing POST endpoint shape
// Source: server/src/http/server.ts — middleware ordering

const confirmSubmitBody = z.object({
  prKey: z.string().min(1),
  verdict: z.enum(['approve', 'request_changes', 'comment']),
  body: z.string().min(0).max(65536),
  exportPath: z.string().optional(),
}).strict();

export function mountConfirmSubmit(app: Hono, manager: SessionManager): void {
  app.post('/api/confirm-submit', async (c) => {
    const parsed = confirmSubmitBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.text('Bad request', 400);
    // ... apply events, call Octokit or fs.writeFile
  });
}
```

### Pattern 8: Local Markdown Export Format

**What:** For `prKey` starting with `local:`, `submit_review` writes a structured markdown file to `exportPath`. Format follows D-11.

```markdown
# Review: [PR title]
**Verdict:** Request changes
**Base → Head:** main → feat-auth
**Date:** 2026-04-22T14:32:00.000Z

## Summary
[User-edited review body text]

## Inline Comments

### src/auth/login.ts:42 (RIGHT)
Missing null check on `user.token` before passing to `verifyJwt`.
The function throws on undefined but no caller catches this.

### src/auth/login.ts:87 (LEFT)
This deleted branch handled the `expired` case — ensure the replacement covers it.
```

### Anti-Patterns to Avoid

- **Using `position` in the Octokit payload:** Never. `position` is deprecated, counts unified-diff lines from the first `@@`, and conflicts with `line`+`side`. [VERIFIED: GitHub docs, Pitfall 1]
- **Calling Octokit directly from the MCP tool handler:** The MCP tool applies `submission.proposed` and returns — it does NOT call Octokit. Octokit is called only from the HTTP `/api/confirm-submit` handler after user confirmation.
- **Skipping pending-review detection:** Starting a new review without checking for existing pending reviews leads to duplicate submissions (Pitfall 10). Detection must happen at session start, not at submit time.
- **Using `console.log` in the MCP server:** Corrupts the JSON-RPC stdio channel. Use `logger.error` (stderr) per project convention.
- **Storing the GitHub token in the browser bundle:** The token is obtained server-side via `gh auth token` and used only within the server process.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub API auth + REST calls | Custom fetch wrappers | `octokit` (`octokit@5.0.5`) | Type-safe, paginate helper, handles headers |
| Diff coordinate mapping | Custom position calculator | Anchor adapter using `Thread.line`+`Thread.side` | Thread already carries server-resolved coords from Phase 5 |
| Review deduplication | Custom hash comparison | `submissionId` embedded in review body + `submissionState` | Simple, no GitHub API query needed at submit time |
| Pending review listing | GraphQL query | REST `GET /pulls/{n}/reviews` + client-side filter | REST is sufficient; GraphQL path is deferred (CONTEXT.md) |
| Signal-ratio UI components | Custom chart library | Plain CSS counts strip with `--warn` token | Design.html shows a simple horizontal stats bar |

**Key insight:** The Octokit `paginate` helper handles pagination for `listReviews` automatically. Never assume one page is sufficient — the PR may have many historical reviews.

---

## Runtime State Inventory

Phase 6 is additive — no renames or migrations. However, the pending-review detection interacts with GitHub-side state that lives outside the project repo.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `state.db` (SQLite): `ReviewSession` gains 3 new optional fields (`submissionState`, `pendingSubmission`, `pendingReview`) — all optional, zero-migration (pre-Phase-6 snapshots load without these fields, reducer returns them as `undefined`) | Code edit only (shared/types.ts + reducer) |
| Live service config | GitHub: existing pending reviews for a PR from the authenticated user — the plugin must detect and offer adopt/clear at session start | API call at session start (pending-review.ts) |
| OS-registered state | None | — |
| Secrets/env vars | `gh auth token` — used server-side only, not stored | None |
| Build artifacts | `server/dist/` — rebuild required after adding `octokit` dependency | `pnpm build` in server/ after `pnpm add octokit` |

Nothing found in OS-registered state category — verified by reviewing the plugin's startup sequence (no OS registration).

---

## Common Pitfalls

### Pitfall A: `position` vs `line`+`side` in createReview comments

**What goes wrong:** Inline comments land on wrong lines, or the API returns 422. The legacy `position` parameter counts unified-diff lines from the first `@@` header — not file line numbers. Many Octokit examples and older code use `position`.

**Why it happens:** GitHub maintains backward compatibility. The Octokit TypeScript types for `createReview` still list `position` as a field (and incorrectly mark it required in some versions — issue #614).

**How to avoid:** Use only `line` + `side` (never `position`) through the single Anchor adapter in `server/src/submit/anchor.ts`. Run the integration test that posts a comment to a fixture PR and reads it back. [VERIFIED: docs.github.com — position is deprecated]

**Warning signs:** 422 errors with "pull_request_review_thread.line must be part of the diff"; comments appearing off by N lines where N equals context-line count.

### Pitfall B: TypeScript type error from `position` being required in Octokit types

**What goes wrong:** TypeScript compilation fails because `PullsCreateReviewParamsComments.position` is typed as `number` (not `number | undefined`) in some versions of `@octokit/types`.

**Why it happens:** Open Octokit bug — issue #614 on `plugin-rest-endpoint-methods.js`. [VERIFIED: WebFetch of GitHub issue]

**How to avoid:** Supply `position: undefined as unknown as number` or use a type assertion on the comments array. Confirm the behavior against the installed version of `octokit@5.0.5` during Wave 0.

### Pitfall C: Calling Octokit from within the MCP tool handler (blocking the LLM turn)

**What goes wrong:** The `submit_review` MCP tool calls Octokit directly. The Octokit call may take several seconds. The LLM's MCP client has a ~60s timeout but the UX degrades — the LLM turn is blocked until GitHub responds.

**Why it happens:** The naive pattern is "tool calls API, returns result". [ASSUMED — based on Pitfall 7 pattern in PITFALLS.md]

**How to avoid:** The two-step flow (D-05) avoids this entirely. The MCP tool applies `submission.proposed` and returns immediately. The Octokit call happens in the HTTP handler, invoked by the user's browser, not the LLM tool call.

### Pitfall D: Pending review not detected because `listReviews` only returns one page

**What goes wrong:** Plugin calls `octokit.rest.pulls.listReviews` once (30-item default page) and sees no PENDING review. But the PR has 31+ historical reviews; the pending one is on page 2.

**Why it happens:** Default pagination returns 30 items. The pending review is the most recent one, but `listReviews` returns in chronological order (oldest first). [VERIFIED: GitHub REST docs — "returns in chronological order"]

**How to avoid:** Use `octokit.paginate(octokit.rest.pulls.listReviews, ...)` which fetches all pages, or walk pages in reverse order (checking the last page first for a PENDING review since it would be the most recent).

**Warning signs:** Duplicate reviews appearing on PRs with many historical reviews.

### Pitfall E: `submissionState` not persisted — duplicate submit on browser refresh

**What goes wrong:** User clicks Confirm, Octokit call succeeds, browser shows success. User refreshes. `submissionState` was only in React state, not in the SQLite session. Confirm button is enabled again. Second Octokit call posts a duplicate review.

**Why it happens:** Forgetting that all persistent state flows through the Phase 2 reducer + SQLite pipeline.

**How to avoid:** `submissionState` must be a `ReviewSession` field applied via `applyEvent('submission.completed', ...)` before the HTTP handler returns. The reducer persists it to SQLite. On resume, the browser reads `submissionState: 'submitted'` and disables the Submit button.

### Pitfall F: `Thread.side === 'BOTH'` not handled in Anchor adapter

**What goes wrong:** `DiffLine.side` can be `'LEFT' | 'RIGHT' | 'BOTH'` (defined in `shared/types.ts`). Context lines are typed as `BOTH`. If a thread was anchored to a context line (which `draft_comment` should prevent, but may not for legacy sessions), the Octokit call receives `side: 'BOTH'` which is not a valid GitHub API value.

**Why it happens:** `LineSide` type in `shared/types.ts` includes `'BOTH'` for context lines.

**How to avoid:** Anchor adapter maps `BOTH → 'RIGHT'` (context lines in the post-image). Add an assertion or log warning if a thread with `side === 'BOTH'` is encountered.

---

## Code Examples

### Creating a Review via Octokit

```typescript
// Source: GitHub REST API docs (docs.github.com/en/rest/pulls/reviews)
// Source: octokit/rest.js library docs

import { Octokit } from 'octokit';

// Verdict mapping: plugin uses lowercase enum → GitHub API uses uppercase
const eventMap: Record<string, 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'> = {
  approve: 'APPROVE',
  request_changes: 'REQUEST_CHANGES',
  comment: 'COMMENT',
};

const submissionId = nanoid(12);
const bodyWithId = `${body}\n\n<!-- submission_id: ${submissionId} -->`;

const { data: review } = await octokit.rest.pulls.createReview({
  owner,
  repo,
  pull_number: pullNumber,
  commit_id: session.headSha,    // anchor to current HEAD SHA
  event: eventMap[verdict],
  body: bodyWithId,
  comments: session.threads
    ? Object.values(session.threads)
        .filter((t) => t.draftBody && !t.resolved)
        .map((t) => ({
          path: t.path,
          body: t.draftBody!,
          line: t.line,
          side: t.side === 'BOTH' ? 'RIGHT' : t.side,
          // Position explicitly undefined; Octokit type bug workaround:
          position: undefined as unknown as number,
        }))
    : [],
});

// review.html_url = "https://github.com/owner/repo/pull/1#pullrequestreview-123456"
```

### Detecting Pending Reviews

```typescript
// Source: GitHub REST docs — listReviews returns chronological order
// Filter client-side for state === 'PENDING'

async function getAuthenticatedLogin(octokit: Octokit): Promise<string> {
  const { data } = await octokit.rest.users.getAuthenticated();
  return data.login;
}

async function detectPendingReview(
  octokit: Octokit,
  owner: string, repo: string, pullNumber: number
): Promise<{ id: number; commentCount: number } | null> {
  const login = await getAuthenticatedLogin(octokit);
  const reviews = await octokit.paginate(
    octokit.rest.pulls.listReviews,
    { owner, repo, pull_number: pullNumber, per_page: 100 }
  );
  const pending = reviews.find(
    (r) => r.state === 'PENDING' && r.user?.login === login
  );
  return pending ? { id: pending.id, commentCount: 0 } : null;
}

// To clear: DELETE /pulls/{n}/reviews/{review_id}
await octokit.rest.pulls.deletePendingReview({
  owner, repo, pull_number: pullNumber, review_id: pendingId
});
```

### Submit Modal Keyboard Shortcut Wiring (App.tsx pattern)

```typescript
// Source: web/src/App.tsx — existing keydown listener pattern

// Phase 6: wire 'v' and 's' shortcuts (currently toast stubs from Phase 3 D-18)
case 'v':
  // Open verdict picker in TopBar or cycle verdict (planner discretion)
  openVerdictPicker();
  break;
case 's':
  // Open submit modal directly (planner discretion)
  if (state.submissionState?.status !== 'submitted') {
    setSubmitModalOpen(true);
  }
  break;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `position` parameter in review comments | `line` + `side` (+ `start_line`/`start_side` for ranges) | GitHub API v3 → current (position deprecated but still accepted) | Off-by-N line placement bugs eliminated |
| `@octokit/rest` standalone | `octokit` meta-package (includes @octokit/rest, pagination, auth) | Octokit v5.x | Single import, pagination helper included |
| Manual token from env | `gh auth token` shell-out | — | Single auth surface, matches user's gh CLI session |

**Deprecated/outdated:**
- `position` field in review-comment payloads: deprecated, use `line`+`side` instead. [VERIFIED: GitHub REST docs]
- `@octokit/rest` as a standalone package: superseded by `octokit` meta-package for v5+.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `gh` CLI | `gh auth token` for Octokit auth | ✓ | 2.x (assumed, used by Phase 1) | None — required for GitHub mode |
| `octokit` npm package | `pulls.createReview` | ✗ (not yet installed) | 5.0.5 (to install) | None — must add to server/package.json |
| Node.js `node:fs/promises` | Markdown export | ✓ | Built-in Node 22 | — |
| `nanoid` | `submissionId` generation | ✓ | 5.1.9 (already in server) | — |

**Missing dependencies with no fallback:**
- `octokit@5.0.5` — must be added to `server/package.json` in Wave 0. Plan task required: `pnpm add octokit@5.0.5`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (latest, configured via server/vitest.config.ts or package.json) |
| Config file | server/package.json (vitest script) or server/vitest.config.ts |
| Quick run command | `pnpm --filter server test --run` |
| Full suite command | `pnpm --filter server test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUB-01 | `pulls.createReview` atomic call with correct `line`+`side` coordinates | integration (fixture PR read-back) | `pnpm --filter server test --run submit-review` | ❌ Wave 0 |
| SUB-01 | Anchor adapter maps `Thread.{path, line, side}` → Octokit comment | unit | `pnpm --filter server test --run anchor` | ❌ Wave 0 |
| SUB-02 | Signal-ratio calculation returns correct counts and isNitHeavy flag | unit | `pnpm --filter server test --run confirm-submit` | ❌ Wave 0 |
| SUB-03 | Duplicate submit refused when `submissionState === 'submitted'` | unit | `pnpm --filter server test --run confirm-submit` | ❌ Wave 0 |
| SUB-03 | Pending-review detection filters by PENDING state and login | unit (mocked Octokit) | `pnpm --filter server test --run pending-review` | ❌ Wave 0 |
| SUB-04 | Local markdown export writes correct file with verdict, body, inline comments | unit | `pnpm --filter server test --run markdown-export` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter server test --run`
- **Per wave merge:** `pnpm --filter server test --run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `server/src/submit/__tests__/anchor.test.ts` — covers SUB-01 (Anchor adapter unit test)
- [ ] `server/src/submit/__tests__/pending-review.test.ts` — covers SUB-03 (pending detection)
- [ ] `server/src/submit/__tests__/markdown-export.test.ts` — covers SUB-04 (local export)
- [ ] `server/src/http/routes/__tests__/confirm-submit.test.ts` — covers SUB-01 (duplicate gate), SUB-02 (signal-ratio)
- [ ] `server/src/mcp/tools/__tests__/submit-review.test.ts` — covers MCP tool handler

Integration test for SUB-01 line-placement read-back requires a real GitHub fixture PR. This test is optional for CI (it requires `gh` auth) but MUST be run manually before shipping. The planner should note this as a manual verification step in the success criteria.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (GitHub token) | `gh auth token` server-side only; never exposed to browser |
| V3 Session Management | yes (confirm-submit POST) | Phase 1 `token-validate` middleware; double-submit token pattern |
| V4 Access Control | yes (confirm-submit must be per-session) | `tokenValidate` middleware already applied to all `/api/*` routes |
| V5 Input Validation | yes (body, verdict, exportPath) | `zod` validation on `/api/confirm-submit` body |
| V6 Cryptography | no (submissionId is not a secret) | `nanoid` for non-cryptographic ID generation |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSRF — malicious site POSTs to `/api/confirm-submit` | Tampering | Phase 1 double-submit token (`x-review-token` header + cookie) |
| Path traversal via `exportPath` | Tampering | Validate exportPath is an absolute path with a safe extension; reject paths outside allowed directories |
| Review body XSS via LLM-authored text | Spoofing | Review body rendered as a textarea value (React controlled) — auto-escaped. GitHub API receives raw markdown — no HTML injection surface |
| GitHub token exfiltration | Information Disclosure | Token obtained via `execa('gh', ['auth', 'token'])`, used in server process only, never sent to browser |
| Submitting review from wrong GitHub identity | Spoofing | Display authenticated user login in UI (PLUG-V2-01 is deferred, but the `getAuthenticated()` call for pending-review detection surfaces the login; Phase 7 can add the display) |

**`exportPath` validation:** The `submit_review` MCP tool receives `exportPath` from the LLM. Before writing, the server must validate: (1) the path is absolute; (2) it ends with `.md`; (3) it does not contain `..` segments. This prevents path traversal if the LLM generates a malicious path. [ASSUMED — standard file-write security practice]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Thread.side === 'BOTH'` can occur for context-line threads and must be mapped to `'RIGHT'` in the Anchor adapter | Code Examples, Pitfall F | Low — the mapping to RIGHT is safe; LEFT would be wrong for context lines, which should be anchored on RIGHT |
| A2 | `octokit@5.0.5` TypeScript types still exhibit the `position` required-field bug (issue #614) | Pitfall B | Medium — if fixed in 5.0.5, the workaround is harmless but unnecessary |
| A3 | MCP tool blocking on a multi-second Octokit call degrades UX (Pitfall C) | Anti-Patterns | Low — the two-step flow already avoids this; claim is stated for rationale only |
| A4 | `exportPath` LLM-supplied paths require validation for path traversal | Security Domain | Medium — LLM could hallucinate a path like `../../.env`; validation is cheap insurance |
| A5 | Walkthrough completion is determined by all steps having `status !== 'pending'` | Pattern 5 (signal ratio) / D-03 | Low — this matches the existing StageStepper logic in TopBar.tsx |

---

## Open Questions

1. **GitHub token for `GET /users/authenticated`**
   - What we know: `getAuthenticatedLogin` needs to call `octokit.rest.users.getAuthenticated()` to know whose pending review to look for.
   - What's unclear: Whether this is cached or whether a separate `gh api user` call is cheaper.
   - Recommendation: Use `octokit.rest.users.getAuthenticated()` at session start alongside pending-review detection; cache the result in `SessionManager`.

2. **Adopt path for pending reviews**
   - What we know: D-08 says "adopt" imports pending review comments into session threads.
   - What's unclear: GitHub's pending review may have comments at positions that map to `position` (not `line`+`side`) since older code posted them that way. These may not be directly adoptable as `Thread` objects with `line`+`side` coords.
   - Recommendation: For adopt, import the pending review's `body` and verdict as `pendingSubmission`; skip adopting individual comments into threads (comments are read-only context, not editable threads). The planner should specify this explicitly.

3. **`commit_id` in createReview**
   - What we know: The GitHub docs list `commit_id` as optional (defaults to most recent commit).
   - What's unclear: Whether omitting it causes comment placement to shift if new commits were pushed between session start and submission.
   - Recommendation: Always supply `commit_id: session.headSha` to anchor comments to the exact commit the user reviewed.

---

## Sources

### Primary (HIGH confidence)
- [GitHub REST: Create a review](https://docs.github.com/en/rest/pulls/reviews?apiVersion=2022-11-28) — `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` parameters: `event`, `body`, `comments[]` with `line`+`side` fields; `position` deprecated
- [GitHub REST: PR review comments](https://docs.github.com/en/rest/pulls/comments?apiVersion=2022-11-28) — `line`+`side` vs `position` semantics; `side` values `LEFT`/`RIGHT`; multi-line `start_line`/`start_side`
- `/octokit/rest.js` (Context7) — `pulls.createReview`, `pulls.listReviews`, `paginate` helper; SDK usage pattern
- `server/src/ingest/github.ts` — existing `execa('gh', ['auth', 'token'])` auth pattern [VERIFIED: codebase read]
- `server/src/session/reducer.ts` — pure function, no lastEventId touches [VERIFIED: codebase read]
- `server/src/http/server.ts` — middleware ordering; `/api/*` token validation [VERIFIED: codebase read]
- `shared/types.ts` — `Thread.{path, line, side}`, `LineSide` includes `'BOTH'`, `Verdict` type, `SelfReview.findings` with `Severity` [VERIFIED: codebase read]
- `server/package.json` — `octokit` NOT yet installed [VERIFIED: codebase read]

### Secondary (MEDIUM confidence)
- [Octokit plugin-rest-endpoint-methods.js issue #614](https://github.com/octokit/plugin-rest-endpoint-methods.js/issues/614) — `position` marked required in TypeScript types, confirmed still open [VERIFIED: WebFetch]
- [GitHub community discussion #55863](https://github.com/orgs/community/discussions/55863) — `listReviews` has no server-side state filter; filtering must be client-side [VERIFIED: WebFetch]
- [GitHub REST docs](https://docs.github.com/en/rest/pulls/reviews) — PENDING reviews identified by `state: 'PENDING'` and absence of `submitted_at` [VERIFIED: WebSearch + WebFetch]

### Tertiary (LOW confidence — marked ASSUMED in log)
- A1: `BOTH` → `RIGHT` mapping for context lines
- A4: `exportPath` path-traversal risk
- A5: walkthrough completion signal

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `octokit@5.0.5` confirmed via npm registry; all other dependencies already in codebase
- GitHub API mechanics: HIGH — verified against current docs; position deprecation confirmed
- Anchor adapter: HIGH — GitHub REST docs confirm `line`+`side` semantics
- Pending review detection: HIGH — API behavior confirmed; client-side filtering confirmed
- TypeScript type bug for position: MEDIUM — issue confirmed open but may be fixed in 5.0.5
- Adopt path for pending review comments: LOW — coordinates from older pending reviews may use `position`

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (GitHub API versioned; Octokit major update would invalidate stack section)
