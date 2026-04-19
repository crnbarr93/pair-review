# Phase 3: Diff UI + File Tree + Navigation — Research

**Researched:** 2026-04-19
**Domain:** React SPA diff renderer live-wiring, IntersectionObserver-driven state, `gh api` ingest extension, keyboard shortcut patterns
**Confidence:** HIGH (all findings verified against codebase; confirmed via `gh --help` and direct code inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01** — Commit `c7fe93f`'s prototype (paper/teal, 3-column layout) is the authoritative design direction. Phase-1 `01-UI-SPEC.md` is formally superseded. PROJECT.md Key Decisions must record the supersession at Phase-3 commit.

**D-02** — 2-column layout: TopBar + (FileExplorer | DiffViewer). StageStepper, ChatPanel, InlineThread stay on disk, not mounted.

**D-03** — TweaksPanel deleted. `threadLayout`/`progressViz` locked as constants.

**D-04** — `:root` token set in `web/src/index.css` is authoritative. No dark-mode palette. No `@theme` block.

**D-05** — Open Decision 1 resolves to the **bespoke `DiffViewer.tsx`**. Remove `@git-diff-view/react` from `web/package.json`. Delete `DiffView.spike.tsx`, `diff-view-spike.test.tsx`, remove `@git-diff-view/react/styles/diff-view-pure.css` import from `main.tsx`.

**D-06** — DiffViewer consumes server-side Shiki tokens (`state.shikiTokens[fileId][hunkIdx][lineIdx]`). Delete `web/src/utils/highlight.ts`.

**D-07** — Multi-file: all files in one long vertical scroll with per-file section headers. FileExplorer clicks scroll to anchored section via `scrollIntoView`. `n`/`p` navigate hunks across file boundaries.

**D-08** — Word-level intra-line diff highlighting deferred to Phase 7. No stub DOM pre-reserved.

**D-09** — Open Decision 1 validated by a committed synthetic fixture at `web/src/__tests__/fixtures/`. Vitest render test asserts unified + split modes, hunk anchors, first paint ≤500ms on 50-hunk PR.

**D-10** — FileExplorer "Repo" tab kept in UI, rendered disabled (opacity 0.5, `not-allowed`, tooltip "Full repo tree available in Phase 7").

**D-11** — Review status: `untouched → in-progress` (IntersectionObserver ≥50% / 500ms); `in-progress → reviewed` (explicit via `r` or "Mark reviewed"); `reviewed → in-progress` (toggle via `r`). All transitions fire as SessionEvents.

**D-12** — Review status tracked per file. Per-hunk is Phase 5's concern.

**D-13** — Generated file detection: hardcoded path-pattern allowlist. `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `poetry.lock`, `Gemfile.lock`, `composer.lock`, `Package.resolved`, `*.min.*`, `*.map`, `dist/**`, `build/**`, `node_modules/**`, `vendor/**`, `.next/**`, `.nuxt/**`, `coverage/**`, `__generated__/**`, `*.pb.go`. No size heuristic, no user config.

**D-14** — `DiffFile` gets `generated: boolean`. Populated during `parse-diff` ingest. Travels in SSE snapshot.

**D-15** — Generated files in explorer: muted style, "Excluded" label. Diff section collapsed by default with "Expand" affordance. Expand does NOT flip `generated` flag — UI-only toggle persisted via `file.generatedExpandToggled` SessionEvent.

**D-16** — LLM-side exclusion is Phase 3 flag-only. No new MCP tools. Phase 4/5 tools filter on `generated: boolean`.

**D-17** — One global keydown listener at AppShell level. Skips if `document.activeElement` is `input`, `textarea`, or `contenteditable`.

**D-18** — Keyboard semantics: `n`/`p` cross-file hunk navigation with wrap + toast. `r` marks current file. `c`/`v`/`s` dispatch stub toasts. Wrap behavior: wrap + "Wrapped to first/last hunk" toast.

**D-19** — No `?` shortcut in Phase 3. Footer hint `n / p · r · c v s` (live keys in `--ink-3`, stubs in `--ink-4`).

**D-20** — Existing PR comments: `gh api /repos/{owner}/{repo}/pulls/{n}/comments` (inline) + `gh api /repos/{owner}/{repo}/pulls/{n}/reviews` (top-level). Use `--paginate`. Normalize to `ReadOnlyComment[]`.

**D-21** — Read-only comment markers in prototype's `thread-marker` gutter slot. Muted grey fill (`--paper-3` bg, `--ink-3` fg). Click opens popover. No reply affordance. Orphan comments hidden, stderr log.

**D-22** — Orphan comments: hidden in Phase 3. Server logs count to stderr.

**D-23** — Local-branch mode: skip existing-comment fetch entirely.

**D-24** — CI checks: `gh pr checks <n> --json name,state,bucket,link` (NOTE: CONTEXT says `conclusion,detailsUrl` but `gh pr checks` JSON fields are `bucket` and `link`). See research finding Q6.

**D-25** — CI pill: compact aggregate with click-to-expand dropdown. External `<a href target="_blank">` for check links.

**D-26** — No CI polling. One-shot at session start. CI pill hides entirely in local-branch mode.

**D-27** — New SessionEvent variants: `file.reviewStatusSet`, `file.generatedExpandToggled`, `existingComments.loaded`, `ciChecks.loaded`.

**D-28** — Each event extends reducer pure function, inherits Phase-2 persistence + SSE broadcast.

### Claude's Discretion

- Exact fixture PR contents (5–10 files, 30–50 hunks, mixed languages)
- Viewport-intersection threshold for auto-in-progress (50%/500ms — confirmed in UI-SPEC)
- Render-budget threshold for fixture test (500ms — confirmed in UI-SPEC)
- Wrap or no-op for `n`/`p` boundaries (wrap + toast — confirmed in UI-SPEC)
- Keyboard hint visibility (footer `n / p · r · c v s` — confirmed in UI-SPEC)
- Read-only comment marker visual distinction (muted grey — confirmed in UI-SPEC)
- CI pill in local-branch mode (hide entirely — confirmed in UI-SPEC)
- Disabled Repo tab styling (opacity 0.5, not-allowed, tooltip — confirmed in UI-SPEC)
- Where `n`/`p` focused hunk anchor lives (client-local transient state, NOT a SessionEvent)
- Exact `ReadOnlyComment` / `CIStatus` / `CheckRun` type shapes in `shared/types.ts`

### Deferred Ideas (OUT OF SCOPE)

- Orphan-comments sidebar panel (Phase 7)
- Full-repo-tree (Phase 7)
- Word-level diff highlighting (Phase 7 / v1.x)
- CI polling (Phase 7)
- Failed-check inline log drill-down (Phase 7)
- Keyboard help overlay (`?`) (Phase 7)
- Octokit adoption (Phase 6)
- TweaksPanel (deleted)
- Per-repo `.pair-review.json` generated-file config (v2)
- Authenticated user identity in UI chrome (Phase 7)
- Repo-mode file tree implementation (Phase 7)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLUG-04 | Keyboard shortcuts (`n`/`p` next/prev hunk, `c` comment, `r` mark reviewed, `v` verdict, `s` submit) | Q4: one global keydown listener at AppShell; `n`/`p` use hunkIndex ref; `r` fires SessionEvent via POST; `c`/`v`/`s` dispatch stub toasts |
| INGEST-03 | Existing PR review comments (inline + top-level) shown read-only alongside diff | Q5: `gh api /repos/{owner}/{repo}/pulls/{n}/comments --paginate` + normalize to `ReadOnlyComment[]`; anchor resolution via `path + line + side` to `DiffLine.id` |
| INGEST-04 | CI / check-run status (name + conclusion) on PR header | Q6: `gh pr checks <n> --json name,state,bucket,link` — `bucket` is the normalized pass/fail/pending/skipping/cancel field; `link` is the URL |
| DIFF-01 | GitHub-style unified diff with syntax highlighting + hunk anchoring as default mode | Q1: bespoke DiffViewer consumes `ShikiFileTokens`, renders `<span style="color:{token.color}">` HTML via `dangerouslySetInnerHTML`; hunk anchors via `id={hunk.id}` on section header |
| DIFF-02 | Toggle between unified and split diff views | Q1: split renderer already in DiffViewer.tsx; split toggle disabled <1024px per UI-SPEC |
| DIFF-03 | File-tree sidebar with per-file review status (reviewed / in-progress / untouched) + click-to-jump | Q2: FileExplorer live-wired to store; status dots from `session.fileReviewStatus[fileId]`; click calls `scrollIntoView({behavior:'smooth'})` on `#diff-${fileId}` anchor |
| DIFF-04 | Generated/lockfile/vendored paths auto-collapsed in UI + excluded from LLM context | Q3: hardcoded path-pattern allowlist in ingest; `generated: boolean` on DiffFile; UI collapses generated sections by default |
</phase_requirements>

---

## Summary

Phase 3 is a live-wiring exercise, not greenfield. The committed prototype (`c7fe93f`) provides all visual structure; what's missing is the connection to the Phase-2 event-sourced store, four new features (generated-file flag, per-file review status, existing PR comments, CI checks), and keyboard shortcuts. The architectural pattern is already established: every state mutation flows server → SessionEvent → reducer → persist → SSE → store → React. Phase 3 adds four new SessionEvent variants to that pipeline and wires five existing prototype components to live store data.

**The biggest technical risk is the Shiki theme mismatch**: the server currently highlights with `github-dark` but the UI uses a light-mode paper palette. The DiffViewer renders Shiki token colors via inline `style="color:{color}"`, so dark-theme hex colors will produce unreadable white-on-white text in the light UI. The fix — switch `shiki.ts` to `github-light` — is a one-line change but must happen in Wave 0 or the fixture-PR render test will fail visually.

**A secondary finding on `gh pr checks`**: CONTEXT D-24 references fields `conclusion` and `detailsUrl`, but `gh pr checks --json` does not expose those field names. The correct field names verified by `gh pr checks --help` are `name`, `state`, `bucket` (normalized: pass/fail/pending/skipping/cancel), and `link` (the URL). Plans must use `bucket` (not `conclusion`) and `link` (not `detailsUrl`) in the `gh pr checks` call and the `CIStatus` normalization logic.

**Primary recommendation:** Wire the six existing prototype components to Phase-2 store state. Fix Shiki theme. Add `generated: boolean` during ingest. Add four SessionEvent variants. Add two `gh api` ingest calls. Add one global keydown listener. Commit the synthetic fixture and its render test.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Generated-file detection | API / Backend (server/ingest) | — | `parse-diff` result augmented with `generated` flag at ingest time; one canonical location prevents drift |
| Shiki syntax highlighting | API / Backend (server/highlight) | — | Already server-side per Phase-1 design; tokens travel in SSE snapshot |
| Per-file review status state | API / Backend (session reducer) | Browser (visual feedback) | Must survive browser close; goes through SessionEvent pipeline; UI reflects store |
| Auto-in-progress IntersectionObserver | Browser / Client | — | Viewport detection is inherently client-side; fires POST to server to record SessionEvent |
| Keyboard shortcut handling | Browser / Client | — | DOM-level event, client-side only; `r` key fires POST; `c`/`v`/`s` are toasts only |
| Existing PR comment fetch | API / Backend (server/ingest) | — | `gh api` call at session start in `startReview`; result travels via SSE as `existingComments.loaded` event |
| Existing comment anchor resolution | API / Backend | — | Server resolves `{path, line, side}` → `DiffLine.id` at ingest time; client only renders pre-resolved anchors |
| CI check-run fetch | API / Backend (server/ingest) | — | `gh pr checks` at session start; result travels via `ciChecks.loaded` event |
| CI pill render | Browser / Client | — | Renders `state.ciStatus` from store; purely display |
| Multi-file scroll | Browser / Client | — | All files in one DOM; `scrollIntoView` on file-section anchors |
| `n`/`p` focused-hunk cursor | Browser / Client (local state) | — | Transient visual focus; NOT a SessionEvent; lives in `useRef` / `useState` in AppShell |

---

## Q1: Diff Renderer — Bespoke DiffViewer.tsx

### Decision Confirmed (D-05)

`@git-diff-view/react` is removed. The bespoke `DiffViewer.tsx` is the Phase-3 renderer. The spike test (`DiffView.spike.tsx` + `diff-view-spike.test.tsx`) is deleted.

### Shiki Token Rendering — CRITICAL FIX REQUIRED

The existing `server/src/highlight/shiki.ts` uses `theme: 'github-dark'`. The UI palette is light-mode paper. Rendering `github-dark` token hex colors against a `#FBFAF7` background produces white-on-white text.

**Fix:** Change `shiki.ts` to use `theme: 'github-light'`. [VERIFIED: @shikijs/themes dist directory contains `github-light.mjs` and `github-light-default.mjs`]

The `ShikiToken` shape is `{ content: string; color?: string; fontStyle?: number }`. Rendering client-side:

```typescript
// Source: shared/types.ts ShikiToken definition + Shiki fontStyle bitmask convention
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

The `dangerouslySetInnerHTML` safety invariant (CONTEXT `code_context`) is preserved: input ONLY comes from server-produced Shiki tokens, never from user text. Comment bodies render via React text nodes.

### DiffViewer Multi-File Refactor

The current `DiffViewer.tsx` renders a single `DiffModelFixture` with hardcoded path. Phase 3 must:

1. Accept `diff: DiffModel` (from `shared/types.ts`) and `shikiTokens: Record<string, ShikiFileTokens>`
2. For each `DiffFile` in `diff.files`:
   - Render a per-file section with `id={`diff-${file.id}`}` for anchor scrolling
   - Render per-file section header (path, +adds, -dels, view toggle, Mark reviewed button)
   - Render hunks using `shikiTokens[file.id][hunkIdx][lineIdx]` per line

3. Hunk anchor IDs already exist: `hunk.id = "${fileId}:h${hunkIndex}"` [VERIFIED: `parse.ts` line 89]

```typescript
// Pattern: unified hunk rendering with Shiki tokens
// Source: existing DiffViewer.tsx adapted for live types
<tr key={line.id} className={line.kind}>
  <td className="gutter">
    <span>{line.kind === 'del' || line.kind === 'context' ? line.fileLine : ''}</span>
    <span>{line.kind === 'add' || line.kind === 'context' ? line.fileLine : ''}</span>
    {/* Thread marker slot — Phase 3: read-only comment markers here */}
  </td>
  <td
    className="content"
    dangerouslySetInnerHTML={{
      __html: tokenToHtml(shikiTokens[file.id]?.[hunkIdx]?.[lineIdx] ?? [{ content: line.text }])
    }}
  />
