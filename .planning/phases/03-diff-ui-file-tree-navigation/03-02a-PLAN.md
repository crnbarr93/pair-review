---
phase: 03
plan: 02a
type: execute
wave: 1
depends_on:
  - "03-01"
files_modified:
  - server/src/ingest/generated-file-detection.ts
  - server/src/ingest/__tests__/generated-file-detection.test.ts
  - server/src/ingest/parse.ts
  - server/src/ingest/__tests__/parse-generated.test.ts
  - server/src/ingest/github.ts
  - server/src/ingest/__tests__/comments.test.ts
  - server/src/ingest/__tests__/ci-checks.test.ts
autonomous: true
requirements:
  - INGEST-03
  - INGEST-04
  - DIFF-04
tags:
  - server
  - ingest
  - github-api

must_haves:
  truths:
    - "parse.ts sets DiffFile.generated correctly: true for lockfiles/dist/node_modules/etc; false for source code"
    - "fetchExistingComments fetches inline + top-level comments via gh api --paginate and returns server-resolved ReadOnlyComment[] with lineId set"
    - "orphan comments (path not in diff) are hidden (lineId=null) and counted to stderr — never thrown"
    - "fetchCIChecks handles exit code 8 (checks pending) without throwing; normalizes to CIStatus with correct aggregate"
    - "resolveCommentAnchor is exported as a pure function so Plan 03-02b's manager extension + Plan 03-03's render test can both exercise it without real gh"
  artifacts:
    - path: "server/src/ingest/generated-file-detection.ts"
      provides: "isGeneratedFile(filePath) — pure path-pattern detection"
      contains: "export function isGeneratedFile"
    - path: "server/src/ingest/github.ts"
      provides: "fetchExistingComments + fetchCIChecks + resolveCommentAnchor"
      contains: "fetchExistingComments"
  key_links:
    - from: "server/src/ingest/generated-file-detection.ts isGeneratedFile"
      to: "server/src/ingest/parse.ts toDiffModel"
      via: "import + call per file during parse"
      pattern: "generated: isGeneratedFile"
    - from: "server/src/ingest/github.ts fetchExistingComments / fetchCIChecks"
      to: "server/src/session/manager.ts startReview (Plan 03-02b)"
      via: "adapter functions imported by manager extension"
      pattern: "fetchExistingComments|fetchCIChecks"
---

<objective>
Populate the Phase 3 INGEST adapter surface: mark each `DiffFile` as generated, fetch existing PR review comments (with anchor resolution + orphan logging), and fetch CI check-runs (with exit-code-8 handling + correct `bucket`/`link` field names). This plan is one half of the former Plan 03-02 split; it contains the pure-ish ingest/adapter functions and their unit tests. The session-wiring consumer + HTTP route + fixture capture live in Plan 03-02b.

Purpose: Plans 03-03 and 03-04 cannot render Phase 3 data until the server produces it. This plan writes every new primitive into the ingest layer without touching the manager, HTTP routes, or fixtures (Plan 03-02b adds those). Keeping the split at the adapter boundary means both halves sit in Wave 1 sequentially — Plan 03-02b depends on 03-02a via the new exports here plus the shared/types.ts contract already committed in 03-01.

Output:
- `server/src/ingest/generated-file-detection.ts` — pure `isGeneratedFile(path)` function + exhaustive unit tests.
- `server/src/ingest/parse.ts` — `toDiffModel` populates `DiffFile.generated`.
- `server/src/ingest/github.ts` — new exports `fetchExistingComments`, `resolveCommentAnchor`, `fetchCIChecks`.
- Tests: generated-file-detection, parse-generated regression, comments (anchor + orphan), ci-checks (field names + exit-8 + aggregate matrix).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/03-diff-ui-file-tree-navigation/03-CONTEXT.md
@.planning/phases/03-diff-ui-file-tree-navigation/03-RESEARCH.md
@.planning/phases/03-diff-ui-file-tree-navigation/03-PATTERNS.md
@.planning/phases/03-diff-ui-file-tree-navigation/03-UI-SPEC.md
@.planning/phases/03-diff-ui-file-tree-navigation/03-01-SUMMARY.md
@shared/types.ts
@server/src/ingest/parse.ts
@server/src/ingest/github.ts

<interfaces>
Shared types (freshly extended in Plan 03-01 — DO NOT re-declare):
- `DiffFile.generated: boolean` (required)
- `ReadOnlyComment { id, lineId, path, line, side, author, createdAt, body, htmlUrl, threadId? }`
- `CheckRun { name, bucket, link }`  ← fields are `bucket` and `link` (NOT `conclusion`/`detailsUrl`)
- `CIStatus { aggregate: 'pass'|'fail'|'pending'|'none', checks: CheckRun[] }`

Existing Phase 1/2 patterns to reuse verbatim:
- `execa('gh', [...argv])` — NEVER string interpolation (T-3-04 mitigation). See existing uses in `server/src/ingest/github.ts` lines 52-56 and `server/src/ingest/local.ts`.
- `mapGhError(err)` helper is already defined in `github.ts` (approximately lines 84-99). Reuse for new `gh` call error handling.
- Logging: `import { logger } from '../logger.js';` — stderr only, NEVER console.log (AP2 anti-pattern). Orphan-count log goes through `logger.warn`.

