# Phase 3 Test Fixtures

Committed fixtures driving Plan 03-03's DiffViewer render test and validating
Open Decision 1's bespoke renderer (D-05). Generator owned by Plan 03-02b.

## Contents

- `diff-model.fixture.json` — A `DiffModel` matching `shared/types.ts`.
- `shiki-tokens.fixture.json` — A `Record<string, ShikiFileTokens>` keyed by `DiffFile.id`.

## Constraints (D-09 / UI-SPEC)

- 5–10 files; 30–50 hunks total
- At least one file with `generated: true` (lockfile)
- At least one renamed file (`status === 'renamed'`, `oldPath` populated)
- At least one file with ≥5 hunks
- Mixed languages: TypeScript, JavaScript, JSON, Markdown

## Regenerating

```sh
pnpm dlx tsx scripts/generate-fixture.ts <pr-url-or-number>
# or, if running from the server workspace:
pnpm --filter server exec tsx ../scripts/generate-fixture.ts <pr-url-or-number>
```

The script runs the real Phase-3 ingest pipeline (ingest → toDiffModel →
highlightHunks) on a live PR, writes the two JSON files to this directory, and
prints warnings for any D-09 constraint violations. It does NOT fail on
violations — it just warns; fix the source PR or hand-edit the fixture to
satisfy constraints.

## Source

Hand-synthesized during Plan 03-03 execution (not captured from a live PR).
The generator script landed in Plan 03-02b alongside this README revision; a
live capture can overwrite these files in any future run without code changes,
since the render test is structural and does not depend on specific file
paths or token colors beyond shape conformance.

## Current shape

- 6 files:
  - `src/app.ts` — 8 hunks, modified
  - `src/utils.ts` — 4 hunks, renamed from `src/helpers.ts`
  - `package-lock.json` — 6 hunks, `generated: true`
  - `README.md` — 1 hunk, modified
  - `src/api.ts` — 7 hunks, modified
  - `config/settings.json` — 6 hunks, modified
- Total hunks: 32 (within 30–50)
- `hasGenerated: true` (package-lock.json)
- `hasRenamed: true` (src/utils.ts ← src/helpers.ts)
- `hasBigHunk: true` (src/app.ts with 8 hunks, src/api.ts with 7)
- Every `DiffLine` has an exactly-one-token Shiki entry with a valid hex
  `color` field so the render test can assert visibility without relying on
  live Shiki output.