</tr>
```

The key type mapping from `DiffModelFixture.DiffRow` to `shared/types DiffLine`:

| `DiffRow` (prototype) | `DiffLine` (shared/types) | Notes |
|-----------------------|--------------------------|-------|
| `type: 'add'` | `kind: 'add'`, `side: 'RIGHT'` | |
| `type: 'rem'` | `kind: 'del'`, `side: 'LEFT'` | |
| `type: 'context'` | `kind: 'context'`, `side: 'BOTH'` | |
| `oldN` / `newN` | `fileLine` (context uses right/new) | Phase-1 parse.ts uses ln2 for context lines |

### Split Mode

The `SplitHunk` component pairs `del` + `add` lines side-by-side. This algorithm is already implemented in `DiffViewer.tsx` and only needs the type change from `DiffRow` to `DiffLine` (rename `type` → `kind`, rename `rem` → `del`). Disable split toggle below 1024px per UI-SPEC.

### Fixture Requirements (D-09)

The synthetic fixture must be built as:
- `DiffModel` JSON (matches `shared/types.ts DiffModel`)
- `Record<string, ShikiFileTokens>` JSON (matches `ShikiFileTokens` shape)

Both committed to `web/src/__tests__/fixtures/diff-model.fixture.json` and `web/src/__tests__/fixtures/shiki-tokens.fixture.json`.

**Recommended capture approach:** Run the real ingest pipeline on a known public PR via a one-off script that calls `toDiffModel()` + `highlightHunks()` and serializes to JSON. Commit the output. This proves the server pipeline works on a real PR and gives a stable test baseline.

**Fixture target PR:** `facebook/react` PR #31405 (a mid-size TypeScript + JSON + Markdown PR with ~8 files, ~40 hunks) is an example of a suitable public fixture, but any PR with: TypeScript, JSON, at least one `package.json` or lockfile-adjacent file, a renamed file, is suitable. The planner can choose; the criterion is the `web/src/__tests__/fixtures/` contents conform to the D-09 spec.

**Render test pattern (500ms budget):**

```typescript
// Source: D-09 spec + existing StaleDiffModal.test.tsx pattern
import { render } from '@testing-library/react';
import { performance } from 'node:perf_hooks';
import diffModelFixture from './fixtures/diff-model.fixture.json';
import shikiTokensFixture from './fixtures/shiki-tokens.fixture.json';

