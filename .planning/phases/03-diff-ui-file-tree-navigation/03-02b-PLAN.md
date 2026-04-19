---
phase: 03
plan: 02b
type: execute
wave: 1
depends_on:
  - "03-01"
  - "03-02a"
files_modified:
  - server/src/session/manager.ts
  - server/src/session/__tests__/manager-phase3.test.ts
  - server/src/http/routes/session-events.ts
  - server/src/http/__tests__/session-events.test.ts
  - server/src/http/index.ts
  - scripts/generate-fixture.ts
  - web/src/__tests__/fixtures/diff-model.fixture.json
  - web/src/__tests__/fixtures/shiki-tokens.fixture.json
  - web/src/__tests__/fixtures/README.md
autonomous: true
requirements:
  - PLUG-04
  - DIFF-03
tags:
  - server
  - session
  - http
  - fixtures

must_haves:
  truths:
    - "startReview in manager.ts fires existingComments.loaded and ciChecks.loaded events after the initial snapshot, for GitHub-source sessions only"
    - "Failures in fetchExistingComments or fetchCIChecks are logged via logger.warn and do NOT throw — the initial snapshot still reaches the client"
    - "Local-source sessions skip both fetches entirely (D-23, D-26)"
    - "POST /api/session/events route accepts a zod-validated {prKey, event} body, calls manager.applyEvent, returns {ok: true} with 200"
    - "POST /api/session/events requires X-Review-Token header (double-submit CSRF invariant from Phase 1)"
    - "Route rejects server-only SessionEvent variants (existingComments.loaded, ciChecks.loaded, session.*) with 400"
    - "A committed synthetic fixture at web/src/__tests__/fixtures/ contains a real DiffModel + ShikiFileTokens, with ≥1 generated file, ≥1 renamed file, 5-10 files, 30-50 hunks"
  artifacts:
    - path: "server/src/session/manager.ts"
      provides: "Phase 3 startReview extension that fires existingComments.loaded + ciChecks.loaded post-snapshot"
      contains: "existingComments.loaded"
    - path: "server/src/http/routes/session-events.ts"
      provides: "POST /api/session/events HTTP handler with zod discriminated-union validation"
      contains: "X-Review-Token"
    - path: "web/src/__tests__/fixtures/diff-model.fixture.json"
      provides: "Committed DiffModel fixture for Open Decision 1 validation"
      contains: "files"
    - path: "web/src/__tests__/fixtures/shiki-tokens.fixture.json"
      provides: "Committed Shiki tokens fixture paired with diff-model.fixture.json"
      contains: "content"
  key_links:
    - from: "server/src/session/manager.ts startReview"
      to: "server/src/session/reducer.ts existingComments.loaded / ciChecks.loaded cases"
      via: "applyEvent call"
      pattern: "applyEvent\\(prKey, \\{ type: 'existingComments"
    - from: "web/src/api.ts postSessionEvent (Plan 03-04)"
      to: "server/src/http/routes/session-events.ts handler"
      via: "POST /api/session/events with X-Review-Token"
      pattern: "X-Review-Token"
---

<objective>
Wire the Plan 03-02a adapter functions into the session lifecycle, open the HTTP route that accepts user-triggered SessionEvents from the web client, and capture the committed synthetic fixture that validates Open Decision 1's bespoke-DiffViewer choice. This plan is the second half of the former Plan 03-02; it is the consumer of Plan 03-02a's exports.

Purpose: Plans 03-03 and 03-04 need two things that 03-02a does not deliver:
1. The session manager must actually fire `existingComments.loaded` + `ciChecks.loaded` so the data flows into the snapshot.
2. A POST /api/session/events HTTP surface so the web client's `postSessionEvent` helper (Plan 03-04) has a server to call.

Plus Plan 03-03's render test needs a committed fixture, so the fixture-capture script + two committed JSON files live here.

Output:
- `server/src/session/manager.ts` — `startReview` extended to fire `existingComments.loaded` + `ciChecks.loaded` events for GitHub-source sessions.
- `server/src/http/routes/session-events.ts` — new POST handler, wired into `server/src/http/index.ts`.
- `scripts/generate-fixture.ts` — one-off script that runs the real ingest pipeline on a PR and writes the fixture JSON files.
- `web/src/__tests__/fixtures/diff-model.fixture.json` + `web/src/__tests__/fixtures/shiki-tokens.fixture.json` — committed fixtures driving the Plan 03-03 Open-Decision-1 validation render test.
- `web/src/__tests__/fixtures/README.md` — documents regeneration + constraints.
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
@.planning/phases/03-diff-ui-file-tree-navigation/03-02a-SUMMARY.md
@shared/types.ts
@server/src/session/manager.ts
@server/src/http/routes/session-resume.ts
@server/src/http/routes/session-adopt.ts
@server/src/http/index.ts

<interfaces>
Plan 03-02a's new exports (consumed here):
- `fetchExistingComments(owner, repo, prNumber, diffModel) => Promise<ReadOnlyComment[]>`
- `fetchCIChecks(prNumber) => Promise<CIStatus>`

