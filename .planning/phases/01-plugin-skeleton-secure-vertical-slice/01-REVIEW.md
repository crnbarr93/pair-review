---
phase: 01-plugin-skeleton-secure-vertical-slice
status: issues_found
depth: standard
files_reviewed: 50
reviewed: 2026-04-19
findings:
  critical: 1
  warning: 8
  info: 9
  total: 18
---

# Phase 01 Code Review

**Reviewed:** 2026-04-19
**Depth:** standard
**Files:** 50 (server runtime + tests, web SPA + tests, plugin manifest, slash command, security probes)

## Summary

The vertical slice is well-structured: middleware order is defensible, the security probes script is real (not a placeholder), the token-validate double-submit logic is correct, idempotency in `SessionManager.startReview` is enforced, and the post-checkpoint fixes (CLAUDE_PLUGIN_ROOT path resolution, `&session=` URL plumbing, unified-diff envelope wrapping for `@git-diff-view/react`) are reflected in the code. The findings below are real bugs/safety items worth addressing before Phase 2 builds on this surface.

---

## Critical

### CR-01: `mountStatic` static-asset path may 404 when run from foreign cwd

**File:** `server/src/http/routes/static.ts:15-17`

The fix in `e7d6119` correctly moved off literal `'web/dist'` so MCP-spawned launches don't look in the user's cwd, but the implementation re-introduces the same class of bug from the other side. `@hono/node-server`'s `serveStatic({ root })` resolves `root` against `process.cwd()` and rejects (or fails to match) paths containing `..`. When the plugin runs from `/Users/x/proj` and `webDistDir()` returns `/Users/y/.claude/plugins/git-review-plugin/web/dist`, `path.relative` produces `../../../y/.claude/plugins/git-review-plugin/web/dist`. Depending on the `serve-static` version, either the traversal is refused or it joins back to cwd and looks in the wrong tree.

**Note:** During the human-verify walkthrough in 01-07 the diff rendered successfully, so in the specific cwd combination the user tested the relative path happened to resolve. However the e2e test never exercises asset URLs (only `GET /` which uses `renderIndex`, not `serveStatic`), so the bug is not regression-protected.

**Recommended fix:** Replace the `serveStatic` call with a custom `app.get('/assets/*')` handler that resolves an absolute path under `webDistDir()/assets`, rejects any path that escapes the assets dir (defense-in-depth against URL `..`), and reads via `node:fs/promises#readFile`. Add an integration test that boots from a non-plugin cwd and asserts `GET /assets/<hash>.js → 200`.

---

## Warnings

### WR-01: `repo-infer.ts` swallows error detail — auth failures look like "not in a repo"

**File:** `server/src/ingest/repo-infer.ts:15-22`

The catch block matches `err instanceof Error` (always true for execa rejections) and overwrites with a fixed string. A user whose `gh` is not authenticated and a user whose cwd is not a git repo both get the same generic message with no logged stderr. Mirror the `mapGhError` pattern from `ingest/github.ts` — read `err.stderr`, branch on `gh auth login` vs `not a git repository` vs unknown, and surface the right hint.

### WR-02: `ingest/local.ts:43` reports nonsense refs for diff-phase failures

**File:** `server/src/ingest/local.ts:41-44`

When rev-parse fails with "unknown revision", the catch builds `Unknown git ref. Check that ${fallback.replace('Invalid ref: ', '')} exist.` with `fallback = 'Invalid ref: ${base} or ${head}'`. That works for rev-parse, but `mapGitError` is also called from the diff phase with `fallback = 'git diff failed'` — so an "unknown revision" coming back from `git diff base...head` produces `Unknown git ref. Check that git diff failed exist.`. Inline different mappers per phase, or pass the refs explicitly so the message is interpretable in both contexts.

### WR-03: `paraphrase()` slice can split surrogate pairs at the truncation boundary

**File:** `server/src/mcp/tools/start-review.ts:71-73`

