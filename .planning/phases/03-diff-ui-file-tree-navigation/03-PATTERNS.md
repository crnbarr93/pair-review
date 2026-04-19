# Phase 3: Diff UI + File Tree + Navigation — Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 17 new/modified files
**Analogs found:** 14 / 17 (3 patterns are NEW — no existing analog)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `shared/types.ts` | model | CRUD | itself | self-extension |
| `server/src/ingest/generated-file-detection.ts` | utility | transform | `server/src/ingest/parse.ts` | role-match |
| `server/src/ingest/parse.ts` | transform | transform | itself | self-extension |
| `server/src/ingest/github.ts` | service | request-response | itself | self-extension |
| `server/src/highlight/shiki.ts` | service | transform | itself | self-extension |
| `server/src/session/reducer.ts` | service | event-driven | itself | self-extension |
| `server/src/session/manager.ts` | service | event-driven | itself | self-extension |
| `web/src/App.tsx` | component | event-driven | itself | self-extension |
| `web/src/components/DiffViewer.tsx` | component | request-response | itself | self-extension |
| `web/src/components/FileExplorer.tsx` | component | request-response | itself | self-extension |
| `web/src/components/TopBar.tsx` | component | request-response | itself | self-extension |
| `web/src/store.ts` | store | event-driven | itself | self-extension |
| `web/src/api.ts` | utility | request-response | itself | self-extension |
| `web/src/main.tsx` | utility | request-response | itself | self-extension |
| `web/src/__tests__/fixtures/` | test data | — | `server/src/ingest/parse.ts` output shape | data-shape match |
| `web/src/__tests__/DiffViewer.test.tsx` | test | — | `web/src/components/__tests__/StaleDiffModal.test.tsx` | role-match |
| `scripts/generate-fixture.ts` | utility | batch | `server/src/session/manager.ts` startReview pipeline | role-match |

Phase 3 is a live-wiring exercise. All five prototype components exist — the primary task is: remove fixture imports, add typed props from `shared/types`, and wire to `store.ts`. The "closest analog" for each component is therefore itself, with the key old-shape-to-new-shape mappings extracted below.

---

## Pattern Assignments

---

### `shared/types.ts` — type extensions

**Analog:** `shared/types.ts` itself (lines 1–130)

**Rule:** All types are plain JSON-serializable interfaces and type aliases. No classes, no functions, no runtime code. Phase 3 adds to existing unions without changing existing field names.

**DiffFile extension** — add `generated: boolean` (after `binary`, line 43):
```typescript
export interface DiffFile {
  id: string;
  path: string;
  oldPath?: string;
  status: FileStatus;
  binary: boolean;
  hunks: Hunk[];
  generated: boolean;   // NEW: true if path matches GENERATED_PATTERNS allowlist
}
```

**SessionEvent union extension** — append 4 new variants after `session.viewBoth` (line 101):
```typescript
export type SessionEvent =
  | { type: 'session.adoptNewDiff'; newDiff: DiffModel; newHeadSha: string; newShikiTokens: Record<string, ShikiFileTokens> }
  | { type: 'session.reset' }
  | { type: 'session.viewBoth' }
  // Phase 3 additions:
  | { type: 'file.reviewStatusSet'; fileId: string; status: 'untouched' | 'in-progress' | 'reviewed' }
  | { type: 'file.generatedExpandToggled'; fileId: string; expanded: boolean }
  | { type: 'existingComments.loaded'; comments: ReadOnlyComment[] }
  | { type: 'ciChecks.loaded'; ciStatus: CIStatus };
```

**ReviewSession extension** — add 4 optional fields after `lastEventId` (line 88):
```typescript
export interface ReviewSession {
  // ... all existing fields unchanged ...
  lastEventId: number;
  // Phase 3 additions:
  fileReviewStatus?: Record<string, 'untouched' | 'in-progress' | 'reviewed'>;
  expandedGeneratedFiles?: Record<string, boolean>;
  existingComments?: ReadOnlyComment[];
  ciStatus?: CIStatus;
}
```

**New types to append** after line 130 (after `AppState`):
```typescript
export type FileReviewStatus = 'untouched' | 'in-progress' | 'reviewed';

export interface ReadOnlyComment {
  id: number;
  lineId: string | null;  // null = orphan (hidden in Phase 3); server-resolved
  path: string;
  line: number | null;
  side: 'LEFT' | 'RIGHT' | 'BOTH';
  author: string;
  createdAt: string;       // ISO timestamp
  body: string;            // render via React text nodes — NEVER innerHTML
  htmlUrl: string;         // "View on GitHub" link
  threadId?: number;       // in_reply_to_id — for visual grouping
}

export interface CheckRun {
  name: string;
  bucket: 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel';
  link: string;   // gh CLI field name is 'link', not 'detailsUrl'
}

export interface CIStatus {
  aggregate: 'pass' | 'fail' | 'pending' | 'none';
  checks: CheckRun[];
}
```

---

### `server/src/ingest/generated-file-detection.ts` — NEW file

**Analog:** `server/src/ingest/parse.ts` (pure transform function pattern, same module)

**Imports pattern** (copy parse.ts module style — no external runtime deps):
```typescript
// No imports needed — pure string matching only
```

**Core pattern** (new, modeled on parse.ts pure-function discipline):
```typescript
// Source: CONTEXT D-13 allowlist + RESEARCH.md Q3
// Pure function — no I/O, no async, no side effects.
const GENERATED_PATTERNS: Array<RegExp | string> = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'poetry.lock',
  'Gemfile.lock',
  'composer.lock',
  'Package.resolved',
  /\.min\.[^.]+$/,
  /\.map$/,
  /^dist\//,
  /^build\//,
  /^node_modules\//,
  /^vendor\//,
  /^\.next\//,
  /^\.nuxt\//,
  /^coverage\//,
  /^__generated__\//,
  /\.pb\.go$/,
];

export function isGeneratedFile(filePath: string): boolean {
  return GENERATED_PATTERNS.some(p =>
    typeof p === 'string'
      ? filePath === p || filePath.endsWith('/' + p)
      : p.test(filePath)
  );
}
```

