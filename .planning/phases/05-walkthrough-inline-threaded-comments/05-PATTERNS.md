# Phase 5: Walkthrough + Inline Threaded Comments — Pattern Map

**Mapped:** 2026-04-22
**Files analyzed:** 12 new/modified files
**Analogs found:** 12 / 12

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `shared/types.ts` (modify) | model | — | `shared/types.ts` (Phase 4 additions) | exact |
| `server/src/session/reducer.ts` (modify) | service | event-driven | `server/src/session/reducer.ts` (Phase 3/4 case additions) | exact |
| `server/src/mcp/tools/set-walkthrough.ts` | service | request-response | `server/src/mcp/tools/run-self-review.ts` | exact |
| `server/src/mcp/tools/reply-in-thread.ts` | service | request-response | `server/src/mcp/tools/run-self-review.ts` | exact |
| `server/src/mcp/tools/draft-comment.ts` | service | request-response | `server/src/mcp/tools/set-pr-summary.ts` | exact |
| `server/src/mcp/tools/resolve-thread.ts` | service | request-response | `server/src/mcp/tools/set-pr-summary.ts` | exact |
| `server/src/mcp/server.ts` (modify) | config | — | `server/src/mcp/server.ts` | exact |
| `server/src/http/routes/session-events.ts` (modify) | middleware | request-response | `server/src/http/routes/session-events.ts` | exact |
| `web/src/store.ts` (modify) | store | event-driven | `web/src/store.ts` (Phase 4 additions) | exact |
| `web/src/components/WalkthroughBanner.tsx` | component | request-response | `web/src/components/SummaryDrawer.tsx` | role-match |
| `web/src/components/WalkthroughStepList.tsx` | component | request-response | `web/src/components/TopBar.tsx` (StageStepper) | exact |
| `web/src/components/ThreadCard.tsx` | component | event-driven | `web/src/components/DiffViewer.tsx` (ReadOnlyMarker) | role-match |
| `web/src/components/DiffViewer.tsx` (modify) | component | event-driven | `web/src/components/DiffViewer.tsx` | exact |
| `web/src/components/TopBar.tsx` (modify) | component | request-response | `web/src/components/TopBar.tsx` (StageStepper) | exact |
| `web/src/App.tsx` (modify) | component | event-driven | `web/src/App.tsx` | exact |

---

## Pattern Assignments

### `shared/types.ts` (modifications — new Phase 5 types)

**Analog:** `shared/types.ts` — Phase 4 additions block (lines 193–287)

**Section placement pattern** (line 100, `// Phase 2 event union` comment):
Each phase adds its types in a clearly fenced block with a comment header:
```typescript
// -------------------------------------------------------------------------
// Phase 4 additions — LLM Summary + Checklist + Self-Review
// D-06: ...
// -------------------------------------------------------------------------
```
Phase 5 block goes after line 287, same structure:
```typescript
// -------------------------------------------------------------------------
// Phase 5 additions — Walkthrough + Inline Threaded Comments
// D-01: Walkthrough at hunk-level granularity.
// D-13: threadId is server-generated nanoid; lineId is the Phase-1 opaque rail extended to threads.
// D-19: ReviewSession gains walkthrough/threads fields (all optional for backward compat).
// -------------------------------------------------------------------------
```

**SessionEvent extension pattern** (lines 101–118):
```typescript
// Phase 4 additions (D-17):
| { type: 'summary.set'; summary: PrSummary }
| { type: 'selfReview.set'; selfReview: SelfReview };
```
Phase 5 extends the union before the closing `;` — swap trailing `;` to `|` on the Phase 4 last variant, add new variants. The same trailing-semicolon-as-end-of-union contract applies.

**ReviewSession field extension pattern** (lines 94–98):
```typescript
// Phase 4 additions (D-18) — optional so pre-Phase-4 snapshots load without migration:
summary?: PrSummary | null;
selfReview?: SelfReview | null;
```
Phase 5 adds fields below these, same `?:` optional pattern with a Phase-5 comment.

**SECURITY annotation pattern** (lines 219–235):
All LLM-authored text fields carry an inline security comment:
```typescript
/** SECURITY: render via React text nodes, NEVER innerHTML. */
paraphrase: string;
```
Phase 5 new types must follow this on `WalkthroughStep.commentary`, `ThreadTurn.message`, and `Thread.draftBody`.

---

### `server/src/session/reducer.ts` (modifications — 6 new case branches)

**Analog:** `server/src/session/reducer.ts` (all lines — the full file is the pattern)

**Existing spread pattern** (lines 29–51):
```typescript
case 'file.reviewStatusSet':
  return {
    ...s,
    fileReviewStatus: {
      ...(s.fileReviewStatus ?? {}),
      [e.fileId]: e.status,
    },
  };
case 'summary.set':
  return { ...s, summary: e.summary };
case 'selfReview.set':
  return { ...s, selfReview: e.selfReview };
```

**Exhaustiveness guard** (lines 52–55) — CRITICAL:
```typescript
default: {
  // Exhaustiveness guard — adding an event variant without handling it is a compile error.
  const _never: never = e;
  throw new Error(`Unknown event type: ${JSON.stringify(_never)}`);
}
```
Every new `SessionEvent` variant added to `shared/types.ts` MUST have a `case` here, or the TypeScript build fails at this line.