it('renders 50-hunk fixture within 500ms first paint', () => {
  const start = performance.now();
  const { container } = render(
    <DiffViewer
      diff={diffModelFixture as DiffModel}
      shikiTokens={shikiTokensFixture as Record<string, ShikiFileTokens>}
      view="unified"
      onViewChange={() => {}}
      fileReviewStatus={{}}
      expandedGenerated={new Set()}
      focusedHunkId={null}
      readOnlyComments={[]}
    />
  );
  const elapsed = performance.now() - start;
  expect(container.querySelector('.hunk')).toBeTruthy();
  expect(elapsed).toBeLessThan(600); // 500ms target + 20% advisory tolerance
});
```

---

## Q2: File-Tree Sidebar

### No Library Needed

**Use the existing `FileExplorer.tsx` directly.** It already implements the folder/file node pattern, per-file status dots, `active` state, filter toggle, search input, and summary chips. The "Changed" tab already renders a flat filtered list — exactly what Phase 3 needs. The "Repo" tab renders a tree — disable it per D-10.

Phase 3 changes to `FileExplorer.tsx`:

1. Remove `FILE_STATE`, `PR`, `REPO_TREE` fixture imports. Accept props from store.
2. Map `session.fileReviewStatus[fileId]` (new `'untouched' | 'in-progress' | 'reviewed'` union) to existing status dot visuals:
   - `untouched` → `--ink-4` at 0.4 opacity (existing `.status.pending` style)
   - `in-progress` → `--warn` (existing warn color, replaces `threads` status)
   - `reviewed` → `--ok` (existing ok color, unchanged)
3. Add `generated` prop to `FileNode`: muted `--ink-4` text + "Excluded" label suffix
4. Disable "Repo" tab: `disabled` HTML attr + `opacity: 0.5` + `cursor: not-allowed` + `title="Full repo tree available in Phase 7"`
5. Replace `3 threads` chip with `{n} in-progress` chip
6. Summary chip recount: `reviewed / in-progress / untouched`
7. Click handler: `document.getElementById(`diff-${file.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })`

### Tree Expand State

The "Changed" file list is flat (no nesting needed for Phase 3). Expand/collapse of folder nodes is already implemented in `FolderNode` with local `useState` — no SessionEvent needed for that. Generated-file expand toggle uses `file.generatedExpandToggled` SessionEvent because it must persist across reload (D-15).

### `active` file tracking (focused hunk)

The "current active file" (highlighted with `--claude-2` bg + `--claude` left rail) tracks which file contains the currently-focused hunk. This is client-local state in the AppShell — a `string | null` fileId that updates whenever `n`/`p` moves the focus or the user clicks a file in the explorer. It does NOT go through SessionEvents (transient visual focus per CONTEXT D-10 discretion resolution confirmed: "probably client-local").

```typescript
// AppShell local state (not in store, not in session)
const [focusedFileId, setFocusedFileId] = useState<string | null>(null);
const [focusedHunkId, setFocusedHunkId] = useState<string | null>(null);
```

---

## Q3: Generated-File Detection

### Hardcoded Allowlist (D-13 confirmed)

Detection goes in `server/src/ingest/parse.ts` (the `toDiffModel` function) as a pure function applied to each `DiffFile.path` before the `DiffFile` object is constructed.

```typescript
// Source: D-13 allowlist + standard glob matching patterns
// Location: server/src/ingest/generated-file-detection.ts (new file)
const GENERATED_PATTERNS: Array<RegExp | string> = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'poetry.lock',
  'Gemfile.lock',
  'composer.lock',
  'Package.resolved',
  /\.min\.[^.]+$/,           // *.min.js, *.min.css, etc.
  /\.map$/,                  // *.map source maps
  /^dist\//,                 // dist/**
  /^build\//,                // build/**
  /^node_modules\//,         // node_modules/**
  /^vendor\//,               // vendor/**
  /^\.next\//,               // .next/**
  /^\.nuxt\//,               // .nuxt/**
  /^coverage\//,             // coverage/**
  /^__generated__\//,        // __generated__/**
  /\.pb\.go$/,               // *.pb.go
];

export function isGeneratedFile(filePath: string): boolean {
  return GENERATED_PATTERNS.some(p =>
    typeof p === 'string' ? filePath === p || filePath.endsWith('/' + p) : p.test(filePath)
  );
}
```

This function is called in `toDiffModel` and sets `DiffFile.generated`. Because it's applied at ingest time and travels in the SSE snapshot, no client-side re-derivation is needed.

### LLM Exclusion (D-16)

The flag is the contract. Phase 4/5 tools check `file.generated === false` by default. Phase 3 verification test: assert that `toDiffModel(diffWithLockfile)` produces a `DiffFile` with `generated: true` for the lockfile path.

### No `.gitattributes` Parsing

GitHub's `linguist-generated` attribute approach is not used. The hardcoded list covers 100% of common cases. Per D-13, extension via daily-use observation is the stated strategy — no user config file. [ASSUMED: this covers all lockfile/generated patterns the author will encounter in practice]

---

## Q4: Keyboard Shortcuts

### Pattern: One Global Keydown Listener at AppShell

D-17 locks this design. No library needed. The pattern is:

```typescript
// Source: CONTEXT D-17 + Web API KeyboardEvent
// Location: web/src/App.tsx (AppShell level)
useEffect(() => {
  function onKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return; // don't steal browser shortcuts

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

### `n`/`p` Cross-File Navigation

The hunk list is a flat virtual array built from `diff.files.flatMap(f => f.hunks)` filtered to non-generated files. The focused index is a `useRef<number>` in AppShell. Navigation:

```typescript
// Source: D-18 spec — cross-file hunk list navigation
function advanceHunk(delta: number) {
  const allHunks = diff.files
    .filter(f => !f.generated)
    .flatMap(f => f.hunks.map(h => ({ fileId: f.id, hunkId: h.id })));
  
  let next = (focusedHunkIndex.current + delta + allHunks.length) % allHunks.length;
  const wrapping = delta > 0
    ? focusedHunkIndex.current === allHunks.length - 1
    : focusedHunkIndex.current === 0;

  focusedHunkIndex.current = next;
  const { hunkId, fileId } = allHunks[next];
  setFocusedHunkId(hunkId);
  setFocusedFileId(fileId);
  document.getElementById(hunkId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  
  if (wrapping) {
    showToast(delta > 0 ? 'Wrapped to first hunk' : 'Wrapped to last hunk');
  }
}
```

The focused hunk gets a transient 400ms `--claude` left-border pulse via a CSS class: `.hunk.focused { border-left: 2px solid var(--claude); animation: hunkFocus 400ms ease-out; }`.

### `r` Key — Marks Current File

"Current file" = `focusedFileId` (set by `n`/`p`) OR the top-most visible file if no hunk is focused. Toggle logic per D-11 state machine:

- `untouched` or `in-progress` → `reviewed`
- `reviewed` → `in-progress`

Fires via `POST /api/session/events` with `{ type: 'file.reviewStatusSet', fileId, status }`.

### Toast Implementation

The toast system (for `c`/`v`/`s` stub keys and `n`/`p` wrap notifications) is a bottom-center pill that auto-dismisses at 2.5s. Simplest implementation: a `useState<string | null>` in AppShell with a `setTimeout` that clears it. No library needed.

```typescript
// Simple toast state pattern
const [toast, setToast] = useState<string | null>(null);
function showToast(msg: string) {
  setToast(msg);
  setTimeout(() => setToast(null), 2500);
}
// Render: <div className="toast" role="status" aria-live="polite">{toast}</div>
```

### Library Assessment

`react-hotkeys-hook` is the standard library for keyboard shortcut management in React (focuses input field detection, hook-based API). However, Phase 3's requirements are simple enough that the hand-rolled approach in D-17 is correct — it's one `useEffect`, one `switch`, 20 lines. Using a library here would be Pitfall 13 (over-engineering). [ASSUMED: D-17 is sufficient for Phase 3; Phase 5 may reassess if comment-composer inputs require more sophisticated focus detection]

---

## Q5: Existing PR Comments — INGEST-03

### API Calls

D-20 specifies two calls at session start. Correcting to use `--paginate`:

```typescript
// Source: CONTEXT D-20 + gh api --paginate docs [CITED: https://cli.github.com/manual/gh_api]
// Location: server/src/ingest/github.ts extension

export async function fetchExistingComments(
  owner: string, repo: string, prNumber: number
): Promise<ReadOnlyComment[]> {
  const [inlineRaw, reviewsRaw] = await Promise.all([
    execa('gh', ['api', '--paginate', `repos/${owner}/${repo}/pulls/${prNumber}/comments`]),
    execa('gh', ['api', `repos/${owner}/${repo}/pulls/${prNumber}/reviews`]),
  ]);
  
  const inline = JSON.parse(inlineRaw.stdout) as GhInlineComment[];
  const reviews = JSON.parse(reviewsRaw.stdout) as GhReview[];
  
  return [
    ...inline.map(normalizeInlineComment),
    ...reviews
      .filter(r => r.body)
      .map(normalizeTopLevelReview),
  ];
}
```

### GitHub API Fields — Inline Comments

`GET /repos/{owner}/{repo}/pulls/{n}/comments` returns objects with:

```typescript
// Source: [CITED: https://docs.github.com/en/rest/pulls/comments]
interface GhInlineComment {
  id: number;
  path: string;           // file path
  line: number | null;    // new file line number (RIGHT), null for deleted-line comments
  original_line: number;  // may differ after force-push
  side: 'LEFT' | 'RIGHT';
  start_line: number | null;  // for multi-line comments
  start_side: 'LEFT' | 'RIGHT' | null;
  user: { login: string };
  body: string;
  created_at: string;
  html_url: string;
  in_reply_to_id: number | null;
}
```

**The Pitfall 1 trap (position vs line/side):** Read-only comment anchoring uses `line` + `side`, NOT `position`. The existing comment anchor is resolved to a `DiffLine.id` by matching `{path, line, side}` against the parsed `DiffModel`. This resolution happens server-side during `startReview` so the client receives pre-resolved `{ lineId: string }` anchors.

```typescript
// Anchor resolution pattern
// Source: D-20 + shared/types DiffModel structure [VERIFIED: parse.ts output shape]
function resolveCommentAnchor(
  comment: GhInlineComment,
  diffModel: DiffModel
): string | null {
  const file = diffModel.files.find(f => f.path === comment.path);
  if (!file) return null; // orphan
  
  const targetLine = comment.line ?? comment.original_line;
  const targetSide = comment.side as LineSide;
  
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.fileLine === targetLine && line.side === targetSide) {
        return line.id;
      }
    }
    // Context lines appear as side=BOTH; LEFT comments on context still valid
    for (const line of hunk.lines) {
      if (line.kind === 'context' && line.fileLine === targetLine) {
        return line.id;
      }
    }
  }
  return null; // orphan — log to stderr, hide per D-22
}
```

### `ReadOnlyComment` Type

```typescript
// Location: shared/types.ts (new addition, D-27)
export interface ReadOnlyComment {
  id: number;
  lineId: string | null;  // null = orphan (hidden in Phase 3)
  path: string;
  line: number | null;
  side: 'LEFT' | 'RIGHT' | 'BOTH';
  author: string;
  createdAt: string;       // ISO timestamp
  body: string;            // Rendered as React text node — NOT via innerHTML
  htmlUrl: string;         // "View on GitHub" link
  threadId?: number;       // in_reply_to_id — for visual grouping
}
```

### Top-Level Review Bodies

`GET /repos/{owner}/{repo}/pulls/{n}/reviews` returns reviews (the top-level comment + verdict for each reviewer). These have `body` but no `path`/`line` — they're PR-level comments. In Phase 3 these are noted but may not anchor to the diff. The `existingComments.loaded` SessionEvent carries all normalized comments; the client only renders those with a resolved `lineId`.

### Pagination Note (Pitfall 22)

`gh api --paginate` automatically follows `Link` header pagination. For the reviews endpoint (`/pulls/{n}/reviews`), pagination is less common (most PRs have <30 reviewers), but `--paginate` is defensive and correct.

---

## Q6: CI Check-Run Status — INGEST-04

### Field Name Correction (CRITICAL)

CONTEXT D-24 references `--json name,state,conclusion,detailsUrl`. **These are NOT `gh pr checks` JSON field names.**

[VERIFIED: `gh pr checks --help` output, confirmed in this session]

Correct `gh pr checks --json` fields:
- `name` — check name
- `state` — raw check state (varies by check runner)
- `bucket` — normalized category: `pass | fail | pending | skipping | cancel`
- `link` — URL to check details (analogous to `detailsUrl`)
- Additional available fields: `completedAt`, `description`, `event`, `startedAt`, `workflow`

### Correct Implementation

```typescript
// Source: [VERIFIED: gh pr checks --help output]
// Location: server/src/ingest/github.ts extension
export async function fetchCIChecks(prNumber: number): Promise<CIStatus> {
  try {
    const { stdout } = await execa('gh', [
      'pr', 'checks', String(prNumber),
      '--json', 'name,state,bucket,link'
    ]);
    const checks = JSON.parse(stdout) as GhCheckRun[];
    return normalizeCIStatus(checks);
  } catch (err) {
    // gh exits 8 if checks are pending — NOT an error; parse stdout regardless
    // gh exits non-zero on actual CLI failures — handle via catch
    const execaErr = err as { stdout?: string; exitCode?: number };
    if (execaErr.exitCode === 8 && execaErr.stdout) {
      const checks = JSON.parse(execaErr.stdout) as GhCheckRun[];
      return normalizeCIStatus(checks);
    }
    throw err;
  }
}
```

**Exit code 8 is documented behavior for `gh pr checks`**: "Additional exit codes: 8: Checks pending." The ingest must catch exit code 8 and parse `stdout` anyway.

### `CIStatus` and `CheckRun` Types

```typescript
// Location: shared/types.ts (new additions, D-27)
export interface CheckRun {
  name: string;
  bucket: 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel';
  link: string;   // called 'detailsUrl' in UI copy but 'link' in gh CLI output
}