Shared types (from Plan 03-01, already committed):
- `SessionEvent` user-triggered variants accepted by the HTTP route: `file.reviewStatusSet`, `file.generatedExpandToggled`
- Server-only variants (rejected at the HTTP boundary): `existingComments.loaded`, `ciChecks.loaded`, `session.adoptNewDiff`, `session.reset`, `session.viewBoth`

Existing Phase 1/2 patterns to reuse verbatim:
- `manager.applyEvent(prKey, event)` — serialized via per-prKey Promise queue (Phase 2 Plan 02-03 pattern). Order is non-negotiable: `writeState (disk) → sessions.set (memory) → bus.emit (broadcast)`.
- HTTP route pattern: see `server/src/http/routes/session-resume.ts` for the handler shape — zod validation, X-Review-Token middleware already wired at app level, `await manager.applyEvent`, return `{ ok: true }`.
- Logging: `import { logger } from '../logger.js';` — stderr only, NEVER console.log (AP2 anti-pattern).
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Web POST /api/session/events → server | Client-supplied `{prKey, event}` body; must be zod-validated before reaching reducer |
| Plan 03-02a adapter failures → manager | `fetchExistingComments` / `fetchCIChecks` may throw; failures must NOT crash `startReview` |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-3-05 | Tampering | Forged POST /api/session/events without token | mitigate | Route is mounted behind the existing Phase-1 `requireReviewToken` middleware; the handler ALSO verifies zod schema before calling `applyEvent`. A malformed body returns 400 before reaching the reducer. Bad token returns 403 at middleware. |
| T-3-06 | Denial of Service | Client posts malformed SessionEvent causing reducer throw | mitigate | Zod schema uses `z.discriminatedUnion('type', [...])` matching the 2 Phase-3 user-triggered variants only (review-status, expand-toggle — NOT existingComments.loaded or ciChecks.loaded which are server-only). A client posting a server-only event type receives 400. |
| T-3-12 | Denial of Service | fetchExistingComments/fetchCIChecks failures crashing startReview | mitigate | Both adapter calls are wrapped in independent try/catch; errors are logged via `logger.warn` and the initial snapshot + browser launch proceed unchanged. UI surface degrades gracefully (markers absent, CI pill `none`). Test asserts `startReview` resolves even when `fetchExistingComments` rejects. |
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend manager.startReview to fire existingComments.loaded + ciChecks.loaded events</name>
  <files>
    - server/src/session/manager.ts
    - server/src/session/__tests__/manager-phase3.test.ts
  </files>
  <read_first>
    - server/src/session/manager.ts — entire file. Focus on the `startReview` method and the existing Phase 2 pipeline (ingest → parse → highlight → initial session snapshot → writeState → sessions.set → bus.emit). Find the exact line where the initial snapshot is persisted (approximately line 197 per 03-PATTERNS.md) and the browser-launch line (approximately line 202).
    - .planning/phases/03-diff-ui-file-tree-navigation/03-PATTERNS.md — "server/src/session/manager.ts — extend startReview" section has the exact extension block
    - .planning/phases/03-diff-ui-file-tree-navigation/03-CONTEXT.md — D-20, D-23, D-24, D-27 (ingest fires events post-snapshot for GitHub-source only)
    - .planning/phases/02-persistent-session-store-resume/02-03-PLAN.md — applyEvent Promise-chain queue discipline (per-prKey serialization)
    - Plan 03-02a's committed github.ts for the exported shapes of `fetchExistingComments` and `fetchCIChecks`
  </read_first>
  <behavior>
    After edit, during `startReview`:
    1. Existing Phase 1/2 pipeline runs unchanged: ingest, parse, highlight, write initial snapshot, set in-memory session, emit snapshot bus event.
    2. For GitHub-source sessions ONLY (`source.kind === 'github'`):
       - `fetchExistingComments(owner, repo, prNumber, diffModel)` is called. On success, `applyEvent({ type: 'existingComments.loaded', comments })` fires (which re-runs the full persist + broadcast pipeline per Phase 2 Plan 02-03). On failure, `logger.warn` is called; no throw (UI surface: markers don't render).
       - `fetchCIChecks(prNumber)` is called. On success, `applyEvent({ type: 'ciChecks.loaded', ciStatus })` fires. On failure, `logger.warn`; no throw (CI pill renders `none`).
    3. For local-source sessions (`source.kind === 'local'`) — NEITHER call fires (D-23 + D-26). Unit test asserts neither gh api comments nor gh pr checks is invoked.
    4. Ordering: both events fire AFTER the initial snapshot is persisted (so the SSE subscriber sees snapshot → update → update, not an incomplete snapshot).
    5. Errors are caught independently: if existingComments fails, CI checks still attempt. Both failures are logger.warn-only.
  </behavior>
  <action>
    Step 1 — RED: Create `server/src/session/__tests__/manager-phase3.test.ts` with targeted tests. Mock `ingestGithub`, `toDiffModel`, `highlightHunks`, `fetchExistingComments`, `fetchCIChecks` at the module level so we can assert `applyEvent` is called with the right payloads.

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    // Mock the ingest pipeline pieces so we can run startReview without real gh
    vi.mock('../../ingest/github.js', () => ({
      ingestGithub: vi.fn(),
      fetchExistingComments: vi.fn(),
      fetchCIChecks: vi.fn(),
      fetchCurrentHeadSha: vi.fn(),
    }));
    vi.mock('../../ingest/parse.js', () => ({
      toDiffModel: vi.fn(),
    }));
    vi.mock('../../highlight/shiki.js', () => ({
      highlightHunks: vi.fn().mockResolvedValue([]),
    }));
    vi.mock('../../browser-launch.js', () => ({
      launchBrowser: vi.fn(),
    }));
    vi.mock('../../persist/index.js', () => ({
      writeState: vi.fn().mockResolvedValue(undefined),
      readState: vi.fn().mockResolvedValue(null),
    }), { virtual: true });

    // Import AFTER mocks are registered
    import { ingestGithub, fetchExistingComments, fetchCIChecks } from '../../ingest/github.js';
    import { toDiffModel } from '../../ingest/parse.js';
    // Import the SessionManager under test
    // NOTE: depending on your manager.ts export shape, adjust this import line
    import { SessionManager } from '../manager.js';

    describe('SessionManager.startReview — Phase 3 ingest extensions', () => {
      let manager: SessionManager;

      beforeEach(() => {
        vi.mocked(ingestGithub).mockReset();
        vi.mocked(fetchExistingComments).mockReset();
        vi.mocked(fetchCIChecks).mockReset();
        vi.mocked(toDiffModel).mockReset();
        manager = new SessionManager(/* pass required ctor args per Phase 1 shape */);
      });

      it('fires existingComments.loaded + ciChecks.loaded events for github source', async () => {
        vi.mocked(ingestGithub).mockResolvedValue({
          meta: { source: 'github', title: 't', description: '', author: 'a', baseBranch: 'b', headBranch: 'h', baseSha: 'b', headSha: 'h', additions: 0, deletions: 0, filesChanged: 0, number: 1, owner: 'o', repo: 'r' },
          diffText: '',
        } as any);
        vi.mocked(toDiffModel).mockReturnValue({ files: [], totalHunks: 0 } as any);
        vi.mocked(fetchExistingComments).mockResolvedValue([{ id: 1, lineId: null, path: '', line: null, side: 'BOTH', author: 'a', createdAt: '', body: 'x', htmlUrl: '' }]);
        vi.mocked(fetchCIChecks).mockResolvedValue({ aggregate: 'pass', checks: [] });

        const applyEventSpy = vi.spyOn(manager, 'applyEvent');
        await manager.startReview({ kind: 'github', number: 1 });

        // existingComments.loaded was fired
        expect(applyEventSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ type: 'existingComments.loaded' })
        );
        // ciChecks.loaded was fired
        expect(applyEventSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ type: 'ciChecks.loaded' })
        );
      });

      it('does NOT fire existingComments.loaded or ciChecks.loaded for local source (D-23, D-26)', async () => {
        // Assume ingestLocal is also mocked separately if used; for this test we focus on the decision gate
        const applyEventSpy = vi.spyOn(manager, 'applyEvent');
        // Kick off a local-source startReview (exact shape of source depends on Phase 1 surface)
        try {
          await manager.startReview({ kind: 'local', base: 'main', head: 'feature' } as any);
        } catch (err) {
          // May throw if ingestLocal mock isn't configured — we only care about whether phase-3 events fire
        }
        expect(fetchExistingComments).not.toHaveBeenCalled();
        expect(fetchCIChecks).not.toHaveBeenCalled();
        // Confirm no Phase-3 events were emitted
        const phase3Events = applyEventSpy.mock.calls.filter(
          ([, ev]) => ['existingComments.loaded', 'ciChecks.loaded'].includes((ev as any).type)
        );
        expect(phase3Events).toHaveLength(0);
      });

      it('logger.warns but does not throw when fetchExistingComments rejects (T-3-12)', async () => {
        vi.mocked(ingestGithub).mockResolvedValue({
          meta: { source: 'github', title: 't', description: '', author: 'a', baseBranch: 'b', headBranch: 'h', baseSha: 'b', headSha: 'h', additions: 0, deletions: 0, filesChanged: 0, number: 1, owner: 'o', repo: 'r' },
          diffText: '',
        } as any);
        vi.mocked(toDiffModel).mockReturnValue({ files: [], totalHunks: 0 } as any);
        vi.mocked(fetchExistingComments).mockRejectedValue(new Error('gh api failed'));
        vi.mocked(fetchCIChecks).mockResolvedValue({ aggregate: 'pass', checks: [] });
        // Should not throw — error is caught and logged
        await expect(manager.startReview({ kind: 'github', number: 1 } as any)).resolves.not.toThrow();
      });
    });
    ```

    NOTE: This test relies on details of Phase 1 manager.ts construction. If the existing manager has a specific constructor shape (e.g., requires deps injected), the test scaffolding needs to match — the executor should read `server/src/session/manager.ts` and adapt the `new SessionManager(...)` line and any missing mock to match reality. The behavioral assertions (applyEvent called with correct payloads; not called for local; no throw on fetch failure) MUST hold regardless of scaffolding details.

    Step 2 — GREEN: Edit `server/src/session/manager.ts`:

    1. Add imports at top:
       ```typescript
       import { fetchExistingComments, fetchCIChecks } from '../ingest/github.js';
       ```

    2. In `startReview`, find the point AFTER the initial snapshot has been persisted + set + broadcast (per 03-PATTERNS.md, approximately line 197, just before the browser-launch call at ~line 202). Insert the Phase 3 ingest-extension block:

       ```typescript
       // Phase 3 GitHub-only: fetch existing PR comments and CI checks (D-20, D-24).
       // Both run post-snapshot so the web client sees: snapshot → update(existingComments) → update(ciChecks).
       // Failures are logged to stderr only; UI renders the "absent" variants (no markers, CI pill = none).
       if (source.kind === 'github' && pr.owner && pr.repo && typeof pr.number === 'number') {
         try {
           const comments = await fetchExistingComments(pr.owner, pr.repo, pr.number, diff);
           await this.applyEvent(prKey, { type: 'existingComments.loaded', comments });
         } catch (err) {
           logger.warn('Failed to load existing comments:', err);
         }
         try {
           const ciStatus = await fetchCIChecks(pr.number);
           await this.applyEvent(prKey, { type: 'ciChecks.loaded', ciStatus });
         } catch (err) {
           logger.warn('Failed to load CI checks:', err);
         }
       }
       ```

    Use the exact local variable names that the existing `startReview` already uses (`source`, `pr`, `prKey`, `diff`). If any names differ, adapt to match — the READ of manager.ts is mandatory before editing.

    Step 3 — Verify tests green. If the test scaffolding struggles with manager construction, simplify the test to focus on the key behavioral invariants by directly calling `manager.applyEvent` with controlled inputs instead of driving the full `startReview`. The grep-based acceptance criteria below catch the pipeline wiring reliably.
  </action>
  <verify>
    <automated>pnpm --filter @review/server test -- --run manager-phase3 || pnpm --filter @review/server test -- --run manager</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "fetchExistingComments" server/src/session/manager.ts` returns 1
    - `grep -c "fetchCIChecks" server/src/session/manager.ts` returns 1
    - `grep -c "existingComments.loaded" server/src/session/manager.ts` returns 1
    - `grep -c "ciChecks.loaded" server/src/session/manager.ts` returns 1
    - `grep -c "source.kind === 'github'" server/src/session/manager.ts` ≥ 1 (GitHub-only gate)
    - `grep -c "logger.warn" server/src/session/manager.ts` ≥ 2 (both failure paths logged)
    - Existing manager tests still pass: `pnpm --filter @review/server test -- --run manager` exits 0
  </acceptance_criteria>
  <done>
    `startReview` fires both `existingComments.loaded` and `ciChecks.loaded` events after the initial snapshot for GitHub-source sessions, with independent try/catch that logs failures via `logger.warn` without throwing. Local-source sessions skip both. Existing manager tests green.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add POST /api/session/events HTTP route + wire it into the app</name>
  <files>
    - server/src/http/routes/session-events.ts
    - server/src/http/__tests__/session-events.test.ts
    - server/src/http/index.ts
  </files>
  <read_first>
    - server/src/http/routes/session-resume.ts — the template pattern for a POST route (zod validation → manager.applyEvent → ok:true)
    - server/src/http/index.ts — where routes are mounted (find the `app.route(...)` or `app.post(...)` lines for session-resume/session-adopt); add the new route next to them
    - server/src/http/routes/session-adopt.ts — for reference on X-Review-Token middleware wiring (may be at app-level, may be per-route)
    - .planning/phases/03-diff-ui-file-tree-navigation/03-PATTERNS.md — "web/src/api.ts" section NOTE block ("A new HTTP route `POST /api/session/events` must also be created at `server/src/http/routes/session-events.ts`")
    - .planning/phases/01-plugin-skeleton-secure-vertical-slice/01-03-PLAN.md — X-Review-Token + Host + CSP middleware pattern
    - shared/types.ts — the USER-TRIGGERED SessionEvent variants are ONLY `file.reviewStatusSet` and `file.generatedExpandToggled` (existingComments.loaded and ciChecks.loaded are server-only)
  </read_first>
  <behavior>
    After edit:
    - `POST /api/session/events` exists as a Hono route.
    - Body is validated via zod `discriminatedUnion('type', [reviewStatusSchema, expandToggleSchema])` — posting any OTHER event type (e.g., `session.reset`, `existingComments.loaded`) returns 400.
    - Missing/invalid `X-Review-Token` returns 403 (via the existing Phase-1 middleware — we don't re-implement it, just ensure the route is behind the same protective layer).
    - Unknown `prKey` (manager.get returns null) returns 404.
    - Valid request calls `manager.applyEvent(prKey, event)` and returns 200 `{ ok: true }`.
    - POST body malformed (not JSON, or zod fails) returns 400 with a short error string.
    - Test matrix covers: happy path (reviewStatusSet), happy path (generatedExpandToggled), server-only event type rejection (existingComments.loaded → 400), missing token → 403, unknown prKey → 404.
  </behavior>
  <action>
    Step 1 — RED: Create `server/src/http/__tests__/session-events.test.ts`. Follow the Phase-1 http test pattern (look at any existing route test for scaffolding — e.g., session-resume test). The test boots the Hono app in-process and hits it with `app.fetch(...)`.

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest';
    import { Hono } from 'hono';

    // Create minimal in-memory test harness; adapt as needed to match server/src/http/index.ts real shape.
    // If a test helper `createTestApp()` exists in server/src/http/__tests__/, prefer it.

    describe('POST /api/session/events', () => {
      it('accepts file.reviewStatusSet and returns ok:true', async () => {
        // Boot the app with a mocked manager whose applyEvent resolves; construct via the same factory used in server/src/http/index.ts
        const mockManager = { applyEvent: vi.fn().mockResolvedValue(undefined), get: vi.fn().mockReturnValue({ prKey: 'gh:o/r#1' }) };
        const app = buildAppForTest({ manager: mockManager, token: 'T' });
        const res = await app.fetch(new Request('http://127.0.0.1/api/session/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Review-Token': 'T', 'Host': '127.0.0.1' },
          body: JSON.stringify({ prKey: 'gh:o/r#1', event: { type: 'file.reviewStatusSet', fileId: 'abc', status: 'reviewed' } }),
        }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ ok: true });
        expect(mockManager.applyEvent).toHaveBeenCalledWith('gh:o/r#1', expect.objectContaining({ type: 'file.reviewStatusSet' }));
      });

      it('rejects server-only event type (existingComments.loaded) with 400', async () => {
        const mockManager = { applyEvent: vi.fn(), get: vi.fn().mockReturnValue({ prKey: 'gh:o/r#1' }) };
        const app = buildAppForTest({ manager: mockManager, token: 'T' });
        const res = await app.fetch(new Request('http://127.0.0.1/api/session/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Review-Token': 'T', 'Host': '127.0.0.1' },
          body: JSON.stringify({ prKey: 'gh:o/r#1', event: { type: 'existingComments.loaded', comments: [] } }),
        }));
        expect(res.status).toBe(400);
        expect(mockManager.applyEvent).not.toHaveBeenCalled();
      });

      it('rejects missing X-Review-Token with 403', async () => {
        const mockManager = { applyEvent: vi.fn(), get: vi.fn().mockReturnValue({ prKey: 'gh:o/r#1' }) };
        const app = buildAppForTest({ manager: mockManager, token: 'T' });
        const res = await app.fetch(new Request('http://127.0.0.1/api/session/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Host': '127.0.0.1' },
          body: JSON.stringify({ prKey: 'gh:o/r#1', event: { type: 'file.reviewStatusSet', fileId: 'abc', status: 'reviewed' } }),
        }));
        expect(res.status).toBe(403);
      });

      it('returns 404 for unknown prKey', async () => {
        const mockManager = { applyEvent: vi.fn(), get: vi.fn().mockReturnValue(null) };
        const app = buildAppForTest({ manager: mockManager, token: 'T' });
        const res = await app.fetch(new Request('http://127.0.0.1/api/session/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Review-Token': 'T', 'Host': '127.0.0.1' },
          body: JSON.stringify({ prKey: 'unknown', event: { type: 'file.reviewStatusSet', fileId: 'abc', status: 'reviewed' } }),
        }));
        expect(res.status).toBe(404);
      });
    });

    // Helper (adjust to match actual server/src/http/index.ts factory signature):
    function buildAppForTest(_opts: unknown): Hono {
      throw new Error('Implement using the existing test harness in server/src/http/__tests__/ or import from server/src/http/index.ts factory');
    }
    ```

    The executor should replace `buildAppForTest` with the real test-app factory from the codebase. If none exists, add a minimal factory inline that matches `server/src/http/index.ts` initialization and mount the `registerSessionEventsRoute` function.

    Step 2 — GREEN: Create `server/src/http/routes/session-events.ts`. Pattern after `session-resume.ts`:

    ```typescript
    // Phase 3 — POST /api/session/events
    // Accepts user-triggered SessionEvents from the web client (keyboard r-key, mark-reviewed button,
    // generated-file expand/collapse). Server-only events (existingComments.loaded, ciChecks.loaded)
    // are explicitly rejected here — they are server-generated during startReview.
    import { Hono } from 'hono';
    import { z } from 'zod';
    import type { SessionManager } from '../../session/manager.js';
    import { logger } from '../../logger.js';

    const reviewStatusSchema = z.object({
      type: z.literal('file.reviewStatusSet'),
      fileId: z.string().min(1),
      status: z.enum(['untouched', 'in-progress', 'reviewed']),
    });
    const expandToggleSchema = z.object({
      type: z.literal('file.generatedExpandToggled'),
      fileId: z.string().min(1),
      expanded: z.boolean(),
    });
    // Only USER-TRIGGERED variants are accepted. Server-only variants (session.adoptNewDiff,
    // existingComments.loaded, ciChecks.loaded, etc.) are deliberately omitted (T-3-06).
    const userEventSchema = z.discriminatedUnion('type', [reviewStatusSchema, expandToggleSchema]);

    const bodySchema = z.object({
      prKey: z.string().min(1),
      event: userEventSchema,
    }).strict();

    export function registerSessionEventsRoute(app: Hono, manager: SessionManager): void {
      app.post('/api/session/events', async (c) => {
        let raw: unknown;
        try {
          raw = await c.req.json();
        } catch {
          return c.json({ error: 'invalid json' }, 400);
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return c.json({ error: 'invalid event body', details: parsed.error.issues.map(i => i.message) }, 400);
        }
        const { prKey, event } = parsed.data;
        const session = manager.get(prKey);
        if (!session) {
          return c.json({ error: 'unknown prKey' }, 404);
        }
        try {
          await manager.applyEvent(prKey, event);
        } catch (err) {
          logger.error('applyEvent failed in /api/session/events:', err);
          return c.json({ error: 'internal error' }, 500);
        }
        return c.json({ ok: true });
      });
    }
    ```

    Step 3 — Wire into `server/src/http/index.ts`. Find where `session-resume.ts`'s route is registered (look for `registerSessionResumeRoute` or similar). Add:

    ```typescript
    import { registerSessionEventsRoute } from './routes/session-events.js';
    // ... after the existing route registrations:
    registerSessionEventsRoute(app, manager);
    ```

    Make sure the route is registered AFTER the X-Review-Token middleware (which is mounted at app level in Phase 1 per `01-03-PLAN.md`). If the existing middleware order is unclear, read `server/src/http/index.ts` fully before editing.

    Step 4 — Run: `pnpm --filter @review/server test -- --run session-events` — tests should pass.
  </action>
  <verify>
    <automated>pnpm --filter @review/server test -- --run session-events</automated>
  </verify>
  <acceptance_criteria>
    - File `server/src/http/routes/session-events.ts` exists and exports `registerSessionEventsRoute`
    - `grep -c "discriminatedUnion" server/src/http/routes/session-events.ts` returns 1 (uses z.discriminatedUnion)
    - `grep -c "file.reviewStatusSet" server/src/http/routes/session-events.ts` returns 1
    - `grep -c "file.generatedExpandToggled" server/src/http/routes/session-events.ts` returns 1
    - `grep -c "existingComments.loaded" server/src/http/routes/session-events.ts` returns 0 (server-only, not accepted from clients)
    - `grep -c "ciChecks.loaded" server/src/http/routes/session-events.ts` returns 0
    - `grep -c "session.adoptNewDiff\|session.reset\|session.viewBoth" server/src/http/routes/session-events.ts` returns 0 (only 2 user-triggered variants accepted)
    - `grep -c "registerSessionEventsRoute" server/src/http/index.ts` returns 1 (route is wired)
    - Test file `server/src/http/__tests__/session-events.test.ts` exists and all cases pass (happy, 400 wrong-type, 403 missing-token, 404 unknown-prKey)
    - `pnpm --filter @review/server test -- --run session-events` exits 0
  </acceptance_criteria>
  <done>
    POST /api/session/events exists, validates via z.discriminatedUnion restricted to the two user-triggered variants, honors X-Review-Token, returns 404 on unknown prKey, 200 on success. Server-only event types rejected with 400. Route wired into http/index.ts.
  </done>
</task>

<task type="auto">
  <name>Task 3: Build the fixture-capture script + commit synthetic DiffModel and Shiki-tokens fixtures</name>
  <files>
    - scripts/generate-fixture.ts
    - web/src/__tests__/fixtures/diff-model.fixture.json
    - web/src/__tests__/fixtures/shiki-tokens.fixture.json
    - web/src/__tests__/fixtures/README.md
  </files>
  <read_first>
    - server/src/session/manager.ts — the existing `startReview` pipeline (ingest → toDiffModel → highlightHunks) — the fixture script copies this
    - server/src/ingest/parse.ts — toDiffModel (after Plan 03-02a Task 2, produces DiffFile.generated)
    - server/src/highlight/shiki.ts — highlightHunks (after Plan 03-01 Task 2, uses github-light)
    - .planning/phases/03-diff-ui-file-tree-navigation/03-PATTERNS.md — "scripts/generate-fixture.ts" section
    - .planning/phases/03-diff-ui-file-tree-navigation/03-RESEARCH.md — Q8 "Fixture PR for Spike" + "Recommended capture approach"
    - .planning/phases/03-diff-ui-file-tree-navigation/03-UI-SPEC.md — Fixture Requirements (5-10 files, 30-50 hunks, at least 1 lockfile, 1 renamed, 1 file with ≥5 hunks)
    - .planning/phases/03-diff-ui-file-tree-navigation/03-CONTEXT.md — D-09
  </read_first>
  <behavior>
    - `scripts/generate-fixture.ts` is a one-off node script (run via `pnpm tsx scripts/generate-fixture.ts <pr-number-or-url>` or similar) that exercises the real server ingest pipeline: ingest → toDiffModel → highlightHunks.
    - The script writes `web/src/__tests__/fixtures/diff-model.fixture.json` (a full `DiffModel`) and `web/src/__tests__/fixtures/shiki-tokens.fixture.json` (a `Record<string, ShikiFileTokens>`).
    - Fixture constraints (D-09 + UI-SPEC):
      - 5-10 files
      - 30-50 total hunks
      - At least one file with `generated: true` (e.g., package-lock.json in the PR)
      - At least one renamed file (`status: 'renamed'`, `oldPath` populated)
      - At least one file with ≥5 hunks
      - Mixed languages: TypeScript/JavaScript + JSON + Markdown at minimum
    - A short `README.md` in the fixtures directory documents: (1) where the fixture came from (PR URL or "synthetic"), (2) how to regenerate, (3) the constraints it must satisfy.
    - Falls back to a handcrafted synthetic fixture if no suitable live PR is available in the moment — the script can also be used to regenerate post-hoc.
  </behavior>
  <action>
    Step 1 — Create `scripts/generate-fixture.ts`. Pattern per 03-PATTERNS.md:

    ```typescript
    // One-off fixture capture. Runs the real Phase-3 ingest pipeline on a live PR
    // and writes the DiffModel + ShikiFileTokens to web/src/__tests__/fixtures/.
    //
    // Usage:  pnpm tsx scripts/generate-fixture.ts <pr-number-or-url>
    //
    // CONSTRAINTS to honor (D-09 + UI-SPEC):
    //   5-10 files, 30-50 hunks, >=1 generated file (lockfile), >=1 renamed file,
    //   >=1 file with >=5 hunks, mixed languages (ts/js/json/md).
    import { writeFile, mkdir } from 'node:fs/promises';
    import { dirname, resolve } from 'node:path';
    import { fileURLToPath } from 'node:url';
    import { ingestGithub } from '../server/src/ingest/github.js';
    import { toDiffModel } from '../server/src/ingest/parse.js';
    import { highlightHunks } from '../server/src/highlight/shiki.js';
    import type { DiffModel, ShikiFileTokens } from '../shared/types.js';

    async function main() {
      const arg = process.argv[2];
      if (!arg) {
        console.error('Usage: tsx scripts/generate-fixture.ts <pr-number-or-url>');
        process.exit(1);
      }
      const { meta, diffText } = await ingestGithub(arg);
      const diff: DiffModel = toDiffModel(diffText);
      const shikiTokens: Record<string, ShikiFileTokens> = {};
      for (const file of diff.files) {
        if (file.binary) continue;
        shikiTokens[file.id] = await highlightHunks(file.path, meta.headSha || 'HEAD', file.hunks);
      }
      // Validate constraints
      const files = diff.files.length;
      const hunks = diff.totalHunks;
      const hasGenerated = diff.files.some(f => f.generated);
      const hasRenamed = diff.files.some(f => f.status === 'renamed');
      const hasBigHunk = diff.files.some(f => f.hunks.length >= 5);
      console.error(`Captured: files=${files}, hunks=${hunks}, hasGenerated=${hasGenerated}, hasRenamed=${hasRenamed}, hasBigHunk=${hasBigHunk}`);
      if (files < 5 || files > 10) console.error(`WARN: files=${files} outside 5-10 range`);
      if (hunks < 30 || hunks > 50) console.error(`WARN: hunks=${hunks} outside 30-50 range`);
      if (!hasGenerated) console.error('WARN: no generated file — add a lockfile to PR or synthesize');
      if (!hasRenamed) console.error('WARN: no renamed file — PR must include a rename');
      if (!hasBigHunk) console.error('WARN: no file with >=5 hunks');

      const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'web/src/__tests__/fixtures');
      await mkdir(fixturesDir, { recursive: true });
      await writeFile(resolve(fixturesDir, 'diff-model.fixture.json'), JSON.stringify(diff, null, 2));
      await writeFile(resolve(fixturesDir, 'shiki-tokens.fixture.json'), JSON.stringify(shikiTokens, null, 2));
      console.error('Wrote fixtures to', fixturesDir);
    }

    main().catch(err => { console.error(err); process.exit(1); });
    ```

    Step 2 — Run the script against a suitable public PR to capture the fixture. If the developer hasn't approved `gh auth login` for the test context, OR if `gh` CLI can't reach a usable PR, fall back to SYNTHESIZING a fixture by hand: write a minimal `DiffModel` + `ShikiFileTokens` with a few files:

    Synthetic fixture shape (if needed):
    - `src/app.ts` with 5 hunks, `generated: false`
    - `src/utils.ts` → renamed from `src/helpers.ts`, 2 hunks, `generated: false`
    - `package-lock.json` with 2 hunks, `generated: true`
    - `README.md` with 1 hunk, `generated: false`
    - `src/api.ts` with 3 hunks, `generated: false`
    - `config/settings.json` with 1 hunk, `generated: false`

    Total: 6 files, 14 hunks.

    NOTE: 14 hunks is under the 30-50 target — the executor should either (a) regenerate via real PR to hit the constraint, OR (b) expand the synthetic fixture by padding an existing file to 10+ hunks until the total falls in 30-50. Log any discrepancy clearly in the SUMMARY for 03-02b.

    Shiki tokens for the synthetic fixture can be generated by calling `highlightHunks()` on each file programmatically in a one-off script run, OR constructed by hand for each hunk (tedious but acceptable for ~14 hunks). The tokens must have at least one token per line with a non-null `color` field so the render test (Plan 03-03) can assert visibility.

    Step 3 — Create `web/src/__tests__/fixtures/README.md`:

    ```markdown
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
    <record the PR URL here, or "hand-synthesized" if generated manually>
    ```

    Fill in the "Source" line after the fixture is captured.

    Step 4 — Commit all three files in the SUMMARY.
  </action>
  <verify>
    <automated>test -f web/src/__tests__/fixtures/diff-model.fixture.json && test -f web/src/__tests__/fixtures/shiki-tokens.fixture.json && test -f web/src/__tests__/fixtures/README.md && node -e "const d=require('./web/src/__tests__/fixtures/diff-model.fixture.json'); if (d.files.length < 3) { console.error('FAIL: fixture has <3 files'); process.exit(1) } if (!d.files.some(f => f.generated)) { console.error('FAIL: no generated file'); process.exit(1) } console.log('OK: files=' + d.files.length + ', hunks=' + d.totalHunks + ', hasGenerated=' + d.files.some(f => f.generated))"</automated>
  </verify>
  <acceptance_criteria>
    - `test -f scripts/generate-fixture.ts` (script exists)
    - `test -f web/src/__tests__/fixtures/diff-model.fixture.json` (DiffModel fixture exists)
    - `test -f web/src/__tests__/fixtures/shiki-tokens.fixture.json` (Shiki fixture exists)
    - `test -f web/src/__tests__/fixtures/README.md` (README exists)
    - The JSON fixture is parseable and has `files: DiffFile[]` and `totalHunks: number`
    - At least one `DiffFile` in the fixture has `generated: true`
    - At least one `DiffFile` in the fixture has `status: 'renamed'` with `oldPath` populated
    - Ideally: `files.length` is in `[5..10]` and `totalHunks` is in `[30..50]` — if not (synthetic fallback), log in SUMMARY.md as a known tradeoff
    - Shiki tokens JSON keys are `DiffFile.id` values, mapping to `ShikiHunkTokens[]` arrays of arrays of `ShikiToken`
  </acceptance_criteria>
  <done>
    `scripts/generate-fixture.ts` can be invoked to regenerate. Two committed JSON fixtures at `web/src/__tests__/fixtures/` satisfy D-09 constraints (or log a clear exception in the SUMMARY). README.md documents the source and regeneration path.
  </done>
</task>

</tasks>

<verification>
Plan-wide verification after all 3 tasks complete:

```bash
# Type compile — full monorepo (should be clean now that shared types + parse.ts + github.ts + reducer + http/routes are all aligned)
pnpm -r tsc --noEmit

