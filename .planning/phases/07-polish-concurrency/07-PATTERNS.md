# Phase 7: Polish + Verification - Pattern Map

**Mapped:** 2026-04-28
**Files analyzed:** 8 new/modified files
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `shared/types.ts` | model | transform | `shared/types.ts` itself (prior phase additions) | exact |
| `server/src/ingest/identity.ts` | service | request-response | `server/src/ingest/github.ts` | exact |
| `server/src/http/middleware/secure-headers.ts` | middleware | request-response | same file (one-line addition) | exact |
| `web/src/components/TopBar.tsx` | component | request-response | `web/src/components/TopBar.tsx` itself (CIPill pattern) | exact |
| `web/src/store.ts` | store | event-driven | `web/src/store.ts` itself (prior phase additions) | exact |
| `server/src/session/manager.ts` | service | CRUD | `server/src/session/manager.ts` itself (Phase 3 post-snapshot pattern) | exact |
| `server/src/__tests__/pitfall-verify.test.ts` | test | batch | `server/src/session/__tests__/manager.resume.test.ts` + `server/src/persist/__tests__/store.test.ts` | exact |
| `server/src/ingest/__tests__/identity.test.ts` | test | request-response | `server/src/ingest/__tests__/github.test.ts` | exact |

---

## Pattern Assignments

### `shared/types.ts` (model, transform)

**Analog:** `shared/types.ts` — every prior phase adds optional fields to `ReviewSession` following the same pattern. Phase 7 continues this pattern.

**Prior phase pattern for ReviewSession additions** (lines 95-108):
```typescript
// Phase X additions (D-NN) — all optional for backward compat with pre-Phase-X snapshots:
chatMessages?: ChatMessage[];
requestQueue?: { pending: number };
```

**New field to add** (after line 108, before closing brace):
```typescript
// Phase 7 additions (D-02) — optional for backward compat:
authenticatedUser?: AuthIdentity | null;  // null = fetch failed (fail-open, D-04)
```

**New interface to add** (at bottom of file, after `ChatMessage`):
```typescript
// -------------------------------------------------------------------------
// Phase 7 additions — Auth Identity Badge (D-02/D-03/D-04)
// D-04: null means fetch failed; the badge simply does not render.
// SECURITY: login and avatarUrl are rendered via React text nodes and <img src> —
//           never dangerouslySetInnerHTML.
// -------------------------------------------------------------------------

export interface AuthIdentity {
  login: string;
  avatarUrl: string;
  mismatch: boolean;  // true = gh auth token user != GITHUB_TOKEN user (D-03)
}
```

**AppState addition pattern** — `web/src/store.ts` (lines 29-74) shows that every `ReviewSession` optional field is mirrored into `AppState` with the same name and same optional/null pattern. Follow this for `authenticatedUser`.

---

### `server/src/ingest/identity.ts` (service, request-response)

**Analog:** `server/src/ingest/github.ts`

**Imports pattern** (lines 1-10):
```typescript
import { execa } from 'execa';
import type { AuthIdentity } from '@shared/types';
import { logger } from '../logger.js';
```

**Core execa invocation pattern** (github.ts lines 22-25 — parallel Promise.all + JSON.parse):
```typescript
// Prefer single-field jq extraction over two-line output:
const { stdout } = await execa('gh', ['api', 'user', '--jq', '{login:.login,avatar_url:.avatar_url}']);
const parsed = JSON.parse(stdout) as { login: string; avatar_url: string };
```

**Fail-open pattern** (github.ts line 34 uses `throw mapGhError(err)` — identity.ts inverts this):
```typescript
// D-04: NEVER throw from fetchAuthIdentity. Always return null on any error.
export async function fetchAuthIdentity(): Promise<AuthIdentity | null> {
  try {
    // ... gh api user call ...
    return identity;
  } catch {
    return null;  // fail-open — badge simply absent
  }
}
```

**Double-wrapped inner try/catch pattern** (mismatch detection must be independently fail-open from the outer):
```typescript
// Inner try/catch for mismatch: failure returns false, not null, to avoid breaking outer.
async function detectTokenMismatch(ghAuthLogin: string, envToken: string): Promise<boolean> {
  try {
    const { stdout } = await execa('gh', ['api', 'user', '--hostname', 'github.com'], {
      env: { ...process.env, GH_TOKEN: envToken },
    });
    const envUser = JSON.parse(stdout) as { login: string };
    return envUser.login !== ghAuthLogin;
  } catch {
    return false;  // mismatch detection itself fails open (Pitfall D in RESEARCH.md)
  }
}
```