export interface CIStatus {
  aggregate: 'pass' | 'fail' | 'pending' | 'none';
  checks: CheckRun[];
}
```

**Aggregate logic:**
- Any `bucket: 'fail'` → `aggregate: 'fail'`
- No fail + any `pending` → `aggregate: 'pending'`
- All `pass` or `skipping` or `cancel` → `aggregate: 'pass'`
- Empty checks array → `aggregate: 'none'`

### TopBar CI Pill

The CI pill renders from `state.ciStatus.aggregate` using the color tokens from UI-SPEC. Click-to-expand shows `state.ciStatus.checks[]` as a list with name + icon + external `<a href={check.link} target="_blank">` link. The CI pill is hidden entirely in local-branch mode (`pr.source === 'local'`).

---

## Q7: LLM Context Filtering

### Filter Boundary: Server-Side at Ingest, Expressed as Flag

The filter does NOT live in the UI. The `DiffFile.generated: boolean` flag is the single source of truth, set at `toDiffModel()` time in `server/src/ingest/parse.ts`. [VERIFIED: parse.ts is where DiffFile objects are constructed]

The data flow is: ingest → flag set → SessionEvent `existingComments.loaded` and snapshot → SSE → store → every component. Phase 4/5 MCP tools see the flag when they read from the session's `diff.files`. UI auto-collapse is a presentation of the flag.

**No client-side re-derivation:** The `generated` flag travels in the persisted session JSON and the SSE snapshot. It is never recalculated on the client. If the flag is wrong, fix it in `isGeneratedFile()` — one place.

**Phase 4/5 tool contract:** When `Phase 4` calls `list_files()`, it filters `diff.files.filter(f => !f.generated)` by default with an explicit opt-in param `include_generated: true`. This contract is established by Phase 3's flag but honored by Phase 4/5 implementations.

---

## Q8: Fixture PR for Spike

**Recommended:** Build the fixture programmatically, not by fetching a live GitHub PR. The approach:

1. Write a one-off Node script (`scripts/generate-fixture.ts`) that:
   - Uses `ingestGithub()` from `server/src/ingest/github.ts`
   - Calls `toDiffModel()` on the diff
   - Calls `highlightHunks()` on each file (with `github-light` theme after the fix)
   - Serializes the `DiffModel` and `Record<string, ShikiFileTokens>` to JSON files

2. Run against any accessible GitHub PR that meets the D-09 criteria
3. Commit the resulting JSON files

**Why this approach:** It proves the server pipeline works end-to-end on a real PR and gives a stable fixture that doesn't require network access in CI.

**Suitable public PRs (examples — planner picks any one):**

| PR | Why Suitable |
|----|-------------|
| `microsoft/TypeScript` any recent PR | TypeScript + JSON (tsconfig files) + MD, multiple renamed/added files |
| `vitejs/vite` any v8 release PR | TypeScript + JSON + CHANGELOG.md, often includes pnpm-lock.yaml |
| Any PR on this plugin itself (future phases) | Perfect alignment, mixed TS/JSON/MD |

The simplest option: craft a small synthetic fixture by hand (not from a live PR) using the `DiffModel` + `ShikiFileTokens` shape directly. The planner should include a Wave 0 task to create the fixture using the real ingest pipeline, not hand-craft it, to prove the pipeline works.

**Fixture requirements checklist (D-09 + UI-SPEC Fixture Requirements section):**
- [ ] 5-10 files, 30-50 hunks total
- [ ] Languages: TypeScript, JavaScript, JSON, Markdown minimum
- [ ] At least one `package-lock.json`-equivalent (`generated: true`)
- [ ] At least one renamed file (`DiffFile.status = 'renamed'`, `oldPath` populated)
- [ ] At least one file with ≥5 hunks

---

## Standard Stack (Phase 3 additions only)

The full stack is locked in CLAUDE.md. Phase 3 adds no new dependencies to either `web/package.json` or `server/package.json` beyond removing `@git-diff-view/react`.

### web/package.json

**Remove:** `@git-diff-view/react` (D-05)
**Add:** none

### server/package.json

**No changes.** `execa`, `parse-diff`, `shiki`, `zod` all already present.

### Shiki Theme Change (server/src/highlight/shiki.ts)

| Property | Current | Phase 3 Fix |
|----------|---------|-------------|
| `themes` array | `['github-dark']` | `['github-light']` |
| `theme` in `codeToTokensBase` | `'github-dark'` | `'github-light'` |

[VERIFIED: `github-light.mjs` confirmed present in `@shikijs/themes/dist/`]

---

## Architecture Patterns

### System Architecture Diagram

```
Browser keydown event
       |
       v