Phase 1 opaque ID patterns (from server/src/ingest/parse.ts):
- `DiffFile.id = sha1(path).slice(0,12)`
- `Hunk.id = `${fileId}:h${hunkIdx}``
- `DiffLine.id = `${fileId}:h${hunkIdx}:l${lineIdx}``

Downstream consumers of this plan's exports (Plan 03-02b):
- `fetchExistingComments(owner, repo, prNumber, diffModel) => Promise<ReadOnlyComment[]>`
- `fetchCIChecks(prNumber) => Promise<CIStatus>`
- `resolveCommentAnchor(comment, diffModel) => string | null`
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| `gh` CLI subprocess → server | JSON stdout is parsed; shell argv is server-constructed (never user-interpolated) |
| GitHub API JSON → `ReadOnlyComment.body` | Arbitrary markdown/HTML content from strangers; must not flow into any innerHTML path |
| Generated-file detection — server-side single source of truth | Phase 4/5 MCP tools will filter on `DiffFile.generated`; incorrect classification → LLM context leak |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-3-01 | Tampering | `ReadOnlyComment.body` carrying `<script>` or `onerror=` | mitigate | Type's JSDoc documents "render via React text nodes, NEVER innerHTML" (enforced in Plan 03-03). This plan stores the body as a plain string; no server-side HTML sanitization needed because the client never feeds it to `dangerouslySetInnerHTML`. A unit test in Plan 03-03 asserts `<script>` in a comment body does NOT execute. |
| T-3-02 | Information Disclosure | Generated-file flag leaking LLM context | mitigate | Server-side single source of truth: `isGeneratedFile` is imported ONLY in `parse.ts` (unit-tested). Client never recomputes; it renders whatever the server sends. Test asserts `parse.ts` produces `generated: true` on a fixture lockfile. |
| T-3-03 | Tampering | Comment bodies rendered as markdown/HTML | mitigate | Same as T-3-01 — body stored as raw string; Plan 03-03's DiffViewer renders via React text nodes only. |
| T-3-04 | Tampering | gh CLI shell injection | mitigate | All new `gh` calls use `execa('gh', [argv])`. The `prNumber` is numeric (typed `number`); owner/repo come from server-validated `PullRequestMeta`, which was populated from `gh pr view --json` output in Phase 1 (server-trusted). Grep assertion in verify: `grep -c 'sh -c\|\`gh ' server/src/ingest/github.ts` returns 0. |
| T-3-07 | Information Disclosure | Orphan comments (force-push drift) leaking PII to logs | accept | Stderr log includes only the orphan count (integer), never comment author or body. Verified: log format is `Skipped N orphan comments` — no identifying info. |
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create pure isGeneratedFile detector + exhaustive unit tests</name>
  <files>
    - server/src/ingest/generated-file-detection.ts
    - server/src/ingest/__tests__/generated-file-detection.test.ts
  </files>
  <read_first>
    - server/src/ingest/parse.ts — reference for the code module style (pure, synchronous, ESM .js import specifiers)
    - .planning/phases/03-diff-ui-file-tree-navigation/03-CONTEXT.md — D-13 lists the exact patterns (lockfiles + glob shapes)
    - .planning/phases/03-diff-ui-file-tree-navigation/03-PATTERNS.md — "server/src/ingest/generated-file-detection.ts — NEW file" section has the exact code to copy
    - .planning/phases/03-diff-ui-file-tree-navigation/03-RESEARCH.md — Q3 (confirms allowlist approach; no regex-heavy detection needed)
  </read_first>
  <behavior>
    The detector returns `true` for:
    - `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `poetry.lock`, `Gemfile.lock`, `composer.lock`, `Package.resolved`
    - `foo.min.js`, `bar.min.css`, `x.min.anything`
    - `app.map`, `vendor.js.map`
    - Paths under `dist/**`, `build/**`, `node_modules/**`, `vendor/**`, `.next/**`, `.nuxt/**`, `coverage/**`, `__generated__/**`
    - `proto/v1.pb.go` and any `*.pb.go` path

    The detector returns `false` for:
    - Ordinary source code: `src/app.ts`, `pages/index.tsx`, `README.md`, `package.json` (NOT the lock file)
    - Paths that CONTAIN a generated segment but are NOT under one: `my-dist-plans/notes.md` (contains "dist" substring but not at path start)
    - A file named `package-lock.json` in a subdirectory: `apps/web/package-lock.json` should ALSO match (trailing-basename match)
  </behavior>
  <action>
    Step 1 — RED: Create `server/src/ingest/__tests__/generated-file-detection.test.ts` with the following exhaustive test matrix:

    ```typescript
    import { describe, it, expect } from 'vitest';
    import { isGeneratedFile } from '../generated-file-detection.js';

    describe('isGeneratedFile — positives', () => {
      const positives: string[] = [
        'package-lock.json',
        'apps/web/package-lock.json',
        'yarn.lock',
        'pnpm-lock.yaml',
        'Cargo.lock',
        'poetry.lock',
        'Gemfile.lock',
        'composer.lock',
        'Package.resolved',
        'foo.min.js',
        'bar.min.css',
        'x.min.anything',
        'app.map',
        'vendor/bundle.js.map',
        'dist/index.js',
        'dist/subdir/x.js',
        'build/app.js',
        'node_modules/lodash/index.js',
        'vendor/lib.js',
        '.next/static/chunks/main.js',
        '.nuxt/app.js',
        'coverage/lcov.info',
        '__generated__/schema.ts',
        'proto/v1.pb.go',
      ];
      it.each(positives)('detects %s as generated', (p) => {
        expect(isGeneratedFile(p)).toBe(true);
      });
    });

    describe('isGeneratedFile — negatives', () => {
      const negatives: string[] = [
        'src/app.ts',
        'pages/index.tsx',
        'README.md',
        'package.json',                  // the non-lock file
        'my-dist-plans/notes.md',        // "dist" substring NOT at path start
        'src/coverage-report.ts',        // not under coverage/
        'lib.rs',
        'Cargo.toml',                    // not Cargo.lock
        'src/vendor-integration.ts',     // "vendor" substring NOT at path start
        'spec/foo.spec.ts',
        'testing.min.notjs.source.ts',   // .min. must be followed by extension-only
      ];
      it.each(negatives)('does not detect %s as generated', (p) => {
        expect(isGeneratedFile(p)).toBe(false);
      });
    });
    ```

    Run: `pnpm --filter @review/server test -- --run generated-file-detection` and confirm RED.

    Step 2 — GREEN: Create `server/src/ingest/generated-file-detection.ts` with the verbatim implementation from 03-PATTERNS.md "generated-file-detection.ts — NEW file" section:

    ```typescript
    // Phase 3 D-13 — hardcoded generated-file path allowlist.
    // Pure function — no I/O, no async, no external deps.
    // Single source of truth: parse.ts imports this; client never recomputes (T-3-02 mitigation).
    const GENERATED_PATTERNS: Array<RegExp | string> = [
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'Cargo.lock',
      'poetry.lock',
      'Gemfile.lock',
      'composer.lock',
      'Package.resolved',
      /\.min\.[^.]+$/,           // *.min.js, *.min.css, etc. (extension-only suffix)
      /\.map$/,                  // *.map source maps
      /^dist\//,                 // dist/**
      /^build\//,                // build/**
      /^node_modules\//,         // node_modules/**
      /^vendor\//,               // vendor/**
      /^\.next\//,               // .next/**
      /^\.nuxt\//,               // .nuxt/**
      /^coverage\//,             // coverage/**
      /^__generated__\//,        // __generated__/**
      /\.pb\.go$/,               // *.pb.go protobuf output
    ];

    /**
     * Detect whether a diff path is a generated/lockfile/vendored file.
     * Called during `parse.ts:toDiffModel` for each file; result populates `DiffFile.generated`.
     * Phase 4/5 MCP tools filter on this flag by default (DIFF-04 LLM exclusion).
     */
    export function isGeneratedFile(filePath: string): boolean {
      return GENERATED_PATTERNS.some(p =>
        typeof p === 'string'
          ? filePath === p || filePath.endsWith('/' + p)
          : p.test(filePath)
      );
    }
    ```

    Run: `pnpm --filter @review/server test -- --run generated-file-detection` and confirm GREEN (all ~35 cases pass).
  </action>
  <verify>
    <automated>pnpm --filter @review/server test -- --run generated-file-detection</automated>
  </verify>
  <acceptance_criteria>
    - File `server/src/ingest/generated-file-detection.ts` exists and exports `isGeneratedFile`
    - `grep -c "GENERATED_PATTERNS" server/src/ingest/generated-file-detection.ts` returns 1
    - `grep -c "export function isGeneratedFile" server/src/ingest/generated-file-detection.ts` returns 1
    - Test file `server/src/ingest/__tests__/generated-file-detection.test.ts` contains ≥35 test cases (positives + negatives)
    - `pnpm --filter @review/server test -- --run generated-file-detection` exits 0
    - File has zero runtime imports (pure function — `grep -c "^import" server/src/ingest/generated-file-detection.ts` returns 0 or only type-only imports)
  </acceptance_criteria>
  <done>
    Pure `isGeneratedFile` detector with the full CONTEXT D-13 allowlist. ≥35 test cases pass covering positives, negatives, and edge cases (substring-not-prefix, non-lock package.json, .min. extension requirement).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire isGeneratedFile into parse.ts::toDiffModel and add regression test</name>
  <files>
    - server/src/ingest/parse.ts
    - server/src/ingest/__tests__/parse-generated.test.ts
  </files>
  <read_first>
    - server/src/ingest/parse.ts — entire file; find the `toDiffModel` function and the exact location where the DiffFile object literal is constructed (approximately lines 95-103 per 03-PATTERNS.md)
    - .planning/phases/03-diff-ui-file-tree-navigation/03-PATTERNS.md — "server/src/ingest/parse.ts — inject generated flag" section
    - shared/types.ts — `DiffFile.generated` is now required (Plan 03-01 Task 1)
  </read_first>
  <behavior>
    After edit:
    - `toDiffModel(diffWithLockfile)` produces a DiffFile with `generated: true` for `package-lock.json`.
    - `toDiffModel(diffWithSrcFile)` produces a DiffFile with `generated: false` for `src/app.ts`.
    - All existing parse tests continue to pass (no field renames, no behavioral change).
    - TypeScript compile clean across the server workspace now that `DiffFile.generated` is required.
  </behavior>
  <action>
    Step 1 — Edit `server/src/ingest/parse.ts`:

    1. Add import at top (after existing imports):
       ```typescript
       import { isGeneratedFile } from './generated-file-detection.js';
       ```

    2. Find the DiffFile object literal in `toDiffModel` (the return block per 03-PATTERNS.md, approximately lines 95-103). Add a `generated` field after `hunks`:
       ```typescript
       return {
         id: fileId,
         path,
         oldPath: f.from && f.to && f.from !== f.to ? f.from : undefined,
         status,
         binary,
         hunks,
         generated: isGeneratedFile(path),   // Phase 3 D-14
       };
       ```

    Do NOT change any other line of parse.ts. Existing tests against hunk IDs, line IDs, diff position, side assignment, context-line handling are all correct.

    Step 2 — RED: Create `server/src/ingest/__tests__/parse-generated.test.ts`:

    ```typescript
    import { describe, it, expect } from 'vitest';
    import { toDiffModel } from '../parse.js';

    // Minimal unified-diff fixture strings
    const DIFF_LOCKFILE = `diff --git a/package-lock.json b/package-lock.json
    index abc..def 100644
    --- a/package-lock.json
    +++ b/package-lock.json
    @@ -1,3 +1,3 @@
     line1
    -line2
    +line2-new
     line3
    `;

    const DIFF_SRC = `diff --git a/src/app.ts b/src/app.ts
    index abc..def 100644
    --- a/src/app.ts
    +++ b/src/app.ts
    @@ -1,3 +1,3 @@
     const x = 1;
    -console.log('old');
    +console.log('new');
     export { x };
    `;

    describe('toDiffModel — generated flag (Phase 3 DIFF-04)', () => {
      it('marks package-lock.json as generated', () => {
        const model = toDiffModel(DIFF_LOCKFILE);
        const file = model.files.find(f => f.path === 'package-lock.json');
        expect(file).toBeDefined();
        expect(file!.generated).toBe(true);
      });
      it('marks src/app.ts as NOT generated', () => {
        const model = toDiffModel(DIFF_SRC);
        const file = model.files.find(f => f.path === 'src/app.ts');
        expect(file).toBeDefined();
        expect(file!.generated).toBe(false);
      });
    });
    ```

    Run: `pnpm --filter @review/server test -- --run parse-generated` and confirm both tests GREEN (assuming Task 1 was completed first).

    Step 3 — Verify all existing parse tests still pass:
    ```
    pnpm --filter @review/server test -- --run parse
    ```

    No existing test should break. If any test constructs a `DiffFile` literal inline (not via `toDiffModel`), it will fail type-check because `generated` is now required — update that test to include `generated: false`.
  </action>
  <verify>
    <automated>pnpm --filter @review/server test -- --run parse</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "isGeneratedFile" server/src/ingest/parse.ts` returns ≥1 (the call in toDiffModel)
    - `grep -c "generated: isGeneratedFile" server/src/ingest/parse.ts` returns 1
    - Test file `server/src/ingest/__tests__/parse-generated.test.ts` exists and 2 tests pass
    - `pnpm --filter @review/server test -- --run parse` exits 0 (all parse tests pass, new + existing)
    - `pnpm --filter @review/server tsc --noEmit` exits 0 (type compile clean)
  </acceptance_criteria>
  <done>
    `toDiffModel` populates `DiffFile.generated` by calling `isGeneratedFile(path)`. Regression test proves lockfile=true, source=false. All existing parse tests still pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add fetchExistingComments + resolveCommentAnchor in github.ts</name>
  <files>
    - server/src/ingest/github.ts
    - server/src/ingest/__tests__/comments.test.ts
  </files>
  <read_first>
    - server/src/ingest/github.ts — entire file; note the existing `execa` calls (lines 52-56), the `mapGhError` helper (lines 84-99), and the exports list
    - .planning/phases/03-diff-ui-file-tree-navigation/03-PATTERNS.md — "server/src/ingest/github.ts — add fetchExistingComments and fetchCIChecks" section has the exact code to copy
    - .planning/phases/03-diff-ui-file-tree-navigation/03-RESEARCH.md — Q5 (GitHub API shape + anchor resolution + pagination)
    - .planning/phases/03-diff-ui-file-tree-navigation/03-CONTEXT.md — D-20 (source), D-22 (orphan logging — stderr, count only), D-23 (local-branch skip)
    - shared/types.ts — ReadOnlyComment shape (from Plan 03-01)
    - server/src/logger.ts — (if exists) — logger.warn is stderr; otherwise use the existing logger pattern in manager.ts
  </read_first>
  <behavior>
    After edit:
    - `fetchExistingComments(owner, repo, prNumber, diffModel)` returns `ReadOnlyComment[]`.
    - Each returned comment has `lineId` set to a valid `DiffLine.id` from the diff model, OR `null` if the comment's `(path, line, side)` does not resolve to a line in the current diff (orphan — hidden per D-22).
    - Orphans are counted and logged via `logger.warn("Skipped N orphan comments")` (stderr only per Phase 1 AP2 anti-pattern) — NEVER via `console.log`.
    - Orphan log contains only the count (integer), never comment body / author / id (T-3-07 mitigation).
    - Pagination is handled via `gh api --paginate` (D-20).
    - Anchor resolution matches Pitfall 12: context lines (`side: 'BOTH'`) are valid targets for existing comments (LEFT-side comment on a context line resolves).
    - On gh CLI failure, the function throws via `mapGhError` (reused from existing pattern).
    - Top-level reviews (from `/pulls/{n}/reviews`) with non-empty `body` ARE normalized and included in output with `lineId: null` (they have no diff anchor); they are filtered out by the "only render comments with resolved lineId" rule in Plan 03-03.
  </behavior>
  <action>
    Step 1 — RED: Create `server/src/ingest/__tests__/comments.test.ts` with tests for anchor resolution (pure function) + orphan handling. The `execa` call path is integration-like and harder to mock; focus tests on the pure `resolveCommentAnchor` function and the orphan-count logging path via a mocked execa.

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest';
    import type { DiffModel } from '../../../../shared/types.js';

    // Mock execa at the module level so fetchExistingComments uses a deterministic stub
    vi.mock('execa', () => ({
      execa: vi.fn(),
    }));

    // Also mock the logger so we can assert orphan-count logging
    vi.mock('../../logger.js', () => ({
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
      },
    }));

    import { execa } from 'execa';
    import { logger } from '../../logger.js';
    import { fetchExistingComments, resolveCommentAnchor } from '../github.js';

    const sampleDiff: DiffModel = {
      totalHunks: 1,
      files: [{
        id: 'abc123def456',
        path: 'src/app.ts',
        status: 'modified',
        binary: false,
        generated: false,
        hunks: [{
          id: 'abc123def456:h0',
          header: '@@ -1,3 +1,3 @@',
          lines: [
            { id: 'abc123def456:h0:l0', kind: 'context', side: 'BOTH', fileLine: 1, diffPosition: 1, text: 'line1' },
            { id: 'abc123def456:h0:l1', kind: 'del', side: 'LEFT', fileLine: 2, diffPosition: 2, text: 'old' },
            { id: 'abc123def456:h0:l2', kind: 'add', side: 'RIGHT', fileLine: 2, diffPosition: 3, text: 'new' },
          ],
        }],
      }],
    };

    describe('resolveCommentAnchor', () => {
      it('resolves a RIGHT comment on an added line', () => {
        const id = resolveCommentAnchor(
          { id: 1, path: 'src/app.ts', line: 2, original_line: 2, side: 'RIGHT', user: {login:'x'}, body: '', created_at: '', html_url: '', in_reply_to_id: null },
          sampleDiff
        );
        expect(id).toBe('abc123def456:h0:l2');
      });
      it('resolves a LEFT comment on a context line (Pitfall 12)', () => {
        const id = resolveCommentAnchor(
          { id: 1, path: 'src/app.ts', line: 1, original_line: 1, side: 'LEFT', user: {login:'x'}, body: '', created_at: '', html_url: '', in_reply_to_id: null },
          sampleDiff
        );
        expect(id).toBe('abc123def456:h0:l0');
      });
      it('returns null when path is not in the diff (orphan)', () => {
        const id = resolveCommentAnchor(
          { id: 1, path: 'src/gone.ts', line: 2, original_line: 2, side: 'RIGHT', user: {login:'x'}, body: '', created_at: '', html_url: '', in_reply_to_id: null },
          sampleDiff
        );
        expect(id).toBeNull();
      });
      it('falls back to original_line when line is null', () => {
        const id = resolveCommentAnchor(
          { id: 1, path: 'src/app.ts', line: null, original_line: 2, side: 'LEFT', user: {login:'x'}, body: '', created_at: '', html_url: '', in_reply_to_id: null },
          sampleDiff
        );
        expect(id).toBe('abc123def456:h0:l1');
      });
    });

    describe('fetchExistingComments', () => {
      beforeEach(() => {
        vi.mocked(execa).mockReset();
        vi.mocked(logger.warn).mockReset();
      });

      it('normalizes inline comments and sets lineId from anchor resolution', async () => {
        vi.mocked(execa)
          .mockResolvedValueOnce({ stdout: JSON.stringify([
            { id: 10, path: 'src/app.ts', line: 2, original_line: 2, side: 'RIGHT', user: { login: 'alice' }, body: 'nit', created_at: '2026-04-01T00:00:00Z', html_url: 'https://x/10', in_reply_to_id: null },
          ]), exitCode: 0 } as any)
          .mockResolvedValueOnce({ stdout: JSON.stringify([]), exitCode: 0 } as any);
        const out = await fetchExistingComments('o', 'r', 1, sampleDiff);
        expect(out).toHaveLength(1);
        expect(out[0].lineId).toBe('abc123def456:h0:l2');
        expect(out[0].author).toBe('alice');
        expect(out[0].body).toBe('nit');
      });

      it('counts and stderr-logs orphan comments (T-3-07: count only, no PII)', async () => {
        vi.mocked(execa)
          .mockResolvedValueOnce({ stdout: JSON.stringify([
            { id: 20, path: 'gone.ts', line: 5, original_line: 5, side: 'RIGHT', user: { login: 'bob' }, body: 'SECRET', created_at: '', html_url: '', in_reply_to_id: null },
          ]), exitCode: 0 } as any)
          .mockResolvedValueOnce({ stdout: JSON.stringify([]), exitCode: 0 } as any);
        await fetchExistingComments('o', 'r', 1, sampleDiff);
        const call = vi.mocked(logger.warn).mock.calls[0];
        const logged = call?.join(' ') ?? '';
        expect(logged).toMatch(/orphan/i);
        expect(logged).toMatch(/1/);
        // T-3-07: never log body/author in orphan count message
        expect(logged).not.toContain('SECRET');
        expect(logged).not.toContain('bob');
      });

      it('uses gh api --paginate for comments', async () => {
        vi.mocked(execa)
          .mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as any)
          .mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as any);
        await fetchExistingComments('o', 'r', 1, sampleDiff);
        const firstCall = vi.mocked(execa).mock.calls[0];
        expect(firstCall[0]).toBe('gh');
        expect(firstCall[1]).toContain('api');
        expect(firstCall[1]).toContain('--paginate');
      });
    });
    ```

    Run: test should FAIL (RED) since `resolveCommentAnchor` and `fetchExistingComments` don't exist yet.

    Step 2 — GREEN: Edit `server/src/ingest/github.ts`. Add the following (pattern per 03-PATTERNS.md):

    1. Add imports at top (alongside existing imports):
       ```typescript
       import type { ReadOnlyComment, DiffModel, LineSide } from '../../../shared/types.js';
       ```

    2. Add the `GhInlineComment` interface (internal — NOT exported):
       ```typescript
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
       ```

    3. Add `resolveCommentAnchor` as an EXPORTED pure function (exported specifically to unit-test it independently of execa):
       ```typescript
       // Source: CONTEXT D-20 + RESEARCH Q5 anchor resolution pattern.
       // Pitfall 12: context lines (side=BOTH) are valid targets for existing comments.
       export function resolveCommentAnchor(comment: GhInlineComment, diffModel: DiffModel): string | null {
         const file = diffModel.files.find(f => f.path === comment.path);
         if (!file) return null;
         const targetLine = comment.line ?? comment.original_line;
         const targetSide = comment.side as LineSide;
         for (const hunk of file.hunks) {
           for (const line of hunk.lines) {
             if (line.fileLine === targetLine && line.side === targetSide) return line.id;
           }
           // Context lines appear as side=BOTH — a LEFT comment on a context line is valid (Pitfall 12)
           for (const line of hunk.lines) {
             if (line.kind === 'context' && line.fileLine === targetLine) return line.id;
           }
         }
         return null;
       }
       ```

    4. Add `fetchExistingComments` as an exported async function:
       ```typescript
       // Source: CONTEXT D-20 + D-22 + RESEARCH Q5.
       // --paginate per Pitfall 22 (large PRs with many reviewers).
       export async function fetchExistingComments(
         owner: string,
         repo: string,
         prNumber: number,
         diffModel: DiffModel,
       ): Promise<ReadOnlyComment[]> {
         try {
           const [inlineRaw, reviewsRaw] = await Promise.all([
             execa('gh', ['api', '--paginate', `repos/${owner}/${repo}/pulls/${prNumber}/comments`]),
             execa('gh', ['api', '--paginate', `repos/${owner}/${repo}/pulls/${prNumber}/reviews`]),
           ]);
           const inline = JSON.parse(inlineRaw.stdout) as GhInlineComment[];
           interface GhReview { id: number; user: { login: string }; body: string; submitted_at?: string; html_url: string }
           const reviews = JSON.parse(reviewsRaw.stdout) as GhReview[];

           let orphanCount = 0;
           const inlineNormalized: ReadOnlyComment[] = inline.map(c => {
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

           const topLevelNormalized: ReadOnlyComment[] = reviews
             .filter(r => r.body && r.body.length > 0)
             .map(r => ({
               id: r.id,
               lineId: null,                // top-level reviews have no diff anchor
               path: '',
               line: null,
               side: 'BOTH' as const,
               author: r.user.login,
               createdAt: r.submitted_at ?? '',
               body: r.body,
               htmlUrl: r.html_url,
             }));

           if (orphanCount > 0) {
             // T-3-07: log count only, never body or author
             logger.warn(`Skipped ${orphanCount} orphan comments`);
           }
           return [...inlineNormalized, ...topLevelNormalized];
         } catch (err) {
           throw mapGhError(err);
         }
       }
       ```

    Make sure `logger` is imported at the top (it may already be present from Phase 1). If not:
       ```typescript
       import { logger } from '../logger.js';
       ```

    Step 3 — Run tests GREEN:
    ```
    pnpm --filter @review/server test -- --run comments
    ```
  </action>
  <verify>
    <automated>pnpm --filter @review/server test -- --run comments</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export async function fetchExistingComments" server/src/ingest/github.ts` returns 1
    - `grep -c "export function resolveCommentAnchor" server/src/ingest/github.ts` returns 1
    - `grep -c "'--paginate'" server/src/ingest/github.ts` ≥ 2 (both comments and reviews URLs paginate)
    - `grep -c "Skipped .* orphan" server/src/ingest/github.ts` returns 1 (stderr log format)
    - `grep -c "console.log" server/src/ingest/github.ts` returns 0 (AP2 anti-pattern — all logging via `logger`)
    - `grep -c "\\$\\{owner\\}/\\$\\{repo\\}" server/src/ingest/github.ts` ≥ 1 (owner/repo used in gh api path — not shell-interpolated)
    - `grep -c "sh -c" server/src/ingest/github.ts` returns 0 (T-3-04)
    - Test file `server/src/ingest/__tests__/comments.test.ts` exists and all tests pass
    - `pnpm --filter @review/server test -- --run comments` exits 0
  </acceptance_criteria>
  <done>
    `fetchExistingComments` + `resolveCommentAnchor` are implemented and exported. Pagination flag present. Orphan count logged via `logger.warn` (stderr). Context-line anchor resolution covered by test. No shell injection.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Add fetchCIChecks (with exit-code-8 handling and correct field names)</name>
  <files>
    - server/src/ingest/github.ts
    - server/src/ingest/__tests__/ci-checks.test.ts
  </files>
  <read_first>
    - server/src/ingest/github.ts — the file after Task 3 edits (for the pattern of adding a new exported async function)
    - .planning/phases/03-diff-ui-file-tree-navigation/03-PATTERNS.md — "server/src/ingest/github.ts" section, `fetchCIChecks` example verbatim
    - .planning/phases/03-diff-ui-file-tree-navigation/03-RESEARCH.md — Q6 (the field-name correction — bucket/link NOT conclusion/detailsUrl) + Pitfall B (exit code 8)
    - .planning/phases/03-diff-ui-file-tree-navigation/03-CONTEXT.md — D-24 (the ORIGINAL wrong field names — IGNORE — PROJECT.md correction row records this)
    - shared/types.ts — `CheckRun { name, bucket, link }` and `CIStatus { aggregate, checks }`
  </read_first>
  <behavior>
    After edit:
    - `fetchCIChecks(prNumber)` returns `CIStatus`.
    - Uses `gh pr checks <prNumber> --json name,state,bucket,link` (NOT `conclusion,detailsUrl` — those field names do not exist in `gh pr checks`).
    - Exit code 8 is caught and `stdout` is parsed anyway (checks pending).
    - Any other non-zero exit throws via `mapGhError`.
    - Aggregate logic:
      - Empty checks → `aggregate: 'none'`
      - Any `fail` → `aggregate: 'fail'`
      - No fail + any `pending` → `aggregate: 'pending'`
      - Otherwise → `aggregate: 'pass'`
  </behavior>
  <action>
    Step 1 — RED: Create `server/src/ingest/__tests__/ci-checks.test.ts`:

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    vi.mock('execa', () => ({ execa: vi.fn() }));
    vi.mock('../../logger.js', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

    import { execa } from 'execa';
    import { fetchCIChecks } from '../github.js';

    describe('fetchCIChecks', () => {
      beforeEach(() => vi.mocked(execa).mockReset());

      it('uses the correct --json field names (bucket,link NOT conclusion,detailsUrl)', async () => {
        vi.mocked(execa).mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as any);
        await fetchCIChecks(42);
        const call = vi.mocked(execa).mock.calls[0];
        expect(call[0]).toBe('gh');
        expect(call[1]).toContain('pr');
        expect(call[1]).toContain('checks');
        expect(call[1]).toContain('42');
        const jsonIdx = call[1].indexOf('--json');
        expect(jsonIdx).toBeGreaterThan(-1);
        const fields = call[1][jsonIdx + 1] as string;
        expect(fields).toMatch(/\bbucket\b/);
        expect(fields).toMatch(/\blink\b/);
        expect(fields).not.toMatch(/\bconclusion\b/);
        expect(fields).not.toMatch(/\bdetailsUrl\b/);
      });

      it('returns aggregate=none for empty checks', async () => {
        vi.mocked(execa).mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as any);
        const r = await fetchCIChecks(1);
        expect(r.aggregate).toBe('none');
        expect(r.checks).toEqual([]);
      });

      it('returns aggregate=pass when all checks pass', async () => {
        vi.mocked(execa).mockResolvedValueOnce({ stdout: JSON.stringify([
          { name: 'test', bucket: 'pass', link: 'https://x' },
          { name: 'lint', bucket: 'pass', link: 'https://y' },
        ]), exitCode: 0 } as any);
        const r = await fetchCIChecks(1);
        expect(r.aggregate).toBe('pass');
        expect(r.checks).toHaveLength(2);
      });

      it('returns aggregate=fail when any check fails', async () => {
        vi.mocked(execa).mockResolvedValueOnce({ stdout: JSON.stringify([
          { name: 'test', bucket: 'pass', link: '' },
          { name: 'lint', bucket: 'fail', link: '' },
        ]), exitCode: 0 } as any);
        expect((await fetchCIChecks(1)).aggregate).toBe('fail');
      });

      it('returns aggregate=pending when any check is pending and none fail', async () => {
        vi.mocked(execa).mockResolvedValueOnce({ stdout: JSON.stringify([
          { name: 'test', bucket: 'pass', link: '' },
          { name: 'lint', bucket: 'pending', link: '' },
        ]), exitCode: 0 } as any);
        expect((await fetchCIChecks(1)).aggregate).toBe('pending');
      });

      it('parses stdout on exit code 8 (checks pending — not an error per RESEARCH Pitfall B)', async () => {
        const err = Object.assign(new Error('gh exit 8'), {
          stdout: JSON.stringify([{ name: 'test', bucket: 'pending', link: '' }]),
          exitCode: 8,
        });
        vi.mocked(execa).mockRejectedValueOnce(err);
        const r = await fetchCIChecks(1);
        expect(r.aggregate).toBe('pending');
        expect(r.checks).toHaveLength(1);
      });

      it('throws on real gh failure (non-8 exit code)', async () => {
        const err = Object.assign(new Error('auth failed'), {
          stderr: 'gh auth login required',
          stdout: '',
          exitCode: 4,
        });
        vi.mocked(execa).mockRejectedValueOnce(err);
        await expect(fetchCIChecks(1)).rejects.toThrow();
      });
    });
    ```

    Run: test should FAIL (RED).

    Step 2 — GREEN: Edit `server/src/ingest/github.ts` to add `fetchCIChecks`. Follow 03-PATTERNS.md verbatim:

    ```typescript
    // Source: CONTEXT D-24 + RESEARCH Q6 (field-name correction: bucket/link, not conclusion/detailsUrl).
    // CRITICAL: gh pr checks exits 8 when checks are pending — that is NOT an error (Pitfall B).
    // PROJECT.md D-24 correction row documents this at planning time.
    export async function fetchCIChecks(prNumber: number): Promise<CIStatus> {
      let stdout: string;
      try {
        const result = await execa('gh', [
          'pr', 'checks', String(prNumber),
          '--json', 'name,state,bucket,link',   // bucket NOT conclusion; link NOT detailsUrl
        ]);
        stdout = result.stdout;
      } catch (err) {
        const execaErr = err as { stdout?: string; exitCode?: number };
        if (execaErr.exitCode === 8 && typeof execaErr.stdout === 'string') {
          stdout = execaErr.stdout;   // 8 = checks pending — parse stdout anyway
        } else {
          throw mapGhError(err);
        }
      }
      interface GhCheckRun { name: string; bucket: string; link: string }
      const checks = JSON.parse(stdout) as GhCheckRun[];
      if (checks.length === 0) return { aggregate: 'none', checks: [] };
      const buckets = new Set(checks.map(c => c.bucket));
      const aggregate: CIStatus['aggregate'] =
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

    Add `CIStatus` and `CheckRun` imports at the top:
    ```typescript
    import type { CIStatus, CheckRun } from '../../../shared/types.js';
    ```
    (Combine with other type imports from the same module if already present.)

    Step 3 — Run: `pnpm --filter @review/server test -- --run ci-checks` — should GREEN.
  </action>
  <verify>
    <automated>pnpm --filter @review/server test -- --run ci-checks</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export async function fetchCIChecks" server/src/ingest/github.ts` returns 1
    - `grep -c "name,state,bucket,link" server/src/ingest/github.ts` returns 1
    - `grep -c "conclusion,detailsUrl" server/src/ingest/github.ts` returns 0 (wrong fields must not appear)
    - `grep -c "exitCode === 8" server/src/ingest/github.ts` returns 1 (Pitfall B mitigation)
    - Test file `server/src/ingest/__tests__/ci-checks.test.ts` exists; all 7 test cases pass
    - `pnpm --filter @review/server test -- --run ci-checks` exits 0
  </acceptance_criteria>
  <done>
    `fetchCIChecks` is implemented with the correct field names. Exit code 8 is handled as "pending". Aggregate logic covers empty/pass/fail/pending. All 7 test cases green.
  </done>
</task>

</tasks>

<verification>
Plan-wide verification after all 4 tasks complete:

```bash
# Server tests for this plan's scope
pnpm --filter @review/server test -- --run generated-file-detection
pnpm --filter @review/server test -- --run parse
pnpm --filter @review/server test -- --run comments
pnpm --filter @review/server test -- --run ci-checks

# Type compile — shared + server should be clean; web may fail only on the not-yet-added manager extension + /api/session/events route; Plan 03-02b closes that gap
pnpm --filter @review/shared tsc --noEmit
pnpm --filter @review/server tsc --noEmit

# Grep invariants
grep -c "conclusion,detailsUrl" server/src/ingest/github.ts     # → 0
grep -c "name,state,bucket,link" server/src/ingest/github.ts    # → 1
grep -c "console.log" server/src/ingest/github.ts               # → 0 (AP2)
grep -c "sh -c" server/src/ingest/github.ts                      # → 0 (T-3-04)
grep -c "export async function fetchExistingComments" server/src/ingest/github.ts  # → 1
grep -c "export function resolveCommentAnchor" server/src/ingest/github.ts         # → 1
grep -c "export async function fetchCIChecks" server/src/ingest/github.ts          # → 1
```
</verification>

<success_criteria>
- All 4 tasks green.
- `isGeneratedFile` is a pure detector; `parse.ts` wires it into every `DiffFile`.
- `fetchExistingComments` + `resolveCommentAnchor` + `fetchCIChecks` are exported from `github.ts` with correct field names, pagination, and exit-code-8 handling.
- Plan 03-02b can now consume these three exports from the manager extension.
</success_criteria>

<output>
After completion, create `.planning/phases/03-diff-ui-file-tree-navigation/03-02a-SUMMARY.md` with:
- Actual generated-file-detection test count (positives + negatives)
- Confirmation that `gh pr checks --json name,state,bucket,link` is the ONLY gh command form used (no `conclusion,detailsUrl` anywhere)
- Confirmation that orphan-comment log format is `Skipped N orphan comments` with no PII
- Any Phase-2 test that needed tweaking because `DiffFile.generated` is now required (should be near-zero given the type is additive)
- Explicit pointer to Plan 03-02b as the consumer of the three new exports
</output>