---

### `server/src/ingest/parse.ts` — inject `generated` flag

**Analog:** itself

**The only change:** Add one import at top and one field in the `DiffFile` literal returned in the `shaped` array map (lines 95–103):

```typescript
// ADD at top:
import { isGeneratedFile } from './generated-file-detection.js';

// EXISTING return block (lines 95-103) — add `generated` field:
return {
  id: fileId,
  path,
  oldPath: f.from && f.to && f.from !== f.to ? f.from : undefined,
  status,
  binary,
  hunks,
  generated: isGeneratedFile(path),   // ADD THIS LINE
};
```

No other changes. The existing `toDiffModel` structure, `lineFromChange` function, ID generation (`${fileId}:h${hi}:l${li}`), and `parse-diff` integration are all correct and unchanged.

---

### `server/src/ingest/github.ts` — add `fetchExistingComments` and `fetchCIChecks`

**Analog:** itself

**Existing `execa` call pattern** to copy (lines 52–56):
```typescript
const { stdout } = await execa('gh', [
  'api',
  `repos/${owner}/${repo}/pulls/${prNumber}`,
  '--jq', '.base.sha',
]);
```

**Existing error handling** to reuse (lines 84–99) — `mapGhError` is already defined; new functions call it:
```typescript
function mapGhError(err: unknown): Error {
  if (err instanceof Error) {
    const raw = err as Error & { stderr?: unknown };
    const stderr = typeof raw.stderr === 'string' ? raw.stderr : '';
    if (stderr.includes('gh auth login') || stderr.includes('authentication')) {
      return new Error("gh CLI is not authenticated. Run 'gh auth login' and try again.");
    }
    if (stderr.includes('no default repository')) {
      return new Error("Couldn't infer repo from current directory.");
    }
    return new Error(`gh CLI failed: ${err.message}`);
  }
  return new Error('gh CLI failed');
}
```

**New function 1 — `fetchExistingComments`** (add after `fetchCurrentHeadSha`):
```typescript
// Source: CONTEXT D-20 + RESEARCH.md Q5
// Uses --paginate per Pitfall 22
interface GhInlineComment {
  id: number;
  path: string;
  line: number | null;
  original_line: number;
  side: 'LEFT' | 'RIGHT';
  user: { login: string };
  body: string;
  created_at: string;
  html_url: string;
  in_reply_to_id: number | null;
}

export async function fetchExistingComments(
  owner: string,
  repo: string,
  prNumber: number,
  diffModel: DiffModel
): Promise<ReadOnlyComment[]> {
  try {
    const [inlineRaw, reviewsRaw] = await Promise.all([
      execa('gh', ['api', '--paginate', `repos/${owner}/${repo}/pulls/${prNumber}/comments`]),
      execa('gh', ['api', '--paginate', `repos/${owner}/${repo}/pulls/${prNumber}/reviews`]),
    ]);
    const inline = JSON.parse(inlineRaw.stdout) as GhInlineComment[];
    let orphanCount = 0;
    const normalized: ReadOnlyComment[] = inline.map(c => {
      const lineId = resolveCommentAnchor(c, diffModel);
      if (!lineId) orphanCount++;
      return {
        id: c.id,
        lineId,
        path: c.path,
        line: c.line,
        side: c.side,
        author: c.user.login,
        createdAt: c.created_at,
        body: c.body,
        htmlUrl: c.html_url,
        threadId: c.in_reply_to_id ?? undefined,
      };
    });
    if (orphanCount > 0) {
      console.error(`Skipped ${orphanCount} orphan comments`); // stderr only
    }
    return normalized;
  } catch (err) {
    throw mapGhError(err); // reuse existing error mapper
  }
}
```

**Anchor resolution helper** (pure, add alongside `fetchExistingComments`):
```typescript
// Source: RESEARCH.md Q5 anchor resolution pattern
// Pitfall 12: context lines (side=BOTH) are valid targets for existing comments
function resolveCommentAnchor(comment: GhInlineComment, diffModel: DiffModel): string | null {
  const file = diffModel.files.find(f => f.path === comment.path);
  if (!file) return null;
  const targetLine = comment.line ?? comment.original_line;
  const targetSide = comment.side as LineSide;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.fileLine === targetLine && line.side === targetSide) return line.id;
    }
    // context lines are side=BOTH — LEFT comments on context are valid
    for (const line of hunk.lines) {
      if (line.kind === 'context' && line.fileLine === targetLine) return line.id;
    }
  }
  return null; // orphan
}
```

**New function 2 — `fetchCIChecks`** — CRITICAL: field names are `bucket`/`link`, NOT `conclusion`/`detailsUrl`; exit code 8 is not an error:
```typescript
// Source: CONTEXT D-24 (with field-name correction per RESEARCH.md Q6)
// CRITICAL: gh pr checks exits 8 when checks are pending — that is NOT an error.
export async function fetchCIChecks(prNumber: number): Promise<CIStatus> {
  let stdout: string;
  try {
    const result = await execa('gh', [
      'pr', 'checks', String(prNumber),
      '--json', 'name,state,bucket,link',  // 'bucket' not 'conclusion'; 'link' not 'detailsUrl'
    ]);
    stdout = result.stdout;
  } catch (err) {
    const execaErr = err as { stdout?: string; exitCode?: number };
    if (execaErr.exitCode === 8 && execaErr.stdout) {
      stdout = execaErr.stdout; // exit 8 = "checks pending" — parse stdout anyway
    } else {
      throw mapGhError(err);
    }
  }
  interface GhCheckRun { name: string; bucket: string; link: string }
  const checks = JSON.parse(stdout) as GhCheckRun[];
  if (checks.length === 0) return { aggregate: 'none', checks: [] };
  const buckets = new Set(checks.map(c => c.bucket));
  const aggregate =
    buckets.has('fail') ? 'fail' :
    buckets.has('pending') ? 'pending' : 'pass';
  return {
    aggregate,
    checks: checks.map(c => ({
      name: c.name,
      bucket: c.bucket as CheckRun['bucket'],
      link: c.link,
    })),
  };
}
```