**New Phase 5 cases to add** before the `default:` block, following the same spread idiom:
```typescript
case 'walkthrough.set':
  return { ...s, walkthrough: e.walkthrough };
case 'walkthrough.stepAdvanced':
  return {
    ...s,
    walkthrough: s.walkthrough ? { ...s.walkthrough, cursor: e.cursor } : s.walkthrough,
  };
case 'walkthrough.showAllToggled':
  return {
    ...s,
    walkthrough: s.walkthrough ? { ...s.walkthrough, showAll: e.showAll } : s.walkthrough,
  };
case 'thread.replyAdded':
  return {
    ...s,
    threads: { ...(s.threads ?? {}), [e.threadId]: e.thread },
  };
case 'thread.draftSet':
  return {
    ...s,
    threads: s.threads
      ? { ...s.threads, [e.threadId]: { ...s.threads[e.threadId], draftBody: e.body } }
      : s.threads,
  };
case 'thread.resolved':
  return {
    ...s,
    threads: s.threads
      ? { ...s.threads, [e.threadId]: { ...s.threads[e.threadId], resolved: true } }
      : s.threads,
  };
```

---

### `server/src/mcp/tools/set-walkthrough.ts` (new file)

**Analog:** `server/src/mcp/tools/run-self-review.ts` (full file — exact shape match)

**Imports pattern** (lines 1–14 of run-self-review.ts):
```typescript
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../session/manager.js';
import { logger } from '../../logger.js';
import type { DiffModel, Walkthrough } from '@shared/types';
```
`nanoid` import is already in `run-self-review.ts` — bring it over. Add `Walkthrough` and `WalkthroughStep` from shared types.

**Zod schema pattern** (lines 21–52 of run-self-review.ts):
The `FindingSchema` nested object schema + outer `Input` is the direct template:
```typescript
const WalkthroughStepSchema = z.object({
  hunkId: z.string().regex(/^[A-Za-z0-9_-]+:h\d+$/, {
    error: 'Invalid hunkId. Must be an opaque hunk ID from list_files/get_hunk. Format: `<fileId>:h<hunkIdx>`. Never construct hunkId strings from file paths or line numbers.',
  }),
  commentary: z.string().min(1).max(1000),
});

const Input = z.object({
  prKey: z.string().min(1).max(200),
  steps: z.array(WalkthroughStepSchema).min(1).max(200),
});
```

**`resolveLineId` → `resolveHunkId` pattern** (lines 81–97 of run-self-review.ts):
```typescript
function resolveLineId(diff: DiffModel, lineId: string): { ... } | null {
  const match = /^(.+):h(\d+):l(\d+)$/.exec(lineId);
  if (!match) return null;
  const [, fileId, hunkIdxRaw, lineIdxRaw] = match;
  const file = diff.files.find((f) => f.id === fileId);
  if (!file) return null;
  const hunk = file.hunks[Number(hunkIdxRaw)];
  if (!hunk) return null;
  const line = hunk.lines[Number(lineIdxRaw)];
  if (!line) return null;
  return { path: file.path, line: line.fileLine, side: line.side };
}
```
For `resolveHunkId`, use the same structure but stop at the hunk level:
```typescript
function resolveHunkId(diff: DiffModel, hunkId: string): { path: string; header: string } | null {
  const match = /^(.+):h(\d+)$/.exec(hunkId);
  if (!match) return null;
  const [, fileId, hunkIdxRaw] = match;
  const file = diff.files.find((f) => f.id === fileId);
  if (!file) return null;
  const hunk = file.hunks[Number(hunkIdxRaw)];
  if (!hunk) return null;
  return { path: file.path, header: hunk.header };
}
```

**Error response pattern** (lines 121–130 of run-self-review.ts):
```typescript
if (!session) {
  return {
    content: [{ type: 'text' as const, text: `session not found for prKey "${prKey}". Call start_review first.` }],
    isError: true as const,
  };
}
```

**`applyEvent` call pattern** (line 209 of run-self-review.ts):
```typescript
await manager.applyEvent(prKey, { type: 'selfReview.set', selfReview });
return { content: [{ type: 'text' as const, text: renderAck(selfReview) }] };
```

