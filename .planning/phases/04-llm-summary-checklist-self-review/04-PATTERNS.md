# Phase 4: LLM Summary + Checklist + Self-Review — Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 10 new/modified files
**Analogs found:** 10 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server/src/mcp/tools/list-files.ts` | tool-handler | request-response (read state) | `server/src/mcp/tools/start-review.ts` | role-match |
| `server/src/mcp/tools/get-hunk.ts` | tool-handler | request-response (read state) | `server/src/mcp/tools/start-review.ts` | role-match |
| `server/src/mcp/tools/set-pr-summary.ts` | tool-handler | request-response (mutate via event) | `server/src/mcp/tools/start-review.ts` | exact |
| `server/src/mcp/tools/run-self-review.ts` | tool-handler | request-response (mutate via event) | `server/src/mcp/tools/start-review.ts` | exact |
| `server/src/checklist/index.ts` | utility / const-export | transform (pure data) | `server/src/logger.ts` (const-export pattern) | partial |
| `server/src/session/reducer.ts` | reducer (modify) | event-driven | `server/src/session/reducer.ts` (itself) | exact |
| `shared/types.ts` | type definitions (modify) | — | `shared/types.ts` (itself) | exact |
| `web/src/store.ts` | store (modify) | event-driven | `web/src/store.ts` (itself) | exact |
| `web/src/components/FindingsSidebar.tsx` | component (new) | request-response / event-driven | `web/src/components/FileExplorer.tsx` | role-match |
| `web/src/App.tsx` | app root (modify) | event-driven | `web/src/App.tsx` (itself) | exact |

---

## Pattern Assignments

### `server/src/mcp/tools/list-files.ts` (tool-handler, read-state)

**Analog:** `server/src/mcp/tools/start-review.ts`

**Imports pattern** (lines 1–5 of analog):
```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../session/manager.js';
import { logger } from '../../logger.js';
import type { ReviewSession } from '@shared/types';
```

**Registration pattern** (lines 18–41 of analog):
```typescript
export function registerListFiles(mcp: McpServer, manager: SessionManager): void {
  mcp.registerTool(
    'list_files',
    {
      title: 'List Files',
      description: '...',
      inputSchema: Input.shape,   // Input is a z.object({}); .shape is the convention
    },
    async ({ cursor, limit, includeExcluded }) => {
      try {
        // read-only: manager.get(prKey) to get session snapshot
        // build FileSummary[] from session.diff.files
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (err) {
        logger.error('list_files failed', err);
        return { content: [{ type: 'text' as const, text: renderFriendlyError(err) }], isError: true };
      }
    }
  );
}
```

**Key differences from start-review:**
- `list_files` is a **read tool** — it calls `manager.get(prKey)` not `manager.startReview(...)`. No `applyEvent` call.
- Return value is structured JSON (text-serialized), not a human-readable summary string.
- `prKey` must be resolved from the call context (stored in the tool handler's closure on the `manager`; Phase 4 tools need to accept `prKey` as an input parameter or derive it from the session).
- `includeExcluded: false` by default — filter `session.diff.files` where `!f.generated`.
- Cursor encoding: base64-encode an integer offset (`Buffer.from(String(offset)).toString('base64')`).

**Error handling pattern** (lines 35–38 of analog):
```typescript
logger.error('list_files failed', err);
return { content: [{ type: 'text' as const, text: renderFriendlyError(err) }], isError: true };
```

---

### `server/src/mcp/tools/get-hunk.ts` (tool-handler, read-state)

**Analog:** `server/src/mcp/tools/start-review.ts`

Same imports/registration shape as `list-files.ts`. Key specifics:

**Input schema pattern:**
```typescript
const Input = z.object({
  hunkId: z.string().min(1),   // format: `${fileId}:h${hunkIdx}`
  cursor: z.string().optional(),
});
```

**Core read pattern:**
```typescript
// Resolve hunkId → file + hunk from session.diff.files
// Apply cursor-based line slicing (decode cursor to integer offset, slice DiffLine[])
// Return { hunkId, fileId, path, header, lines: DiffLine[], nextCursor, totalLines }
```

**lineId on each DiffLine** is already present as `line.id` per `shared/types.ts` line 23. Return lines as-is from the session snapshot — no transform needed.

---

### `server/src/mcp/tools/set-pr-summary.ts` (tool-handler, mutate via event)

**Analog:** `server/src/mcp/tools/start-review.ts` — this is the closest **mutation-path** analog.

**Imports pattern** (identical to analog plus shared types):
```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../../session/manager.js';
import { logger } from '../../logger.js';
import type { PrSummary } from '@shared/types';
```

**Input schema — structured-fields blob (D-06):**
```typescript
const Input = z.object({
  prKey: z.string().min(1),
  summary: z.object({
    intent: z.enum(['bug-fix', 'refactor', 'feature', 'chore', 'other']),
    intentConfidence: z.number().min(0).max(1),
    paraphrase: z.string().min(1),
    keyChanges: z.array(z.string()),
    riskAreas: z.array(z.string()),
    generatedAt: z.string(),   // ISO timestamp
  }),
});
```

**Mutation path via applyEvent** (copies the pattern from `manager.startReview` → `applyEvent`):
```typescript
async ({ prKey, summary }) => {
  try {
    await manager.applyEvent(prKey, { type: 'summary.set', summary });
    return { content: [{ type: 'text' as const, text: 'Summary set.' }] };
  } catch (err) {
    logger.error('set_pr_summary failed', err);
    return { content: [{ type: 'text' as const, text: renderFriendlyError(err) }], isError: true };
  }
}
```

Note: `manager.applyEvent(prKey, event)` is the public mutation API established in Phase 2. See `server/src/session/manager.ts` lines 33–. The tool handler does NOT write to the session directly.

---

### `server/src/mcp/tools/run-self-review.ts` (tool-handler, mutate via event)

**Analog:** `server/src/mcp/tools/start-review.ts` — mutation path, plus schema-enforcement complexity.

**Input schema — with nit cap (D-03) and lineId-only anchoring (D-04):**
```typescript
const FindingSchema = z.object({
  category: z.enum(['correctness', 'security', 'tests', 'performance', 'style']),
  checklistItemId: z.string(),
  severity: z.enum(['blocker', 'major', 'minor', 'nit']),
  lineId: z.string().regex(/^[^:]+:h\d+:l\d+$/),  // format enforced
  title: z.string().max(120),
  rationale: z.string().max(400),
});

const Input = z.object({
  prKey: z.string().min(1),
  findings: z.array(FindingSchema).superRefine((arr, ctx) => {
    const nitCount = arr.filter(f => f.severity === 'nit').length;
    if (nitCount > 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Too many nits (${nitCount}). Max 3 allowed. Promote the most important, drop the rest.`,
      });
    }
  }),
  coverage: z.record(
    z.enum(['correctness', 'security', 'tests', 'performance', 'style']),
    z.enum(['pass', 'partial', 'fail'])
  ),
  verdict: z.enum(['request_changes', 'comment', 'approve']).default('request_changes'),
});
```

**lineId resolution before applyEvent (D-04):**
```typescript
// Resolve each finding.lineId → (path, line, side) from session.diff.files
// Unknown lineId → return isError: true with corrective message
// Store ResolvedFinding (lineId + resolved path/line/side) in the selfReview blob
```

**Zod v4 note:** Use `.superRefine()` for cross-field validation (nit cap). Avoid `z.discriminatedUnion` here since finding schema has no discriminator — use `z.array(FindingSchema)` directly.

---

### `server/src/checklist/index.ts` (utility, const-export)

**Analog:** `server/src/logger.ts` (const export from a module with no I/O at import time).

**Export pattern** (copy the bare const-export shape):
```typescript
// server/src/logger.ts — const export, no I/O, module-level initialization
export const logger = { ... };

// checklist/index.ts — same shape: const + type, no I/O
export interface ChecklistItem {
  id: string;
  category: 'correctness' | 'security' | 'tests' | 'performance' | 'style';
  criticality: 1 | 2 | 3;
  text: string;
  evaluationHint?: string;
}

export const CHECKLIST: readonly ChecklistItem[] = [
  // ~5 items per category × 5 categories = ~25 items total
  // Example shape:
  { id: 'c-01', category: 'correctness', criticality: 1, text: '...', evaluationHint: '...' },
  // ...
] as const;
```

The module-level `CHECKLIST` const is read at server start by `run-self-review.ts`'s handler registration to interpolate item texts into the tool description string. No filesystem I/O, no async, no external dependency. Same pattern as `logger.ts` — import and use synchronously.

---

### `server/src/session/reducer.ts` (reducer, modify)

**Analog:** The file itself — copy the pattern of an existing case branch.

**Existing case pattern** (lines 28–35 of reducer.ts):
```typescript
case 'file.reviewStatusSet':
  return {
    ...s,
    fileReviewStatus: {
      ...(s.fileReviewStatus ?? {}),
      [e.fileId]: e.status,
    },
  };
```

**New Phase 4 case branches to add:**
```typescript
case 'summary.set':
  return { ...s, summary: e.summary };

case 'selfReview.set':
  return { ...s, selfReview: e.selfReview };
```

Both follow the atomic-replace pattern (D-08, D-01). No array merging, no diff, just spread-replace. Place before the `default: never` exhaustiveness guard (currently line 48). The reducer MUST NOT touch `lastEventId` — that invariant is on line 9 of reducer.ts.

---

### `shared/types.ts` (type definitions, modify)

**Analog:** The file itself. Copy the shape of existing Phase-3 additions (lines 148–177).

**New interface pattern** (mirrors `ReadOnlyComment` and `CIStatus` at lines 150–177):
```typescript
// Phase 4 additions — same plain-JSON discipline as existing events
export type ChecklistCategory = 'correctness' | 'security' | 'tests' | 'performance' | 'style';
export type Severity = 'blocker' | 'major' | 'minor' | 'nit';
export type Verdict = 'request_changes' | 'comment' | 'approve';
export type CategoryCoverage = Record<ChecklistCategory, 'pass' | 'partial' | 'fail'>;

export interface PrSummary {
  intent: 'bug-fix' | 'refactor' | 'feature' | 'chore' | 'other';
  intentConfidence: number;   // 0–1
  paraphrase: string;
  keyChanges: string[];
  riskAreas: string[];
  generatedAt: string;        // ISO
}

export interface ResolvedFinding {
  id: string;
  category: ChecklistCategory;
  checklistItemId: string;
  severity: Severity;
  lineId: string;             // opaque, server-resolved (D-17)
  path: string;               // server-resolved from lineId
  line: number;               // server-resolved from lineId
  side: LineSide;             // server-resolved from lineId (already defined above)
  title: string;              // max 120 chars
  rationale: string;          // max 400 chars
}

export interface SelfReview {
  findings: ResolvedFinding[];
  coverage: CategoryCoverage;
  verdict: Verdict;
  generatedAt: string;        // ISO
}
```

**SessionEvent union additions** (append after line 112, before closing semicolon):
```typescript
// Phase 4 additions (D-17):
| { type: 'summary.set'; summary: PrSummary }
| { type: 'selfReview.set'; selfReview: SelfReview }
```

**ReviewSession additions** (append after `ciStatus?: CIStatus` at line 94):
```typescript
// Phase 4 additions (D-18):
summary?: PrSummary | null;
selfReview?: SelfReview | null;
```

Use semicolons for interface member separators (matches existing style in the file).

---

### `web/src/store.ts` (store, modify)

**Analog:** The file itself — copy the pattern of existing Phase-3 action handlers.

**Existing action pattern** (lines 120–138):
```typescript
onUpdate(msg: UpdateMessage) {
  const s = msg.state;
  const hasFiles = s.diff.files.length > 0;
  state = {
    ...state,
    phase: s.error ? 'error' : hasFiles ? 'diff' : 'empty',
    pr: s.pr,
    diff: s.diff,
    shikiTokens: s.shikiTokens,
    staleDiff: s.staleDiff,
    prKey: s.prKey,
    fileReviewStatus: s.fileReviewStatus ?? {},
    expandedGeneratedFiles: s.expandedGeneratedFiles ?? {},
    existingComments: s.existingComments ?? [],
    ciStatus: s.ciStatus,
    headShaError: undefined,
  };
  emit();
},
```

**New Phase 4 action pattern** (add to `actions` object):
```typescript
onSummarySet(msg: UpdateMessage) {
  // msg.state carries the full updated ReviewSession after summary.set
  state = {
    ...state,
    summary: msg.state.summary ?? null,
  };
  emit();
},

onSelfReviewSet(msg: UpdateMessage) {
  // msg.state carries the full updated ReviewSession after selfReview.set
  state = {
    ...state,
    selfReview: msg.state.selfReview ?? null,
    // Auto-open sidebar on first selfReview (D-12 / UI-SPEC § FindingsSidebar):
    findingsSidebarOpen: true,
  };
  emit();
},
```

**AppState additions** (add to `AppState` interface at the top of store.ts, after `ciStatus`):
```typescript
// Phase 4 additions (D-17/D-18):
summary?: PrSummary | null;
selfReview?: SelfReview | null;
findingsSidebarOpen: boolean;
```

**INITIAL additions** (add to `INITIAL` constant):
```typescript
summary: null,
selfReview: null,
findingsSidebarOpen: false,
```

**`onUpdate` must also propagate the new fields** (extend the existing `onUpdate` handler):
```typescript
summary: s.summary ?? null,
selfReview: s.selfReview ?? null,
// Don't auto-open sidebar on generic updates — only onSelfReviewSet does that
```

**`onSnapshot` must also propagate** (extend `onSnapshot` handler similarly).

**Dispatch routing** — the existing SSE subscription in `web/src/main.tsx` or wherever `actions.onUpdate` is called must route `summary.set` and `selfReview.set` update events to the new action handlers. The `UpdateMessage.event.type` discriminant is the routing key:
```typescript
// In the SSE update handler (web/src/main.tsx or api.ts):
if (msg.type === 'update') {
  if (msg.event.type === 'selfReview.set') {
    actions.onSelfReviewSet(msg);
  } else if (msg.event.type === 'summary.set') {
    actions.onSummarySet(msg);
  } else {
    actions.onUpdate(msg);
  }
}
```

---

### `web/src/components/FindingsSidebar.tsx` (component, new)

**Analog:** `web/src/components/FileExplorer.tsx` — same role (left/right panel, list with active-item state, click → scroll), same component anatomy (typed props, internal helper functions, single export).

**Imports pattern** (lines 1–3 of FileExplorer analog):
```typescript
import type { SelfReview, ResolvedFinding, ChecklistCategory } from '@shared/types';
import { Ic } from './icons';
```

**Props interface pattern** (lines 9–14 of FileExplorer analog):
```typescript
interface FindingsSidebarProps {
  selfReview: SelfReview | null | undefined;
  open: boolean;
  onClose: () => void;
  activeCategory: ChecklistCategory | null;
  onCategoryClick: (cat: ChecklistCategory | null) => void;
  onFindingClick: (lineId: string) => void;
}
```

**cn() helper** — copy verbatim from FileExplorer (lines 5–7):
```typescript
function cn(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}
```

**Panel guard pattern** (mirrors `StaleDiffModal`'s `if (!state.staleDiff) return null`):
```typescript
export function FindingsSidebar({ selfReview, open, ... }: FindingsSidebarProps) {
  if (!open) return null;
  // ... render
}
```

**Active-item state** — local `useState` for which finding's rationale is expanded, mirroring FileExplorer's implicit active state via `active={activeFileId === f.id}`:
```typescript
const [expandedRationale, setExpandedRationale] = useState<string | null>(null);
```

**Category section collapse state** — local `useState<Set<ChecklistCategory>>` for which sections are expanded (those with findings default expanded, empty sections default collapsed):
```typescript
const [collapsedSections, setCollapsedSections] = useState<Set<ChecklistCategory>>(
  () => new Set(/* categories with 0 findings */)
);
```

**Finding click → scrollIntoView** (reusing Phase 3 `DiffViewer` anchor rail):
```typescript
// In FileExplorer analog, line 134–137:
onClick={() => {
  onPick(file.id);
  document.getElementById(`diff-${file.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}}

// FindingsSidebar equivalent:
onClick={() => {
  onFindingClick(finding.lineId);
  document.getElementById(finding.lineId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}}
```

**Severity pill color pattern** (mirrors `FileExplorer`'s `dotColor` logic at lines 117–123):
```typescript
const SEVERITY_PALETTE: Record<string, { bg: string; fg: string }> = {
  blocker: { bg: 'var(--block-bg)', fg: 'var(--block)' },
  major:   { bg: 'var(--warn-bg)', fg: 'var(--warn)' },
  minor:   { bg: 'var(--paper-2)', fg: 'var(--ink-2)' },
  nit:     { bg: 'var(--paper-2)', fg: 'var(--ink-4)' },
};
```

**Empty state pattern** (mirrors the self-guarding `if (!state.staleDiff) return null` in `StaleDiffModal`):
```typescript
if (!selfReview) {
  return (
    <div className="findings-sidebar" role="complementary" aria-label="Code review findings">
      <div className="findings-empty">
        <p className="findings-empty-heading">Self-review not run yet</p>
        <p className="findings-empty-body">Ask Claude to run <code>run_self_review</code> to see findings here.</p>
      </div>
    </div>
  );
}
```

---

### `web/src/App.tsx` (app root, modify)

**Analog:** The file itself — copy the pattern of how `StaleDiffModal` and `FileExplorer` are imported and mounted.

**Existing mount pattern** (lines 268–295):
```tsx
<div className="app">
  {state.pr && <TopBar pr={state.pr} ... />}
  <main className="main">
    {diff && (
      <>
        <FileExplorer ... />
        <DiffViewer ... />
      </>
    )}
  </main>
  <StaleDiffModal />
</div>
```

**Phase 4 mount pattern** (what changes):
```tsx
import { StageStepper } from './components/TopBar';   // already exported from TopBar.tsx
import { FindingsSidebar } from './components/FindingsSidebar';

// New state:
const [findingsSidebarOpen, setFindingsSidebarOpen] = useState(false);
const [activeCategory, setActiveCategory] = useState<ChecklistCategory | null>(null);
const [summaryDrawerOpen, setSummaryDrawerOpen] = useState(false);

// In render:
<div className="app">   {/* grid-template-rows: 44px 52px 1fr */}
  {state.pr && <TopBar pr={state.pr} findingsSidebarOpen={findingsSidebarOpen} onToggleFindingsSidebar={...} ... />}
  <StageStepper
    stages={[...]}   // derived from state.summary / state.selfReview
    active={activeStep}
    onPick={handleStepClick}
  />
  <main className="main">   {/* grid-template-columns: 280px 1fr [280px] */}
    {diff && (
      <>
        <FileExplorer ... />
        <DiffViewer ... />
        <FindingsSidebar
          selfReview={state.selfReview}
          open={findingsSidebarOpen}
          onClose={() => setFindingsSidebarOpen(false)}
          activeCategory={activeCategory}
          onCategoryClick={setActiveCategory}
          onFindingClick={handleFindingClick}
        />
      </>
    )}
  </main>
  <StaleDiffModal />
</div>
```

The `.app` grid needs `grid-template-rows: 44px 52px 1fr` (currently `44px 1fr` at `index.css` line 91). The `.main` grid needs to conditionally add the 280px third column.

---

## Shared Patterns

### MCP Tool Registration
**Source:** `server/src/mcp/server.ts` lines 1–14
**Apply to:** All four new tool files
```typescript
// In server.ts: import + call for each new tool
import { registerListFiles } from './tools/list-files.js';
import { registerGetHunk } from './tools/get-hunk.js';
import { registerSetPrSummary } from './tools/set-pr-summary.js';
import { registerRunSelfReview } from './tools/run-self-review.js';

// In startMcp():
registerListFiles(mcp, manager);
registerGetHunk(mcp, manager);
registerSetPrSummary(mcp, manager);
registerRunSelfReview(mcp, manager);
```

### Error Handling in MCP Tools
**Source:** `server/src/mcp/tools/start-review.ts` lines 35–38
**Apply to:** All four new tool files
```typescript
} catch (err) {
  logger.error('tool_name failed', err);
  return { content: [{ type: 'text' as const, text: renderFriendlyError(err) }], isError: true };
}

function renderFriendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `Failed: ${msg}`;
}
```

### Stderr-Only Logging (MCP constraint)
**Source:** `server/src/logger.ts` lines 1–12; `start-review.ts` line 36
**Apply to:** All server-side files
```typescript
import { logger } from '../../logger.js';
// Use: logger.error(...), logger.info(...), logger.warn(...)
// NEVER: console.log(...) — corrupts stdio JSON-RPC channel
```

### Reducer Immutability
**Source:** `server/src/session/reducer.ts` lines 11–54
**Apply to:** New case branches in reducer.ts
```typescript
// Always spread-return a new object; never mutate `s`
case 'summary.set':
  return { ...s, summary: e.summary };
// lastEventId is NEVER touched by the reducer (line 9 invariant)
```

### Store emit() Pattern
**Source:** `web/src/store.ts` lines 62–65, 78–149
**Apply to:** New action handlers in store.ts
```typescript
function emit() {
  listeners.forEach((l) => l());
}
// Every action handler ends with emit() after mutating `state`
```

### CSS Token Usage (no new tokens)
**Source:** `web/src/index.css` lines 10–50; `04-UI-SPEC.md` Token Additions section
**Apply to:** `FindingsSidebar.tsx`, `App.tsx` (inline styles + CSS classes)
```typescript
// Severity pills — use var() inline styles, same as FileExplorer dots:
style={{ background: 'var(--block-bg)', color: 'var(--block)' }}

// Active state — matches FileExplorer .exp-file.active pattern:
className={cn('finding-row', isActive && 'active')}
// CSS: .finding-row.active { background: var(--claude-2); border-left: 2px solid var(--claude); }

// No new CSS variables — all tokens already in index.css
```

### Zod inputSchema Convention
**Source:** `server/src/mcp/tools/start-review.ts` lines 9–16
**Apply to:** All four new tool inputSchemas
```typescript
const Input = z.object({ /* fields */ });
// Registration uses Input.shape (NOT Input directly):
mcp.registerTool('tool_name', { inputSchema: Input.shape }, handler);
// Zod v4 note: avoid z.discriminatedUnion with duplicate discriminators (see start-review.ts line 7 comment)
```

### Component Test File Pattern
**Source:** `server/src/mcp/tools/__tests__/start-review.test.ts` lines 1–11; `server/src/session/__tests__/reducer.test.ts` lines 1–6
**Apply to:** Test files for new tools and new reducer branches
```typescript
import { describe, it, expect } from 'vitest';
// Server-side tests import from '.js' extension (ESM, Node16 module resolution):
import { registerRunSelfReview } from '../run-self-review.js';
// Fixture builder pattern (reducer.test.ts lines 5–26):
function fixture(): ReviewSession { return { prKey: 'gh:o/r#1', ..., lastEventId: 0 }; }
```

---

## No Analog Found

All files have analogs. No entries in this table.

---

## Metadata

**Analog search scope:** `server/src/mcp/`, `server/src/session/`, `server/src/`, `web/src/components/`, `web/src/`, `shared/`
**Files scanned:** 90+ TypeScript/TSX files
**Pattern extraction date:** 2026-04-20