---

### `server/src/highlight/shiki.ts` — one-line theme fix

**Analog:** itself

**The only change** — two occurrences of `'github-dark'` become `'github-light'`:

Line 10 (`themes` array):
```typescript
themes: ['github-light'],   // was: ['github-dark']
```

Line 73 (`codeToTokensBase` call):
```typescript
theme: 'github-light',      // was: 'github-dark'
```

Everything else is unchanged. The `ShikiToken` shape (`{ content, color?, fontStyle? }`) is already correct. Switching themes changes the hex color values that flow through `dangerouslySetInnerHTML` from dark (white/grey on `#FBFAF7` = invisible) to light (dark on `#FBFAF7` = readable). `github-light.mjs` is confirmed present in `@shikijs/themes/dist/`.

**`tokenToHtml` helper** — belongs in `web/src/components/DiffViewer.tsx`, not here:
```typescript
// Add this to DiffViewer.tsx — consumes ShikiToken[] from store snapshot
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tokenToHtml(tokens: ShikiToken[]): string {
  return tokens.map(tok => {
    const styles: string[] = [];
    if (tok.color) styles.push(`color:${tok.color}`);
    if (tok.fontStyle) {
      if (tok.fontStyle & 1) styles.push('font-style:italic');
      if (tok.fontStyle & 2) styles.push('font-weight:bold');
    }
    if (!styles.length) return escapeHtml(tok.content);
    return `<span style="${styles.join(';')}">${escapeHtml(tok.content)}</span>`;
  }).join('');
}
```

---

### `server/src/session/reducer.ts` — 4 new event branches

**Analog:** itself

**Existing reducer discipline** (lines 1–34 — invariants are load-bearing):
```typescript
// INVARIANT: pure function — no I/O, no async, no timestamp reads
// INVARIANT: returns NEW session object via spread — never mutates input
// INVARIANT: does NOT touch lastEventId (manager.ts applyEvent owns the counter)
// INVARIANT: exhaustiveness guard (default: _never: never) MUST stay at bottom
export function applyEvent(s: ReviewSession, e: SessionEvent): ReviewSession {
  switch (e.type) {
    case 'session.adoptNewDiff':
      return { ...s, diff: e.newDiff, headSha: e.newHeadSha, ... };
    case 'session.reset':
      return { ...s, pendingReset: true };
    case 'session.viewBoth':
      return { ...s, viewBothMode: true, staleDiff: undefined };
    default: {
      const _never: never = e;  // exhaustiveness guard — keep this
      throw new Error(`Unknown event type: ${JSON.stringify(_never)}`);
    }
  }
}
```

**4 new branches** — insert before `default`, copy the spread-and-override pattern:
```typescript
case 'file.reviewStatusSet':
  return {
    ...s,
    fileReviewStatus: {
      ...(s.fileReviewStatus ?? {}),
      [e.fileId]: e.status,
    },
  };

case 'file.generatedExpandToggled':
  return {
    ...s,
    expandedGeneratedFiles: {
      ...(s.expandedGeneratedFiles ?? {}),
      [e.fileId]: e.expanded,
    },
  };

case 'existingComments.loaded':
  return { ...s, existingComments: e.comments };

case 'ciChecks.loaded':
  return { ...s, ciStatus: e.ciStatus };
```

---

### `server/src/session/manager.ts` — extend `startReview`

**Analog:** itself

**Existing ingest pipeline** (lines 125–207) — the extension point is after `writeState(prKey, session)` (~line 197), before browser launch (~line 202):
```typescript
// Pattern: fire applyEvent for each new event type, exactly as session-resume.ts does
// (see server/src/http/routes/session-resume.ts lines 80-85)
await manager.applyEvent(prKey, {
  type: 'session.adoptNewDiff',
  newDiff, newHeadSha, newShikiTokens,
});
```

**Phase 3 extension** — add after `writeState` and before browser launch in the GitHub path:
```typescript
// GitHub-only: fetch existing comments and CI checks (D-20, D-24)
if (source.kind === 'github' && pr.owner && pr.repo && pr.number) {
  try {
    const comments = await fetchExistingComments(pr.owner, pr.repo, pr.number, diff);
    await this.applyEvent(prKey, { type: 'existingComments.loaded', comments });
  } catch (err) {
    logger.warn('Failed to load existing comments:', err); // stderr only (D-22)
  }
  try {
    const ciStatus = await fetchCIChecks(pr.number);
    await this.applyEvent(prKey, { type: 'ciChecks.loaded', ciStatus });
  } catch (err) {
    logger.warn('Failed to load CI checks:', err); // CI pill renders 'none' (D-24/D-26)
  }
}
```

The `applyEvent` method (lines 226–241) is unchanged. The pipeline (serialize queue → reduce → persist disk → update memory → broadcast bus) is identical for all event types.

---

### `web/src/App.tsx` — 2-column layout + keydown + IntersectionObserver

**Analog:** itself + `web/src/components/__tests__/StaleDiffModal.test.tsx` (for store consumption pattern)

**REMOVE these imports and state** (lines 1–26):
```typescript
// DELETE all imports from './data'
// DELETE: TweaksPanel, StageStepper imports
// DELETE state: tweaks, tweaksOpen, openThreadId, sideThreadId, gutterPop, activeStage
```

