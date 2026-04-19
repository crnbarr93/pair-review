# Phase 3 Test Fixtures

Captured by `scripts/generate-fixture.ts` or hand-crafted per D-09 constraints.

## Contents

- `diff-model.fixture.json` — A `DiffModel` matching `shared/types.ts`.
- `shiki-tokens.fixture.json` — A `Record<string, ShikiFileTokens>` keyed by `DiffFile.id`.

## Constraints (D-09 / UI-SPEC)

- 5-10 files; 30-50 hunks total
- At least one file with `generated: true` (lockfile)
- At least one renamed file (`status === 'renamed'`, `oldPath` populated)
- At least one file with ≥5 hunks
- Mixed languages: TypeScript, JavaScript, JSON, Markdown

## Regenerating

`pnpm tsx scripts/generate-fixture.ts <pr-url-or-number>`

(The script warns on any constraint violation but still writes the output; fix the source PR or
hand-edit to satisfy constraints.)

## Source

Hand-synthesized for Plan 03-03 execution (Rule 3 unblock: Plan 03-02b's fixture-capture task
owns the canonical generator, but its output is checked in alongside this Plan's render test so
the test can load them directly. If 03-02b is executed later in the same wave, its capture step
should overwrite this synthetic fixture with a live-PR capture.)

## Current shape

- 6 files: `src/app.ts` (8 hunks), `src/utils.ts` (4, renamed from `src/helpers.ts`),
  `package-lock.json` (6, generated), `README.md` (1), `src/api.ts` (7), `config/settings.json` (6).
- Total hunks: 32 (within 30-50).
- Every `DiffLine` has an exactly-one-token Shiki entry with a valid hex `color` field so the
  render test can assert visibility without relying on live Shiki output.