`stripped.slice(0, 277) + '...'` slices at JS code-unit position 277, which can split a surrogate pair if an astral character (emoji, etc.) sits at offset 276, producing a malformed string. Use `Array.from(stripped).slice(0, 277).join('') + '...'` or a grapheme-aware slicer.

### WR-04: SSE keep-alive loop has no shutdown coordination

**File:** `server/src/http/routes/events.ts:25-30`, `server/src/index.ts:30-33`

The `while (true)` keep-alive loop never observes `stream.onAbort` (the callback is registered but contains only a comment), so when SIGTERM arrives `httpServer.close()` waits indefinitely on every active SSE response. The 2-second `setTimeout(..., 2000).unref()` is the only thing that finalizes shutdown — every shutdown looks like a hang to the user. Track an `aborted` flag from `stream.onAbort` and break out of the loop:

```ts
let aborted = false;
stream.onAbort(() => { aborted = true; });
while (!aborted) {
  await stream.sleep(15_000);
  if (aborted) break;
  await stream.writeSSE({ event: 'ping', data: '' });
}
```

### WR-05: File-ID derivation loses rename relationship and has no cross-revision stability

**File:** `server/src/ingest/parse.ts:69`

`createHash('sha1').update(path).digest('hex').slice(0, 12)` is fine for single-PR identity but: (a) loses the rename relationship — a comment threaded against `old.ts:h0:l3` cannot be re-anchored after rename to `new.ts`, (b) sha1-12 has 48-bit collision space (effectively zero for one PR, but a downstream concern). Document the constraint in `shared/types.ts` so Phase 6's comment-anchoring work doesn't bake in a wrong assumption.

### WR-06: `fileLine` defaulting to `0` will silently break GitHub PR comment posting in Phase 6

**File:** `server/src/ingest/parse.ts:42-48`

The `?? 0` fallback hides a malformed-input case. Line 0 is invalid in GitHub's PR review comment API — Phase 6 will see opaque API errors. Replace with a parse-time error or `logger.warn` when a change has no line number.

### WR-07: `tokenValidate` uses non-constant-time string equality on a secret

**File:** `server/src/http/middleware/token-validate.ts:21`

`header !== cookie || header !== launchToken` short-circuits with non-constant-time comparison. On strict 127.0.0.1 loopback this is not exploitable in any realistic threat model, but if the surface ever grows beyond loopback the comparison should switch to `crypto.timingSafeEqual` over equal-length buffers. Add a code comment justifying the choice now so future refactors don't accidentally promote this surface.

### WR-08: `Promise.all` in `ingestGithub` leaks the second `gh` subprocess on first-failure

**File:** `server/src/ingest/github.ts:12-15`

If `gh pr view` rejects fast, `gh pr diff` keeps running until completion (its stdout is read then discarded). Not functional but keeps the network call alive past expectation. Use `Promise.allSettled` with explicit reject, or wire `AbortController` into `execa`'s `cancelSignal`.

---

## Info

### IN-01: `EmptyState`/`ErrorState` reference renamed `/review` command

**File:** `web/src/components/EmptyState.tsx:25`, `web/src/components/ErrorState.tsx:13,22`, `web/src/main.tsx:18,22`

User-facing copy says "Run `/review` again" but commit `d4320b4` renamed the command to `/pair-review`. Update all four sites for consistency.

### IN-02: React root mounts after `openEventStream` — fragile ordering

**File:** `web/src/main.tsx:29-43`

`useSyncExternalStore` re-reads state on subscribe so this is functionally correct (snapshot is in store by mount), but the ordering is fragile. Mount root first (in `loading` state), then call `openEventStream`. Bonus: user sees skeleton sooner.

### IN-03: `bootstrap()` swallows network vs 403 distinction

**File:** `web/src/main.tsx:20-24`

`fetch` rejection (TypeError on network failure) and 403 forbidden both render the same fatal. Distinguish with a `try/catch` around `adoptSession` for clearer hints.

### IN-04: `vite.config.ts:51` proxy port is `0` — non-functional dev mode

**File:** `web/vite.config.ts:50-52`