AppShell keydown handler (D-17)
       |
  [n/p] scrollIntoView(hunkId) + setFocusedHunkId()
  [r]   POST /api/session/events → file.reviewStatusSet → reducer → persist → SSE broadcast
  [c/v/s] setToast(stubMessage)
       
IntersectionObserver (per file section)
       |
  [50% visible / 500ms]
       |
  POST /api/session/events → file.reviewStatusSet (untouched→in-progress) → reducer → persist → SSE

startReview (server)
       |
  ┌────────────────────────────────────────────┐
  │  ingestGithub() or ingestLocal()           │
  │       +                                    │
  │  fetchExistingComments() [github only]     │
  │       +                                    │
  │  fetchCIChecks() [github only]             │
  └────────────────────────────────────────────┘
       |
  toDiffModel() + isGeneratedFile() annotation
       |
  highlightHunks() → ShikiFileTokens (github-light)
       |
  initial ReviewSession snapshot
       |
  applyEvent('existingComments.loaded', comments)
  applyEvent('ciChecks.loaded', ciStatus)
       |
  SSE snapshot → store → AppShell → DiffViewer + FileExplorer + TopBar
```

### Recommended Project Structure (Phase 3 additions)

```
server/src/
├── ingest/
│   ├── github.ts          # +fetchExistingComments(), +fetchCIChecks()
│   ├── generated-file-detection.ts   # NEW: isGeneratedFile()
│   └── parse.ts           # extend toDiffModel to set generated flag
├── highlight/
│   └── shiki.ts           # change theme: github-dark → github-light
└── session/
    └── reducer.ts         # add 4 new SessionEvent branches