**ADD these imports:**
```typescript
import { useAppStore } from './store';
import { postSessionEvent } from './api';   // new helper added in api.ts
import type { DiffModel } from '@shared/types';
```

**CSS grid target** (supersedes current 3-column, per D-02):
```css
/* .app  was: grid-template-rows: 44px 52px 1fr */
.app { grid-template-rows: 44px 1fr }

/* .main was: grid-template-columns: 280px 1fr 380px */
.main { grid-template-columns: 280px 1fr }
```

**Store consumption pattern** (copy from `StaleDiffModal.tsx` line 23):
```typescript
const state = useAppStore();
// state.diff, state.shikiTokens, state.fileReviewStatus, state.existingComments, state.ciStatus
```

**Global keydown listener** — NEW pattern (no existing analog in codebase):
```typescript
// Source: CONTEXT D-17 + RESEARCH.md Q4
// Must be inside App() component body
const focusedHunkIndex = useRef<number>(-1);
const [focusedHunkId, setFocusedHunkId] = useState<string | null>(null);
const [focusedFileId, setFocusedFileId] = useState<string | null>(null);

useEffect(() => {
  function onKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'n': advanceHunk(+1); break;
      case 'p': advanceHunk(-1); break;
      case 'r': markCurrentFileReviewed(); break;
      case 'c': showToast('Comments available in Phase 5'); break;
      case 'v': showToast('Verdict picker available in Phase 6'); break;
      case 's': showToast('Submit available in Phase 6'); break;
    }
  }
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}, [advanceHunk, markCurrentFileReviewed, showToast]);
```

**`advanceHunk` pattern** — cross-file virtual list navigation (RESEARCH.md Q4):
```typescript
function advanceHunk(delta: number) {
  const allHunks = (state.diff?.files ?? [])
    .filter(f => !f.generated)
    .flatMap(f => f.hunks.map(h => ({ fileId: f.id, hunkId: h.id })));
  if (allHunks.length === 0) return;

  const current = focusedHunkIndex.current;
  const wrapping = delta > 0
    ? current === allHunks.length - 1
    : current === 0 || current === -1;

  const next = current === -1
    ? 0
    : (current + delta + allHunks.length) % allHunks.length;
  focusedHunkIndex.current = next;

  const { hunkId, fileId } = allHunks[next];
  setFocusedHunkId(hunkId);
  setFocusedFileId(fileId);
  document.getElementById(hunkId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (wrapping) showToast(delta > 0 ? 'Wrapped to first hunk' : 'Wrapped to last hunk');
}
```

**Toast pattern** — NEW (no existing analog):
```typescript
const [toast, setToast] = useState<string | null>(null);
function showToast(msg: string) {
  setToast(msg);
  setTimeout(() => setToast(null), 2500);
}
// JSX: <div className="toast" role="status" aria-live="polite">{toast}</div>
```

**IntersectionObserver for auto-in-progress** — NEW (no existing analog, attach per file section):
```typescript
// Source: CONTEXT D-11 + UI-SPEC Fixture Requirements (50% / 500ms)
// Attach after DiffViewer mounts; one observer per DiffFile section
useEffect(() => {
  if (!state.diff) return;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const fileId = (entry.target as HTMLElement).dataset.fileId;
        if (!fileId) continue;
        if (entry.isIntersecting) {
          timers.set(fileId, setTimeout(() => {
            const current = state.fileReviewStatus?.[fileId] ?? 'untouched';
            if (current === 'untouched') {
              postSessionEvent(state.sessionKey, {
                type: 'file.reviewStatusSet',
                fileId,
                status: 'in-progress',
              }).catch(() => {}); // silent — next reload will re-derive
            }
          }, 500));
        } else {
          const t = timers.get(fileId);
          if (t) { clearTimeout(t); timers.delete(fileId); }
        }
      }
    },
    { threshold: 0.5 }
  );
  state.diff.files.forEach(f => {
    const el = document.getElementById(`diff-${f.id}`);
    if (el) observer.observe(el);
  });
  return () => { observer.disconnect(); timers.forEach(clearTimeout); };
}, [state.diff, state.fileReviewStatus, state.sessionKey]);
```

---

### `web/src/components/DiffViewer.tsx` — live data + multi-file + Shiki tokens

**Analog:** itself

**REMOVE these imports** (lines 1–6):
```typescript
// DELETE:
import { THREADS, type DiffHunk, type DiffModelFixture, type DiffRow } from '../data';
import { cn, highlight } from '../utils/highlight';
```

**ADD these imports:**
```typescript
import type { DiffModel, DiffFile, Hunk, DiffLine, ShikiFileTokens, ShikiToken, ReadOnlyComment } from '@shared/types';
import { Ic } from './icons';   // keep
```

**Replace `DiffViewerProps` interface** (lines 11–19):
```typescript
// CURRENT props (lines 11-19):
interface DiffViewerProps {
  diff: DiffModelFixture;
  view: DiffView;
  onViewChange: (v: DiffView) => void;
  openThreadId: string | null;
  onOpenThread: (tid: string) => void;
  onCloseThread: () => void;
  threadLayout: ThreadLayout;
}

// PHASE 3 REPLACEMENT:
interface DiffViewerProps {
  diff: DiffModel;
  shikiTokens: Record<string, ShikiFileTokens>;
  view: DiffView;
  onViewChange: (v: DiffView) => void;
  fileReviewStatus: Record<string, 'untouched' | 'in-progress' | 'reviewed'>;
  expandedGenerated: Set<string>;        // fileIds where generated-collapse is expanded
  focusedHunkId: string | null;
  readOnlyComments: ReadOnlyComment[];   // pre-resolved by server; lineId is the key
  onMarkReviewed: (fileId: string) => void;
  onExpandGenerated: (fileId: string, expanded: boolean) => void;
}
```

