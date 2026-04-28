# Phase 7: Polish + Verification - Research

**Researched:** 2026-04-28
**Domain:** Test coverage gaps, auth identity display, port-in-use verification, PITFALLS checklist
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** SESS-04 (multi-session concurrency) is dropped from Phase 7 and moved to backlog.
- **D-02:** Auth identity: TopBar row 1 avatar badge (avatar circle + username), top-right next to Settings button. Fetch via `gh api user` at session start; cache it.
- **D-03:** Token mismatch warning: when `gh auth token` and `GITHUB_TOKEN` env var resolve to different GitHub users, show warning icon on badge with tooltip: "gh auth and GITHUB_TOKEN resolve to different users".
- **D-04:** Identity fetch is fail-open — if it fails, badge simply does not render. Never blocks session start.
- **D-05:** Mixed verification approach: automate mechanical items, manually verify subjective ones.
- **D-06:** Automate with integration tests: Pitfall 1 (anchor.test.ts — verify sufficient), Pitfall 6 (security headers — verify CSP completeness), Pitfall 8 (resume across browser close), Pitfall 9 (resume after force-push/new commits), Pitfall 10 (duplicate-submission guard), Pitfall 16 (port-in-use fallback).
- **D-07:** Manual verification (against a real PR): Pitfall 3 (signal-ratio warning fires), Pitfall 4 (default verdict is request_changes), Pitfall 5 (large-PR walkthrough doesn't choke), Pitfall 12 (pre-existing code guard), Pitfall 14 (walkthrough ordering covers core change first).
- **D-08:** Fix whatever the verification pass surfaces as broken or missing. Papercut scope is emergent.
- **D-09:** Phase 06.3 visual gaps (pixel-match, validity toggle, finding click scroll, gutter marker click) are NOT formally verified in Phase 7.

### Claude's Discretion

- Test infrastructure choices (extend existing test files vs new dedicated verification test file).
- Port-in-use fallback implementation details (retry count, port increment vs random).
- How to fetch GitHub user identity efficiently (gh api user, gh auth status, or parse from token).
- Whether to bundle the auth identity fetch into the existing start_review flow or as a separate server endpoint.

### Deferred Ideas (OUT OF SCOPE)

- **SESS-04 (multi-session concurrency)** — Dropped from Phase 7, moved to backlog. Preferred design if ever built: TopBar dropdown switcher with full LLM context switching via `switch_session` request type through the user-request queue.
- **Phase 06.3 visual verification** — 5 human-needed items deferred to organic daily-use discovery.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SESS-04 | User can run multiple concurrent review sessions in separate browser tabs and switch between them via a session-switcher UI | **DEFERRED TO BACKLOG per D-01.** Plan must acknowledge deferral explicitly and leave SESS-04 unchecked in traceability. |
</phase_requirements>

---

## Summary

Phase 7 is a verification and polish pass — not a feature-building phase. Its central activity is running the "looks done but isn't" PITFALLS checklist and fixing whatever breaks. Based on codebase inspection, significant automated test coverage already exists for several of the 11 checklist items; some items need new tests to be written, and the rest require manual verification against a real PR.

The three concrete deliverables are: (1) auth identity badge in the TopBar (completely new feature, small scope), (2) automated integration test gaps filled for Pitfalls 1/6/8/9/10/16, and (3) papercut repairs for anything the verification pass surfaces.

A notable pre-existing finding: the server already binds to `port: 0` (OS ephemeral assignment), which means Pitfall 16 (port-in-use) is architecturally solved at the server level. The test gap is simply verifying that behavior formally. Additionally, one pre-existing test failure exists: `start-review.test.ts` asserts the MCP server key is `git-review-plugin` but the plugin was renamed to `gr` in commit `cab19ef` — this stale assertion must be fixed in Phase 7.

**Primary recommendation:** Run all existing tests first to establish baseline, fix the stale `git-review-plugin` test assertion, then write the missing integration tests for Pitfalls 8, 9, and 16 (the three gaps), then implement the auth badge, then do the manual verification pass.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Auth identity fetch | API/Backend (SessionManager) | — | `gh auth token` and `gh api user` are CLI calls that must stay server-side; tokens never reach the browser |
| Auth badge rendering | Browser/Client (TopBar.tsx) | — | Pure display component; receives data via SSE snapshot |
| Auth identity caching | API/Backend (ReviewSession state) | — | Cached in ReviewSession so SSE delivers it; survives browser refresh |
| Token mismatch detection | API/Backend (identity fetch layer) | — | Comparison of `gh auth token` user vs `GITHUB_TOKEN` user is a server-side operation |
| Port-in-use fallback | API/Backend (index.ts) | — | Already handled by `port: 0` in Hono `serve()` |
| PITFALLS test coverage | Server test layer | — | Vitest integration tests in `server/src/` |
| Manual verification | Human (author) | — | Subjective quality checks require real PR + human judgment |

---

## Standard Stack

No new libraries are needed for Phase 7. The phase uses the project's existing stack exclusively.

### Core (existing — no additions)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `execa` | 8.x | Shell out to `gh api user` for identity fetch | Already used throughout `ingest/github.ts` for all `gh` CLI calls |
| `vitest` | current | Integration test framework | Existing test infrastructure; all server tests use it |
| `hono` | `4.12.14` | HTTP server | Existing; no change |
| `@hono/node-server` | latest | Node adapter | Existing; `port: 0` already used — OS assigns ephemeral port |

### No New Dependencies

The auth identity fetch uses the same `execa('gh', ['api', 'user', '--jq', '.login,.avatar_url'])` pattern already established in `ingest/github.ts`. The TopBar badge is pure React with existing CSS variables. No new npm packages are required.

**Version verification:** All packages already installed. [VERIFIED: codebase inspection]

---

## Architecture Patterns

### System Architecture Diagram

```
Session start (startReview)
        |
        v
  derivePrKey()
        |
        v
  [NEW] fetchAuthIdentity()        <-- gh api user + gh auth token comparison
        |  fail-open: null on error
        v
  ingestGithub() / persisted load
        |
        v
  applyEvent(authIdentity.set)     <-- stores in ReviewSession
        |
        v
  SSE snapshot → browser           <-- session.authenticatedUser delivered
        |
        v
  TopBar.tsx renders badge         <-- avatar circle + username OR empty

Port assignment (already solved):
  serve({ port: 0 })  →  OS assigns ephemeral port  →  manager.setHttpPort()
```

### Recommended Project Structure

No structural changes. New code lands in:

```
server/src/
├── ingest/
│   └── identity.ts          # NEW: fetchAuthIdentity() + detectTokenMismatch()
├── session/
│   └── manager.ts           # MODIFIED: call fetchAuthIdentity in startReview
├── __tests__/
│   └── pitfall-verify.test.ts  # NEW: Pitfalls 8, 9, 16 integration tests
web/src/
└── components/
    └── TopBar.tsx           # MODIFIED: render auth badge
shared/
└── types.ts                 # MODIFIED: add AuthIdentity + authenticatedUser to ReviewSession
```

### Pattern 1: Identity Fetch (new `server/src/ingest/identity.ts`)

**What:** Fetches `gh api user` for login + avatar, and optionally detects mismatch between `gh auth token` identity and `GITHUB_TOKEN` env var identity.

**When to use:** Called once per `startReview`, after `derivePrKey`, before browser launch. Fail-open.

```typescript
// Source: established execa pattern from server/src/ingest/github.ts
export interface AuthIdentity {
  login: string;
  avatarUrl: string;
  mismatch?: boolean;  // true if gh auth token user != GITHUB_TOKEN user
}

export async function fetchAuthIdentity(): Promise<AuthIdentity | null> {
  try {
    const { stdout } = await execa('gh', ['api', 'user', '--jq', '{login:.login,avatar_url:.avatar_url}']);
    const parsed = JSON.parse(stdout) as { login: string; avatar_url: string };
    const identity: AuthIdentity = { login: parsed.login, avatarUrl: parsed.avatar_url };

    // D-03: detect token mismatch
    const envToken = process.env.GITHUB_TOKEN;
    if (envToken) {
      identity.mismatch = await detectTokenMismatch(parsed.login, envToken);
    }
    return identity;
  } catch {
    return null;  // D-04: fail-open
  }
}

// Compare GITHUB_TOKEN identity against gh auth token identity
async function detectTokenMismatch(ghAuthLogin: string, envToken: string): Promise<boolean> {
  try {
    const { stdout } = await execa('gh', ['api', 'user', '--hostname', 'github.com'], {
      env: { ...process.env, GH_TOKEN: envToken },
    });
    const envUser = JSON.parse(stdout) as { login: string };
    return envUser.login !== ghAuthLogin;
  } catch {
    return false;  // mismatch detection itself fails open
  }
}
```

**Note:** `gh api user` fields verified by running `gh api user --jq '.login,.avatar_url'` locally — returns `crnbarr93` and the avatar URL. [VERIFIED: live gh CLI output]

### Pattern 2: Port-in-use (already implemented)

The server already uses `serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' })` in `server/src/index.ts` line 37. Port 0 means the OS assigns a free ephemeral port — Pitfall 16 is architecturally solved. The only gap is a formal test asserting this behavior.

```typescript
// Source: server/src/index.ts (existing)
const httpServer = serve(
  { fetch: app.fetch, port: 0, hostname: '127.0.0.1' },
  (info) => {
    manager.setHttpPort(info.port);
    // ...
  }
);
```

The integration test for this should start two server instances and verify both get distinct non-zero ports.

### Pattern 3: Resume-across-browser-close (Pitfall 8) — existing but needs end-to-end test

`SessionManager.startReview` already loads from disk via `readState(prKey)` on path (2) (line 94). The crash tests in `store.crash.test.ts` verify atomic writes. What's missing is a test that verifies the full resume flow: write state → restart server → confirm state is restored from disk.

### Pattern 4: Stale-diff on resume (Pitfall 9) — existing logic, needs verification test

`SessionManager.startReview` already does SHA comparison (lines 103-113 in `manager.ts`) and produces `staleDiff` when mismatched. The `session-resume.test.ts` covers the HTTP handler for the choose-resume endpoint. What's missing is a test that verifies the stale-diff path is entered when the persisted SHA differs from the "current" SHA.

### Pattern 5: Duplicate submission guard (Pitfall 10) — already tested

`confirm-submit.test.ts` line 147-169 covers the 409 response when `submissionState.status === 'submitted'`. The `submissionId` is embedded as an HTML comment in the review body via `octokit-submit.ts`. This Pitfall's automated coverage is sufficient.

### Anti-Patterns to Avoid

- **Blocking session start on identity fetch failure:** D-04 says fail-open. Never `throw` from `fetchAuthIdentity` — always return `null` on error.
- **Putting `gh` token in `ReviewSession` state:** Identity data is `{ login, avatarUrl, mismatch }` only. Tokens never leave the server process memory.
- **Adding `console.log` to the MCP server:** Corrupts the JSON-RPC stdio channel. Always use `logger.error` (stderr) per the established pattern.
- **Re-fetching identity on every SSE reconnect:** Cache identity in `ReviewSession` so it survives browser refresh without a new `gh` CLI call.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Port-in-use fallback | Custom retry loop on EADDRINUSE | `serve({ port: 0 })` (already done) | OS ephemeral assignment is infallible; custom retry adds complexity with no benefit |
| GitHub user identity | Custom token parsing / JWT decode | `gh api user` via execa | Same auth surface as the rest of the plugin; no new credentials surface |
| Token mismatch comparison | Custom REST call | `gh api user` with `GH_TOKEN` env override | `gh` handles auth edge cases (org SSO, PAT scopes) correctly |
| State persistence verification | Custom file-watcher test | Vitest + tmp dir + `readState()` | Existing store.test.ts pattern works; see `writeState/readState` round-trip test |

**Key insight:** This phase explicitly avoids building anything new. Every tool needed already exists in the codebase.

---

## Runtime State Inventory

> Phase 7 is a polish/verification phase, not a rename/migration. No runtime state inventory needed.

Omitted — greenfield additions and test coverage work only.

---

## Common Pitfalls

### Pitfall A: Pre-existing test failure blocks CI baseline

**What goes wrong:** The `start-review.test.ts` test `plugin manifest structure > .claude-plugin/plugin.json exists and has required keys` currently fails because it asserts the MCP server key is `git-review-plugin` but the plugin was renamed to `gr` in commit `cab19ef`. Running verification against a broken baseline is misleading.

**Why it happens:** Test was written when the plugin was called `git-review-plugin`; rename commit didn't update the test assertion.

**How to avoid:** Fix this stale assertion as the **first task** of Phase 7 before any other verification work. The fix is a one-line string change in `start-review.test.ts` line 190.

**Warning signs:** `npx vitest run` shows 1 failure before any Phase 7 changes are applied.

### Pitfall B: Pitfall 16 (port-in-use) misunderstood as "not implemented"

**What goes wrong:** Planner creates a task to "implement port fallback" when it's already done via `port: 0`. Work is wasted re-implementing what exists.

**Why it happens:** The pitfall description in PITFALLS.md says "avoid hardcoded port" — it's easy to assume the code hardcodes a port without reading index.ts.

**How to avoid:** The only work needed for Pitfall 16 is a verification test. No implementation required.

**Warning signs:** Any task description that says "add port fallback logic to index.ts".

### Pitfall C: Auth identity fetch becomes synchronous on the hot path

**What goes wrong:** `fetchAuthIdentity()` calls `gh api user` which is a network call. If it blocks `startReview` before returning the session to the LLM, session startup feels slow.

**Why it happens:** `startReview` is already sequential for ingest. Adding another CLI call extends the blocking period.

**How to avoid:** Run identity fetch in parallel with other non-dependent startup work, or run it after the initial session snapshot is written so the browser gets the diff immediately and the auth badge appears on a subsequent SSE update. The decision of "parallel vs post-snapshot" is in Claude's Discretion (CONTEXT.md).

### Pitfall D: Mismatch detection adds second `gh api user` call with env token

**What goes wrong:** `detectTokenMismatch` fires an additional `execa` call that can fail if `GITHUB_TOKEN` is set but is for a different GitHub host (GHES). This causes the entire identity fetch to fail, violating the fail-open requirement.

**Why it happens:** Mismatch detection is itself a network call inside a fail-open wrapper.

**How to avoid:** Double-wrap: the mismatch detection is `try/catch` returning `false` on any error, independent of the outer `fetchAuthIdentity` try/catch. See Pattern 1 code example above.

### Pitfall E: Verification pass discovers real bugs mid-phase that weren't expected

**What goes wrong:** D-08 says "fix whatever the verification pass surfaces" but the planner already created a fixed set of tasks. A real bug found during manual verification has no task slot.

**Why it happens:** Emergent scope in a pre-planned task list.

**How to avoid:** The plan must include a dedicated "papercut repairs" wave with open-ended scope. The manual verification tasks should be structured as: "run manual check → if issue found → fix it before proceeding". The plan should not be a fixed list of pre-defined fixes.

---

## Code Examples

### Identity type addition to `shared/types.ts`

```typescript
// Source: established pattern from shared/types.ts (reviewed 2026-04-28)
export interface AuthIdentity {
  login: string;
  avatarUrl: string;
  mismatch: boolean;  // true = gh auth token and GITHUB_TOKEN are different users
}

// Add to ReviewSession (after existing Phase 06.1 additions):
// authenticatedUser?: AuthIdentity | null;  // null = fetch failed (fail-open)
```

### TopBar badge (in `web/src/components/TopBar.tsx`)

```tsx
// Source: existing TopBar.tsx pattern (reviewed 2026-04-28)
// Add after spacer div, before Settings button:
{authenticatedUser && (
  <div className="auth-badge" title={authenticatedUser.mismatch
    ? 'gh auth and GITHUB_TOKEN resolve to different users'
    : authenticatedUser.login
  }>
    {authenticatedUser.mismatch && <Ic.warning />}
    <img
      src={authenticatedUser.avatarUrl}
      alt={authenticatedUser.login}
      className="auth-avatar"
      width={20}
      height={20}
    />
    <span className="auth-login">{authenticatedUser.login}</span>
  </div>
)}
```

### Pitfall 16 verification test

```typescript
// Source: existing lifecycle.test.ts pattern (reviewed 2026-04-28)
// Verify OS ephemeral port assignment works when a preferred port is busy
it('server gets distinct port from OS when port 0 is requested', async () => {
  // Start two servers with port: 0
  // Verify both ports are non-zero and different
  // This proves OS-level ephemeral assignment works
  const port1 = await startTestServer();
  const port2 = await startTestServer();
  expect(port1).toBeGreaterThan(0);
  expect(port2).toBeGreaterThan(0);
  expect(port1).not.toBe(port2);
});
```

### Pitfall 8 resume test (missing — needs to be written)

```typescript
// Pattern: write state → reset in-memory → re-read from disk → confirm state restored
it('resume after server restart restores session state from disk', async () => {
  const prKey = 'gh:o/r#1';
  const testData = { prKey, lastEventId: 5, someField: 'persisted' };
  await writeState(prKey, testData);

  // Simulate server restart: clear in-memory session, re-read from disk
  const reloaded = await readState(prKey);
  expect(reloaded).not.toBeNull();
  expect((reloaded as typeof testData).lastEventId).toBe(5);
  expect((reloaded as typeof testData).someField).toBe('persisted');
});
```

### Pitfall 9 stale-diff test (missing — needs to be written)

```typescript
// Verify that staleDiff is set when stored SHA differs from fetched SHA
it('startReview sets staleDiff when head SHA has changed since last session', async () => {
  const storedSha = 'aaa111';
  const currentSha = 'bbb222';
  // Seed disk state with storedSha
  // Mock fetchCurrentHeadSha to return currentSha
  // Call manager.startReview
  // Assert session.staleDiff = { storedSha, currentSha }
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Auth identity deferred to v2 (`PLUG-V2-01` in REQUIREMENTS.md) | Pulled into v1 Phase 7 per D-02 | Phase 7 discuss | Small scope; completes the "visible identity" security UX story |
| Multi-session concurrency (SESS-04) assigned to Phase 7 | Deferred to backlog per D-01 | Phase 7 discuss | Reduces Phase 7 scope significantly |
| Plugin named `git-review-plugin` | Renamed to `gr` (commit `cab19ef`) | 2026-04-27 | One stale test assertion needs fixing |

**Deprecated/outdated:**
- `start-review.test.ts` assertion `expect(servers).toHaveProperty('git-review-plugin')` — stale since plugin rename. Fix to `'gr'`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `gh api user --jq '{login:.login,avatar_url:.avatar_url}'` returns a JSON object (not two lines) | Pattern 1 | If gh version < X uses different jq output format, parse will fail. Mitigation: test passes on installed gh 2.x. [VERIFIED: live output] |
| A2 | Setting `GH_TOKEN` env var in `execa` opts overrides auth for that call without affecting the parent process | Pattern 1 (mismatch detection) | If gh reads from a different env var for non-interactive use, mismatch detection silently fails open — acceptable per D-04. [ASSUMED: gh CLI behavior, not verified against docs] |
| A3 | The stale `git-review-plugin` assertion is the only rename-related test breakage | Common Pitfalls A | If other tests reference the old name, the baseline is more broken than assessed. Risk: LOW — grep of test files shows only one occurrence. |

---

## Open Questions

1. **Where exactly in `startReview` should `fetchAuthIdentity` be called?**
   - What we know: D-04 says fail-open; identity must land in ReviewSession before SSE snapshot; adding a CLI call extends startup time.
   - What's unclear: Whether to run it before or after `ingestGithub` (which is also a CLI call), and whether to fire it in parallel.
   - Recommendation: Run in parallel with `ingestGithub` (both are `gh` CLI calls; neither depends on the other). Gate SSE snapshot on both completing. This is in Claude's Discretion.

2. **Should the SessionEvent for identity be a new `authIdentity.set` event type?**
   - What we know: All mutations go through `applyEvent` → reducer → persist → SSE. An identity update follows this pattern.
   - What's unclear: Whether a new event type is worth the type-file churn, or whether identity should just be set on the initial session object (no event needed since it's set once at session start).
   - Recommendation: Set it on the initial `ReviewSession` object at creation time (like `headSha`, `createdAt`) rather than emitting a separate event. Avoids a new event type and an extra SSE update. No behavioral difference since identity is immutable per session.

3. **Should the manual verification items have formal pass/fail criteria defined in the plan?**
   - What we know: D-07 lists 5 manual items. D-08 says fix what breaks.
   - What's unclear: Whether to write VERIFICATION.md or just fix-and-commit informally.
   - Recommendation: Per CONTEXT.md "no need for formal VERIFICATION.md ceremony — fix issues as they're found during the pass." Keep manual verification tasks as lightweight "run this, fix anything broken" steps.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `gh` CLI | Auth identity fetch, all ingest | ✓ | 2.x | N/A — required for GitHub mode |
| `node` | Test runner, server | ✓ | 22 LTS | — |
| `vitest` | Integration tests | ✓ | (installed) | — |

**Missing dependencies:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (installed in `server/`) |
| Config file | `server/vitest.config.ts` |
| Quick run command | `cd server && npx vitest run` |
| Full suite command | `cd server && npx vitest run --reporter=verbose` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SESS-04 | Multi-session concurrency | — | N/A — DEFERRED to backlog | N/A |
| Pitfall 1 | Comment line correctness (`line`+`side`, never `position`) | unit | `cd server && npx vitest run src/submit/__tests__/anchor.test.ts` | ✅ `anchor.test.ts` |
| Pitfall 6 | Security headers (CSP completeness) | unit | `cd server && npx vitest run src/http/__tests__/secure-headers.test.ts` | ✅ `secure-headers.test.ts` |
| Pitfall 8 | Resume across browser close | integration | `cd server && npx vitest run src/__tests__/pitfall-verify.test.ts` | ❌ Wave 0 |
| Pitfall 9 | Stale-diff detection on resume | integration | `cd server && npx vitest run src/__tests__/pitfall-verify.test.ts` | ❌ Wave 0 |
| Pitfall 10 | Duplicate submission guard | unit | `cd server && npx vitest run src/http/routes/__tests__/confirm-submit.test.ts` | ✅ `confirm-submit.test.ts` (409 test) |
| Pitfall 16 | Port-in-use fallback (OS ephemeral) | integration | `cd server && npx vitest run src/__tests__/pitfall-verify.test.ts` | ❌ Wave 0 |
| Stale test fix | Plugin manifest uses `gr` not `git-review-plugin` | unit | `cd server && npx vitest run src/mcp/tools/__tests__/start-review.test.ts` | ✅ (needs assertion fix) |
| Auth badge (D-02/03/04) | Identity badge renders; mismatch warning; fail-open | unit | `cd server && npx vitest run src/ingest/__tests__/identity.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd server && npx vitest run`
- **Per wave merge:** `cd server && npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `server/src/__tests__/pitfall-verify.test.ts` — covers Pitfall 8 (resume), Pitfall 9 (stale-diff), Pitfall 16 (ephemeral port)
- [ ] `server/src/ingest/__tests__/identity.test.ts` — covers `fetchAuthIdentity` fail-open, mismatch detection, `null` return on error
- [ ] Fix stale assertion in `server/src/mcp/tools/__tests__/start-review.test.ts` line 190: `'git-review-plugin'` → `'gr'`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (identity display) | `gh auth token` — no new auth surface added |
| V3 Session Management | no | No changes to session token or cookie handling |
| V4 Access Control | no | No new endpoints or permission changes |
| V5 Input Validation | no | No new LLM-supplied or user-supplied input |
| V6 Cryptography | no | No new crypto |

### Known Threat Patterns for Auth Identity Badge

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Avatar URL → external image load (CSP violation) | Information disclosure | The existing CSP has `img-src 'self'` — GitHub avatar URLs (`avatars.githubusercontent.com`) are external. CSP must be updated to include `img-src 'self' https://avatars.githubusercontent.com` or avatar must be fetched server-side and proxied. |
| Login/avatar rendered as innerHTML | Tampering (XSS) | Render via React text nodes (`<span>{login}</span>`) and `<img src={...}>` — never `dangerouslySetInnerHTML`. Existing security pattern already established. |
| `GITHUB_TOKEN` value logged | Information disclosure | Never log the token value — log only the comparison result (`mismatch: true/false`). Existing logger pattern (paths + hashes, never content) applies. |

**CSP avatar URL gap:** This is a concrete, pre-existing issue that Phase 7 will surface when implementing the avatar `<img>` tag. The fix is to add `https://avatars.githubusercontent.com` to `img-src` in `server/src/http/middleware/secure-headers.ts`. The existing test `secure-headers.test.ts` should be extended to assert this.

---

## Sources

### Primary (HIGH confidence)

- `server/src/index.ts` — confirmed `port: 0` (OS ephemeral) already in use; Pitfall 16 architecturally solved. [VERIFIED: codebase inspection 2026-04-28]
- `server/src/submit/__tests__/anchor.test.ts` — confirmed Pitfall 1 covered (7 test cases including `position: undefined` assertion). [VERIFIED: codebase inspection]
- `server/src/submit/__tests__/pending-review.test.ts` — confirmed `getAuthenticatedLogin` and `detectPendingReview` tested; Pitfall 10 partially covered. [VERIFIED: codebase inspection]
- `server/src/http/__tests__/secure-headers.test.ts` — confirmed 9 CSP assertions exist; gap found: no `img-src` assertion for avatar URLs. [VERIFIED: codebase inspection]
- `server/src/http/routes/__tests__/confirm-submit.test.ts` — confirmed 409 duplicate-submission guard tested. [VERIFIED: codebase inspection]
- `server/src/session/manager.ts` lines 94-129 — confirmed persisted-load path (Pitfall 8) and staleDiff detection (Pitfall 9) are implemented. [VERIFIED: codebase inspection]
- Live `gh api user --jq '.login,.avatar_url'` — confirmed field names and output format. [VERIFIED: live CLI output]
- `npx vitest run` output — confirmed 1 pre-existing failure: `start-review.test.ts` `git-review-plugin` assertion stale after rename. [VERIFIED: live test run 2026-04-28]

### Secondary (MEDIUM confidence)

- `server/src/mcp/tools/__tests__/start-review.test.ts` line 190 — stale `git-review-plugin` assertion identified. Rename was commit `cab19ef`. Fix is mechanical.

### Tertiary (LOW confidence)

- [ASSUMED] `GH_TOKEN` env override in `execa` opts works for mismatch detection — not verified against gh CLI documentation. Fail-open wrapping makes this low-risk.

---

## Metadata

**Confidence breakdown:**
- Existing test coverage audit: HIGH — direct codebase inspection
- Port-in-use status: HIGH — read `server/src/index.ts` directly, confirmed `port: 0`
- Auth identity fetch approach: HIGH — same pattern as `ingest/github.ts`
- Manual pitfall status: MEDIUM — human judgment required; research cannot determine if Pitfall 3/4/5/12/14 pass without running against a real PR
- CSP avatar URL gap: HIGH — `secure-headers.ts` and existing test checked; gap is real

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (stable domain)