**mapGhError reference** — github.ts lines 92-107 shows the error-mapping pattern, but identity.ts does NOT use it because identity.ts is entirely fail-open (no re-throw at all).

**Logger pattern** (logger.ts stderr-only rule — never console.log):
```typescript
// NEVER console.log — corrupts JSON-RPC stdio channel.
// Use logger.warn for failure telemetry if needed:
// logger.warn('fetchAuthIdentity failed — badge will be absent');
// But for identity, even logging may be too noisy; silent null return is sufficient.
```

---

### `server/src/http/middleware/secure-headers.ts` (middleware, request-response)

**Analog:** Same file — one-line addition to `imgSrc` array.

**Existing pattern** (lines 1-17 — full file):
```typescript
import { secureHeaders, NONCE } from 'hono/secure-headers';
import type { MiddlewareHandler } from 'hono';

export function secureHeadersMw(): MiddlewareHandler {
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", NONCE],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],           // <-- ADD 'https://avatars.githubusercontent.com' here
      connectSrc: ["'self'"],
      fontSrc: ["'none'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  });
}
```

**Required change** (line 10 — `imgSrc` array):
```typescript
imgSrc: ["'self'", 'data:', 'https://avatars.githubusercontent.com'],
```

**Rationale:** The RESEARCH.md Security Domain section identifies this as a concrete pre-existing CSP gap. GitHub avatar URLs (`avatars.githubusercontent.com`) are external images. Without this addition, the avatar `<img>` tag will be blocked by the browser.

---

### `web/src/components/TopBar.tsx` (component, request-response)

**Analog:** Same file — the `CIPill` component (lines 204-281) shows the established pattern for optional data: guard with a null check, render conditionally using project CSS class conventions and the `Ic` icon namespace.

**Optional prop addition pattern** (TopBarProps interface lines 11-22):
```typescript
// Add to TopBarProps interface — follow existing optional field pattern:
interface TopBarProps {
  // ... existing props ...
  authenticatedUser?: AuthIdentity | null;  // D-02: optional; absent = badge hidden
}
```

**Spacer + button row-1 pattern** (lines 64-77) — auth badge goes between `<div className="spacer" />` and the Settings button:
```tsx
<div className="spacer" />
{/* D-02: Auth identity badge — absent when authenticatedUser is null/undefined (D-04) */}
{authenticatedUser && (
  <div
    className="auth-badge"
    title={
      authenticatedUser.mismatch
        ? 'gh auth and GITHUB_TOKEN resolve to different users'  // D-03
        : authenticatedUser.login
    }
  >
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
<button type="button" className="topbtn" onClick={onSettingsClick}>
```

**SECURITY:** `authenticatedUser.login` renders via React text node (`<span>`), `avatarUrl` via `<img src>`. Never `dangerouslySetInnerHTML`.

**Icon pattern** — new `Ic.warning` icon must be added to `web/src/components/icons.tsx` following the same inline SVG pattern (lines 1-40):
```typescript
// Add to the Ic object in icons.tsx:
warning: (p: Props = {}) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
    <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M8 7v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <circle cx="8" cy="11.5" r="0.5" fill="currentColor"/>
  </svg>
),
```

---

### `web/src/store.ts` (store, event-driven)

**Analog:** Same file — every prior phase mirrors new `ReviewSession` optional fields into `AppState` and handles them in `onSnapshot` and `onUpdate`.

**AppState field addition pattern** (lines 29-74 — follow the "Phase N additions" comment convention):
```typescript
// Phase 7 additions
authenticatedUser?: AuthIdentity | null;
```

**INITIAL sentinel pattern** (lines 76-102):
```typescript
// Add to INITIAL:
authenticatedUser: undefined,
```

**onSnapshot mirror pattern** (lines 153-188 — snapshot maps every session field):
```typescript
// Add inside onSnapshot state merge:
authenticatedUser: s.authenticatedUser ?? null,
```