**`registerRunSelfReview` export function pattern** (lines 113–226 of run-self-review.ts):
```typescript
export function registerSetWalkthrough(mcp: McpServer, manager: SessionManager): void {
  mcp.registerTool(
    'set_walkthrough',
    { title: 'Set Walkthrough', description: DESCRIPTION, inputSchema: Input.shape },
    async ({ prKey, steps }) => {
      try {
        // ... handler body ...
      } catch (err) {
        logger.error('set_walkthrough failed', err);
        return {
          content: [{ type: 'text' as const, text: `set_walkthrough failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true as const,
        };
      }
    }
  );
}
```

**DESCRIPTION pattern** (lines 54–77 of run-self-review.ts):
```typescript
export const DESCRIPTION: string = [
  'First line describing the tool purpose.',
  '',
  'Discipline block 1: ...',
  '  - Sub-item',
  '',
  'Discipline block 2: ...',
].join('\n');
```
Export `DESCRIPTION` as a named const so tests can assert on it (see test pattern below).

---

### `server/src/mcp/tools/reply-in-thread.ts` (new file)

**Analog:** `server/src/mcp/tools/run-self-review.ts` (full file)

**Imports pattern**: same as `set-walkthrough.ts` above, plus `nanoid` for threadId generation.

**Zod schema with optional discriminated fields pattern** (no direct analog — closest is the `Source` union in `start-review.ts` lines 9–15):
```typescript
// start-review.ts lines 9-15: dual-variant union without extra discriminator field
const Source = z.union([
  z.union([
    z.object({ kind: z.literal('github'), url: z.string().url() }),
    z.object({ kind: z.literal('github'), number: z.number().int().positive() }),
  ]),
  z.object({ kind: z.literal('local'), base: z.string().min(1), head: z.string().min(1) }),
]);
```
For `reply_in_thread`, use optional fields + `.refine()` (simpler than union, fewer LLM-facing discriminators):
```typescript
const Input = z.object({
  prKey: z.string().min(1).max(200),
  lineId: z.string().regex(/^[A-Za-z0-9_-]+:h\d+:l\d+$/, { error: 'Invalid lineId. Supply from list_files/get_hunk.' }).optional(),
  threadId: z.string().min(1).max(40).optional(),
  message: z.string().min(1).max(4000),
  preExisting: z.boolean().optional(),
}).refine(
  (d) => d.lineId !== undefined || d.threadId !== undefined,
  { error: 'Either lineId (new thread) or threadId (reply to existing) must be supplied.' }
);
```

**`resolveLineId` reuse pattern**: copy `resolveLineId` from `run-self-review.ts` lines 81–97, but extend the return type to include `lineKind: LineKind` (add `kind: line.kind` to the returned object). This extension enables the `preExisting` gate. Alternatively, extract to a shared module — see Shared Patterns section.

**`preExisting` gate pattern** (novel — no existing analog):
```typescript
// After resolveLineId call succeeds:
const resolved = resolveLineId(session.diff, lineId);
if (!resolved) return errorResponse(`lineId "${lineId}" does not resolve`);
if (resolved.lineKind === 'context' && !preExisting) {
  return {
    content: [{ type: 'text' as const, text: `lineId "${lineId}" is an unchanged context line. Set preExisting: true to intentionally flag pre-existing code.` }],
    isError: true as const,
  };
}
```

**`nanoid` threadId generation** (line 2 and line 189 of run-self-review.ts — nanoid already used for finding IDs):
```typescript
import { nanoid } from 'nanoid';
// in handler:
const threadId = `th_${nanoid(10)}`; // e.g. "th_v9fK2mRqLw"
```

---

### `server/src/mcp/tools/draft-comment.ts` (new file)

**Analog:** `server/src/mcp/tools/set-pr-summary.ts` (simpler tool, fewer validations)

**Pattern**: The minimal tool shape — schema, session guard, single `applyEvent`, ack response, `catch` block. No complex validation loops. Direct template:
```typescript
const Input = z.object({
  prKey: z.string().min(1).max(200),
  threadId: z.string().min(1).max(40),
  body: z.string().min(1).max(65536),
});