**Old `DiffRow` field to new `DiffLine` field mapping** — all rename points in `UnifiedHunk` and `SplitHunk`:

| `DiffRow` (prototype `data.ts`) | `DiffLine` (`shared/types.ts`) | Change required |
|---------------------------------|-------------------------------|-----------------|
| `r.type === 'add'` | `line.kind === 'add'` | rename `type` → `kind` |
| `r.type === 'rem'` | `line.kind === 'del'` | rename `type` → `kind`; `'rem'` → `'del'` |
| `r.type === 'context'` | `line.kind === 'context'` | rename `type` → `kind` |
| `r.oldN ?? ''` | left gutter: `line.kind === 'del' \|\| line.kind === 'context' ? line.fileLine : ''` | — |
| `r.newN ?? ''` | right gutter: `line.kind === 'add' \|\| line.kind === 'context' ? line.fileLine : ''` | — |
| `r.text` | `line.text` | same name |
| `r.threadIds.map(tid => THREADS[tid])` | `readOnlyComments.filter(c => c.lineId === line.id)` | replaces fixture lookup |
| `highlight(r.text)` | `tokenToHtml(shikiTokens[fileId]?.[hunkIdx]?.[lineIdx] ?? [{ content: line.text }])` | replaces regex highlighter |

**UnifiedHunk row pattern** (adapts lines 103–154):
```typescript
// Replace <tr key={i} className={r.type}> with:
<tr key={line.id} className={line.kind}>
  <td className="gutter">
    <span style={{ display: 'inline-block', width: 16, textAlign: 'right', marginRight: 4 }}>
      {line.kind === 'del' || line.kind === 'context' ? line.fileLine : ''}
    </span>
    <span style={{ display: 'inline-block', width: 16, textAlign: 'right' }}>
      {line.kind === 'add' || line.kind === 'context' ? line.fileLine : ''}
    </span>
    {/* Read-only comment markers (Phase 3, D-21) */}
    {readOnlyComments
      .filter(c => c.lineId === line.id)
      .map(c => (
        <span
          key={c.id}
          className="thread-marker"
          style={{ background: 'var(--paper-3)', color: 'var(--ink-3)' }}
          aria-label={`Existing comment from ${c.author}`}
          title="View existing comment"
          onClick={e => { e.stopPropagation(); setOpenCommentId(c.id); }}
        />
      ))
    }
  </td>
  <td
    className="content"
    dangerouslySetInnerHTML={{
      __html: tokenToHtml(
        shikiTokens[fileId]?.[hunkIdx]?.[lineIdx] ?? [{ content: line.text }]
      )
    }}
  />
</tr>
```

**Multi-file outer loop** — wrap the existing single-file render in `diff.files.map()`:
```typescript
// Replace the single <div className="diff"> render with:
<div className="diff-canvas">
  {diff.files.map(file => (
    <div
      key={file.id}
      id={`diff-${file.id}`}              // anchor for FileExplorer scrollIntoView
      data-file-id={file.id}             // used by IntersectionObserver in App.tsx
    >
      {file.generated && !expandedGenerated.has(file.id) ? (
        <GeneratedFileStub file={file} onExpand={onExpandGenerated} />
      ) : (
        <div className="diff">
          <div className="diff-head">
            {/* path, stats, view toggle, Mark reviewed button — existing structure */}
          </div>
          {file.generated && expandedGenerated.has(file.id) && (
            <div className="generated-banner">Generated file — expanded</div>
          )}
          <div className="diff-body">
            {file.hunks.map((hunk, hunkIdx) => (
              <div
                key={hunk.id}
                id={hunk.id}                 // anchor for n/p keyboard scrollIntoView
                className={
                  focusedHunkId === hunk.id
                    ? 'hunk focused'
                    : 'hunk'
                }
              >
                <div className="hunk-head">{hunk.header}</div>
                {view === 'unified'
                  ? <UnifiedHunk hunk={hunk} hunkIdx={hunkIdx} fileId={file.id} ... />
                  : <SplitHunk hunk={hunk} hunkIdx={hunkIdx} fileId={file.id} ... />
                }
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  ))}
</div>
```

**`GeneratedFileStub` component** (new, render when `generated && !expanded`):
```typescript
// Source: CONTEXT D-15 + UI-SPEC DiffViewer copywriting contract
function GeneratedFileStub({
  file,
  onExpand,
}: {
  file: DiffFile;
  onExpand: (fileId: string, expanded: boolean) => void;
}) {
  return (
    <div className="diff">
      <div className="diff-head">
        <div className="path"><span className="sub">{dir}/</span><span>{name}</span></div>
        <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>Excluded</span>
      </div>
      <div className="diff-body" style={{ padding: '12px 16px', color: 'var(--ink-3)' }}>
        This file is auto-collapsed as generated/lockfile content.
        It is excluded from Claude's context.{' '}
        <button type="button" onClick={() => onExpand(file.id, true)}>
          Expand
        </button>
      </div>
    </div>
  );
}
```

**SplitHunk field renames** (lines 163–256 — minimal diff only):
```typescript
// In SplitPair union: DiffRow → DiffLine, remove 'type: empty' placeholder
// In pairing loop:  r.type === 'rem'  →  r.kind === 'del'
//                   r.type === 'add'  →  r.kind === 'add'
// In render:        'oldN' → left-side fileLine
//                   'newN' → right-side fileLine
//                   highlight(text) → tokenToHtml(shikiTokens[fileId][hunkIdx][pairIdx] ?? ...)
```

---

### `web/src/components/FileExplorer.tsx` — live-wired to store

**Analog:** itself