**onUpdate mirror pattern** (lines 190-217 — update also mirrors session fields):
```typescript
// Add inside onUpdate state merge:
authenticatedUser: s.authenticatedUser ?? null,
```

**Import addition** — add `AuthIdentity` to the shared types import block at the top of `store.ts` (lines 1-21).

---

### `server/src/session/manager.ts` (service, CRUD)

**Analog:** Same file — Phase 3 post-snapshot fetch pattern (lines 217-230) shows how to add a fail-open side-effect after the initial session snapshot is written. This is the hook point for identity fetch.

**Post-snapshot pattern** (lines 217-230 — Phase 3 adds existing comments + CI checks after initial persist):
```typescript
// Phase 3 GitHub-only: fetch existing PR comments and CI checks (D-20, D-24).
// Both run post-snapshot so the web client sees: snapshot → update(existingComments) → update(ciChecks).
// Failures are logged to stderr only; UI renders the "absent" variants.
if (source.kind === 'github' && pr.owner && pr.repo && typeof pr.number === 'number') {
  try {
    const comments = await fetchExistingComments(pr.owner, pr.repo, pr.number, diff);
    await this.applyEvent(prKey, { type: 'existingComments.loaded', comments });
  } catch (err) {
    logger.warn('Failed to load existing comments:', err);
  }
  // ...
}
```

**Identity fetch integration** — RESEARCH.md Open Question 2 recommends setting identity on the initial `ReviewSession` object at creation time (no extra event, no extra SSE update) rather than using applyEvent. This avoids a new event type and keeps startup simpler. Follow the `createdAt`/`headSha` pattern (manager.ts lines 192-204):

```typescript
// Fetch identity in parallel with ingestGithub (both are gh CLI calls, neither depends on the other)
// Set on the initial session object — identity is immutable per session (no event needed)
const [{ meta, diffText }, authIdentity] = await Promise.all([
  ingestGithub(id),
  fetchAuthIdentity(),   // fail-open: null on error (D-04)
]);

// ... parse diff, highlight, etc. ...

const session: ReviewSession = {
  prKey,
  pr,
  diff,
  shikiTokens,
  createdAt: new Date().toISOString(),
  headSha: pr.headSha,
  error: null,
  lastEventId: 0,
  authenticatedUser: authIdentity,  // D-02: null if fetch failed
};
```

**Import addition** to manager.ts:
```typescript
import { fetchAuthIdentity } from '../ingest/identity.js';
```

**Disk-load path** (manager.ts lines 92-129) — for resumed sessions, the persisted `authenticatedUser` is already in the snapshot and will be loaded as-is. No re-fetch on resume. The migrated session spread at line 99 handles this automatically.

---

### `server/src/__tests__/pitfall-verify.test.ts` (test, batch)

**Analog:** `server/src/session/__tests__/manager.resume.test.ts` for Pitfalls 8 and 9; `server/src/__tests__/lifecycle.test.ts` for Pitfall 16.

