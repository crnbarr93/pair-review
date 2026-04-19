# Phase 3 Deferred Items

## Pre-existing test failures (out of scope for 03-01)

- `server/src/__tests__/end-to-end.test.ts` — fails with MODULE_NOT_FOUND error before ever reaching plan-03 changes. Verified by `git stash && npx vitest run src/__tests__/end-to-end.test.ts` reproducing the same failure on the pre-change worktree. Not caused by Phase 3 work; deferred.

## tsx + execa transitive-deps incompatibility on Node 24 (out of scope for 03-02b)

- `npx tsx scripts/generate-fixture.ts <pr>` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` on `unicorn-magic` (transitively imported by `execa@9.6.1`) when run on Node `24.10.0`. This is an environmental issue with tsx's register loader vs Node 24's stricter exports resolution, not a script bug. The script itself is well-formed TypeScript and its imports match the exact shape the server's `vitest`-driven test harness loads cleanly. A live regeneration run is expected to succeed on Node 22 LTS (the stack's target runtime per `.planning/PROJECT.md` Technology Stack) or once execa publishes a release that no longer depends on the older `unicorn-magic` version. The script does not need to actually execute for Plan 03-02b's success criteria — Plan 03-03's render test consumes the committed hand-synthesized fixtures, not live output.