**REMOVE these imports** (lines 1–11):
```typescript
// DELETE:
import { FILE_STATE, PR, REPO_TREE, type RepoFileNode, type RepoFolderNode, type RepoNode } from '../data';
import { cn } from '../utils/highlight';
```

**Replace `ExplorerProps`** (lines 14–21):
```typescript
// CURRENT:
interface ExplorerProps {
  filter: ExplorerFilter;
  setFilter: (f: ExplorerFilter) => void;
  activePath: string;
  onPick: (path: string) => void;
}

// PHASE 3 REPLACEMENT:
import type { DiffFile } from '@shared/types';
type FileReviewStatus = 'untouched' | 'in-progress' | 'reviewed';

interface ExplorerProps {
  files: DiffFile[];
  fileReviewStatus: Record<string, FileReviewStatus>;
  activeFileId: string | null;
  onPickFile: (fileId: string) => void;
}
```

**Summary chip recount** (lines 91–101 — replace hardcoded values):
```typescript
// CURRENT:
<span><span className="dot" style={{ background: 'var(--ok)' }} /> 1 reviewed</span>
<span><span className="dot" style={{ background: 'var(--warn)' }} /> 3 threads</span>
<span><span className="dot" style={{ background: 'var(--ink-4)', opacity: 0.4 }} /> 2 pending</span>

// PHASE 3 REPLACEMENT (computed):
const reviewed = files.filter(f => (fileReviewStatus[f.id] ?? 'untouched') === 'reviewed').length;
const inProgress = files.filter(f => (fileReviewStatus[f.id] ?? 'untouched') === 'in-progress').length;
const untouched = files.filter(f => (fileReviewStatus[f.id] ?? 'untouched') === 'untouched').length;
// Render: N reviewed / N in-progress / N untouched
// Replace 'threads' chip → 'in-progress' chip (--warn color unchanged)
// Replace 'pending'  chip → 'untouched'  chip (--ink-4 at 0.4 opacity unchanged)
```

**FileNode status dot** (lines 200–228 — replace `FILE_STATE[file.path]` lookup):
```typescript
// CURRENT (lines 201-202):
const state = FILE_STATE[file.path];

// PHASE 3 REPLACEMENT — props: file: DiffFile, reviewStatus: FileReviewStatus
const dotColor =
  reviewStatus === 'reviewed'    ? 'var(--ok)'   :
  reviewStatus === 'in-progress' ? 'var(--warn)' :
  'var(--ink-4)';                              // untouched
const dotOpacity = reviewStatus === 'untouched' ? 0.4 : 1;
```

**Click handler** (line 209 — replace `onPick(file.path)` with scroll-to-anchor):
```typescript
// CURRENT:
onClick={() => onPick(file.path)}

// PHASE 3 REPLACEMENT:
onClick={() => {
  onPickFile(file.id);
  document.getElementById(`diff-${file.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}}
```

**Repo tab disabled** (lines 72–78 — per D-10):
```typescript
// CURRENT:
<button type="button" className={cn(filter === 'all' && 'on')} onClick={() => setFilter('all')}>
  Repo
</button>

// PHASE 3 REPLACEMENT:
<button
  type="button"
  disabled
  title="Full repo tree available in Phase 7"
  style={{ opacity: 0.5, cursor: 'not-allowed' }}
>
  Repo
</button>
```

**Generated file row** — add after the `active` class check (line 207):
```typescript
// Add to FileNode className and add 'Excluded' label when file.generated is true:
<div
  className={cn('exp-file', active && 'active', file.generated && 'excluded')}
  style={{ ['--indent' as string]: `${14 + depth * 14}px` }}
  onClick={...}
>
  <span className={cn('file-icon', ext)} />
  <span className="name" style={file.generated ? { color: 'var(--ink-4)' } : undefined}>
    {name}
  </span>
  {file.generated && (
    <span style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 'auto' }}>Excluded</span>
  )}
  {/* stats + status dot */}