**File-level structure pattern** (manager.resume.test.ts lines 1-60 — vi.mock at top, then describe blocks):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules that require real I/O
vi.mock('../../browser-launch.js', () => ({
  launchBrowser: vi.fn(async () => undefined),
}));
vi.mock('../../persist/store.js', () => ({
  writeState: vi.fn(async () => undefined),
  readState: vi.fn(async () => null),
}));
// ... other mocks for ingest, shiki, etc. ...
```

**beforeEach/afterEach pattern** (manager.resume.test.ts lines 99-117):
```typescript
beforeEach(async () => {
  vi.clearAllMocks();
  // Re-import mocked modules after clearAllMocks to get fresh vi.mocked() handles
  const managerMod = await import('../manager.js');
  SessionManager = managerMod.SessionManager;
  const storeMod = await import('../../persist/store.js');
  readStateMock = vi.mocked(storeMod.readState);
  // ...
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

**Pitfall 8 test shape** (writeState/readState round-trip, extending store.test.ts lines 36-38):
```typescript
describe('Pitfall 8: resume across browser close', () => {
  it('full round-trip: write state, clear in-memory, re-read from disk', async () => {
    // Uses tmpDir + vi.stubEnv pattern from store.test.ts
    const { writeState, readState } = await import('../../persist/store.js');
    const data = { prKey: 'gh:o/r#1', lastEventId: 5, someField: 'persisted' };
    await writeState('gh:o/r#1', data);
    const reloaded = await readState('gh:o/r#1');
    expect(reloaded).not.toBeNull();
    expect((reloaded as typeof data).lastEventId).toBe(5);
  });
});
```

**Pitfall 9 test shape** (follows manager.resume.test.ts disk-load-4 at line 167 — divergent SHA → staleDiff):
```typescript
describe('Pitfall 9: stale-diff on resume after force-push', () => {
  it('startReview sets staleDiff when stored SHA differs from fetched SHA', async () => {
    readStateMock.mockResolvedValueOnce(makePersistedSession(DERIVED_PR_KEY, { headSha: 'old-sha' }));
    fetchGithubHeadShaMock.mockResolvedValueOnce('new-sha');
    const manager = new SessionManager({ sessionToken: 'tt1234' });
    manager.setLaunchUrl('http://127.0.0.1:8080/?token=tt1234');
    const session = await manager.startReview({ kind: 'github', number: 1 });
    expect(session.staleDiff).toEqual({ storedSha: 'old-sha', currentSha: 'new-sha' });
  });
});
```

**Pitfall 16 test shape** (lifecycle.test.ts lines 11-66 shows the process-spawn pattern; for port test, use a lighter Hono serve approach):
```typescript
describe('Pitfall 16: port-in-use fallback (OS ephemeral)', () => {
  it('two serve({ port: 0 }) calls get distinct non-zero ports', async () => {
    // Start two Hono instances with port: 0
    // Verify both ports are > 0 and != each other
    // Matches the existing serve({ port: 0 }) call in server/src/index.ts line 37
  });
});
```

**tmpDir isolation pattern** (store.test.ts lines 11-22 — required for any test touching disk):
```typescript
let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pitfall-test-'));
  vi.stubEnv('CLAUDE_PLUGIN_DATA', tmpDir);
  vi.resetModules();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(tmpDir, { recursive: true, force: true });
});
```

---

### `server/src/ingest/__tests__/identity.test.ts` (test, request-response)

**Analog:** `server/src/ingest/__tests__/github.test.ts` — exact same structure: `vi.mock('execa')` at top, per-`describe` `vi.resetModules()` + `vi.clearAllMocks()`, `mockImplementation` keyed on `args` array, `await import('../module.js')` inside each test.

**File-level mock pattern** (github.test.ts lines 1-3):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('execa', () => ({ execa: vi.fn() }));
```

**Args-keyed mock factory pattern** (github.test.ts lines 34-56):
```typescript
// For identity.ts, key on args[0]==='api' and args[1]==='user':
const mockExeca = (_bin: string, args: string[]) => {
  if (args[0] === 'api' && args[1] === 'user') {
    return Promise.resolve({ stdout: JSON.stringify({ login: 'crnbarr93', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' }) });
  }
  return Promise.reject(new Error(`unexpected: ${args.join(' ')}`));
};
```

**Fail-open test** (inverts github.test.ts auth-failure test — identity must return null, NOT throw):
```typescript
it('returns null when gh api fails (fail-open per D-04)', async () => {
  const { execa } = await import('execa');
  (execa as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));
  const { fetchAuthIdentity } = await import('../identity.js');
  const result = await fetchAuthIdentity();
  expect(result).toBeNull();  // NOT a throw — fail-open
});
```

**Mismatch detection test** — env var override pattern:
```typescript
it('sets mismatch=true when GITHUB_TOKEN resolves to a different user', async () => {
  // First call (gh api user, no GH_TOKEN override) → login: 'user-a'
  // Second call (gh api user with GH_TOKEN) → login: 'user-b'
  // Expect identity.mismatch === true
});

it('sets mismatch=false when GITHUB_TOKEN resolves to same user', async () => {
  // Both calls return same login
  // Expect identity.mismatch === false
});

it('mismatch detection failure is itself fail-open (returns false, not null)', async () => {
  // First call succeeds; second call (mismatch detection) throws
  // Expect identity to be non-null with mismatch=false
});
```

---

### `server/src/mcp/tools/__tests__/start-review.test.ts` (test — stale assertion fix)

**Not a new file — one-line fix.** The stale `'git-review-plugin'` string at lines 190-193 and 239 must be changed to `'gr'` (the plugin's current name after commit `cab19ef`).

**Current (stale):**
```typescript
expect(servers).toHaveProperty('git-review-plugin');
expect(servers['git-review-plugin'].command).toBe('node');
expect(servers['git-review-plugin'].args[0]).toContain('${CLAUDE_PLUGIN_ROOT}');
expect(servers['git-review-plugin'].args[0]).toContain('server/dist/index.js');
// line 239:
expect(content).toContain('mcp__git-review-plugin__start_review');
```

**Required (fixed):**
```typescript
expect(servers).toHaveProperty('gr');
expect(servers['gr'].command).toBe('node');
expect(servers['gr'].args[0]).toContain('${CLAUDE_PLUGIN_ROOT}');
expect(servers['gr'].args[0]).toContain('server/dist/index.js');
// line 239:
expect(content).toContain('mcp__gr__start_review');
```

---

## Shared Patterns

### Fail-Open
**Source:** `server/src/session/manager.ts` lines 218-230 + `server/src/ingest/github.ts` error handling
**Apply to:** `server/src/ingest/identity.ts`, identity fetch integration in `manager.ts`

The established project-wide convention for "optional enrichment" operations:
```typescript
try {
  const result = await optionalEnrichment();
  // use result
} catch (err) {
  logger.warn('enrichment failed:', err);
  // silently degrade — never block the session
}
```

For `fetchAuthIdentity`, the fail-open is even quieter — no `logger.warn` needed, just return `null`.

### Backward-Compatible Optional Fields on ReviewSession
**Source:** `shared/types.ts` lines 95-108 (every prior phase)
**Apply to:** `shared/types.ts` Phase 7 `authenticatedUser` addition, `web/src/store.ts` AppState mirroring

Every new field is:
1. Declared `optional` (`?`) on `ReviewSession` — pre-Phase-7 snapshots load without migration
2. Mirrored into `web/src/store.ts:AppState` with the same optionality
3. Handled in both `onSnapshot` and `onUpdate` with a `?? null` or `?? undefined` fallback

### execa + gh CLI Pattern
**Source:** `server/src/ingest/github.ts` lines 1-10, 20-36
**Apply to:** `server/src/ingest/identity.ts`

```typescript
import { execa } from 'execa';
// ...
const { stdout } = await execa('gh', ['api', 'user', ...]);
const parsed = JSON.parse(stdout) as { login: string; avatar_url: string };
```

Never `console.log` (stdout corruption); always destructure `{ stdout }` from execa result.

### Vitest Module-Reset Pattern for execa Mocks
**Source:** `server/src/ingest/__tests__/github.test.ts` lines 26-31
**Apply to:** `server/src/ingest/__tests__/identity.test.ts`

```typescript
beforeEach(() => {
  vi.resetModules();  // required so vi.mock('execa') takes effect on fresh dynamic imports
});
afterEach(() => {
  vi.clearAllMocks();
});
// Then inside each test: const { execa } = await import('execa');
```

### tmpDir Isolation for Disk Tests
**Source:** `server/src/persist/__tests__/store.test.ts` lines 11-22
**Apply to:** `server/src/__tests__/pitfall-verify.test.ts` (Pitfall 8 sub-test)

```typescript
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pitfall-test-'));
  vi.stubEnv('CLAUDE_PLUGIN_DATA', tmpDir);
  vi.resetModules();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});
```

### Conditional TopBar Inline Component Pattern
**Source:** `web/src/components/TopBar.tsx` lines 204-281 (CIPill)
**Apply to:** Auth badge rendering in `TopBar.tsx`

Optional UI pieces in the TopBar are inline function components at the bottom of the file. They receive typed props, guard with null checks at the top (`if (!ciStatus ...) return null;`), and use project CSS classes + `var(--...)` tokens. The `Ic` namespace provides all icons.

---

## No Analog Found

All files have close analogs in the existing codebase. No entries.

---

## Metadata

**Analog search scope:** `server/src/ingest/`, `server/src/session/`, `server/src/http/middleware/`, `server/src/__tests__/`, `server/src/persist/__tests__/`, `web/src/components/`, `web/src/store.ts`, `shared/types.ts`
**Files scanned:** 14 source files read directly
**Pattern extraction date:** 2026-04-28