# All server tests green
pnpm --filter @review/server test -- --run

# Fixture files exist
test -f web/src/__tests__/fixtures/diff-model.fixture.json
test -f web/src/__tests__/fixtures/shiki-tokens.fixture.json

# Grep invariants
grep -c "existingComments.loaded" server/src/session/manager.ts             # -> 1
grep -c "ciChecks.loaded" server/src/session/manager.ts                     # -> 1
grep -c "source.kind === 'github'" server/src/session/manager.ts            # >= 1
grep -c "existingComments.loaded" server/src/http/routes/session-events.ts  # -> 0 (server-only, rejected from clients)
grep -c "ciChecks.loaded" server/src/http/routes/session-events.ts          # -> 0
grep -c "discriminatedUnion" server/src/http/routes/session-events.ts       # -> 1
grep -c "registerSessionEventsRoute" server/src/http/index.ts               # -> 1
```
</verification>

<success_criteria>
- All 3 tasks green.
- `startReview` fires `existingComments.loaded` + `ciChecks.loaded` events for GitHub-source sessions only, with try/catch that logs failures via `logger.warn` without throwing.
- `POST /api/session/events` accepts only the two user-triggered event variants; rejects server-only types with 400; enforces X-Review-Token; returns 404 on unknown prKey.
- Synthetic fixture committed with at least one generated file and one renamed file.
- Plans 03-03 / 03-04 / 03-05 can run on top of these foundations with no blockers.
</success_criteria>

<output>
After completion, create `.planning/phases/03-diff-ui-file-tree-navigation/03-02b-SUMMARY.md` with:
- Actual fixture PR used (URL or "synthesized") + fixture file/hunk/rename/generated counts
- Any deviations from D-09 constraints (e.g., if the fixture has only 14 hunks instead of 30-50) with rationale
- Confirmation that only the two user-triggered variants are accepted by the POST route (grep-verified)
- Whether any Phase-2 manager test needed tweaking because of the startReview extension
- Any retrofit to manager construction or test scaffolding that the executor had to apply
</output>