web/src/
├── App.tsx                # 2-column layout (D-02), keydown listener, IntersectionObserver setup
├── components/
│   ├── DiffViewer.tsx     # multi-file, Shiki tokens, hunk anchors, existing comment markers
│   ├── FileExplorer.tsx   # live-wired to store, review status, generated styling
│   └── TopBar.tsx         # CI pill, stub CTA buttons
├── store.ts               # add 4 new action handlers
├── api.ts                 # add postSessionEvent() helper
└── __tests__/
    └── fixtures/
        ├── diff-model.fixture.json
        └── shiki-tokens.fixture.json

shared/types.ts             # DiffFile.generated, 4 new SessionEvent variants,
                            # ReadOnlyComment, CIStatus, CheckRun types
```

### Anti-Patterns to Avoid

- **Putting `generated` flag in UI state:** The flag lives on `DiffFile` in the session. Don't recompute it client-side. The single point of truth is `server/src/ingest/generated-file-detection.ts`.
- **Using `position` for read-only comment anchoring:** Use `line` + `side` (Pitfall 1 pattern). Anchor resolution happens server-side when building `ReadOnlyComment.lineId`.
- **console.log in MCP server process:** Corrupts the JSON-RPC stdio channel. All server logging uses `logger.warn/error` (stderr). [VERIFIED: established pattern in `server/src/session/manager.ts`]
- **Putting `focusedHunkId` in SessionEvent:** It's transient visual state. Use `useRef` / `useState` at AppShell level. [VERIFIED: CONTEXT D-10 discretion resolution]
- **Treating `gh pr checks` exit code 8 as an error:** Exit 8 = "checks pending" — parse stdout anyway.
- **Deleting `data.ts` before tests pass:** `data.ts` is used by multiple test imports indirectly. Delete it last, after all components are live-wired and tests verify against the fixture.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unified diff parsing | Custom parser | `parse-diff` (already in use) | Already battle-tested, handles edge cases |
| Syntax highlighting | Custom regex highlighter | Shiki server-side (already in use) | `highlight.ts` is deleted per D-06; Shiki already has the full pipeline |
| Pagination of `gh api` | Manual `Link` header parsing | `gh api --paginate` | One flag, handles all edge cases |
| Exit-code handling for `gh pr checks` | Custom process exit handling | Catch in `execa` `catch` block, check `exitCode === 8` | Standard execa pattern, already used in github.ts |
| Toast dismissal timing | setTimeout in useEffect | Direct `useState` + `setTimeout` inline | Scope is small enough; no need for a toast library |
| Per-file review status persistence | Direct SQLite write | SessionEvent pipeline (Phase 2 pattern) | Phase 2 infrastructure handles persist + broadcast; never bypass it |

---

## Common Pitfalls

### Pitfall A: Shiki `github-dark` Colors on Light Background

**What goes wrong:** `dangerouslySetInnerHTML` renders white/light hex codes (e.g., `#e6edf3`) from the dark theme against the `--paper` (`#FBFAF7`) background. All code is invisible.

