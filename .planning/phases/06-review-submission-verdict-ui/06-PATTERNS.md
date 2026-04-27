# Phase 6: Review Submission + Verdict UI — Pattern Map

**Mapped:** 2026-04-22
**Files analyzed:** 13 new/modified files
**Analogs found:** 12 / 13

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/mcp/tools/submit-review.ts` | service | request-response | `server/src/mcp/tools/run-self-review.ts` | exact |
| `server/src/submit/anchor.ts` | utility | transform | `server/src/ingest/github.ts` (`resolveCommentAnchor`) | role-match |
| `server/src/submit/octokit-submit.ts` | service | request-response | `server/src/ingest/github.ts` (`ingestGithub`) | role-match |
| `server/src/submit/markdown-export.ts` | utility | file-I/O | `server/src/ingest/local.ts` | role-match |
| `server/src/submit/pending-review.ts` | service | request-response | `server/src/ingest/github.ts` (`fetchExistingComments`) | role-match |
| `server/src/http/routes/confirm-submit.ts` | controller | request-response | `server/src/http/routes/session-events.ts` | exact |
| `server/src/session/reducer.ts` (modified) | service | event-driven | itself (pure function, extend existing switch) | exact |
| `shared/types.ts` (modified) | model | — | itself (additive extension pattern) | exact |
| `server/src/mcp/server.ts` (modified) | config | — | itself (registration pattern) | exact |
| `server/src/http/server.ts` (modified) | config | — | itself (mount pattern) | exact |
| `web/src/store.ts` (modified) | store | event-driven | itself (additive action pattern) | exact |
| `web/src/components/SubmitModal.tsx` | component | request-response | `web/src/components/StaleDiffModal.tsx` | exact |
| `web/src/App.tsx` (modified) | component | event-driven | itself (keyboard + modal wiring pattern) | exact |

---

## Pattern Assignments

### `server/src/mcp/tools/submit-review.ts` (service, request-response)

**Analog:** `server/src/mcp/tools/run-self-review.ts`

**Imports pattern** (`run-self-review.ts` lines 1–14):
```typescript
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../session/manager.js';
import { logger } from '../../logger.js';
import type { Verdict } from '@shared/types';
```

**Tool registration pattern** (`run-self-review.ts` lines 113–117):
```typescript
export function registerSubmitReview(mcp: McpServer, manager: SessionManager): void {
  mcp.registerTool(
    'submit_review',
    { title: 'Submit Review', description: DESCRIPTION, inputSchema: Input.shape },
    async ({ prKey, verdict, body, exportPath }) => {
```

**Input schema pattern** (`run-self-review.ts` lines 34–52):
```typescript
const VerdictEnum = z.enum(['request_changes', 'comment', 'approve']);

const Input = z.object({
  prKey: z.string().min(1).max(200),
  body: z.string().min(0).max(65536),
  verdict: VerdictEnum,
  exportPath: z.string().optional(),
});
```

**Session guard + isError return pattern** (`run-self-review.ts` lines 118–132):
```typescript
const session = manager.get(prKey);
if (!session) {
  return {
    content: [{ type: 'text' as const, text: `session not found for prKey "${prKey}". Call start_review first.` }],
    isError: true as const,
  };
}
```

**applyEvent then return pattern** (`run-self-review.ts` lines 208–211):
```typescript
await manager.applyEvent(prKey, { type: 'submission.proposed', verdict, body });
return { content: [{ type: 'text' as const, text: 'Review submitted to modal — awaiting user confirmation.' }] };
```

**Error catch pattern** (`run-self-review.ts` lines 213–225):
```typescript
} catch (err) {
  logger.error('submit_review failed', err);
  return {
    content: [{ type: 'text' as const, text: `submit_review failed: ${err instanceof Error ? err.message : String(err)}` }],
    isError: true as const,
  };
}
```

**Key difference from analog:** `submit_review` calls `applyEvent('submission.proposed', ...)` and returns immediately (two-step flow per D-05). It does NOT call Octokit directly. The actual submission happens in the HTTP confirm-submit handler.

---

### `server/src/submit/anchor.ts` (utility, transform)

**Analog:** `server/src/ingest/github.ts` — `resolveCommentAnchor` function (lines 139–160)

**Imports pattern** (`github.ts` lines 1–9):
```typescript
import type { DiffModel, LineSide } from '@shared/types';
```

**Core transform pattern** — adapt from `resolveCommentAnchor` at `github.ts` lines 139–160. The anchor adapter inverts this: instead of mapping a GitHub comment coordinate back to a `DiffLine.id`, it maps a `Thread` object forward to an Octokit payload:

```typescript
// server/src/submit/anchor.ts
import type { Thread } from '@shared/types';

export interface OctokitComment {
  path: string;
  body: string;
  line: number;
  side: 'LEFT' | 'RIGHT';
  position: undefined;  // Octokit type bug workaround (issue #614)
}

/**
 * D-09: line + side ONLY. Never position. Single adapter, no inline mapping.
 * BOTH maps to RIGHT (context lines anchor on the post-image side).
 */
export function threadToOctokitComment(thread: Thread): OctokitComment {
  return {
    path: thread.path,
    body: thread.draftBody ?? '',
    line: thread.line,
    side: thread.side === 'BOTH' ? 'RIGHT' : thread.side,
    position: undefined,  // required by TS types (bug), optional in API
  };
}
```

**Validation pattern** — analogous to the `resolveCommentAnchor` null-guard at `github.ts` lines 141–144:
```typescript
// Filter only threads eligible for posting
export function collectPostableThreads(threads: Record<string, Thread>): Thread[] {
  return Object.values(threads).filter((t) => t.draftBody && !t.resolved);
}
```

---

### `server/src/submit/octokit-submit.ts` (service, request-response)

**Analog:** `server/src/ingest/github.ts` — `ingestGithub` + `fetchBaseRefOid` functions

**Imports pattern** (`github.ts` lines 1–3):
```typescript
import { execa } from 'execa';
import type { ... } from '@shared/types';
import { logger } from '../logger.js';
```

**Auth pattern** — `gh auth token` shell-out already established in `github.ts` lines 60–68. For `octokit-submit.ts`:
```typescript
import { execa } from 'execa';
import { Octokit } from 'octokit';

async function getOctokit(): Promise<Octokit> {
  const { stdout } = await execa('gh', ['auth', 'token']);
  return new Octokit({ auth: stdout.trim() });
}
```

**Error mapping pattern** (`github.ts` lines 92–107 — `mapGhError`):
```typescript
function mapGhError(err: unknown): Error {
  if (err instanceof Error) {
    const raw = err as Error & { stderr?: unknown };
    const stderr = typeof raw.stderr === 'string' ? raw.stderr : '';
    if (stderr.includes('gh auth login') || stderr.includes('authentication')) {
      return new Error("gh CLI is not authenticated. Run 'gh auth login' and try again.");
    }
    return new Error(`gh CLI failed: ${err.message}`);
  }
  return new Error('gh CLI failed');
}
```

**Core submission call** (from RESEARCH.md code examples):
```typescript
const eventMap: Record<string, 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'> = {
  approve: 'APPROVE',
  request_changes: 'REQUEST_CHANGES',
  comment: 'COMMENT',
};

const { data: review } = await octokit.rest.pulls.createReview({
  owner, repo, pull_number: pullNumber,
  commit_id: session.headSha,
  event: eventMap[verdict],
  body: bodyWithSubmissionId,
  comments: postableThreads.map(threadToOctokitComment),
});
// review.html_url is the posted review URL
```

---

### `server/src/submit/markdown-export.ts` (utility, file-I/O)

**Analog:** `server/src/ingest/local.ts` (file-I/O utility using `node:fs/promises`)

**Imports pattern:**
```typescript
import { promises as fs } from 'node:fs';
import { resolve, extname } from 'node:path';
import type { Thread, ReviewSession } from '@shared/types';
import type { Verdict } from '@shared/types';
```

**Path validation pattern** (security per RESEARCH.md Security Domain):
```typescript
// Validate exportPath before writing (path traversal defense — RESEARCH.md D-12)
export function validateExportPath(exportPath: string): void {
  if (!path.isAbsolute(exportPath)) throw new Error('exportPath must be absolute');
  if (extname(exportPath) !== '.md') throw new Error('exportPath must end with .md');
  if (exportPath.includes('..')) throw new Error('exportPath must not contain ..');
}
```

**File write pattern** (using Node built-in):
```typescript
await fs.writeFile(exportPath, markdownContent, 'utf-8');
```

---

### `server/src/submit/pending-review.ts` (service, request-response)

**Analog:** `server/src/ingest/github.ts` — `fetchExistingComments` function (lines 173–242)

**Imports pattern** (`github.ts` lines 180–193):
```typescript
import { execa } from 'execa';
import { Octokit } from 'octokit';
import { logger } from '../logger.js';
```

**Paginate pattern** — mirrors `fetchExistingComments` use of `gh api --paginate` in `github.ts` lines 180–197. For pending-review detection, use `octokit.paginate`:
```typescript
// Source: RESEARCH.md Pattern 3 — PENDING filter is client-side (no server-side state param)
const reviews = await octokit.paginate(
  octokit.rest.pulls.listReviews,
  { owner, repo, pull_number: pullNumber, per_page: 100 }
);
const pending = reviews.find(
  (r) => r.state === 'PENDING' && r.user?.login === authenticatedLogin
);
```

**Orphan count / logger pattern** (`github.ts` line 234):
```typescript
// T-3-07: log count only, never body or user PII
logger.warn(`Pending review detected: reviewId=${pending.id}`);
```

---

### `server/src/http/routes/confirm-submit.ts` (controller, request-response)

**Analog:** `server/src/http/routes/session-events.ts`

**Imports pattern** (`session-events.ts` lines 15–20):
```typescript
import type { Hono } from 'hono';
import { z } from 'zod';
import type { SessionManager } from '../../session/manager.js';
import { logger } from '../../logger.js';
```

**Zod body schema pattern** (`session-events.ts` lines 55–67):
```typescript
const confirmSubmitBody = z.object({
  prKey: z.string().min(1),
  verdict: z.enum(['approve', 'request_changes', 'comment']),
  body: z.string().min(0).max(65536),
  exportPath: z.string().optional(),
}).strict();
```

**Mount + safeParse + 400 guard pattern** (`session-events.ts` lines 69–86):
```typescript
export function mountConfirmSubmit(app: Hono, manager: SessionManager): void {
  app.post('/api/confirm-submit', async (c) => {
    const parsed = confirmSubmitBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.text('Bad request', 400);

    const { prKey, verdict, body, exportPath } = parsed.data;
    const session = manager.get(prKey);
    if (!session) return c.text('Unknown session', 404);

    try {
      await manager.applyEvent(prKey, { type: 'submission.confirmed', submissionId: nanoid(12) });
      // ... call octokit or fs.writeFile ...
    } catch (err) {
      logger.warn('confirm-submit failed', err);
      return c.text('Internal error', 500);
    }
    return c.json({ ok: true, url });
  });
}
```

**Token middleware is automatic** — `server/src/http/server.ts` line 19 applies `tokenValidate` to all `/api/*` routes. No per-route middleware needed.

---

### `server/src/session/reducer.ts` (modified — extend existing switch)

**Analog:** itself — existing case branches at lines 11–105 are the canonical pattern to copy.

**Pure function invariant** (lines 10–11):
```typescript
// INVARIANT: reducer does NOT touch lastEventId. SessionManager.applyEvent owns it.
export function applyEvent(s: ReviewSession, e: SessionEvent): ReviewSession {
  switch (e.type) {
```

**Spread-and-patch pattern for new cases** (lines 49–51):
```typescript
case 'selfReview.set':
  return { ...s, selfReview: e.selfReview };
```

**New cases to add** (from RESEARCH.md Pattern 6):
```typescript
case 'submission.proposed':
  return { ...s, pendingSubmission: { verdict: e.verdict, body: e.body } };
case 'submission.confirmed':
  return { ...s, submissionState: { status: 'submitting', submissionId: e.submissionId } };
case 'submission.completed':
  return { ...s, submissionState: { status: 'submitted', reviewId: e.reviewId, url: e.url, submissionId: e.submissionId } };
case 'submission.failed':
  return { ...s, submissionState: { status: 'failed', error: e.error } };
case 'pendingReview.detected':
  return { ...s, pendingReview: { reviewId: e.reviewId, createdAt: e.createdAt, commentCount: e.commentCount } };
case 'pendingReview.resolved':
  return { ...s, pendingReview: undefined };
```

**Exhaustiveness guard** (lines 99–103) — must include new variants in the `SessionEvent` union before the `never` guard compiles cleanly:
```typescript
default: {
  const _never: never = e;
  throw new Error(`Unknown event type: ${JSON.stringify(_never)}`);
}
```

---

### `shared/types.ts` (modified — additive extension)

**Analog:** itself — Phase 5 additions at lines 299–343 show the extension pattern exactly.

**SessionEvent union extension pattern** (lines 105–128):
```typescript
// Extend the existing union — append Phase 6 variants at the bottom:
| { type: 'submission.proposed'; verdict: Verdict; body: string }
| { type: 'submission.confirmed'; submissionId: string }
| { type: 'submission.completed'; reviewId?: number; url?: string; submissionId: string }
| { type: 'submission.failed'; error: string }
| { type: 'pendingReview.detected'; reviewId: number; createdAt: string; commentCount: number }
| { type: 'pendingReview.resolved' }
```

**ReviewSession optional fields pattern** (lines 96–101):
```typescript
// Phase 6 additions (D-17) — all optional for backward compat (pre-Phase-6 snapshots load without these):
submissionState?: SubmissionState;
pendingSubmission?: { verdict: Verdict; body: string };
pendingReview?: { reviewId: number; createdAt: string; commentCount: number };
```

**New type to add — SubmissionState:**
```typescript
export type SubmissionStatus = 'not_yet' | 'submitting' | 'submitted' | 'failed';

export interface SubmissionState {
  status: SubmissionStatus;
  submissionId?: string;
  reviewId?: number;
  url?: string;
  error?: string;
}
```

---

### `server/src/mcp/server.ts` (modified — registration pattern)

**Analog:** itself — lines 1–24 are the complete pattern.

**Import + register pattern** (lines 1–13):
```typescript
import { registerSubmitReview } from './tools/submit-review.js';
// ... add to registerAllTools:
export function registerAllTools(mcp: McpServer, manager: SessionManager): void {
  // ... existing registrations ...
  registerSubmitReview(mcp, manager);  // add this line
}
```

---

### `server/src/http/server.ts` (modified — mount pattern)

**Analog:** itself — lines 1–27 are the complete pattern.

**Mount pattern** (lines 20–25):
```typescript
import { mountConfirmSubmit } from './routes/confirm-submit.js';
// ... inside buildHttpApp, after existing mounts:
mountConfirmSubmit(app, manager);
```

Token middleware already applies automatically via line 19: `app.use('/api/*', tokenValidate(manager))`.

---

### `web/src/store.ts` (modified — additive action pattern)

**Analog:** itself — Phase 5 actions (`onWalkthroughSet`, `onThreadReplyAdded`, etc.) at lines 204–246.

**New state fields pattern** (lines 26–58):
```typescript
// Add to AppState interface:
submissionState?: import('@shared/types').SubmissionState;
pendingSubmission?: { verdict: import('@shared/types').Verdict; body: string };
submitModalOpen: boolean;
```

**New action pattern** (lines 189–230):
```typescript
onSubmissionProposed(msg: UpdateMessage) {
  state = {
    ...state,
    pendingSubmission: msg.state.pendingSubmission ?? null,
    submitModalOpen: true,
  };
  emit();
},

onSubmissionCompleted(msg: UpdateMessage) {
  state = {
    ...state,
    submissionState: msg.state.submissionState,
    submitModalOpen: false,
  };
  emit();
},
```

**onUpdate extension** — mirror the existing pattern at lines 165–187: add `submissionState` and `pendingSubmission` fields to the `onUpdate` merge.

---

### `web/src/components/SubmitModal.tsx` (component, request-response)

**Analog:** `web/src/components/StaleDiffModal.tsx`

**Imports pattern** (`StaleDiffModal.tsx` lines 1–4):
```typescript
import { useState } from 'react';
import { useAppStore } from '../store';
```

**Self-guarding pattern** (`StaleDiffModal.tsx` lines 27–28):
```typescript
// Render nothing when modal is not needed — App.tsx can mount unconditionally
if (!state.submitModalOpen) return null;
```

**Modal overlay + dialog structure** (`StaleDiffModal.tsx` lines 65–72):
```typescript
<div
  className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
  role="dialog"
  aria-modal="true"
  aria-labelledby="submit-modal-title"
>
  <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg max-w-2xl w-full shadow-xl">
```

**Pending state + error state pattern** (`StaleDiffModal.tsx` lines 24–26, 84–117):
```typescript
const [pending, setPending] = useState(false);
const [error, setError] = useState<string | null>(null);
// ... in handler:
if (pending) return;
setPending(true);
try {
  await confirmSubmit({ prKey, verdict, body });
} catch (err) {
  setError(err instanceof Error ? err.message : 'Submit failed');
  setPending(false);
}
```

**POST to confirm endpoint pattern** (`api.ts` `chooseResume` function, lines 97–118):
```typescript
// New api.ts function: confirmSubmit
export async function confirmSubmit(params: {
  prKey: string;
  verdict: Verdict;
  body: string;
  exportPath?: string;
}): Promise<{ ok: true; url?: string }> {
  if (!reviewToken) throw new Error('confirmSubmit: review token not set');
  const res = await fetch('/api/confirm-submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Review-Token': reviewToken,  // double-submit token per Phase 1 D-07
    },
    body: JSON.stringify(params),
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`confirmSubmit failed: HTTP ${res.status}`);
  return res.json();
}
```

**Not dismissible by Escape/backdrop** — same as `StaleDiffModal.tsx` — no `onClick` on backdrop, no Escape listener. Submit modal requires a deliberate button press.

**Signal-ratio warning styling** — use existing CSS tokens: `--warn` for nit-heavy state, `--block` for blockers, `--ok` for approve verdict. These tokens are already established in the design system used by `TopBar.tsx` (`CI_PALETTE` at lines 96–100).

---

### `web/src/App.tsx` (modified — keyboard + modal wiring)

**Analog:** itself — keyboard handler at lines 280–338, modal mount at line 517.

**Keyboard shortcut replacement pattern** (lines 328–334 — currently toast stubs):
```typescript
// Replace the Phase 6 stubs at lines 328-334:
case 'v':
  e.preventDefault();
  // Open verdict picker (planner discretion: dropdown or cycle)
  setVerdictPickerOpen((o) => !o);
  break;
case 's':
  e.preventDefault();
  if (state.submissionState?.status !== 'submitted') {
    actions.setSubmitModalOpen(true);
  }
  break;
```

**Modal mount pattern** (line 517 — `<StaleDiffModal />`):
```typescript
// Add alongside StaleDiffModal (line 517):
<SubmitModal />
```

---

## Shared Patterns

### Security — Token Middleware
**Source:** `server/src/http/server.ts` line 19
**Apply to:** `server/src/http/routes/confirm-submit.ts`
```typescript
// Already covered: app.use('/api/*', tokenValidate(manager)) in http/server.ts.
// The confirm-submit route does NOT need its own middleware call.
// Just mount it normally and the global /api/* middleware applies.
```

### Double-Submit Token (Browser → Server)
**Source:** `web/src/api.ts` lines 104–117 (`chooseResume`)
**Apply to:** new `confirmSubmit` function in `web/src/api.ts`
```typescript
headers: {
  'Content-Type': 'application/json',
  'X-Review-Token': reviewToken,  // Phase 1 double-submit token pattern
},
credentials: 'same-origin',
```

### Error Logging — stderr only
**Source:** `server/src/mcp/tools/run-self-review.ts` line 214 and throughout
**Apply to:** All server-side files in `server/src/submit/`
```typescript
import { logger } from '../../logger.js';
// Use logger.error / logger.warn — NEVER console.log (corrupts JSON-RPC stdio)
logger.error('octokit-submit failed', err);
```

### Opaque IDs
**Source:** `server/src/mcp/tools/run-self-review.ts` line 189
**Apply to:** `server/src/submit/octokit-submit.ts` (submissionId generation)
```typescript
import { nanoid } from 'nanoid';
const submissionId = nanoid(12);  // same nanoid length used for finding IDs
```

### Plain JSON Events (no Date, no functions)
**Source:** `shared/types.ts` line 103 comment + all SessionEvent variants
**Apply to:** All new `SessionEvent` variants in Phase 6
```typescript
// Every SessionEvent must be plain JSON — no Date instances, no functions.
// Use ISO strings for timestamps (e.g., new Date().toISOString()).
```

### applyEvent Ownership
**Source:** `server/src/session/reducer.ts` lines 7–9 (INVARIANT comment)
**Apply to:** `server/src/http/routes/confirm-submit.ts`
```typescript
// INVARIANT: the reducer does NOT touch lastEventId.
// Use manager.applyEvent(prKey, event) — never call the reducer directly.
await manager.applyEvent(prKey, { type: 'submission.completed', ... });
```

### Zod Strict Object Validation
**Source:** `server/src/http/routes/session-events.ts` line 67 (`.strict()`)
**Apply to:** `server/src/http/routes/confirm-submit.ts` body schema
```typescript
const confirmSubmitBody = z.object({ ... }).strict();
// .strict() rejects unknown keys — required for all /api/* POST bodies
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | All Phase 6 files have close analogs in the codebase |

---

## Metadata

**Analog search scope:** `server/src/mcp/tools/`, `server/src/http/routes/`, `server/src/session/`, `server/src/ingest/`, `web/src/components/`, `web/src/store.ts`, `web/src/api.ts`, `shared/types.ts`
**Files scanned:** 18 source files read directly
**Pattern extraction date:** 2026-04-22