`proxy: { '/api': 'http://127.0.0.1:0' }` resolves to "no port"; any `/api/*` request from `vite dev` will fail. Either delete the proxy block (document that dev iteration requires the built bundle), or read the port from `VITE_API_PORT`.

### IN-05: `parseDiff` not wrapped in try/catch — malformed input bubbles to MCP response

**File:** `server/src/ingest/parse.ts:60`

A malformed diff (rare but possible if `gh pr diff` outputs partial data) throws out of `toDiffModel` straight to the MCP tool response. Wrap and rethrow with a friendlier message naming the source.

### IN-06: Shiki cache is unbounded

**File:** `server/src/highlight/shiki.ts:5,92`

`cache.set(key, tokens)` never evicts; key includes `headSha` so over the lifetime of a long-running plugin the cache grows monotonically with every PR fetch. Track for Phase 4+ (LRU or size-bounded eviction).

### IN-07: `paraphrase` placeholder uses an em-dash literal — confirm UTF-8 end-to-end

**File:** `server/src/mcp/tools/start-review.ts:54,76`

Both the MCP stdio JSON-RPC channel and the SSE stream are UTF-8, so this works today. Add a one-line code comment so a future contributor doesn't "fix" the dashes to ASCII.

### IN-08: `web/src/store.ts:29` accepts unused `_variant` parameter

**File:** `web/src/store.ts:29`

`onAdoptFailed(_variant: 'unreachable')` is only ever called with the literal `'unreachable'`. Either drop the parameter or actually use it (forwarding `errorVariant`).

### IN-09: `DiffView.spike.tsx` ships in production build

**File:** `web/src/components/DiffView.spike.tsx:1-41`

Header comment says "NOT referenced from production code", but Vite picks it up via the `src/**/*.{ts,tsx}` content glob. Move under `web/src/__tests__/spike/` or delete now that `DiffView.tsx` has the verified integration. Otherwise it's load-bearing-looking dead code that will rot.

---

## What Was Checked And Looked Good

- Middleware ordering (`hostValidate` → `secureHeaders` → `tokenValidate` scoped to `/api/*`) is correct; `host-validate.test.ts:66` ordering canary locks it down.
- CSP nonce flow end-to-end: Vite injects `nonce="__NONCE__"` post-build (`vite.config.ts:25-30`), `render-index.ts` substitutes per-request, `secureHeadersMw` emits the matching header.
- `crypto.randomBytes(32).toString('base64url')` for session tokens is the right primitive.
- Cookie attributes (`HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure=false` for loopback) are correctly justified and the `does NOT set Secure` test pins it.
- All shell-outs in `ingest/*.ts` use argv arrays (no shell interpolation) — T-05 holds.
- `prKey` filesystem sanitization in `persist/paths.ts:15` covers `/`, `#`, `:`, `\`.
- Deterministic opaque IDs in `parse.ts` are tested for stability across repeated parses.
- Idempotent `startReview` (D-21) verified by unit + integration tests; launch-once `Set` is correct.
- `logger` strictly stderr-only, locked by tests — protects the MCP JSON-RPC stdout channel.
- `bootstrap()` correctly does `history.replaceState` *before* opening the EventSource — T-03 token leak mitigated.

---

## Next Steps

`/gsd-code-review-fix 01` will auto-fix issues, or address selectively:

- **CR-01 should land before any Phase 2 work**: track as a P0 in Phase 2 planning. Add the integration test from a non-plugin cwd.
- **WR-01..WR-04 are reasonable Phase 2 scope** (error-message hygiene + SSE shutdown coordination). Phase 2's persistence work touches the SSE/manager seam anyway.
- **WR-05, WR-06 are Phase 6 prerequisites** — track in PROJECT.md as known limitations of the Phase 1 ID/line-number model.
- **WR-07, WR-08 are loopback-acceptable** — comment in source, defer to whenever surface expands.
- **IN-01 is a quick polish pass** — rename references in 5 minutes.
- **IN-09 (delete DiffView.spike.tsx)** is also a quick win.