**Why it happens:** The server was configured with `github-dark` in Phase 1 (acceptable for a placeholder that wasn't actually rendering tokens). Phase 3 wires real tokens, making the theme mismatch visible.

**How to avoid:** Change `shiki.ts` to `github-light` in Wave 0, before the DiffViewer render test is written. The fixture-PR render test will catch this if it checks that rendered content is visible.

**Warning signs:** Render test passes but code content appears white in browser.

---

### Pitfall B: `gh pr checks` Exit Code 8

**What goes wrong:** `execa` throws when `gh pr checks` exits with code 8 (checks are pending). Server catches the error, logs it, CI pill shows "none" — but the PR actually has pending checks that should show as "pending" aggregate.

**Why it happens:** `execa` by default rejects on non-zero exit. Exit code 8 is a documented non-error condition for `gh pr checks`.

**How to avoid:** In `fetchCIChecks`, catch the execa error, check `exitCode === 8`, and parse `err.stdout` to get the check data.

---

### Pitfall C: Comment Anchor Drift on Force-Push

**What goes wrong:** Existing PR comments anchor to `line: 42`. After a force-push, that line moved to 47. `original_line` (from the GitHub API) may not match the current diff's line numbers.

**Why it happens:** GitHub maintains `original_line` from when the comment was posted; after force-push, the diff changes.

**How to avoid:** In Phase 3, use `line` (current line number) for anchor resolution. If `line` is null (comment was on a deleted line), fall back to `original_line`. If neither resolves, mark as orphan and log to stderr per D-22. This matches Pitfall 12 from PITFALLS.md — existing comments can anchor on context lines.

---

### Pitfall D: `data.ts` Import Removal Race Condition

**What goes wrong:** `App.tsx`, `DiffViewer.tsx`, `FileExplorer.tsx`, `TopBar.tsx` all import from `./data`. Deleting `data.ts` before all imports are removed breaks the entire web app.

**How to avoid:** Delete `data.ts` in the final task of the final wave, after all components are confirmed live-wired and tests pass. The delete task must grep the codebase to confirm zero remaining imports.

---

### Pitfall E: IntersectionObserver Firing During Test

**What goes wrong:** Vitest/happy-dom tests that render `DiffViewer` sections trigger the IntersectionObserver callbacks immediately (intersection threshold always "met" in a headless environment with no real viewport), causing `file.reviewStatusSet` POST calls during render tests.

**How to avoid:** The IntersectionObserver setup lives in `App.tsx`'s AppShell, not inside `DiffViewer`. The DiffViewer render tests in `web/src/__tests__/` render `DiffViewer` in isolation without the AppShell wrapper, so the IntersectionObserver is never set up. For full-integration tests that include AppShell, mock `IntersectionObserver` in `setup.ts` similarly to how `EventSource` is mocked.

---

### Pitfall F: `gh pr checks` Field Names (Research Finding)

**What goes wrong:** Code is written using `conclusion` and `detailsUrl` field names (from CONTEXT D-24). `gh pr checks --json` has no such fields. The CLI exits non-zero with "invalid field" error.

**How to avoid:** Use `bucket` (not `conclusion`) and `link` (not `detailsUrl`). The `CIStatus.CheckRun` type must use `bucket` and `link`. The UI-SPEC's "detailsUrl" copy is the external label, not the field name. [VERIFIED: confirmed via `gh pr checks --help` in this session]

---

## Runtime State Inventory

Not applicable. Phase 3 is a live-wiring + feature-addition phase, not a rename/refactor. No runtime state categories apply.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22 | Runtime | ✓ | macOS default | — |
| `gh` CLI | INGEST-03, INGEST-04 | ✓ | 2.x (assumed; confirmed by Phase 1 use) | — |
| `pnpm` | Package manager | ✓ | (pnpm-workspace.yaml present) | — |
| `vitest` | Tests | ✓ | (web/vitest.config.ts present) | — |
| `happy-dom` 20.9.0 | Browser env for tests | ✓ | 20.9.0 [VERIFIED] | — |
| IntersectionObserver in happy-dom | Auto-in-progress test | ✓ | Present in happy-dom 20.x [VERIFIED: src search] | Mock in setup.ts |
| `scrollIntoView` in happy-dom | Navigation test | ✓ | Present in happy-dom 20.x [VERIFIED: src search] | Mock in setup.ts |
| `github-light` theme in Shiki 4.0.2 | Syntax highlighting fix | ✓ | Confirmed in @shikijs/themes/dist/ [VERIFIED] | `github-light-default` |

**Missing dependencies with no fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (web: happy-dom env; server: node env) |
| Config file | `web/vitest.config.ts` / `server/vitest.config.ts` |
| Quick run (web) | `pnpm --filter web test` |
| Quick run (server) | `pnpm --filter server test` |
| Full suite | `pnpm -r test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DIFF-01 | DiffViewer renders unified mode with Shiki tokens from fixture | unit/render | `pnpm --filter web test -- DiffViewer` | ❌ Wave 0 |
| DIFF-02 | DiffViewer renders split mode from same fixture | unit/render | `pnpm --filter web test -- DiffViewer` | ❌ Wave 0 |
| DIFF-01 | Hunk anchors resolve: `document.getElementById(hunk.id)` exists for each hunk in fixture | unit/render | `pnpm --filter web test -- DiffViewer` | ❌ Wave 0 |
| DIFF-01 | Render budget: first paint ≤600ms on 50-hunk fixture (500ms target + 20% tolerance) | perf/render | `pnpm --filter web test -- DiffViewer` | ❌ Wave 0 |
| DIFF-03 | FileExplorer shows correct status dots for untouched/in-progress/reviewed states | unit/render | `pnpm --filter web test -- FileExplorer` | ❌ Wave 0 |
| DIFF-04 | `isGeneratedFile('package-lock.json')` → true; `isGeneratedFile('src/app.ts')` → false | unit | `pnpm --filter server test -- generated` | ❌ Wave 0 |
| DIFF-04 | `toDiffModel(diffWithLockfile)` produces `DiffFile.generated === true` for lockfile path | unit | `pnpm --filter server test -- parse` | ❌ Wave 0 |
| INGEST-03 | `resolveCommentAnchor` returns correct `lineId` for a known comment in fixture DiffModel | unit | `pnpm --filter server test -- comments` | ❌ Wave 0 |
| INGEST-03 | `resolveCommentAnchor` returns null for a comment whose `path` is not in diff | unit | `pnpm --filter server test -- comments` | ❌ Wave 0 |
| INGEST-04 | `normalizeCIStatus([{bucket:'fail'},...])` → `{aggregate:'fail'}` | unit | `pnpm --filter server test -- ci-checks` | ❌ Wave 0 |
| INGEST-04 | `fetchCIChecks` handles exit code 8 (pending) without throwing | unit | `pnpm --filter server test -- ci-checks` | ❌ Wave 0 |
| PLUG-04 | AppShell `n` key fires `advanceHunk(+1)` and new `focusedHunkId` is set | unit/event | `pnpm --filter web test -- App` | ❌ Wave 0 |
| PLUG-04 | `r` key on file with status `reviewed` triggers POST with `status: 'in-progress'` | unit/event | `pnpm --filter web test -- App` | ❌ Wave 0 |
| PLUG-04 | Keydown skipped when `activeElement` is `INPUT` | unit/event | `pnpm --filter web test -- App` | ❌ Wave 0 |
| SessionEvent | `reducer` handles all 4 new SessionEvent variants correctly | unit | `pnpm --filter server test -- reducer` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter web test -- DiffViewer` (render tests, <15s)
- **Per wave merge:** `pnpm -r test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `web/src/__tests__/DiffViewer.test.tsx` — covers DIFF-01, DIFF-02, render budget
- [ ] `web/src/__tests__/fixtures/diff-model.fixture.json` — synthetic fixture (DiffModel)
- [ ] `web/src/__tests__/fixtures/shiki-tokens.fixture.json` — Shiki tokens for fixture
- [ ] `web/src/__tests__/App.keyboard.test.tsx` — covers PLUG-04 keyboard events
- [ ] `web/src/__tests__/FileExplorer.test.tsx` — covers DIFF-03 status display
- [ ] `server/src/ingest/__tests__/generated-file-detection.test.ts` — covers DIFF-04
- [ ] `server/src/ingest/__tests__/comments.test.ts` — covers INGEST-03 anchor resolution
- [ ] `server/src/ingest/__tests__/ci-checks.test.ts` — covers INGEST-04
- [ ] `server/src/session/__tests__/reducer-phase3.test.ts` — covers 4 new SessionEvent variants
- [ ] `web/src/test/setup.ts` — add `IntersectionObserver` mock (alongside existing `EventSource` mock)

---

## Security Domain

### Applicable ASVS Categories (Phase 3)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 1 shipped token + Host validation; no new auth surface |
| V3 Session Management | no | Phase 2 shipped session pipeline; no change to session mechanics |
| V4 Access Control | no | No new endpoints (existing POST /api/session/events reused) |
| V5 Input Validation | yes | `gh api` responses are JSON-parsed; `ReadOnlyComment.body` rendered as React text node (NOT innerHTML) |
| V6 Cryptography | no | No new crypto |

### `dangerouslySetInnerHTML` Safety (V5)

The only use of `dangerouslySetInnerHTML` in Phase 3 is rendering Shiki tokens:
- Input source: `state.shikiTokens[fileId][hunkIdx][lineIdx]` — server-produced only
- No user input, no GitHub comment body, no PR description flows through innerHTML
- GitHub comment bodies (`ReadOnlyComment.body`) render via React text nodes in popover

This is the same invariant established in Phase 1 and must be grep-enforced: `dangerouslySetInnerHTML` must not appear on any component that receives user-provided or GitHub-API-provided text.

### New Ingest Attack Surface (V5)

`fetchExistingComments` and `fetchCIChecks` add two new `gh api` call paths. The responses are JSON-parsed via `JSON.parse`. The parsed objects are normalized into strongly-typed `ReadOnlyComment[]` / `CIStatus` types before being stored. No raw API response travels to the client.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `highlight.ts` client-side regex highlighting | Shiki server-side tokens (github-light) | Phase 3 (D-06) | Full language coverage; correct light-theme colors |
| `data.ts` fixture imports in App.tsx | Live store data from SSE snapshot | Phase 3 | Phase 3 is complete live-wiring |
| `@git-diff-view/react` (planned) | Bespoke DiffViewer.tsx (D-05 resolution) | Phase 3 | One fewer dependency; full control over rendering |
| `FILE_STATE` prototype status types (`reviewed | threads | pending | new`) | `ReviewStatus = 'untouched' | 'in-progress' | 'reviewed'` (D-11) | Phase 3 | Cleaner state machine; `threads` status deferred to Phase 5 |
| `DiffModelFixture` (data.ts shape) | `DiffModel` from `shared/types.ts` | Phase 3 | Eliminates impedance mismatch; DiffViewer consumes canonical types |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The hardcoded generated-file allowlist covers all patterns the author encounters in daily use | Q3, D-13 | A genuine miss (e.g., a new lockfile format) shows up in LLM context; fixable in a patch |
| A2 | Hand-rolled global keydown listener is sufficient for Phase 3 without `react-hotkeys-hook` | Q4 | Comment composer focus-detection edge cases in Phase 5 may need rework; acceptable for now |
| A3 | The `data.ts` fixture `DiffModelFixture` shape is only used by the prototype components and can be deleted once all components are live-wired | Q1, Pitfall D | If any non-prototype code imports from data.ts, deletion breaks the build; grep before deleting |

---

## Open Questions

1. **`gh pr checks --json` fields vs CONTEXT D-24**
   - What we know: `gh pr checks --json` fields are `name, state, bucket, link` (verified via `gh pr checks --help`)
   - What's unclear: CONTEXT D-24 says `--json name,state,conclusion,detailsUrl` — these field names do not exist in `gh pr checks`
   - Recommendation: Plans use `--json name,state,bucket,link`. `CIStatus.CheckRun` uses `bucket` (not `conclusion`) and `link` (not `detailsUrl`). The PROJECT.md Key Decision row for Phase 3 should note this correction.

2. **`StaleDiffModal` palette harmonization**
   - What we know: CONTEXT canonical_refs says "planner harmonizes its styling with the prototype palette if needed; no functional change"
   - What's unclear: Whether the current `StaleDiffModal` has colors hardcoded or uses the `:root` token set
   - Recommendation: Planner checks `StaleDiffModal.tsx` for any hardcoded colors outside the token system and normalizes as a low-priority task within Phase 3 scope.

3. **Shiki `fontStyle` bitmask rendering (bold text in diffs)**
   - What we know: `ShikiToken.fontStyle` is a bitmask (1=italic, 2=bold, 4=underline) per Shiki convention [ASSUMED]
   - What's unclear: Whether github-light theme actually emits fontStyle values for any common tokens
   - Recommendation: Implement the bitmask rendering; the renderer degrades gracefully (no style applied if 0/undefined).

---

## Sources

### Primary (HIGH confidence)
- `server/src/highlight/shiki.ts` — verified current theme (`github-dark`), confirmed `github-light` in @shikijs/themes/dist/
- `shared/types.ts` — verified `DiffModel`, `DiffFile`, `Hunk`, `DiffLine`, `ShikiFileTokens`, `SessionEvent` shapes
- `server/src/ingest/parse.ts` — verified `toDiffModel()` output, hunk/line ID patterns
- `server/src/session/manager.ts` — verified `applyEvent` pattern, `startReview` flow
- `server/src/session/reducer.ts` — verified reducer structure for extension
- `web/src/components/DiffViewer.tsx` — verified existing split/unified rendering, thread-marker slot pattern
- `web/src/components/FileExplorer.tsx` — verified existing status dot, filter, folder-node patterns
- `web/src/store.ts` — verified store action pattern for extension
- `web/src/api.ts` — verified POST pattern for new session events
- `web/vitest.config.ts` — verified test framework configuration
- `web/src/test/setup.ts` — verified mock pattern for adding `IntersectionObserver` mock
- `gh pr checks --help` — verified JSON field names (`bucket`, `link`, not `conclusion`, `detailsUrl`)

### Secondary (MEDIUM confidence)
- [CITED: https://docs.github.com/en/rest/pulls/comments] — GitHub PR review comment API fields (`path`, `line`, `side`, `original_line`, `user`, `body`, `html_url`, `in_reply_to_id`)
- [CITED: https://cli.github.com/manual/gh_api] — `--paginate` flag for pagination

### Tertiary (LOW confidence — marked [ASSUMED])
- Shiki `fontStyle` bitmask semantics (1=italic, 2=bold, 4=underline) — widely documented convention but not verified against Shiki 4.0.2 source in this session

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing stack confirmed against codebase
- Architecture: HIGH — live-wiring of existing prototype; patterns established in Phase 1/2
- Pitfalls: HIGH — critical finding (gh pr checks field names) verified against CLI; Shiki theme issue verified by code inspection
- Q5/INGEST-03: HIGH — verified GitHub API field names against official docs
- Q6/INGEST-04: HIGH — field name discrepancy verified against `gh pr checks --help`

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (stable stack; no fast-moving dependencies in Phase 3 scope)

---

## RESEARCH COMPLETE

**Phase:** 03 — Diff UI + File Tree + Navigation
**Confidence:** HIGH

### Key Findings

1. **Shiki theme is wrong for light-mode UI (CRITICAL).** Server uses `github-dark`; UI is paper/light. `github-light` exists in Shiki 4.0.2 and must be switched in Wave 0 before the fixture render test is written. One-line fix in `shiki.ts`.

2. **`gh pr checks` field name mismatch with CONTEXT D-24.** CONTEXT says `conclusion` and `detailsUrl`; the actual `gh pr checks --json` fields are `bucket` and `link`. Plans must use the correct field names. Also: exit code 8 = "checks pending" is not an error — stdout must be parsed anyway.

3. **Open Decision 1 is fully resolved.** The bespoke `DiffViewer.tsx` is the renderer. `@git-diff-view/react` is removed. The DiffViewer's type mapping from `DiffModelFixture` (data.ts) to `DiffModel` (shared/types) is straightforward: `type='rem'` → `kind='del'`, `oldN`/`newN` → `fileLine`, thread-marker gutter slot is reused for read-only comment markers.

4. **Phase 3 is primarily wiring, not greenfield.** All 5 prototype components exist and need data-source swaps, not rewrites. The biggest single task is `DiffViewer.tsx` generalization from single-file to multi-file with Shiki token rendering.

5. **`focusedHunkId` is client-local state, not a SessionEvent.** `n`/`p` navigation is transient; no need for persistence. The `r` key DOES fire a SessionEvent because file review status persists.

6. **IntersectionObserver and `scrollIntoView` are available in happy-dom 20.9.0.** Tests can exercise the auto-in-progress viewport transition with a mock or real observer. Add `IntersectionObserver` mock to `web/src/test/setup.ts` alongside the existing `EventSource` mock for isolation.

### File Created

`.planning/phases/03-diff-ui-file-tree-navigation/03-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All dependencies confirmed in codebase; no new packages |
| Architecture | HIGH | Live-wiring of existing prototype; Phase-1/2 patterns well-established |
| Shiki theme fix | HIGH | Verified via directory inspection |
| `gh pr checks` fields | HIGH | Verified via `gh pr checks --help` output |
| GitHub PR comments API | HIGH | Verified against official docs |
| IntersectionObserver availability | HIGH | Verified via happy-dom src directory inspection |
| Generated file detection | MEDIUM | Allowlist is [ASSUMED] sufficient; not tested against all real-world lockfile patterns |

### Open Questions

- CONTEXT D-24 uses `conclusion`/`detailsUrl`; `gh pr checks --json` uses `bucket`/`link`. Planner must use the correct field names and note the correction in the Phase-3 Key Decision row.

### Ready for Planning

Research complete. Planner can now create PLAN.md files for Phase 3.