export function registerDraftComment(mcp: McpServer, manager: SessionManager): void {
  mcp.registerTool(
    'draft_comment',
    { title: 'Draft Comment', description: DESCRIPTION, inputSchema: Input.shape },
    async ({ prKey, threadId, body }) => {
      try {
        const session = manager.get(prKey);
        if (!session) return errorResponse(`session not found for "${prKey}"`);
        if (!session.threads?.[threadId]) {
          return errorResponse(`threadId "${threadId}" not found. Use reply_in_thread to create a thread first.`);
        }
        await manager.applyEvent(prKey, { type: 'thread.draftSet', threadId, body });
        return { content: [{ type: 'text' as const, text: `Draft comment set for thread ${threadId}.` }] };
      } catch (err) {
        logger.error('draft_comment failed', err);
        return { content: [{ type: 'text' as const, text: `draft_comment failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true as const };
      }
    }
  );
}
```

---

### `server/src/mcp/tools/resolve-thread.ts` (new file)

**Analog:** `server/src/mcp/tools/draft-comment.ts` (same minimal shape, different event type)

Same structure as `draft-comment.ts` — schema with `{ prKey, threadId }`, existence check on `session.threads?.[threadId]`, emit `{ type: 'thread.resolved', threadId }`, ack with thread count or confirmation text. The planner may merge this into `draft_comment` as a `resolved: true` flag — if so, omit this file and add `resolved: z.boolean().optional()` to the `draft-comment.ts` Input schema.

---

### `server/src/mcp/server.ts` (modification)

**Analog:** `server/src/mcp/server.ts` (lines 1–16 — current registration list)

**Import + register pattern** (lines 4–8 and line 11):
```typescript
import { registerRunSelfReview } from './tools/run-self-review.js';
// ...
export function registerAllTools(mcp: McpServer, manager: SessionManager): void {
  registerStartReview(mcp, manager);
  // ...
  registerRunSelfReview(mcp, manager);
}
```
Phase 5 adds 3–4 more `import` + `register*()` lines following identical pattern.

---

### `server/src/http/routes/session-events.ts` (modification)

**Analog:** `server/src/http/routes/session-events.ts` (lines 20–39)

**Existing schema + discriminated union pattern** (lines 20–39):
```typescript
const reviewStatusSchema = z.object({
  type: z.literal('file.reviewStatusSet'),
  fileId: z.string().min(1),
  status: z.enum(['untouched', 'in-progress', 'reviewed']),
}).strict();

const expandToggleSchema = z.object({
  type: z.literal('file.generatedExpandToggled'),
  fileId: z.string().min(1),
  expanded: z.boolean(),
}).strict();

const userEventSchema = z.discriminatedUnion('type', [reviewStatusSchema, expandToggleSchema]);
```
Phase 5 adds two new schema objects and extends the `discriminatedUnion` array:
```typescript
const stepAdvancedSchema = z.object({
  type: z.literal('walkthrough.stepAdvanced'),
  cursor: z.number().int().min(0),
}).strict();

const showAllToggledSchema = z.object({
  type: z.literal('walkthrough.showAllToggled'),
  showAll: z.boolean(),
}).strict();

const userEventSchema = z.discriminatedUnion('type', [
  reviewStatusSchema,
  expandToggleSchema,
  stepAdvancedSchema,    // Phase 5 addition
  showAllToggledSchema,  // Phase 5 addition
]);
```
**Do NOT add thread events** (`thread.replyAdded`, `thread.draftSet`, `thread.resolved`) to this list — those are MCP-tool-initiated server-side events, not browser-posted user events.

---

### `web/src/store.ts` (modifications)

**Analog:** `web/src/store.ts` (all lines — extend the existing file)

**`AppState` field extension pattern** (lines 48–52):
```typescript
// Phase 4 additions
summary: PrSummary | null;
selfReview: SelfReview | null;
findingsSidebarOpen: boolean;
activeCategory: ChecklistCategory | null;
```
Phase 5 adds below these, same pattern:
```typescript
// Phase 5 additions
walkthrough: Walkthrough | null;
threads: Record<string, Thread>;
```

**`INITIAL` extension pattern** (lines 54–69):
```typescript
summary: null,
selfReview: null,
findingsSidebarOpen: false,
activeCategory: null,
```
Phase 5 adds:
```typescript
walkthrough: null,
threads: {},
```

**`onSnapshot` handler pattern** (lines 101–132):
```typescript
onSnapshot(msg: SnapshotMessage) {
  const s = msg.session;
  state = {
    ...state,
    // ... many fields ...
    summary: s.summary ?? null,
    selfReview: s.selfReview ?? null,
  };
  emit();
},
```
Phase 5 adds `walkthrough: s.walkthrough ?? null` and a threads merge that protects locally-edited `draftBody` values (Pitfall 3 — CRITICAL). Pattern:
```typescript
// Merge thread state from snapshot, preserving locally-edited draftBody values
const incomingThreads = s.threads ?? {};
const mergedThreads: Record<string, Thread> = { ...incomingThreads };
for (const [tid, existingThread] of Object.entries(state.threads)) {
  if (mergedThreads[tid] && existingThread.draftBody !== incomingThreads[tid]?.draftBody) {
    // User has edited draftBody locally — preserve local value
    mergedThreads[tid] = { ...mergedThreads[tid], draftBody: existingThread.draftBody };
  }
}
```

**Event-specific action pattern** (lines 156–169 — `onSummarySet` / `onSelfReviewSet`):
```typescript
onSelfReviewSet(msg: UpdateMessage) {
  const wasNull = state.selfReview == null;
  state = {
    ...state,
    selfReview: msg.state.selfReview ?? null,
    findingsSidebarOpen: wasNull && msg.state.selfReview != null ? true : state.findingsSidebarOpen,
  };
  emit();
},
```
Phase 5 adds analogous `onWalkthroughSet`, `onThreadReplyAdded`, `onDraftSet`, `onThreadResolved` actions following this exact shape.

**`onUpdate` handler** (lines 134–154) also needs to merge `walkthrough` and `threads` from `msg.state`, same draftBody-protection logic as `onSnapshot`.

---

### `web/src/components/WalkthroughBanner.tsx` (new file)

**Analog:** `web/src/components/SummaryDrawer.tsx` (full file — same role: conditional UI card above a content area, LLM-authored text rendered as React text nodes)

**Imports pattern** (SummaryDrawer.tsx lines 1–2):
```typescript
import { useState } from 'react';
import type { PrSummary, SummaryIntent } from '@shared/types';
```
For WalkthroughBanner:
```typescript
import type { WalkthroughStep } from '@shared/types';
```

**Props interface pattern** (SummaryDrawer.tsx lines 12–18):
```typescript
interface SummaryDrawerProps {
  summary: PrSummary | null | undefined;
  authorDescription?: string;
  open: boolean;
  onClose: () => void;
  onRegenerate?: () => void;
}
```
WalkthroughBanner props:
```typescript
interface WalkthroughBannerProps {
  step: WalkthroughStep;
  stepNum: number;
  totalSteps: number;
  isActive: boolean;         // true = current step; false = visited (collapse to summary)
  onSkip: () => void;
  onNext: () => void;
}
```

**SECURITY: LLM text as React text node** (SummaryDrawer.tsx lines 49, 53 — all text content renders as JSX text, never `dangerouslySetInnerHTML`):
```tsx
<p className={paraphraseExpanded ? '' : 'line-clamp-3'}>
  {summary.paraphrase}
</p>
```
WalkthroughBanner must follow the same pattern for `step.commentary`:
```tsx
<p className="walkthrough-commentary">{step.commentary}</p>
```
Never use `dangerouslySetInnerHTML` on LLM-authored commentary.

**Conditional render pattern** (SummaryDrawer.tsx line 27):
```typescript
if (!open || !summary) return null;
```
WalkthroughBanner renders nothing if `isActive` is false and collapsed view should show inline (handled by CSS class toggle, not early return, since collapsed banners are still visible as compact rows).

**CSS variable palette** (SummaryDrawer.tsx lines 71, 40 — uses `var(--paper-2)`, `var(--ink-4)` etc.):
```tsx
<div style={{ marginTop: 4, padding: '8px 12px', background: 'var(--paper-2)', ... }}>
```
WalkthroughBanner uses the same token palette: `var(--claude)` for active step highlight, `var(--ink-4)` for collapsed summary, `var(--paper-2)` for card background.

---

### `web/src/components/WalkthroughStepList.tsx` (new file)

**Analog:** `web/src/components/TopBar.tsx` — `StageStepper` inner component (lines 185–285)

**Steps array + map pattern** (TopBar.tsx lines 200–235):
```typescript
const steps = [
  {
    label: 'Summary',
    sub: summary ? `${summary.intent} · ...` : 'Not generated',
    status: summary ? 'done' : 'active',
    onClick: summary ? onSummaryStep : undefined,
    disabled: false,
  },
  // ...
];

return (
  <div className="stages" role="list" aria-label="Review stages">
    {steps.map((s, i) => (
      <Fragment key={s.label}>
        <div className={cn('stage', s.status === 'done' && 'done', ...)} ...>
          ...
        </div>
        {i < steps.length - 1 && <div className="stage-connector"><Ic.chev /></div>}
      </Fragment>
    ))}
  </div>
);
```
WalkthroughStepList maps `walkthrough.steps` with the same `Fragment` + connector pattern, showing `stepNum`, `status` badge, and short preview of `commentary`.

**`cn()` helper pattern** (TopBar.tsx lines 5–7):
```typescript
function cn(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}
```
Copy this verbatim into WalkthroughStepList (or import from a shared utils module if one exists).

**Disabled step pattern** (TopBar.tsx lines 219–226):
```typescript
{
  label: 'Walkthrough',
  sub: 'Phase 5',
  status: 'default',
  onClick: undefined,
  disabled: true,
  tooltip: 'Walkthrough available in Phase 5',
},
```
Phase 5 replaces this entry in StageStepper with a conditional that renders `<WalkthroughStepList walkthrough={walkthrough} ... />` when `walkthrough` is non-null, or the original disabled stub when null.

---

### `web/src/components/ThreadCard.tsx` (new file)

**Analog:** `web/src/components/DiffViewer.tsx` — `ReadOnlyMarker` component (lines 462–526)

**ReadOnlyMarker is the closest existing in-diff interactive component** — it renders inside the diff table gutter, manages open/close state with `useState`, and renders LLM-authored text via React text nodes.

**`useState` open/close pattern** (DiffViewer.tsx lines 463–464):
```typescript
function ReadOnlyMarker({ comment }: { comment: ReadOnlyComment }) {
  const [open, setOpen] = useState(false);
```
ThreadCard manages expanded/collapsed state the same way. Multiple `useState` calls for the draft textarea value divergence:
```typescript
function ThreadCard({ thread, onDraftChange }: ThreadCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [localDraft, setLocalDraft] = useState(thread.draftBody ?? '');
```

**SECURITY: body as React text node** (DiffViewer.tsx lines 513–515):
```tsx
{/* SECURITY: body renders as React text node — NEVER innerHTML (T-3-03) */}
<div className="body" style={{ whiteSpace: 'pre-wrap' }}>
  {comment.body}
</div>
```
All ThreadCard message turns and draftBody render the same way — never `dangerouslySetInnerHTML`.

**Popover styling pattern** (DiffViewer.tsx lines 491–509):
```tsx
<div
  className="thread-popover"
  role="dialog"
  aria-label="Existing comment"
  style={{
    position: 'absolute', top: '100%', left: 0, zIndex: 20,
    minWidth: 240, background: 'var(--paper)', border: '1px solid var(--ink-5)',
    borderRadius: 4, padding: 8, fontSize: 12, color: 'var(--ink)',
  }}
>
```
ThreadCard uses the same CSS token palette but renders as a push-down `<tr>` (not a positioned overlay). The card itself uses `var(--paper)`, `var(--ink-5)` border, `var(--ink)` text.

**Keyboard event pattern** (DiffViewer.tsx lines 484–489):
```tsx
onKeyDown={(e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    setOpen((o) => !o);
  }
}}
```
ThreadCard collapse toggle uses the same pattern.

**`colSpan` table cell pattern** (novel — no existing analog, but informed by DiffViewer.tsx table structure):
Unified diff table has 2 columns (gutter + content). Push-down row uses:
```tsx
<tr className="thread-row">
  <td colSpan={2}>
    <ThreadCard thread={thread} ... />
  </td>
</tr>
```
Split diff table has 4 columns — use `colSpan={4}`.

---

### `web/src/components/DiffViewer.tsx` (modifications)

**Analog:** `web/src/components/DiffViewer.tsx` (full file — modifications extend the existing code)

**`UnifiedHunk` per-line render pattern** (lines 263–305) — where to inject thread rows:
```tsx
{hunk.lines.map((line, lineIdx) => {
  // ... existing tr ...
  return (
    <tr key={line.id} id={line.id} className={rowClassName(line.kind)}>
      ...
    </tr>
  );
})}
```
Phase 5 wraps each `<tr>` in a `<Fragment>` and appends thread rows:
```tsx
{hunk.lines.map((line, lineIdx) => {
  const lineThreads = threads.filter(t => t.lineId === line.id);
  return (
    <Fragment key={line.id}>
      <tr id={line.id} className={rowClassName(line.kind)}>
        ...
      </tr>
      {lineThreads.map(thread => (
        <tr key={thread.threadId} className="thread-row">
          <td colSpan={2}><ThreadCard thread={thread} ... /></td>
        </tr>
      ))}
    </Fragment>
  );
})}
```
Note: `Fragment` is already imported in TopBar.tsx (`import { Fragment, useState } from 'react'`). DiffViewer.tsx currently imports only `{ useState }` (line 8) — add `Fragment` to that import.

**WalkthroughBanner injection pattern** (lines 221–248 of DiffViewer.tsx — hunk map in FileSection):
```tsx
{file.hunks.map((hunk, hunkIdx) => (
  <div key={hunk.id} id={hunk.id} className={focusedHunkId === hunk.id ? 'hunk focused' : 'hunk'}>
    <div className="hunk-head">{hunk.header}</div>
    {view === 'unified' ? <UnifiedHunk ... /> : <SplitHunk ... />}
  </div>
))}
```
Phase 5 inserts `<WalkthroughBanner>` above `<div className="hunk-head">` when a walkthrough step maps to this hunk.

**Props threading pattern**: New `walkthrough` and `threads` props thread down from `DiffViewer` → `FileSection` → `UnifiedHunk`/`SplitHunk`. Follow the same pattern as `readOnlyComments` (line 31 prop, line 273 destructure, line 273 filter call). Each level passes only what the child needs.

**`hunkClasses` CSS class composition**: The existing hunk className is `focusedHunkId === hunk.id ? 'hunk focused' : 'hunk'` (line 224). Phase 5 extends this to add `hunk--curated` class when the hunk is in the walkthrough step list, using the `cn()` pattern from TopBar.tsx.

---

### `web/src/components/TopBar.tsx` (modifications — StageStepper)

**Analog:** `web/src/components/TopBar.tsx` (lines 185–285 — StageStepper component)

**Current disabled Walkthrough step** (lines 219–226):
```typescript
{
  label: 'Walkthrough',
  sub: 'Phase 5',
  status: 'default',
  onClick: undefined,
  disabled: true,
  tooltip: 'Walkthrough available in Phase 5',
},
```
Phase 5 replaces this with conditional logic based on whether `walkthrough` prop is non-null. When active, the step renders `WalkthroughStepList` as a sub-tree (similar to how `selfReview` triggers the `stages-coverage-strip` sub-tree at lines 263–284).

**Coverage-strip expansion pattern** (lines 263–284) — template for walkthrough step list expansion:
```tsx
{selfReview && (
  <div className="stages-coverage-strip" role="group" aria-label="Category coverage">
    {CATEGORIES.map((cat) => { ... })}
  </div>
)}
```
Phase 5 analogously adds:
```tsx
{walkthrough && (
  <WalkthroughStepList
    walkthrough={walkthrough}
    onStepClick={onWalkthroughStepClick}
    onShowAllToggle={onShowAllToggle}
  />
)}
```

**Props interface extension pattern** (lines 18–31 of TopBar.tsx):
Add `walkthrough?: Walkthrough | null`, `onWalkthroughStepClick: (cursor: number) => void`, `onShowAllToggle: (showAll: boolean) => void` to `StageStepper`'s props interface. Same `?:` optional pattern used for Phase 4 additions.

---

### `web/src/App.tsx` (modifications)

**Analog:** `web/src/App.tsx` (full file — modifications extend existing code)

**`virtualList` `useMemo` pattern** (lines 47–52):
```typescript
const virtualList = useMemo(() => {
  if (!diff) return [];
  return diff.files
    .filter((f) => !f.generated)
    .flatMap((f) => f.hunks.map((h) => ({ fileId: f.id, hunkId: h.id })));
}, [diff]);
```
Phase 5 extends with walkthrough-awareness:
```typescript
const virtualList = useMemo(() => {
  if (!diff) return [];
  const allHunks = diff.files
    .filter((f) => !f.generated)
    .flatMap((f) => f.hunks.map((h) => ({ fileId: f.id, hunkId: h.id })));

  const walkthrough = state.walkthrough;
  if (walkthrough && !walkthrough.showAll) {
    // Curated mode: only walkthrough steps in step order
    return walkthrough.steps.map((step) => {
      const file = diff.files.find((f) => f.hunks.some((h) => h.id === step.hunkId));
      return { fileId: file?.id ?? '', hunkId: step.hunkId };
    });
  }
  return allHunks;  // show-all mode: all hunks in file order
}, [diff, state.walkthrough]);
```
Add `state.walkthrough` to the dependency array.

**`postSessionEvent` call pattern** (lines 104–108):
```typescript
postSessionEvent(prKey, {
  type: 'file.reviewStatusSet',
  fileId: targetFileId,
  status: nextStatus,
}).catch(() => showToast('Could not mark reviewed. Retry.'));
```
Phase 5 adds analogous calls for walkthrough events:
```typescript
postSessionEvent(prKey, {
  type: 'walkthrough.stepAdvanced',
  cursor: nextCursor,
}).catch(() => showToast('Could not advance step. Retry.'));

postSessionEvent(prKey, {
  type: 'walkthrough.showAllToggled',
  showAll: !state.walkthrough?.showAll,
}).catch(() => showToast('Could not toggle view. Retry.'));
```

**Keyboard handler pattern** (lines 152–196 — `onKeyDown` switch):
```typescript
case 'c':
  e.preventDefault();
  showToast('Comments available in Phase 5');  // <-- STUB TO REPLACE
  break;
```
Phase 5 replacement:
```typescript
case 'c':
  e.preventDefault();
  if (focusedHunkId) {
    const threadEntries = Object.values(state.threads ?? {})
      .filter(t => {
        // Check if any thread is anchored to a line in the focused hunk
        return t.lineId.startsWith(focusedHunkId.replace(/:h\d+$/, '') + ':h') &&
               t.lineId.includes(focusedHunkId.split(':h')[1]?.split(':')[0] ?? '');
      });
    if (threadEntries.length > 0) {
      const el = document.getElementById(`thread-${threadEntries[0].threadId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      showToast('Ask Claude to start a thread on this line');
    }
  } else {
    showToast('Ask Claude to start a thread on this line');
  }
  break;
```

**Component prop threading pattern** (lines 282–289 — StageStepper props):
```tsx
<StageStepper
  summary={state.summary}
  selfReview={state.selfReview}
  activeCategory={state.activeCategory}
  onSummaryStep={() => setSummaryDrawerOpen((o) => !o)}
  onSelfReviewStep={() => actions.toggleFindingsSidebar()}
  onCategoryClick={(cat) => actions.setActiveCategory(cat)}
/>
```
Phase 5 adds `walkthrough={state.walkthrough}` and the two new walkthrough callbacks.

---

## Test File Patterns

### MCP Tool Tests

**Analog:** `server/src/mcp/tools/__tests__/run-self-review.test.ts` (full file)

**Test file structure** (lines 1–10):
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../../session/manager.js';
import type { ReviewSession, SessionEvent, DiffFile, DiffLine, Hunk } from '@shared/types';
import { registerRunSelfReview, DESCRIPTION } from '../run-self-review.js';
```

**Fixture factory pattern** (lines 9–57):
```typescript
function makeLine(id: string, kind: DiffLine['kind'] = 'add', fileLine = 1): DiffLine {
  return { id, kind, side: 'RIGHT', fileLine, diffPosition: 1, text: 'const x = 1;' };
}
function makeHunk(fileId: string, hunkIdx: number, lineCount: number): Hunk { ... }
function makeFile(id: string, path: string): DiffFile { ... }
function makeSession(): ReviewSession { ... }
```
Phase 5 test files copy these factories exactly. The `makeSession()` factory returns a base session without walkthrough/threads — tests add those fields when needed.

**Mock manager pattern** (lines 90–109):
```typescript
const manager = {
  get: (key: string) => sessions.get(key),
  applyEvent: vi.fn(async (prKey: string, event: SessionEvent) => {
    const s = sessions.get(prKey)!;
    if (event.type === 'selfReview.set') {
      const updated = { ...s, selfReview: event.selfReview };
      sessions.set(prKey, updated);
      return updated;
    }
    return s;
  }),
} as unknown as SessionManager;
```
Phase 5 tool tests stub `applyEvent` with branches for `walkthrough.set`, `thread.replyAdded`, `thread.draftSet`, `thread.resolved`.

**`extractHandler` pattern** (lines 82–85):
```typescript
function extractHandler(mcp: McpServer): ToolHandler {
  const calls = (mcp.registerTool as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  return calls[calls.length - 1][2] as ToolHandler;
}
```
Copy verbatim into every Phase 5 tool test file.

**`isError` assertion pattern** (lines 176–180):
```typescript
expect(res.isError).toBe(true);
expect(res.content[0].text.toLowerCase()).toMatch(/lineid|invalid/);
```
Phase 5 tool tests assert `isError: true` on: garbage hunkId, unresolvable lineId, context-line without preExisting, nonexistent threadId, nonexistent prKey.

### Web Component Tests

**Analog:** `web/src/components/__tests__/TopBar.test.tsx` (full file)

**Vitest + Testing Library pattern** (TopBar.test.tsx lines 1–8):
```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { TopBar } from '../TopBar';
import type { CIStatus, PullRequestMeta } from '@shared/types';

afterEach(() => {
  cleanup();
});
```

**Props defaults object pattern** (lines 10–17):
```typescript
const phase4Defaults = {
  activeCategory: null as null,
  findingsSidebarOpen: false,
  onSummaryStep: () => {},
  // ...
};
```
Phase 5 component tests define `phase5Defaults` covering walkthrough/thread props.

**DOM assertion pattern** (lines 47–54):
```typescript
const { container } = render(<Component prop={value} />);
expect(container.textContent).toContain('expected text');
expect(container.querySelector('.some-class')).toBeTruthy();
```

---

## Shared Patterns

### Opaque ID Resolution (apply to: `set-walkthrough.ts`, `reply-in-thread.ts`)

**Source:** `server/src/mcp/tools/run-self-review.ts` lines 81–97

The `resolveLineId` function is currently inlined in `run-self-review.ts`. Phase 5 needs it in multiple tool files. Extract to `server/src/mcp/tools/resolve-ids.ts` (or `server/src/diff-utils.ts`) as a shared utility so Phase 5 tool files `import { resolveLineId, resolveHunkId } from './resolve-ids.js'` rather than duplicating.

```typescript
// Existing resolveLineId shape (run-self-review.ts lines 81–97):
function resolveLineId(diff: DiffModel, lineId: string): {
  path: string; line: number; side: 'LEFT' | 'RIGHT' | 'BOTH';
} | null { ... }

// Phase 5 extension needed — add lineKind to return type:
// { path: string; line: number; side: LineSide; lineKind: LineKind; } | null
```

### Error Response Shape (apply to: all 4 new MCP tool files)

**Source:** `server/src/mcp/tools/run-self-review.ts` lines 121–130 (inline pattern)

```typescript
// Inline pattern used throughout run-self-review.ts:
return {
  content: [{ type: 'text' as const, text: `message here` }],
  isError: true as const,
};
```
Consider extracting `errorResponse(text: string)` and `ackResponse(text: string)` helper functions (not currently extracted — the planner may inline them or create helpers). Both shapes are repeated 5–6 times in `run-self-review.ts`.

### `try/catch` with `logger.error` (apply to: all 4 new MCP tool files)

**Source:** `server/src/mcp/tools/run-self-review.ts` lines 113–226

```typescript
try {
  // ... handler body ...
} catch (err) {
  logger.error('tool_name failed', err);
  return {
    content: [{ type: 'text' as const, text: `tool_name failed: ${err instanceof Error ? err.message : String(err)}` }],
    isError: true as const,
  };
}
```

### `prKey` Empty-String Guard (apply to: `web/src/App.tsx` new walkthrough event calls)

**Source:** `web/src/App.tsx` lines 94–97

```typescript
// prKey is empty ('') until the first snapshot arrives (Plan 03-04 INITIAL).
// Do NOT reconstruct from pr meta — local-branch sessions lack owner/repo/number.
if (!prKey) return;
```
Every new `postSessionEvent` call site must guard with `if (!prKey) return;` before the call.

### CSS Token Palette (apply to: `WalkthroughBanner.tsx`, `ThreadCard.tsx`, `WalkthroughStepList.tsx`)

**Source:** `web/src/components/SummaryDrawer.tsx` lines 40, 44, 71–72 and `web/src/components/FindingsSidebar.tsx` inline styles

Established CSS variable tokens:
- `var(--paper)` — card background
- `var(--paper-2)` — secondary/muted card background
- `var(--paper-3)` — tertiary background (marker)
- `var(--ink)` — primary text
- `var(--ink-3)` — secondary text
- `var(--ink-4)` — muted/disabled text
- `var(--ink-5)` — border
- `var(--ok)`, `var(--ok-bg)` — green success
- `var(--warn)`, `var(--warn-bg)` — yellow warning
- `var(--block)`, `var(--block-bg)` — red blocker
- `var(--claude)` — LLM brand accent (use for active walkthrough step)
- `var(--mono)` — monospace font

### SECURITY: LLM Text Rendering (apply to: `WalkthroughBanner.tsx`, `ThreadCard.tsx`, all LLM-authored text fields)

**Source:** `web/src/components/DiffViewer.tsx` lines 513–515 and `web/src/components/SummaryDrawer.tsx` lines 49–51

All LLM-authored text (walkthrough commentary, thread messages, draft body) MUST render via React text nodes. Never use `dangerouslySetInnerHTML` on these fields. The only permitted `dangerouslySetInnerHTML` in the entire codebase is for server-produced Shiki tokens (DiffViewer.tsx, with T-3-01 comment).

### Stderr-only Logging (apply to: all 4 new MCP tool files)

**Source:** `server/src/mcp/tools/run-self-review.ts` lines 5, 213–215

```typescript
import { logger } from '../../logger.js';
// ...
logger.error('tool_name failed', err);
```
Never use `console.log` in the MCP server — it corrupts the JSON-RPC stdio channel.

---

## No Analog Found

All Phase 5 files have analogs. No files require falling back to RESEARCH.md patterns exclusively, though the following have only partial analogs:

| File | Role | Data Flow | Notes |
|------|------|-----------|-------|
| `server/src/mcp/tools/reply-in-thread.ts` | service | request-response | `preExisting` gate logic is novel — no existing analog; use RESEARCH.md Pattern 2 |
| `web/src/components/ThreadCard.tsx` — draft textarea | component | event-driven | Store-local draft editing with SSE reconnect protection (Pitfall 3) is novel; use RESEARCH.md Assumption A2 |

---

## Metadata

**Analog search scope:** All source files in `server/src/`, `web/src/`, `shared/`

**Files scanned:** `run-self-review.ts`, `start-review.ts`, `set-pr-summary.ts`, `reducer.ts`, `session-events.ts`, `store.ts`, `App.tsx`, `DiffViewer.tsx`, `TopBar.tsx`, `FindingsSidebar.tsx`, `SummaryDrawer.tsx`, `shared/types.ts`, `server.ts`, plus test files `run-self-review.test.ts`, `TopBar.test.tsx`

**Pattern extraction date:** 2026-04-22