</div>
```

---

### `web/src/components/TopBar.tsx` — add CI status pill

**Analog:** itself

**REMOVE fixture imports** (lines 1–3):
```typescript
// DELETE:
import { PR, type Stage } from '../data';
import { cn } from '../utils/highlight';
```

**Replace `TopBar` signature** (line 7 — add props):
```typescript
// CURRENT:
export function TopBar() {

// PHASE 3 REPLACEMENT:
import type { PullRequestMeta, CIStatus } from '@shared/types';

interface TopBarProps {
  pr: PullRequestMeta;
  ciStatus?: CIStatus;
  onSettingsClick: () => void;   // stub: toast "Settings coming in Phase 7"
  onRequestChanges: () => void;  // stub: toast "Verdict picker available in Phase 6"
  onApprove: () => void;         // stub: toast "Submit available in Phase 6"
}
export function TopBar({ pr, ciStatus, onSettingsClick, onRequestChanges, onApprove }: TopBarProps) {
```

**CIPill pattern** — new sub-component inside `TopBar.tsx` (D-25):
```typescript
// Source: CONTEXT D-25 + UI-SPEC CI pill color decisions
function CIPill({ ciStatus }: { ciStatus: CIStatus | undefined }) {
  // Hide entirely in local-branch mode or when aggregate is 'none' (D-26)
  if (!ciStatus || ciStatus.aggregate === 'none') return null;

  const [expanded, setExpanded] = useState(false);
  const palette = {
    pass:    { bg: 'var(--ok-bg)',    fg: 'var(--ok)' },
    fail:    { bg: 'var(--block-bg)', fg: 'var(--block)' },
    pending: { bg: 'var(--warn-bg)', fg: 'var(--warn)' },
    none:    { bg: 'var(--paper-2)', fg: 'var(--ink-4)' },
  };
  const { bg, fg } = palette[ciStatus.aggregate];
  const failCount    = ciStatus.checks.filter(c => c.bucket === 'fail').length;
  const pendingCount = ciStatus.checks.filter(c => c.bucket === 'pending').length;
  const label =
    ciStatus.aggregate === 'pass'    ? 'All checks passed' :
    ciStatus.aggregate === 'fail'    ? `${failCount} check${failCount !== 1 ? 's' : ''} failing` :
    `${pendingCount} check${pendingCount !== 1 ? 's' : ''} pending`;

  return (
    <div
      className="ci-pill"
      style={{ background: bg, color: fg }}
      aria-label={`CI checks: ${ciStatus.aggregate} — ${ciStatus.checks.length} checks`}
    >
      <button type="button" onClick={() => setExpanded(v => !v)}>{label}</button>
      {expanded && (
        <div className="ci-dropdown">
          {ciStatus.checks.map(c => (
            <div key={c.name} className="ci-row">
              {c.name} · {c.bucket}
              <a href={c.link} target="_blank" rel="noreferrer">↗</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

`StageStepper` export (lines 38–70) — keep on disk, no changes. Phase 4 mounts it.

---

### `web/src/store.ts` — 4 new action handlers

**Analog:** itself

**Existing action handler pattern** (lines 98–111 — `onUpdate` is the closest shape to copy):
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
    headShaError: undefined,
  };
  emit();
},
```

**`AppState` interface extension** (lines 18–32 — add 4 fields after `headShaError`):
```typescript
// ADD to AppState:
fileReviewStatus: Record<string, 'untouched' | 'in-progress' | 'reviewed'>;
expandedGeneratedFiles: Record<string, boolean>;
existingComments: ReadOnlyComment[];
ciStatus: CIStatus | undefined;
```

**Update `INITIAL` and both `onSnapshot`/`onUpdate` spread** (lines 34–111) — mirror new fields from ReviewSession into AppState:
```typescript
// In INITIAL (lines 34-40), add:
fileReviewStatus: {},
expandedGeneratedFiles: {},
existingComments: [],
ciStatus: undefined,

// In onSnapshot (lines 72-95) and onUpdate (lines 98-111), add to the state spread:
fileReviewStatus: s.fileReviewStatus ?? {},
expandedGeneratedFiles: s.expandedGeneratedFiles ?? {},
existingComments: s.existingComments ?? [],
ciStatus: s.ciStatus,
```

---

### `web/src/api.ts` — add `postSessionEvent`

**Analog:** itself — specifically the `chooseResume` function (lines 97–118)

**Existing POST pattern with X-Review-Token** (lines 104–117 — copy exactly):
```typescript
const res = await fetch('/api/session/choose-resume', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Review-Token': reviewToken,  // double-submit CSRF — MUST keep on every POST
  },
  body: JSON.stringify(params),
  credentials: 'same-origin',
});
if (!res.ok) throw new Error(`chooseResume failed: HTTP ${res.status}`);
```

**New `postSessionEvent` function** — modeled exactly on `chooseResume`:
```typescript
// ADD after chooseResume
import type { SessionEvent } from '@shared/types';

export async function postSessionEvent(
  prKey: string,
  event: SessionEvent
): Promise<{ ok: true }> {
  if (!reviewToken) throw new Error('postSessionEvent: review token not set — call setReviewToken first');
  const res = await fetch('/api/session/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Review-Token': reviewToken,  // same double-submit CSRF pattern
    },
    body: JSON.stringify({ prKey, event }),
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`postSessionEvent failed: HTTP ${res.status}`);
  return { ok: true };
}
```

NOTE: A new HTTP route `POST /api/session/events` must also be created at `server/src/http/routes/session-events.ts`. Pattern it after `session-resume.ts` lines 32–102: zod validate `{ prKey, event }` → `manager.get(prKey)` null-check → `manager.applyEvent(prKey, event)` → `c.json({ ok: true })`.

---

### `web/src/main.tsx` — remove one import

**Analog:** itself

**The only change** (line 3 — delete):
```typescript
// DELETE line 3:
import '@git-diff-view/react/styles/diff-view-pure.css';
```

No other changes. Bootstrap, token handling, SSE subscription, and React root mounting are unchanged.

---

### `web/src/__tests__/DiffViewer.test.tsx` — render test + fixture validation

**Analog:** `web/src/components/__tests__/StaleDiffModal.test.tsx`

**Test file structure pattern** (from `StaleDiffModal.test.tsx` — copy setup style):
```typescript
// Pattern: vi.mock for store + api, makeState helper, dynamic import, describe block
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
// ...
afterEach(() => { cleanup(); });
```

**D-09 render test** (RESEARCH.md Q1 pattern):
```typescript
import { performance } from 'node:perf_hooks';
import diffModelFixture from './fixtures/diff-model.fixture.json';
import shikiTokensFixture from './fixtures/shiki-tokens.fixture.json';
import type { DiffModel, ShikiFileTokens } from '@shared/types';

it('renders fixture within 500ms first paint', () => {
  const start = performance.now();
  const { container } = render(
    <DiffViewer
      diff={diffModelFixture as unknown as DiffModel}
      shikiTokens={shikiTokensFixture as unknown as Record<string, ShikiFileTokens>}
      view="unified"
      onViewChange={() => {}}
      fileReviewStatus={{}}
      expandedGenerated={new Set()}
      focusedHunkId={null}
      readOnlyComments={[]}
      onMarkReviewed={() => {}}
      onExpandGenerated={() => {}}
    />
  );
  const elapsed = performance.now() - start;
  expect(container.querySelector('.hunk')).toBeTruthy();
  expect(elapsed).toBeLessThan(600); // 500ms target + 20% advisory tolerance
});

it('generated file fixture has at least one file with generated: true', () => {
  const dm = diffModelFixture as unknown as DiffModel;
  expect(dm.files.some(f => f.generated)).toBe(true);
});
```

---

### `scripts/generate-fixture.ts` — one-off fixture capture

**Analog:** `server/src/session/manager.ts` `startReview` pipeline (lines 125–191)

**Pattern to copy** (manager.ts lines 127–178 — same three-step pipeline):
```typescript
// Step 1: ingest (lines 127-128)
const { meta, diffText: dt } = await ingestGithub(id);

// Step 2: parse (line 149)
const diff: DiffModel = toDiffModel(diffText);

// Step 3: highlight (lines 172-178)
const shikiTokens: Record<string, ShikiFileTokens> = {};
for (const file of diff.files) {
  if (file.binary) continue;
  shikiTokens[file.id] = await highlightHunks(file.path, pr.headSha || 'HEAD', file.hunks);
}
```

Write output to `web/src/__tests__/fixtures/diff-model.fixture.json` and `web/src/__tests__/fixtures/shiki-tokens.fixture.json`.

---

## Shared Patterns

### Authentication / CSRF (X-Review-Token double-submit)
**Source:** `web/src/api.ts` lines 104–107
**Apply to:** All new `fetch` POST calls — specifically `postSessionEvent`
```typescript
headers: {
  'Content-Type': 'application/json',
  'X-Review-Token': reviewToken,  // required on every mutating POST
},
credentials: 'same-origin',
```

### Server-side logging — stderr only, never `console.log`
**Source:** `server/src/session/manager.ts` lines 194–196 + established AP2 anti-pattern
**Apply to:** All new server code in `github.ts`, `manager.ts`, reducer additions
```typescript
import { logger } from '../logger.js';
logger.warn('Failed to load CI checks:', err);
// NEVER console.log() — corrupts the JSON-RPC stdio channel
```

### Reducer pure-function invariants
**Source:** `server/src/session/reducer.ts` lines 1–9 (doc comment block)
**Apply to:** All 4 new `SessionEvent` case branches
- Return new object via spread — never mutate input
- Never touch `lastEventId` (manager owns it)
- No async, no I/O, no `Date.now()`

### Event pipeline ordering
**Source:** `server/src/session/manager.ts` `applyEvent` lines 226–241
**Apply to:** All `applyEvent` call sites in `manager.ts` and new `session-events.ts` route
```typescript
// Order is non-negotiable:
// 1. writeState (disk) → 2. sessions.set (memory) → 3. bus.emit (broadcast)
```

### Opaque IDs in anchor and DOM
**Source:** `server/src/ingest/parse.ts` lines 69 and 88–89
**Apply to:** Anchor resolution in `fetchExistingComments`; `id=` attributes in DiffViewer
```typescript
// DiffFile.id  = sha1(path).slice(0,12)
// Hunk.id      = `${fileId}:h${hunkIdx}`
// DiffLine.id  = `${fileId}:h${hunkIdx}:l${lineIdx}`
// DOM anchor   = id={`diff-${file.id}`}      ← FileExplorer scrollIntoView target
// DOM anchor   = id={hunk.id}               ← n/p keyboard nav scrollIntoView target
```

### `dangerouslySetInnerHTML` safety invariant
**Source:** `web/src/components/DiffViewer.tsx` line 138 + CONTEXT code_context
**Apply to:** All `dangerouslySetInnerHTML` usage in refactored DiffViewer
```typescript
// ONLY server-produced Shiki tokens flow into innerHTML.
// NEVER: user text, GitHub comment bodies, PR description, author names.
// Comment popovers render body via React text nodes — no innerHTML.
```

### `gh pr checks` exit code 8
**Source:** RESEARCH.md Q6 Pitfall B — NEW pattern, no existing analog
**Apply to:** `fetchCIChecks` in `server/src/ingest/github.ts`
```typescript
} catch (err) {
  const execaErr = err as { stdout?: string; exitCode?: number };
  if (execaErr.exitCode === 8 && execaErr.stdout) {
    stdout = execaErr.stdout; // 8 = "checks pending" — not an error
  } else {
    throw mapGhError(err);
  }
}
```

---

## No Analog Found

| File / Pattern | Role | Data Flow | Reason |
|----------------|------|-----------|--------|
| Global `keydown` listener (`App.tsx`) | event handler | event-driven | No keyboard shortcut system exists anywhere in the project |
| Toast system (`App.tsx`) | component | — | No notification/toast UI exists yet |
| `IntersectionObserver` for auto-in-progress (`App.tsx`) | hook | event-driven | No IntersectionObserver usage exists in the project |
| `POST /api/session/events` HTTP route (`server/src/http/routes/session-events.ts`) | route | request-response | Route does not exist yet; pattern after `session-resume.ts` lines 32–102 |

---

## Deletions

Files to be deleted as part of Phase 3. Pattern from RESEARCH.md Pitfall D: delete `data.ts` last.

| File | Why Deleted | Decision |
|------|-------------|----------|
| `web/src/components/TweaksPanel.tsx` | Dev-ergonomics surface eliminated | D-03 |
| `web/src/components/DiffView.spike.tsx` | `@git-diff-view/react` spike superseded | D-05 |
| `web/src/__tests__/diff-view-spike.test.tsx` | Spike test superseded | D-05 |
| `web/src/utils/highlight.ts` | Regex highlighter replaced by Shiki tokens | D-06 |
| `web/src/data.ts` | All fixture data replaced by live store — **delete last** | Pitfall D |

`data.ts` must be deleted as the final task of the final wave, after all imports from `App.tsx`, `DiffViewer.tsx`, `FileExplorer.tsx`, `TopBar.tsx` have been removed and tests verify green against live data.

---

## Metadata

**Analog search scope:** `web/src/`, `server/src/`, `shared/`
**Files read directly:** 18 source files
**Pattern extraction date:** 2026-04-19
