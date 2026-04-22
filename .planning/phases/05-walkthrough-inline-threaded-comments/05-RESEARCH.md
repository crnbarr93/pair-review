# Phase 5: Walkthrough + Inline Threaded Comments — Research

**Researched:** 2026-04-22
**Domain:** MCP tool design, React state management, in-diff UI, opaque ID rails, event-sourcing extension
**Confidence:** HIGH — all findings are verified against the live codebase (Phases 1-4), the locked CONTEXT.md decisions, and the approved UI-SPEC.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Walkthrough operates at hunk-level granularity. Each step maps to one hunk.
- **D-02:** "Change this order?" affordance is a read-only preview with skip. No drag-to-reorder. Ask Claude in chat to revise order.
- **D-03:** Per-step commentary renders as a banner/card above the hunk. Scrolls with the diff. Previous steps collapse to a compact one-line summary.
- **D-04:** `set_walkthrough` is a single atomic MCP tool call: `{ steps: [{ hunkId: string, commentary: string }] }`. No add_step/finalize lifecycle.
- **D-05:** "Show all" is a filter, not a state reset. Walkthrough cursor, visited steps, drafted comments are preserved when toggling.
- **D-06:** Non-curated hunks appear interleaved by file position when show-all is active. Curated hunks get a visual badge.
- **D-07:** Toggling back to curated-only snaps to the current walkthrough step.
- **D-08:** Every thread is LLM-initiated (conversational). No solo user threads.
- **D-09:** Thread-to-comment flattening: LLM synthesizes via `draft_comment`, user edits the post-body slot.
- **D-10:** Synthesis on explicit `draft_comment` action only. No auto-synthesis after every turn.
- **D-11:** `preExisting: true` gate on context lines. `draft_comment` and `reply_in_thread` reject context-line anchors unless `preExisting: true` is explicitly set.
- **D-12:** Phase 5 adds 3-4 MCP tools. Cumulative budget 8-9/10 after Phase 5 (1-2 buffer for Phase 6 `submit_review`).
- **D-13:** All thread/comment tools accept only opaque IDs — `lineId` and `threadId` are server-generated. Garbage IDs return schema errors.
- **D-14:** Threads render in-diff push-down below anchored line. Thread card inserts between diff table rows.
- **D-15:** Multiple threads can be expanded simultaneously.
- **D-16:** Long conversations collapse older turns. Last 3 turns visible by default. "N earlier messages" expander. Post-body slot pinned at bottom always.
- **D-17:** FindingsSidebar and inline threads coexist simultaneously.
- **D-18:** New SessionEvent variants: `walkthrough.set`, `walkthrough.stepAdvanced`, `thread.replyAdded`, `thread.draftSet`, `thread.resolved`, `walkthrough.showAllToggled`.
- **D-19:** ReviewSession gains: `walkthrough?: Walkthrough | null`, `threads?: Record<string, Thread>`, `draftComments?: Record<string, DraftComment>` (or inline on Thread — planner's discretion).

### Claude's Discretion

- Exact `Walkthrough` / `Thread` / `DraftComment` type shapes in `shared/types.ts`
- Whether `resolve_thread` is a separate tool or a flag on `draft_comment`
- Exact commentary banner styling (colors, collapse animation, compact summary format)
- Exact thread card styling (message bubble vs flat, timestamp display, author labels)
- Exact "curated" badge visual treatment
- How many turns to show before collapsing (guidance: 3)
- Exact post-body slot styling (textarea vs contenteditable, placeholder text)
- Whether walkthrough step list renders in StageStepper or a dedicated sidebar section
- How `c` keyboard shortcut integrates
- Exact `threadId` format (nanoid length, prefix convention)
- Whether `reply_in_thread` uses `lineId` for new threads and `threadId` for existing, or a discriminated union

### Deferred Ideas (OUT OF SCOPE)

- Drag-to-reorder walkthrough steps
- User-initiated solo threads (no LLM involvement)
- Auto-synthesis of post body after each LLM reply
- One-thread-at-a-time auto-collapse
- Thread card overlay
- Thread side panel
- Suggestion blocks in thread comments (DIFF-V2-03)
- Multi-line comment ranges (DIFF-V2-01)
- Verdict UI, `pulls.createReview` submission (Phase 6)
- Pre-existing pending-review detection (Phase 6)
- Multi-session switcher (Phase 7)
- Any Anthropic API call from the plugin process
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LLM-03 | User can walk through the PR following an LLM-curated narrative that picks hunk order and provides per-step commentary explaining intent and flagging potential issues | `set_walkthrough` MCP tool + `WalkthroughBanner` + `WalkthroughStepList` in StageStepper + `walkthrough.set`/`walkthrough.stepAdvanced`/`walkthrough.showAllToggled` events |
| LLM-04 | User can toggle a "show all" mode during the walkthrough to walk the remaining non-curated hunks without losing progress in the curated set | Show-all is a boolean filter on `walkthrough.showAll`; virtualList in App.tsx is recomputed to include all hunks or only curated; cursor stays in curated coordinate space always |
| LLM-05 | User can carry on a conversational thread with the LLM on any diff line — anchored to `{path, line, side}` — that flattens to a single posted comment on review submission | `reply_in_thread` + `draft_comment` MCP tools + `ThreadCard` push-down row in diff table + `thread.replyAdded`/`thread.draftSet`/`thread.resolved` events; post-body editable slot survives browser refresh via Phase 2 persistence pipeline |
</phase_requirements>

---

## Summary

Phase 5 is a pure additive feature layer on the stable 4-phase scaffold. Nothing in the existing server, persistence, or diff-renderer code needs to change structurally — Phase 5 adds new MCP tool modules, new SessionEvent branches in the reducer, new shared types, new React components, and wires Phase 3 stubs (thread-marker DOM slot, `c` keyboard shortcut).

The architecture pivots on three established patterns that have already proven themselves: (1) the opaque-ID rail (`fileId:hHunkIdx:lLineIdx`) from Phase 1 D-17 and extended by Phase 4's `run_self_review` to validate and resolve lineIds server-side before storing; Phase 5 replicates this pattern for `hunkId` validation in `set_walkthrough` and introduces `threadId` (nanoid) for thread continuity. (2) The atomic MCP tool + `applyEvent` pipeline from Phase 2 and Phase 4: a single tool call produces a `SessionEvent`, the manager queues it, the reducer handles it, persistence writes it, SSE broadcasts it, and the web store mirrors it — no special work needed per new event type. (3) The push-down `tr.thread-row` DOM pattern, already established in Phase 3 CSS (`.thread-panel`, `.thread-marker`, `.thread-row`), which is the mount point for `ThreadCard` components.

The UI-SPEC (approved 2026-04-22) fully specifies visual contracts for all four new surfaces: `WalkthroughBanner`, `WalkthroughStepList`, `ThreadCard`, and `CuratedBadge`. All new CSS maps to existing tokens; no new CSS variables are introduced. The planner has complete constraints and needs only to sequence the implementation waves correctly.

**Primary recommendation:** Implement Phase 5 in three waves: (Wave 1) shared types + reducer + MCP tools; (Wave 2) server/walkthrough state and thread state management; (Wave 3) UI components and App.tsx wiring. This matches the established phase pattern (types first, server second, web third) and ensures the web never references types that don't exist yet.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Walkthrough plan ingestion (`set_walkthrough`) | API / MCP Server | — | MCP tool receives hunkId array, validates each against session diff, stores `Walkthrough` via `applyEvent`. Browser is passive receiver of SSE update. |
| Hunk ID validation (opaque rail) | API / MCP Server | — | Server owns the `DiffModel` and is the only tier that can resolve `hunkId` → `(fileId, hunkIdx, path, header)`. LLM never touches raw coordinates. |
| Thread creation and reply ingestion | API / MCP Server | — | `reply_in_thread` and `draft_comment` are MCP tool calls; server generates `threadId` (nanoid), validates `lineId`, stores via `applyEvent`. |
| Pre-existing line gate (`preExisting: true`) | API / MCP Server | — | Server inspects `DiffLine.kind` from `session.diff` to decide whether to accept or reject the anchor. |
| Walkthrough navigation (next/prev step) | Browser / Client | — | The current step cursor (`walkthrough.cursor`) advances in response to user keyboard/button events posted via `POST /api/session/events`. The server reducer handles `walkthrough.stepAdvanced`. Both server and client track cursor to stay in sync. |
| Show-all toggle state | Browser / Client | API / MCP Server | Toggle is a user action that fires `walkthrough.showAllToggled` via `POST /api/session/events`. Server persists; client recomputes `virtualList` from the updated flag. |
| Thread draft body (editable post-body slot) | Browser / Client | — | After `draft_comment` sets the initial body via SSE, the textarea value diverges from server state as the user edits. Draft edits are store-local until Phase 6 submission (per UI-SPEC interaction contract). |
| WalkthroughBanner rendering | Browser / Client | — | Renders above hunk in `DiffViewer`; consumes `walkthrough` from store. |
| ThreadCard rendering | Browser / Client | — | Renders as `tr.thread-row` inside the existing diff table; consumes `threads` from store. |
| Walkthrough step list (StageStepper) | Browser / Client | — | Extends `StageStepper` in `TopBar.tsx` to display per-step entries and show-all toggle. |

---

## Standard Stack

All packages below are already installed in the project. No new dependencies are required for Phase 5.

### Core (already installed)
| Library | Version | Purpose | Phase 5 Role |
|---------|---------|---------|-------------|
| `@modelcontextprotocol/sdk` | `1.29.0` | MCP server | `mcp.registerTool(name, schema, handler)` pattern for 3-4 new tools |
| `zod` | `4.3.6` | MCP input validation | Opaque ID regex gates for `hunkId` and `threadId`; `preExisting` boolean flag |
| `nanoid` | `5.1.9` | ID generation | `threadId` generation (e.g., `nanoid(10)` — planner picks length) |
| `better-sqlite3` | (workspace) | Persistence | Session state including new `walkthrough`/`threads` fields persists via existing `writeState` |
| `ws` (via Hono) | `8.20.0` | Real-time | Existing SSE pipeline broadcasts new event types to browser without code changes |

[VERIFIED: live codebase — `server/package.json`, import statements in existing tool files]

### No New Dependencies Needed
Phase 5 does not require installing any new packages. The thread card UI, walkthrough banner, step list, and curated badge all use the project's existing hand-rolled CSS token system (confirmed by UI-SPEC). The MCP tools follow the `run-self-review.ts` pattern exactly.

---

## Architecture Patterns

### System Architecture Diagram

```
Claude Code (LLM driver)
        │
        │  MCP stdio
        ▼
┌──────────────────────────────────────┐
│  MCP Server (server/src/mcp/)        │
│                                      │
│  set_walkthrough                     │
│    → validate hunkId[] against       │
│      session.diff.files[].hunks[]    │
│    → emit walkthrough.set event      │
│                                      │
│  reply_in_thread                     │
│    → validate lineId (existing       │
│      resolveLineId pattern)          │
│    → check DiffLine.kind !== context │
│      unless preExisting: true        │
│    → generate threadId if new        │
│    → emit thread.replyAdded event    │
│                                      │
│  draft_comment                       │
│    → validate threadId exists        │
│    → emit thread.draftSet event      │
│                                      │
│  resolve_thread (or flag on above)   │
│    → validate threadId exists        │
│    → emit thread.resolved event      │
└──────────┬───────────────────────────┘
           │
           │  applyEvent → writeState → SessionBus.emit
           ▼
┌──────────────────────────────────────┐
│  Session Layer                       │
│  reducer.ts: new case branches for   │
│  walkthrough.* and thread.* events   │
│                                      │
│  ReviewSession:                      │
│    walkthrough?: Walkthrough | null  │
│    threads?: Record<string, Thread>  │
└──────────┬───────────────────────────┘
           │
           │  SSE (event: update)
           ▼
┌──────────────────────────────────────┐
│  Browser (web/src/)                  │
│                                      │
│  store.ts: onWalkthroughSet,         │
│    onThreadReplyAdded, onDraftSet,   │
│    onThreadResolved actions          │
│                                      │
│  App.tsx: walkthrough-aware          │
│    virtualList; show-all toggle;     │
│    postSessionEvent for              │
│    stepAdvanced/showAllToggled       │
│                                      │
│  DiffViewer.tsx:                     │
│    WalkthroughBanner above hunk      │
│    ThreadCard tr.thread-row in table │
│    CuratedBadge on .hunk--curated    │
│                                      │
│  TopBar.tsx/StageStepper:            │
│    WalkthroughStepList + show-all    │
└──────────────────────────────────────┘
           │
           │  POST /api/session/events
           │  (stepAdvanced, showAllToggled — user-driven)
           ▼
    back to Session Layer
```

### Recommended Project Structure (Phase 5 additions)

```
server/src/mcp/tools/
├── set-walkthrough.ts       # new — validates hunkId[], emits walkthrough.set
├── reply-in-thread.ts       # new — validates lineId + preExisting gate, emits thread.replyAdded
├── draft-comment.ts         # new — validates threadId, emits thread.draftSet
└── resolve-thread.ts        # new (or merged into draft-comment — planner decides)

shared/types.ts              # extend SessionEvent union + ReviewSession fields + new types

server/src/session/reducer.ts  # new case branches for 6 new event types

web/src/components/
├── WalkthroughBanner.tsx    # new — per-step LLM commentary card above hunk
├── WalkthroughStepList.tsx  # new — step list + show-all toggle in StageStepper
└── ThreadCard.tsx           # new — push-down thread card inside diff table

web/src/store.ts             # new action handlers for walkthrough/thread events
web/src/components/DiffViewer.tsx  # mount WalkthroughBanner + ThreadCard; activate thread-marker slot
web/src/components/TopBar.tsx      # enable Walkthrough stage; wire WalkthroughStepList
web/src/App.tsx              # walkthrough-aware virtualList; 'c' key wiring; show-all toggle

server/src/http/routes/session-events.ts  # add walkthrough.stepAdvanced + walkthrough.showAllToggled to accepted user events
```

---

## Pattern 1: MCP Tool — `set_walkthrough`

**What:** Atomic tool call that installs a full walkthrough plan in one shot.

**When to use:** Follows the `run_self_review` atomic-replacement pattern (Phase 4 D-01). The LLM calls this once after `run_self_review` to propose a narrative order. The reducer replaces `session.walkthrough` atomically.

**Zod schema shape:**
```typescript
// Source: existing patterns in server/src/mcp/tools/run-self-review.ts [VERIFIED: codebase]
const WalkthroughStepSchema = z.object({
  hunkId: z.string().regex(/^[A-Za-z0-9_-]+:h\d+$/, {
    error: 'Invalid hunkId. Must be an opaque hunk ID from list_files/get_hunk. Format: `<fileId>:h<hunkIdx>`.'
  }),
  commentary: z.string().min(1).max(1000),
});

const Input = z.object({
  prKey: z.string().min(1).max(200),
  steps: z.array(WalkthroughStepSchema).min(1).max(200),
});
```

**Handler pattern:**
```typescript
// Source: run-self-review.ts handler structure [VERIFIED: codebase]
async ({ prKey, steps }) => {
  const session = manager.get(prKey);
  if (!session) return errorResponse(`session not found for "${prKey}"`);

  // Validate every hunkId resolves to a real hunk
  for (const step of steps) {
    const resolved = resolveHunkId(session.diff, step.hunkId);
    if (!resolved) return errorResponse(`hunkId "${step.hunkId}" not found`);
  }

  const walkthrough: Walkthrough = {
    steps: steps.map((s, i) => ({
      stepNum: i + 1,
      hunkId: s.hunkId,
      commentary: s.commentary,
      status: 'pending' as WalkthroughStepStatus,
    })),
    cursor: 0,
    showAll: false,
    generatedAt: new Date().toISOString(),
  };

  await manager.applyEvent(prKey, { type: 'walkthrough.set', walkthrough });
  return ackResponse(`Walkthrough set. ${steps.length} steps. Hunk ${steps[0].hunkId} is step 1.`);
}
```

**Key implementation detail — `resolveHunkId`:**
```typescript
// Mirrors resolveLineId from run-self-review.ts [VERIFIED: codebase]
function resolveHunkId(diff: DiffModel, hunkId: string): { path: string; header: string } | null {
  const match = /^(.+):h(\d+)$/.exec(hunkId);
  if (!match) return null;
  const [, fileId, hunkIdxRaw] = match;
  const hunkIdx = Number(hunkIdxRaw);
  const file = diff.files.find((f) => f.id === fileId);
  if (!file) return null;
  const hunk = file.hunks[hunkIdx];
  if (!hunk) return null;
  return { path: file.path, header: hunk.header };
}
```

---

## Pattern 2: MCP Tool — `reply_in_thread`

**What:** Starts or continues a conversational thread on a diff line. The LLM is always the initiator.

**Discriminated union for new vs existing thread:**
```typescript
// Planner resolves: lineId-for-new vs threadId-for-existing, or discriminated union
// Recommended: single schema with optional fields + server-side branch
const Input = z.object({
  prKey: z.string().min(1).max(200),
  // For new thread — supply lineId; for existing — supply threadId
  lineId: z.string().regex(/^[A-Za-z0-9_-]+:h\d+:l\d+$/).optional(),
  threadId: z.string().min(1).max(40).optional(),
  message: z.string().min(1).max(4000),
  preExisting: z.boolean().optional(),
}).refine(data => data.lineId !== undefined || data.threadId !== undefined, {
  error: 'Either lineId (new thread) or threadId (reply to existing) must be supplied.'
});
```

**Pre-existing line gate (D-11, Pitfall 12 mitigation):**
```typescript
// Inspect DiffLine.kind from session.diff via resolveLineId pattern [VERIFIED: codebase]
const pos = resolveLineId(session.diff, lineId);
if (!pos) return errorResponse(`lineId "${lineId}" does not resolve`);
const line = lookupLine(session.diff, lineId); // returns DiffLine
if (line.kind === 'context' && !preExisting) {
  return errorResponse(
    `lineId "${lineId}" is an unchanged context line. ` +
    `Set preExisting: true to intentionally flag pre-existing code.`
  );
}
```

**Thread ID generation:**
```typescript
// nanoid 5.1.9 already installed [VERIFIED: server/package.json]
import { nanoid } from 'nanoid';
const threadId = `th_${nanoid(10)}`; // e.g. "th_v9fK2mRqLw"
```

---

## Pattern 3: MCP Tool — `draft_comment`

**What:** Synthesizes a thread into an editable post body. Clean boundary between scratchpad conversation and concrete review comment.

**Schema:**
```typescript
const Input = z.object({
  prKey: z.string().min(1).max(200),
  threadId: z.string().min(1).max(40),
  body: z.string().min(1).max(65536), // GitHub comment limit
});
```

**Handler:** validate `threadId` exists in `session.threads`; emit `thread.draftSet` with `{ threadId, body }`. The store updates the editable textarea value from SSE.

---

## Pattern 4: New SessionEvent Types and Reducer Cases

**What:** Six new branches in `reducer.ts`. All follow the existing `...s, field: value` spread pattern.

```typescript
// In shared/types.ts — extend SessionEvent union [VERIFIED: reducer.ts pattern]
| { type: 'walkthrough.set'; walkthrough: Walkthrough }
| { type: 'walkthrough.stepAdvanced'; cursor: number }
| { type: 'walkthrough.showAllToggled'; showAll: boolean }
| { type: 'thread.replyAdded'; threadId: string; thread: Thread }   // full Thread on first add; turn appended after
| { type: 'thread.draftSet'; threadId: string; body: string }
| { type: 'thread.resolved'; threadId: string }
```

**Reducer cases:**
```typescript
// Source: reducer.ts spread pattern [VERIFIED: codebase]
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

**CRITICAL:** The existing exhaustiveness guard (`const _never: never = e; throw new Error(...)`) means every new event variant MUST have a handler or TypeScript compile fails. [VERIFIED: reducer.ts line 52-54]

---

## Pattern 5: New Shared Types

**What:** Minimal new type surface needed in `shared/types.ts`.

```typescript
// Phase 5 additions to shared/types.ts

export type WalkthroughStepStatus = 'pending' | 'visited' | 'skipped';

export interface WalkthroughStep {
  stepNum: number;
  hunkId: string;              // Opaque, server-validated
  commentary: string;          // LLM narration. SECURITY: render via React text nodes — NEVER innerHTML
  status: WalkthroughStepStatus;
}

export interface Walkthrough {
  steps: WalkthroughStep[];
  cursor: number;              // Index into steps[] of current active step
  showAll: boolean;            // D-05: filter flag
  generatedAt: string;         // ISO timestamp
}

export interface ThreadTurn {
  author: 'llm' | 'user';
  message: string;             // SECURITY: render via React text nodes — NEVER innerHTML
  createdAt: string;           // ISO timestamp
}

export interface Thread {
  threadId: string;            // Server-generated nanoid
  lineId: string;              // Opaque DiffLine.id anchor
  path: string;                // Server-resolved from lineId
  line: number;                // Server-resolved fileLine
  side: LineSide;              // Server-resolved
  preExisting: boolean;        // True if anchored to unchanged context line
  turns: ThreadTurn[];
  draftBody?: string;          // Set by draft_comment; edited client-side after that
  resolved: boolean;
  createdAt: string;           // ISO timestamp
}

// ReviewSession additions (all optional for backward compat)
// walkthrough?: Walkthrough | null;
// threads?: Record<string, Thread>;
```

---

## Pattern 6: User Event Extensions (POST /api/session/events)

**What:** Two new user-driven event variants that must be added to `session-events.ts`'s accepted `userEventSchema`.

```typescript
// Source: session-events.ts discriminatedUnion pattern [VERIFIED: codebase]
const stepAdvancedSchema = z.object({
  type: z.literal('walkthrough.stepAdvanced'),
  cursor: z.number().int().min(0),
}).strict();

const showAllToggledSchema = z.object({
  type: z.literal('walkthrough.showAllToggled'),
  showAll: z.boolean(),
}).strict();

// Add to z.discriminatedUnion('type', [...]):
// stepAdvancedSchema, showAllToggledSchema
```

**Thread interactions do NOT go through `POST /api/session/events`** — they are LLM-driven MCP tool calls, not user-driven browser events. The only user-browser-originated events in Phase 5 are `walkthrough.stepAdvanced` (Next step / keyboard `n`) and `walkthrough.showAllToggled` (show-all toggle button).

**Draft body edits** stay client-side (store-local) until Phase 6 submission per UI-SPEC interaction contract. No `thread.draftEdited` event is posted from the browser.

---

## Pattern 7: DiffViewer Integration — ThreadCard Push-Down Row

**What:** Thread cards mount as `tr.thread-row` inside the existing `<tbody>` of the diff table, below the anchored line. This is the DOM pattern already reserved in Phase 3.

**Implementation approach in `UnifiedHunk`:**
```typescript
// Source: DiffViewer.tsx UnifiedHunk — extend the per-line render [VERIFIED: codebase]
{hunk.lines.map((line, lineIdx) => (
  <Fragment key={line.id}>
    <tr id={line.id} className={rowClassName(line.kind)}>
      {/* ... existing gutter + content cells ... */}
    </tr>
    {/* Phase 5: inject thread card below anchored line */}
    {threadsOnLine.map(thread => (
      <tr key={thread.threadId} className="thread-row">
        <td colSpan={2}>
          <ThreadCard thread={thread} onDraftChange={...} onResolve={...} />
        </td>
      </tr>
    ))}
  </Fragment>
))}
```

**`threadsOnLine` derivation:** filter `threads` (from store) where `thread.lineId === line.id`. Multiple threads per line are supported per D-15.

**Split view:** The same pattern applies to `SplitHunk` with `colSpan={4}` (four columns in split view: left gutter, left content, right gutter, right content).

---

## Pattern 8: `WalkthroughBanner` Above Hunk

**What:** Renders above a hunk when that hunk is the current walkthrough step. Uses `.walkthrough-banner` CSS class (new in Phase 5, defined in `index.css`).

**Implementation approach in `FileSection`:**
```typescript
// Source: DiffViewer.tsx FileSection hunk map [VERIFIED: codebase]
{file.hunks.map((hunk, hunkIdx) => (
  <div key={hunk.id} id={hunk.id} className={hunkClasses(hunk, walkthrough, focusedHunkId)}>
    {/* Phase 5: walkthrough banner above hunk */}
    {walkthroughStepForHunk && (
      <WalkthroughBanner
        step={walkthroughStepForHunk}
        stepNum={walkthroughStepForHunk.stepNum}
        totalSteps={walkthrough.steps.length}
        isActive={walkthrough.cursor === stepIndex}
        onSkip={() => postStepAdvanced(/* skip */)}
        onNext={() => postStepAdvanced(/* next */)}
      />
    )}
    <div className="hunk-head">{hunk.header}</div>
    {/* ... existing UnifiedHunk / SplitHunk ... */}
  </div>
))}
```

---

## Pattern 9: WalkthroughStepList in StageStepper

**What:** The currently-disabled "Walkthrough" step in `StageStepper` (`TopBar.tsx`) is enabled when `walkthrough` is non-null. It expands to show the step list + show-all toggle.

**Implementation:** Replace the hardcoded disabled stub in `StageStepper` with a conditional that renders `WalkthroughStepList` when `walkthrough` is non-null. [VERIFIED: TopBar.tsx lines 219-228 — the stub is a plain `disabled: true` step with no sub-tree]

---

## Pattern 10: `c` Keyboard Shortcut Wiring

**What:** The `case 'c'` branch in `App.tsx`'s `onKeyDown` currently shows a toast. Phase 5 wires it per UI-SPEC.

**Current code:**
```typescript
// Source: App.tsx lines 183-185 [VERIFIED: codebase]
case 'c':
  e.preventDefault();
  showToast('Comments available in Phase 5');
  break;
```

**Phase 5 replacement:**
```typescript
case 'c':
  e.preventDefault();
  if (focusedHunkId) {
    const threadsOnFocused = getThreadsForHunk(state.threads, focusedHunkId);
    if (threadsOnFocused.length > 0) {
      // expand the first open thread (scroll into view + expand)
      scrollToThread(threadsOnFocused[0].threadId);
    } else {
      showToast('Ask Claude to start a thread on this line');
    }
  } else {
    showToast('Ask Claude to start a thread on this line');
  }
  break;
```

---

## Pattern 11: VirtualList for Show-All Toggle

**What:** App.tsx currently computes `virtualList` as non-generated hunks in file order. Phase 5 extends this to support two projections: curated (walkthrough steps in step order) and all (all non-generated hunks in file order, with curated ones interleaved as D-06 specifies).

```typescript
// Source: App.tsx lines 47-53 [VERIFIED: codebase]
const virtualList = useMemo(() => {
  if (!diff) return [];
  const allHunks = diff.files
    .filter((f) => !f.generated)
    .flatMap((f) => f.hunks.map((h) => ({ fileId: f.id, hunkId: h.id })));

  // Phase 5 extension
  if (walkthrough && !walkthrough.showAll) {
    // Curated mode: only walkthrough steps, in step order
    return walkthrough.steps.map((step) => {
      const file = diff.files.find((f) => f.hunks.some((h) => h.id === step.hunkId));
      return { fileId: file?.id ?? '', hunkId: step.hunkId };
    });
  }
  // Show-all mode: all hunks in file order (curated ones get CuratedBadge via CSS)
  return allHunks;
}, [diff, walkthrough]);
```

**Key invariant:** The `n`/`p` keyboard handler calls `advanceHunk(+/-1)`, which operates on `virtualList`. Switching `showAll` changes the list the cursor walks, but the walkthrough `cursor` (stored in `session.walkthrough.cursor`) is always expressed in terms of the curated step array, never the virtualList index. The two coordinate systems are separate. [ASSUMED — design inference; confirmed by D-05/D-07 intent]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Thread ID generation | Custom UUID or hash | `nanoid` (already installed, v5.1.9) | Correct, URL-safe, cryptographic entropy |
| Hunk ID validation | Custom regex from scratch | Extend existing `/^[A-Za-z0-9_-]+:h\d+$/` pattern from `run-self-review.ts` | Pattern already battle-tested in Phase 4; consistent format |
| Diff line lookup for lineId → DiffLine | New traversal function | Extract/share `resolveLineId` from `run-self-review.ts` | Already works; only needs to also return the `DiffLine` object (not just position) |
| State queuing for new events | New queue per event type | Existing `manager.queues` per-prKey Promise chain in `applyEvent` | Already serializes all mutations; new events inherit for free |
| SSE broadcast for new events | New pub-sub per event type | Existing `SessionBus` + `events.ts` SSE route | New event types broadcast automatically via the existing `manager.applyEvent` → `bus.emit` path |
| Textarea auto-resize | Pure CSS or JS hack | `min-height + max-height` on `.thread-draft-input` + `rows` auto (standard HTML behavior) | Simple, no JS needed |
| Thread state persistence across refresh | Custom snapshot endpoint | Existing Phase 2 SSE reconnect: server always re-sends full snapshot | Phase 2 already guarantees full state sync on reconnect; threads are just fields on `ReviewSession` |

**Key insight:** Every new capability in Phase 5 fits into an existing slot in the event-sourcing pipeline. The reducer, the SSE bus, the persistence layer, and the web store all handle new event types without architectural changes — only new `case` branches and new action handlers.

---

## Common Pitfalls

### Pitfall 1: Forgetting the Reducer Exhaustiveness Guard
**What goes wrong:** Adding a new `SessionEvent` variant in `shared/types.ts` without adding the corresponding `case` in `reducer.ts`. TypeScript will surface a compile error via the exhaustiveness guard (`const _never: never = e`), but if the planner forgets to include the reducer task the build will fail.
**Why it happens:** Types and reducer are in different files; easy to miss one.
**How to avoid:** Plan reducer extension as a Wave 1 task alongside types, before any server or web tasks.
**Warning signs:** `Property 'type' does not exist on type 'never'` compile error.
[VERIFIED: reducer.ts lines 52-54]

### Pitfall 2: Exposing `lineId` Directly in Thread API Response
**What goes wrong:** The MCP tool ACK or the `Thread` object sent to the browser includes the raw `lineId` as a mutable-looking field the LLM might be tempted to fabricate.
**Why it happens:** Server resolves `lineId` → `(path, line, side)` at ingest time, but if the `Thread` object echoes `lineId` in the ACK text, the LLM might try to construct lineIds rather than look them up.
**How to avoid:** Tool descriptions must reinforce "only supply lineIds from `list_files`/`get_hunk`". The zod regex gate on `lineId` in `reply_in_thread` makes fabrication fail, but description clarity prevents confusion.
**Warning signs:** LLM error response "lineId X does not resolve" on new threads.
[VERIFIED: Pitfall 2 in `.planning/research/PITFALLS.md` per CONTEXT.md canonical refs]

### Pitfall 3: Thread Draft Body Overwritten on SSE Reconnect
**What goes wrong:** User edits the `draftBody` textarea. Browser refreshes. SSE snapshot arrives. If the store's `onSnapshot` blindly overwrites `state.threads` from the session snapshot, the user's local edits are lost.
**Why it happens:** The `draftBody` on the server reflects the last `draft_comment` call. User edits after that are store-local (per UI-SPEC). A naive snapshot merge clobbers them.
**How to avoid:** In `store.ts`, the `onSnapshot` and `onUpdate` handlers should NOT overwrite local textarea values that have diverged from the server's `draftBody`. One strategy: track which threads have been locally edited in a separate Map, and skip updating `draftBody` for those during snapshot. Alternatively, only apply `thread.draftSet` events (not full snapshot replacement) to update draft bodies.
**Warning signs:** User types in the draft textarea, then Claude makes another tool call (causing SSE update), and the textarea reverts to the LLM-synthesized text.
[ASSUMED — inferred from Phase 2 SSE snapshot behavior; confirmed by UI-SPEC interaction contract "textarea value is synced to local store state (not persisted via MCP)"]

### Pitfall 4: `walkthrough.cursor` Expressing VirtualList Index Instead of Step Array Index
**What goes wrong:** The cursor stored in `session.walkthrough.cursor` gets set to the virtualList index (which changes when show-all is toggled) instead of the step array index (which is stable).
**Why it happens:** App.tsx's `focusedHunkIndex.current` tracks virtualList position; it would be tempting to reuse it for the walkthrough cursor.
**How to avoid:** Keep `walkthrough.cursor` strictly as an index into `walkthrough.steps[]`. Never store a virtualList index in the session. Derive virtualList position from `walkthrough.cursor` when needed.
**Warning signs:** "Curated" mode snapping to the wrong hunk after toggling show-all.
[ASSUMED — design inference from D-05/D-07 and App.tsx virtualList pattern]

### Pitfall 5: Adding Thread Card to HTML Table Without Fragment Wrapper
**What goes wrong:** Injecting `<tr className="thread-row">` between `<tr>` elements inside `<tbody>` without a React Fragment causes "validateDOMNesting" warnings and possible rendering issues.
**Why it happens:** JSX wrapping elements (like a conditional div) inside `<tbody>` breaks table structure.
**How to avoid:** Use `<Fragment>` to wrap the original `<tr>` and the injected `<tr className="thread-row">` per Pattern 7 above. This is the standard approach for augmenting table rows in React.
[VERIFIED: DiffViewer.tsx tbody/tr structure — no Fragments currently used in row rendering]

### Pitfall 6: `session-events.ts` Rejecting New User Events
**What goes wrong:** Browser posts `walkthrough.stepAdvanced` but gets a 400 back because the `userEventSchema` in `session-events.ts` only allows `file.reviewStatusSet` and `file.generatedExpandToggled`.
**Why it happens:** `session-events.ts` has an explicit allowlist of user-originated event types; it intentionally rejects anything not on the list (server-generated variants must not come from the browser).
**How to avoid:** Pattern 6 above explicitly covers extending `userEventSchema` to include the two new user-driven Phase 5 events.
[VERIFIED: session-events.ts lines 39-46]

### Pitfall 7: Tool Description Missing Opaque ID Discipline for `hunkId`
**What goes wrong:** LLM tries to construct a `hunkId` from a file path and line number it knows, rather than using the value returned by `list_files` / `get_hunk`.
**Why it happens:** `set_walkthrough` is a new tool; the LLM hasn't seen examples of correct `hunkId` values yet. Without explicit instruction in the description, it may attempt to construct them.
**How to avoid:** The `set_walkthrough` description must include: "Every hunkId in steps[] must be an opaque value returned by `list_files`. Never construct hunkId strings from file paths or line numbers — the schema rejects them." Mirror the anchor discipline text from `run_self_review` description.
[VERIFIED: run-self-review.ts DESCRIPTION lines 71-73 — same instruction pattern]

---

## Code Examples

### Resolving lineId to DiffLine (shared utility)
```typescript
// Source: run-self-review.ts lines 82-97 [VERIFIED: codebase]
// Phase 5 needs to also return the DiffLine object itself (for .kind check)
function resolveLineId(diff: DiffModel, lineId: string): {
  path: string;
  line: number;
  side: 'LEFT' | 'RIGHT' | 'BOTH';
  lineKind: LineKind;  // Phase 5 addition for preExisting gate
} | null {
  const match = /^(.+):h(\d+):l(\d+)$/.exec(lineId);
  if (!match) return null;
  const [, fileId, hunkIdxRaw, lineIdxRaw] = match;
  const file = diff.files.find((f) => f.id === fileId);
  if (!file) return null;
  const hunk = file.hunks[Number(hunkIdxRaw)];
  if (!hunk) return null;
  const dl = hunk.lines[Number(lineIdxRaw)];
  if (!dl) return null;
  return { path: file.path, line: dl.fileLine, side: dl.side, lineKind: dl.kind };
}
```

### Registering a new MCP tool (reference pattern)
```typescript
// Source: server/src/mcp/tools/run-self-review.ts lines 113-117 [VERIFIED: codebase]
export function registerSetWalkthrough(mcp: McpServer, manager: SessionManager): void {
  mcp.registerTool(
    'set_walkthrough',
    { title: 'Set Walkthrough', description: DESCRIPTION, inputSchema: Input.shape },
    async ({ prKey, steps }) => {
      try {
        // ... handler ...
      } catch (err) {
        logger.error('set_walkthrough failed', err);
        return { content: [{ type: 'text' as const, text: `set_walkthrough failed: ...` }], isError: true };
      }
    }
  );
}
```

### Tool description for walkthrough narrative framing
```typescript
// Pattern based on run-self-review.ts DESCRIPTION [VERIFIED: codebase]
// Key points to include in set_walkthrough description:
const DESCRIPTION = [
  'Compose a hunk-by-hunk walkthrough narrative for the PR.',
  '',
  'Order discipline: prioritize changes that are core to the PR intent (from set_pr_summary intent field).',
  '  - refactor: start with the structural reshaping hunks, then test hunks',
  '  - feature: start with the new capability implementation, then tests, then config',
  '  - bug-fix: start with the fix hunk, then any regression test hunks',
  '  - Never use alphabetical file order or diff position order as the primary axis.',
  '',
  'Commentary discipline: 2-4 sentences per step.',
  '  - What this hunk does (the mechanism)',
  '  - Why it matters in context of the PR intent',
  '  - Any concern the reviewer should pay special attention to',
  '  - NOT a full code analysis — that is already in run_self_review findings.',
  '',
  'Anchor discipline: every hunkId must be an opaque value returned by list_files.',
  '  - Never construct hunkId strings from file paths or line numbers.',
  '  - Format: `<fileId>:h<hunkIdx>` — the schema rejects freeform anchors.',
].join('\n');
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Thread cards as sidebar panels | Push-down `tr.thread-row` inside diff table (GitHub style) | Phase 3 CSS reservation, Phase 5 activation | Spatial co-location; no layout column added |
| LLM supplies `(path, line)` strings | LLM supplies opaque server-generated IDs only | Phase 1 D-17, enforced in Phase 4 | Hallucinated coordinates are structurally impossible |
| Thread-to-comment auto-synthesis on each reply | Explicit `draft_comment` tool call + editable textarea | Phase 5 D-09/D-10 | Clean scratchpad→draft boundary; avoids churn |
| Walkthrough as separate state machine | Filter projection over unified walkthrough state (D-05) | Phase 5 D-05 | show-all toggle preserves cursor; no state reset |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | VirtualList index and walkthrough cursor are separate coordinate systems; walkthrough.cursor indexes into steps[], never virtualList | Pattern 11, Pitfall 4 | Walkthrough cursor drifts after show-all toggle; snapping back to curated mode jumps to wrong hunk |
| A2 | Draft body edits are store-local (not persisted via MCP tool calls); onSnapshot should not overwrite locally-edited draftBody values | Pitfall 3 | User edits lost on any SSE update |
| A3 | `resolve_thread` is a fourth MCP tool (not a flag on `draft_comment`) by default — planner may merge | Pattern 3 section, D-12 | Tool count becomes 9/10 instead of 8/10 (both are within budget) |
| A4 | `lookupLine` (returning DiffLine for `.kind` check) is extracted as a shared utility alongside `resolveLineId`, not duplicated in each tool file | Pattern 1, 2 code examples | Duplicate traversal code — low risk, but messy |

**If A2 is wrong:** The store `onUpdate` handler would need to blindly overwrite `draftBody`, causing user edits to vanish on any SSE event. The UI-SPEC interaction contract ("textarea value is synced to local store state") is the authoritative source here.

---

## Open Questions (RESOLVED)

1. **Does `reply_in_thread` use `lineId`-for-new + `threadId`-for-existing, or a discriminated union?**
   - What we know: D-12/D-13 specify both anchors; CONTEXT.md Claude's Discretion leaves the shape to the planner
   - What's unclear: A single schema with optional fields + server branch is simpler to implement; a discriminated union is more type-safe
   - Recommendation: Single schema with optional fields + `.refine()` validation (matches Zod patterns already in use). The discriminated union adds a `kind` field that the LLM must supply correctly — one more failure point.
   - RESOLVED: Single schema with optional fields + `.refine()` (implemented in 05-02 Task 2)

2. **Should `draftBody` live on `Thread` or in a separate `draftComments: Record<string, DraftComment>` field?**
   - What we know: CONTEXT.md D-19 mentions both options; "Planner may inline this into Thread if cleaner."
   - What's unclear: A separate record adds indirection; inline is simpler for the browser to consume
   - Recommendation: Inline `draftBody?: string` on `Thread`. Simpler SSE update shape; Phase 6 just reads `thread.draftBody` for submission.
   - RESOLVED: `draftBody` inlined on `Thread` (implemented in 05-01 Task 1)

3. **How many `turns` are shown before collapsing?**
   - CONTEXT.md D-16 says "2-3 is the guidance; planner picks"
   - UI-SPEC says "last 3 turns visible by default"
   - Recommendation: Use 3 (matching UI-SPEC). No ambiguity.
   - RESOLVED: 3 visible turns by default (implemented in 05-05 Task 1, `VISIBLE_TURNS = 3`)

---

## Environment Availability

Step 2.6: SKIPPED — Phase 5 is purely code/config changes building on the existing Node.js + pnpm development environment established in Phases 1-4. No new external tools, CLIs, databases, or services are required.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (latest, configured in each workspace) |
| Config file | `vitest.config.ts` per workspace (server/, web/) |
| Quick run command | `pnpm --filter server test --run` or `pnpm --filter web test --run` |
| Full suite command | `pnpm test` (root, runs all workspaces) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LLM-03 | `set_walkthrough` validates hunkId[] and stores Walkthrough | unit | `pnpm --filter server test --run src/mcp/tools/__tests__/set-walkthrough.test.ts` | ❌ Wave 0 |
| LLM-03 | `walkthrough.set` reducer case replaces walkthrough atomically | unit | `pnpm --filter server test --run` (reducer.test.ts) | ❌ Wave 0 |
| LLM-03 | WalkthroughBanner renders active step correctly | unit | `pnpm --filter web test --run` (WalkthroughBanner.test.tsx) | ❌ Wave 0 |
| LLM-03 | StageStepper walkthrough step list renders when walkthrough is set | unit | `pnpm --filter web test --run` (TopBar.test.tsx) | ❌ Wave 0 |
| LLM-03 | Garbage hunkId in `set_walkthrough` returns schema error | unit | in set-walkthrough.test.ts | ❌ Wave 0 |
| LLM-04 | Show-all toggle fires `walkthrough.showAllToggled` event and virtualList includes all hunks | unit | `pnpm --filter web test --run` (App.keyboard.test.tsx or App.integration.test.tsx) | ❌ Wave 0 |
| LLM-04 | walkthrough cursor position preserved across show-all toggle | unit | App or store test | ❌ Wave 0 |
| LLM-05 | `reply_in_thread` validates lineId and rejects context lines without preExisting flag | unit | `pnpm --filter server test --run src/mcp/tools/__tests__/reply-in-thread.test.ts` | ❌ Wave 0 |
| LLM-05 | `reply_in_thread` generates threadId and stores Thread on session | unit | in reply-in-thread.test.ts | ❌ Wave 0 |
| LLM-05 | `draft_comment` validates threadId exists and sets draftBody | unit | `pnpm --filter server test --run src/mcp/tools/__tests__/draft-comment.test.ts` | ❌ Wave 0 |
| LLM-05 | ThreadCard renders turns and draft slot | unit | `pnpm --filter web test --run` (ThreadCard.test.tsx) | ❌ Wave 0 |
| LLM-05 | Browser refresh restores thread state (snapshot re-sends full session) | integration | existing `pnpm --filter server test --run src/__tests__/end-to-end.test.ts` | ✅ (extend) |
| LLM-05 | Garbage threadId in `draft_comment` returns error | unit | in draft-comment.test.ts | ❌ Wave 0 |
| LLM-03+05 | `c` key wires to thread scroll or toast | unit | `pnpm --filter web test --run src/__tests__/App.keyboard.test.tsx` | ✅ (extend) |

### Sampling Rate
- **Per task commit:** `pnpm --filter server test --run && pnpm --filter web test --run`
- **Per wave merge:** `pnpm test` (all workspaces)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `server/src/mcp/tools/__tests__/set-walkthrough.test.ts` — covers LLM-03 (hunkId validation, schema error, walkthrough.set emission)
- [ ] `server/src/mcp/tools/__tests__/reply-in-thread.test.ts` — covers LLM-05 (lineId validation, preExisting gate, threadId generation, thread.replyAdded emission)
- [ ] `server/src/mcp/tools/__tests__/draft-comment.test.ts` — covers LLM-05 (threadId validation, thread.draftSet emission)
- [ ] `server/src/mcp/tools/__tests__/resolve-thread.test.ts` — covers thread.resolved emission
- [ ] `server/src/session/reducer.test.ts` — covers all 6 new event branches (or extend existing if it exists)
- [ ] `web/src/components/__tests__/WalkthroughBanner.test.tsx` — LLM-03 visual states
- [ ] `web/src/components/__tests__/ThreadCard.test.tsx` — LLM-05 turn rendering + draft slot
- [ ] Framework install: none needed (vitest already configured in both workspaces)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 1 already covers per-session token; no new auth surfaces in Phase 5 |
| V3 Session Management | no | Phase 2 persistence handles session lifecycle; no new surfaces |
| V4 Access Control | no | All new MCP tools require valid `prKey` (session-gated); all new user events go through existing `tokenValidate` middleware |
| V5 Input Validation | yes | zod schemas on all MCP tool inputs; opaque ID regex gates; `preExisting` gate; `discriminatedUnion` allowlist on `/api/session/events` |
| V6 Cryptography | no | No new cryptographic operations; `threadId` uses nanoid (CSPRNG) per existing pattern |

### Known Threat Patterns for Phase 5

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| LLM-fabricated hunkId bypassing walkthrough validation | Tampering | Zod regex `/^[A-Za-z0-9_-]+:h\d+$/` + server-side resolution check (same as lineId in Phase 4) |
| LLM commenting on context (pre-existing) code and attributing to PR author | Spoofing / Repudiation | `preExisting: true` required flag gate on `draft_comment` / `reply_in_thread` for `DiffLine.kind === 'context'` |
| Browser injecting MCP-only event variants via POST /api/session/events | Tampering | `session-events.ts` discriminatedUnion allowlist — extended with walkthrough.stepAdvanced and walkthrough.showAllToggled only |
| XSS via LLM-authored commentary or thread message rendered as innerHTML | Tampering | All LLM-authored text (commentary, thread turns, draftBody) MUST render via React text nodes — NEVER `dangerouslySetInnerHTML`. Matches existing T-4-01-04 + T-3-03 security notes. |
| Garbage threadId in `draft_comment` / `resolve_thread` crashing server | Denial of Service | Server-side existence check before processing: `if (!session.threads?.[threadId]) return errorResponse(...)` |

---

## Sources

### Primary (HIGH confidence)
- Live codebase — `server/src/mcp/tools/run-self-review.ts` — resolveLineId, registerTool pattern, zod regex gate, DESCRIPTION framing
- Live codebase — `server/src/session/reducer.ts` — exhaustiveness guard, spread pattern, all event types
- Live codebase — `shared/types.ts` — SessionEvent union, ReviewSession shape, DiffLine/Hunk/DiffFile types
- Live codebase — `web/src/components/DiffViewer.tsx` — UnifiedHunk/SplitHunk tbody structure, thread-marker DOM slot
- Live codebase — `web/src/store.ts` — AppState shape, action handler pattern
- Live codebase — `web/src/App.tsx` — virtualList pattern, keydown handler, advanceHunk
- Live codebase — `web/src/components/TopBar.tsx` — StageStepper disabled Walkthrough stub
- Live codebase — `server/src/http/routes/session-events.ts` — userEventSchema allowlist
- `.planning/phases/05-walkthrough-inline-threaded-comments/05-CONTEXT.md` — all locked decisions D-01 through D-19
- `.planning/phases/05-walkthrough-inline-threaded-comments/05-UI-SPEC.md` — CSS class names, visual states, spacing, typography, interaction contracts
- `server/package.json` — nanoid@5.1.9, zod@4.3.6, @modelcontextprotocol/sdk@1.29.0 confirmed installed

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` — LLM-03, LLM-04, LLM-05 formal requirement text
- `.planning/STATE.md` — accumulated decisions; confirms Phase 4 lineId pattern is the reuse baseline for Phase 5

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified from `server/package.json`; no new dependencies
- Architecture: HIGH — all patterns derived from existing codebase code paths
- Pitfalls: HIGH (verified) + MEDIUM (inferred) — pitfalls 1, 5, 6 verified from code; pitfalls 3, 4 inferred from design constraints

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (stable tech stack; not fast-moving)
